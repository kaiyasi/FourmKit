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
    - 支援已登入用戶和匿名用戶
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
    """管理員查詢最近的回報（從快取中取得）。"""
    try:
        from models import User
        with get_session() as s:
            uid = get_jwt_identity()
            u = s.get(User, int(uid)) if uid is not None else None
            if not u or u.role not in {"dev_admin", "campus_admin", "cross_admin"}:
                return jsonify({"msg": "forbidden"}), 403
    except Exception:
        return jsonify({"msg": "forbidden"}), 403

    try:
        from utils.admin_events import get_recent_events
        events = [e for e in (get_recent_events(limit=100) or []) if e.get("event_type") in {"issue_report", "support_message"}]
        return jsonify({"items": events[:50]})
    except Exception as e:
        return jsonify({"items": [], "error": str(e)})


@bp.get("/my")
@jwt_required(optional=True)
def my_support_items():
    """使用者個人支援紀錄（暫無持久化：先回空清單以撐住前端 UI）"""
    try:
        uid = get_jwt_identity()
        if uid is None:
            return jsonify({"ok": True, "items": []})
        # TODO: 未來若加入支援票據模型，於此查詢並返回
        return jsonify({"ok": True, "items": []})
    except Exception:
        return jsonify({"ok": True, "items": []})


@bp.post("/reply")
@jwt_required()
def reply_to_support():
    """管理員回覆支援請求"""
    from utils.authz import require_role
    from datetime import datetime, timezone
    
    # 權限檢查
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
    ticket_id = data.get("ticket") or data.get("ticket_id")  # 支持兩種參數名稱
    message = _safe_str(data.get("message"), 4000)
    
    if not message:
        return jsonify({"ok": False, "msg": "請輸入回覆內容"}), 400
    
    try:
        with get_session() as s:
            admin_user = s.get(User, int(uid))
            admin_name = admin_user.username if admin_user else "管理員"
            
            # 記錄回覆事件
            EventService.log_event(
                session=s,
                event_type="support.ticket_replied",
                title=f"管理員回覆支援請求",
                description=f"管理員 {admin_name} 回覆：\n\n{message}",
                severity="low",
                actor_id=int(uid),
                actor_name=admin_name,
                actor_role=admin_user.role if admin_user else None,
                target_type="support_ticket",
                target_id=ticket_id,
                metadata={
                    "ticket_id": ticket_id,
                    "reply_message": message,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                is_important=False,
                send_webhook=True
            )
            
            # 發送通知（這裡可以根據需要發送 email 或站內通知）
            try:
                send_admin_event(
                    kind="support_reply",
                    title="管理員回覆",
                    description=f"管理員已回覆支援請求：{message[:100]}{'...' if len(message) > 100 else ''}",
                    actor=admin_name,
                    source="/api/support/reply"
                )
            except Exception:
                pass
                
        return jsonify({"ok": True, "msg": "回覆已發送"})
        
    except Exception as e:
        return jsonify({"ok": False, "msg": f"回覆失敗: {str(e)}"}), 500
