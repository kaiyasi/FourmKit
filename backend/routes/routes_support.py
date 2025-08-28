from __future__ import annotations
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.ratelimit import rate_limit, get_client_ip
from utils.notify import send_admin_event
from services.event_service import EventService
from utils.db import get_session
from utils.ticket import new_ticket_id
from models import User
from models.tickets import SupportTicket, TicketResponse, TicketHistory, UserIdentityCode, TicketStatus, TicketPriority, TicketCategory
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import selectinload
from sqlalchemy import desc, and_, or_
import hmac, hashlib, base64, os
import uuid
import secrets
import string

bp = Blueprint("support", __name__, url_prefix="/api/support")


def _safe_str(v: Any, max_len: int = 2000) -> str:
    try:
        s = str(v or "").strip()
        if len(s) > max_len:
            s = s[:max_len]
        return s
    except Exception:
        return ""


@bp.post("/report")
@jwt_required(optional=True)
@rate_limit(calls=3, per_seconds=300, by='client')
def submit_report():
    """使用者或訪客提交工單。
    接收: { category?, subject?, message, email?, scope?, school_slug? }
    - 創建真正的工單記錄
    - 支持已登入用戶和匿名用戶
    - 為匿名用戶生成追蹤碼
    """
    data = request.get_json(silent=True) or {}
    category = _safe_str(data.get("category"), 64) or "other"
    subject = _safe_str(data.get("subject"), 140) or "用戶回報"
    message = _safe_str(data.get("message"), 4000)
    email = _safe_str(data.get("email"), 255)
    scope = data.get("scope", "cross")  # cross 或 school
    school_slug = data.get("school_slug")
    
    if not message:
        return jsonify({"ok": False, "msg": "請輸入訊息"}), 400
    
    # 映射前端分類到後端枚舉
    category_mapping = {
        "suggestion": "feature",
        "report": "technical",
        "abuse": "abuse",
        "account": "account",
        "other": "other"
    }
    db_category = category_mapping.get(category, "other")
    
    # 獲取用戶資訊
    user_id = None
    user_name = None
    user_identity_code = None
    school_id = None
    
    try:
        user_id_raw = get_jwt_identity()
        if user_id_raw is not None:
            user_id = int(user_id_raw)
            with get_session() as s:
                user = s.get(User, user_id)
                if user:
                    user_name = user.username
                    school_id = user.school_id
                    
                    # 為已登入用戶生成或獲取身份識別碼
                    identity_code = s.query(UserIdentityCode).filter_by(user_id=user_id).first()
                    if not identity_code:
                        # 生成新的身份識別碼
                        code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(12))
                        identity_code = UserIdentityCode(
                            code=f"FK{code}",
                            user_id=user_id,
                            email=user.email,
                            name=user.username,
                            is_verified=True,
                            verified_at=datetime.now(timezone.utc)
                        )
                        s.add(identity_code)
                        s.commit()
                    
                    user_identity_code = identity_code.code
    except Exception:
        pass
    
    # 處理學校資訊（如果是校內問題）
    if scope == "school" and school_slug:
        try:
            with get_session() as s:
                from models.school import School
                school = s.query(School).filter_by(slug=school_slug).first()
                if school:
                    school_id = school.id
        except Exception:
            pass
    
    try:
        with get_session() as s:
            # 生成工單號碼
            ticket_number = new_ticket_id()
            
            # 創建工單
            ticket = SupportTicket(
                ticket_number=ticket_number,
                submitter_id=user_id,
                submitter_email=email if not user_id else None,
                submitter_name=None if user_id else "匿名用戶",
                submitter_ip=get_client_ip(),
                user_agent=request.headers.get("User-Agent"),
                subject=subject,
                description=message,
                category=db_category,
                priority="medium",
                status="open",
                school_id=school_id,
                scope=scope
            )
            
            s.add(ticket)
            s.flush()  # 獲取 ticket.id
            
            # 創建歷史記錄
            history = TicketHistory(
                ticket_id=ticket.id,
                action="created",
                actor_id=user_id,
                actor_name=user_name or "匿名用戶",
                description=f"工單已創建：{subject}"
            )
            s.add(history)
            
            # 更新身份識別碼使用統計
            if user_identity_code:
                identity_code = s.query(UserIdentityCode).filter_by(code=user_identity_code).first()
                if identity_code:
                    identity_code.ticket_count += 1
                    identity_code.last_used = datetime.now(timezone.utc)
            
            s.commit()
            
            # 發送通知
            try:
                category_names = {
                    'account': '帳戶問題',
                    'technical': '技術問題', 
                    'content': '內容相關',
                    'feature': '功能建議',
                    'abuse': '濫用檢舉',
                    'moderation': '審核相關',
                    'other': '其他問題'
                }
                
                send_admin_event(
                    kind="ticket_created",
                    title=f"新工單：{subject}",
                    description=message[:200] + ('...' if len(message) > 200 else ''),
                    actor=user_name or "匿名用戶",
                    source="/api/support/report",
                    fields=[
                        {"name": "工單號碼", "value": ticket_number, "inline": True},
                        {"name": "分類", "value": category_names.get(db_category, db_category), "inline": True},
                        {"name": "範圍", "value": "跨校" if scope == "cross" else "校內", "inline": True},
                        {"name": "聯絡方式", "value": user_identity_code or email or "無", "inline": True}
                    ]
                )
            except Exception:
                pass
            
            # Socket 通知
            try:
                from app import socketio
                socketio.emit('support.ticket_created', {
                    'ticket_number': ticket_number,
                    'category': db_category,
                    'subject': subject,
                    'user': user_name or 'anonymous',
                    'scope': scope,
                    'ts': datetime.now(timezone.utc).isoformat()
                })
            except Exception:
                pass
            
            return jsonify({
                "ok": True,
                "msg": "工單已成功建立！我們會盡快處理",
                "details": {
                    "ticket_number": ticket_number,
                    "category": category_names.get(db_category, db_category),
                    "submitted_at": datetime.now(timezone.utc).isoformat(),
                    "contact_method": "身份識別碼" if user_identity_code else "Email",
                    "tracking_code": user_identity_code
                }
            })
            
    except Exception as e:
        return jsonify({"ok": False, "msg": f"建立工單失敗：{str(e)}"}), 500


@bp.get("/recent")
@jwt_required()
def recent_reports():
    """管理員查詢最近的工單。"""
    try:
        with get_session() as s:
            uid = get_jwt_identity()
            user = s.get(User, int(uid)) if uid is not None else None
            if not user or user.role not in {"dev_admin", "campus_admin", "cross_admin"}:
                return jsonify({"msg": "forbidden"}), 403
                
            limit = min(int(request.args.get("limit", 50)), 100)
            
            # 根據管理員的角色過濾工單
            query = s.query(SupportTicket).options(
                selectinload(SupportTicket.submitter),
                selectinload(SupportTicket.assigned_user)
            )
            
            if user.role == "campus_admin":
                # 校內管理員只能看到自己學校的工單
                query = query.filter(
                    and_(
                        SupportTicket.school_id == user.school_id,
                        SupportTicket.scope == "school"
                    )
                )
            elif user.role == "cross_admin":
                # 跨校管理員能看到跨校工單
                query = query.filter(SupportTicket.scope == "cross")
            # dev_admin 可以看到所有工單
            
            tickets = query.order_by(desc(SupportTicket.created_at)).limit(limit).all()
            
            items = []
            for ticket in tickets:
                status_map = {
                    "open": "開啟",
                    "assigned": "已指派",
                    "in_progress": "處理中", 
                    "waiting": "等待回覆",
                    "resolved": "已解決",
                    "closed": "已關閉"
                }
                
                category_map = {
                    "account": "帳戶問題",
                    "technical": "技術問題",
                    "content": "內容相關",
                    "feature": "功能建議", 
                    "abuse": "濫用檢舉",
                    "moderation": "審核相關",
                    "other": "其他問題"
                }
                
                items.append({
                    "ticket_id": ticket.ticket_number,
                    "id": ticket.id,
                    "title": ticket.subject,
                    "category": category_map.get(ticket.category, ticket.category),
                    "status": status_map.get(ticket.status, ticket.status),
                    "priority": ticket.priority,
                    "submitter": ticket.submitter.username if ticket.submitter else ticket.submitter_name or "匿名用戶",
                    "handler": ticket.assigned_user.username if ticket.assigned_user else None,
                    "scope": "跨校" if ticket.scope == "cross" else "校內",
                    "timestamp": ticket.created_at.isoformat(),
                    "updated_at": ticket.updated_at.isoformat(),
                    "response_count": ticket.response_count,
                    "is_urgent": ticket.is_urgent,
                    "description_snippet": ticket.description[:100] + ('...' if len(ticket.description) > 100 else '')
                })
            
            return jsonify({"items": items})
            
    except Exception as e:
        return jsonify({"items": [], "error": str(e)}), 500


@bp.get("/my")
@jwt_required(optional=True)
def my_support_items():
    """獲取用戶的工單歷史（已登入用戶）"""
    try:
        uid = get_jwt_identity()
        if uid is None:
            return jsonify({"ok": True, "items": []})
            
        limit = min(int(request.args.get("limit", 20)), 100)
        
        with get_session() as s:
            # 查詢用戶提交的工單
            tickets = s.query(SupportTicket).filter_by(
                submitter_id=int(uid)
            ).options(
                selectinload(SupportTicket.responses),
                selectinload(SupportTicket.assigned_user)
            ).order_by(
                desc(SupportTicket.updated_at)
            ).limit(limit).all()
            
            items = []
            for ticket in tickets:
                # 狀態顯示
                status_map = {
                    "open": "開啟",
                    "assigned": "已指派", 
                    "in_progress": "處理中",
                    "waiting": "等待回覆",
                    "resolved": "已解決",
                    "closed": "已關閉"
                }
                
                category_map = {
                    "account": "帳戶問題",
                    "technical": "技術問題",
                    "content": "內容相關", 
                    "feature": "功能建議",
                    "abuse": "濫用檢舉",
                    "moderation": "審核相關",
                    "other": "其他問題"
                }
                
                item = {
                    "ticket_id": ticket.ticket_number,
                    "id": ticket.id,
                    "subject": ticket.subject,
                    "category": category_map.get(ticket.category, ticket.category),
                    "status": status_map.get(ticket.status, ticket.status),
                    "priority": ticket.priority,
                    "created_at": ticket.created_at.isoformat(),
                    "updated_at": ticket.updated_at.isoformat(),
                    "response_count": ticket.response_count,
                    "handler": ticket.assigned_user.username if ticket.assigned_user else None,
                    "scope": "跨校" if ticket.scope == "cross" else "校內",
                    "is_urgent": ticket.is_urgent
                }
                
                # 加入回覆資訊
                if ticket.responses:
                    item["replies"] = []
                    for response in sorted(ticket.responses, key=lambda r: r.created_at):
                        if not response.is_internal:  # 不顯示內部備註
                            item["replies"].append({
                                "message": response.content,
                                "timestamp": response.created_at.isoformat(),
                                "by": "管理員" if response.is_staff_response else "用戶",
                                "author": response.author.username if response.author else None
                            })
                
                items.append(item)
            
            return jsonify({"ok": True, "items": items})
            
    except Exception as e:
        return jsonify({"ok": False, "msg": f"獲取工單失敗：{str(e)}"}), 500


@bp.post("/reply")
@jwt_required()
def reply_to_support():
    """管理員回覆工單"""
    try:
        uid = get_jwt_identity()
        if not uid:
            return jsonify({"ok": False, "msg": "未授權"}), 401
            
        with get_session() as s:
            user = s.get(User, int(uid))
            if not user or user.role not in {"dev_admin", "campus_admin", "cross_admin"}:
                return jsonify({"ok": False, "msg": "權限不足"}), 403
    except Exception:
        return jsonify({"ok": False, "msg": "權限驗證失敗"}), 403
    
    data = request.get_json(silent=True) or {}
    ticket_id = data.get("ticket_id") or data.get("ticket")
    message = _safe_str(data.get("message"), 4000)
    is_internal = data.get("is_internal", False)  # 是否為內部備註
    
    if not message:
        return jsonify({"ok": False, "msg": "請輸入回覆內容"}), 400
    
    if not ticket_id:
        return jsonify({"ok": False, "msg": "請指定工單"}), 400
    
    try:
        with get_session() as s:
            # 查找工單（可以用 ticket_number 或 id）
            ticket = None
            if isinstance(ticket_id, str) and ticket_id.startswith("FK-"):
                ticket = s.query(SupportTicket).filter_by(ticket_number=ticket_id).first()
            else:
                try:
                    ticket_int_id = int(ticket_id)
                    ticket = s.get(SupportTicket, ticket_int_id)
                except ValueError:
                    pass
            
            if not ticket:
                return jsonify({"ok": False, "msg": "找不到工單"}), 404
            
            admin_user = s.get(User, int(uid))
            admin_name = admin_user.username if admin_user else "管理員"
            
            # 權限檢查：確保管理員只能處理自己權限範圍內的工單
            if admin_user.role == "campus_admin":
                if ticket.scope != "school" or ticket.school_id != admin_user.school_id:
                    return jsonify({"ok": False, "msg": "權限不足：無法處理此工單"}), 403
            elif admin_user.role == "cross_admin":
                if ticket.scope != "cross":
                    return jsonify({"ok": False, "msg": "權限不足：無法處理此工單"}), 403
            
            # 創建回覆
            response = TicketResponse(
                ticket_id=ticket.id,
                author_id=int(uid),
                content=message,
                is_internal=is_internal,
                is_staff_response=True,
                ip_address=get_client_ip(),
                user_agent=request.headers.get("User-Agent")
            )
            s.add(response)
            
            # 更新工單狀態
            if ticket.status == "open":
                ticket.status = "in_progress"
            elif ticket.status == "waiting":
                ticket.status = "in_progress"
                
            # 指派工單（如果還沒指派）
            if not ticket.assigned_to:
                ticket.assigned_to = int(uid)
            
            ticket.response_count += 1
            ticket.updated_at = datetime.now(timezone.utc)
            
            # 記錄歷史
            history = TicketHistory(
                ticket_id=ticket.id,
                action="replied",
                actor_id=int(uid),
                actor_name=admin_name,
                description=f"{'內部備註' if is_internal else '回覆'}：{message[:50]}..."
            )
            s.add(history)
            
            s.commit()
            
            # 發送通知（非內部備註才發送給用戶）
            if not is_internal:
                try:
                    send_admin_event(
                        kind="ticket_replied",
                        title=f"工單回覆：{ticket.subject}",
                        description=f"管理員已回覆工單 {ticket.ticket_number}",
                        actor=admin_name,
                        source="/api/support/reply"
                    )
                except Exception:
                    pass
            
            return jsonify({
                "ok": True, 
                "msg": "回覆已發送",
                "ticket_number": ticket.ticket_number,
                "new_status": ticket.status
            })
        
    except Exception as e:
        return jsonify({"ok": False, "msg": f"回覆失敗: {str(e)}"}), 500


@bp.get("/track/<track_code>")
def track_ticket(track_code: str):
    """匿名用戶追蹤工單（使用身份識別碼）"""
    try:
        with get_session() as s:
            # 查找身份識別碼
            identity = s.query(UserIdentityCode).filter_by(code=track_code).first()
            if not identity:
                return jsonify({"ok": False, "msg": "無效的追蹤碼"}), 404
            
            # 查找該身份識別碼的工單
            query = s.query(SupportTicket).options(
                selectinload(SupportTicket.responses),
                selectinload(SupportTicket.assigned_user)
            )
            
            if identity.user_id:
                # 已登入用戶的身份識別碼
                tickets = query.filter_by(submitter_id=identity.user_id).all()
            else:
                # 匿名用戶的身份識別碼 - 通過email匹配
                tickets = query.filter_by(submitter_email=identity.email).all()
            
            items = []
            for ticket in tickets:
                status_map = {
                    "open": "開啟",
                    "assigned": "已指派",
                    "in_progress": "處理中",
                    "waiting": "等待回覆", 
                    "resolved": "已解決",
                    "closed": "已關閉"
                }
                
                category_map = {
                    "account": "帳戶問題",
                    "technical": "技術問題",
                    "content": "內容相關",
                    "feature": "功能建議",
                    "abuse": "濫用檢舉",
                    "moderation": "審核相關", 
                    "other": "其他問題"
                }
                
                item = {
                    "ticket_number": ticket.ticket_number,
                    "subject": ticket.subject,
                    "category": category_map.get(ticket.category, ticket.category),
                    "status": status_map.get(ticket.status, ticket.status),
                    "priority": ticket.priority,
                    "created_at": ticket.created_at.isoformat(),
                    "updated_at": ticket.updated_at.isoformat(),
                    "response_count": ticket.response_count,
                    "scope": "跨校" if ticket.scope == "cross" else "校內"
                }
                
                # 加入公開回覆
                if ticket.responses:
                    item["replies"] = []
                    for response in sorted(ticket.responses, key=lambda r: r.created_at):
                        if not response.is_internal:  # 不顯示內部備註
                            item["replies"].append({
                                "message": response.content,
                                "timestamp": response.created_at.isoformat(),
                                "by": "管理員" if response.is_staff_response else "用戶"
                            })
                
                items.append(item)
            
            return jsonify({
                "ok": True,
                "tracking_code": track_code,
                "tickets": items,
                "total_tickets": len(items)
            })
            
    except Exception as e:
        return jsonify({"ok": False, "msg": f"查詢失敗：{str(e)}"}), 500