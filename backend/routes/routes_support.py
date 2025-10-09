"""Support API routes - 前台支援系統 API
處理用戶創建支援單、查看支援單、訊息回覆等功能
"""
from __future__ import annotations
import re
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from sqlalchemy import desc, or_
from sqlalchemy.exc import SQLAlchemyError, OperationalError

from models.support import SupportTicket, SupportMessage, TicketStatus, TicketCategory, TicketPriority, AuthorType
from models.base import User
from models.school import School
from services.support_service import SupportService
from utils.support_db import get_support_session
from utils.db import get_session as get_main_session
from utils.ratelimit import rate_limit
from utils.sanitize import sanitize_html
from utils.notify import send_admin_event
from utils.authz import require_role

bp = Blueprint("support", __name__, url_prefix="/api/support")


def validate_email(email: str) -> bool:
    """驗證 Email 格式"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email.strip()) is not None


def clean_input(text: str, max_length: int = 1000) -> str:
    """清理用戶輸入"""
    if not text:
        return ""
    
    # 移除多餘空白並限制長度
    cleaned = text.strip()[:max_length]
    
    # HTML 清理（如果內容包含 HTML）
    if '<' in cleaned and '>' in cleaned:
        cleaned = sanitize_html(cleaned)
    
    return cleaned
@bp.route("/tickets", methods=["POST"])
@rate_limit(5, 60)  # 每60秒最多5次創建請求
def create_ticket():
    """創建新工單"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"ok": False, "error": "NO_DATA", "msg": "缺少請求數據"}), 400

        # 取得參數
        subject = clean_input(data.get('subject', ''), 500)
        body = clean_input(data.get('body', ''), 5000)
        category = data.get('category', 'other')
        priority = data.get('priority', 'medium')
        guest_email = data.get('email', '').strip().lower() if data.get('email') else None

        # 驗證必要欄位
        if not subject or not body:
            return jsonify({"ok": False, "error": "MISSING_FIELDS", "msg": "主題和內容不能為空"}), 400

        # 檢查是否登入
        user_id = None
        try:
            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
            if user_id:
                user_id = int(user_id)
        except Exception:
            pass

        # 未登入用戶需要提供 email
        if not user_id and not guest_email:
            return jsonify({"ok": False, "error": "EMAIL_REQUIRED", "msg": "請提供 Email 以便我們回覆"}), 400

        # 驗證 email 格式（僅訪客需要）
        if guest_email and not validate_email(guest_email):
            return jsonify({"ok": False, "error": "INVALID_EMAIL", "msg": "Email 格式不正確"}), 400

        # 獲取用戶學校信息（如果已登入）
        school_id = None
        if user_id:
            with get_main_session() as main_s:
                user = main_s.get(User, user_id)
                if user and user.school_id:
                    school_id = user.school_id

        # 創建工單
        with get_support_session() as support_s:
            ticket = SupportService.create_ticket(
                session=support_s,
                subject=subject,
                body=body,
                category=category,
                priority=priority,
                user_id=user_id,
                guest_email=guest_email,
                school_id=school_id
            )

            # 準備回應
            response_data = {
                "ok": True,
                "ticket": {
                    "id": ticket.id,
                    "public_id": ticket.public_id,
                    "subject": ticket.subject,
                    "status": ticket.status,
                    "category": ticket.category,
                    "priority": ticket.priority,
                    "created_at": ticket.created_at.isoformat()
                }
            }

            # 訪客用戶：生成追蹤連結
            if not user_id and guest_email:
                token = SupportService.generate_guest_token(
                    ticket.id,
                    guest_email,
                    current_app.config.get('SECRET_KEY', 'fallback-secret')
                )
                tracking_url = f"/support/track?ticket={ticket.public_id}&token={token}"
                response_data["tracking_url"] = tracking_url

            return jsonify(response_data), 201

    except ValueError as e:
        return jsonify({"ok": False, "error": "VALIDATION_ERROR", "msg": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Create ticket error: {e}")
        return jsonify({"ok": False, "error": "SERVER_ERROR", "msg": "伺服器錯誤，請稍後再試"}), 500


@bp.route("/my-tickets", methods=["GET"])
@jwt_required()
def get_my_tickets():
    """取得我的工單列表"""
    try:
        user_id = int(get_jwt_identity())
        limit = min(int(request.args.get('limit', 20)), 100)
        offset = max(int(request.args.get('offset', 0)), 0)
        status = request.args.get('status')

        with get_support_session() as support_s:
            tickets = SupportService.get_tickets_by_user(
                session=support_s,
                user_id=user_id,
                status=status,
                limit=limit,
                offset=offset
            )

            # 轉換為前端格式
            ticket_data = []
            for t in tickets:
                ticket_data.append({
                    "id": t.id,
                    "ticket_id": t.public_id,
                    "subject": t.subject,
                    "status": t.status,
                    "category": t.category,
                    "priority": t.priority,
                    "created_at": t.created_at.strftime('%Y-%m-%d'),
                    "last_activity_at": t.last_activity_at.isoformat(),
                    "message_count": t.message_count
                })

            return jsonify({"ok": True, "tickets": ticket_data})

    except Exception as e:
        current_app.logger.error(f"Get my tickets error: {e}")
        return jsonify({"ok": False, "error": "SERVER_ERROR"}), 500


@bp.route("/tickets/<ticket_id>", methods=["GET"])
def get_ticket_detail(ticket_id):
    """取得工單詳情"""
    try:
        # 檢查是否登入
        user_id = None
        try:
            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
            if user_id:
                user_id = int(user_id)
        except Exception:
            pass

        # 訪客驗證 token
        guest_email = None
        if not user_id:
            token = request.args.get('sig')
            if not token:
                return jsonify({"ok": False, "error": "AUTH_REQUIRED", "msg": "需要登入或提供有效 token"}), 401

            ticket_info = SupportService.verify_guest_token(
                token,
                current_app.config.get('SECRET_KEY', 'fallback-secret')
            )
            if not ticket_info:
                return jsonify({"ok": False, "error": "INVALID_TOKEN", "msg": "無效或過期的 token"}), 401

            _, guest_email = ticket_info

        with get_support_session() as support_s:
            ticket = support_s.query(SupportTicket).filter(
                SupportTicket.public_id == ticket_id
            ).first()

            if not ticket:
                return jsonify({"ok": False, "error": "TICKET_NOT_FOUND", "msg": "工單不存在"}), 404

            # 權限檢查
            if user_id:
                # 登入用戶：檢查是否為工單擁有者或管理員
                with get_main_session() as main_s:
                    user = main_s.get(User, user_id)
                    if not user:
                        return jsonify({"ok": False, "error": "USER_NOT_FOUND"}), 404

                    is_owner = (ticket.user_id == user_id) or (
                        user.email and ticket.guest_email == user.email.lower()
                    )
                    is_admin = user.role in ['dev_admin', 'campus_admin', 'cross_admin']

                    if not is_owner and not is_admin:
                        return jsonify({"ok": False, "error": "ACCESS_DENIED", "msg": "無權查看此工單"}), 403
            else:
                # 訪客：檢查 email 匹配
                if ticket.guest_email != guest_email:
                    return jsonify({"ok": False, "error": "ACCESS_DENIED", "msg": "無權查看此工單"}), 403

            # 取得訊息
            messages = support_s.query(SupportMessage).filter(
                SupportMessage.ticket_id == ticket.id
            ).order_by(SupportMessage.created_at).all()

            # 組裝回應
            message_data = []
            for m in messages:
                message_data.append({
                    "id": m.id,
                    "body": m.body,
                    "author_type": m.author_type,
                    "author_display_name": m.get_author_display_name(),
                    "created_at": m.created_at.isoformat(),
                    "is_internal": m.is_internal
                })

            ticket_data = {
                "id": ticket.id,
                "ticket_id": ticket.public_id,
                "subject": ticket.subject,
                "status": ticket.status,
                "category": ticket.category,
                "priority": ticket.priority,
                "submitter": ticket.get_display_name(),
                "created_at": ticket.created_at.isoformat(),
                "last_activity_at": ticket.last_activity_at.isoformat(),
                "message_count": ticket.message_count,
                "messages": message_data
            }

            return jsonify({"ok": True, "ticket": ticket_data})

    except Exception as e:
        current_app.logger.error(f"Get ticket detail error: {e}")
        return jsonify({"ok": False, "error": "SERVER_ERROR"}), 500


@bp.route("/tickets/<int:ticket_id>/messages", methods=["POST"])
@jwt_required()
def add_ticket_message(ticket_id):
    """新增工單訊息"""
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()
        if not data:
            return jsonify({"ok": False, "error": "NO_DATA"}), 400

        body = clean_input(data.get('body', ''), 5000)
        if not body:
            return jsonify({"ok": False, "error": "EMPTY_MESSAGE", "msg": "訊息內容不能為空"}), 400

        with get_support_session() as support_s:
            # 檢查工單是否存在且用戶有權限
            ticket = support_s.get(SupportTicket, ticket_id)
            if not ticket:
                return jsonify({"ok": False, "error": "TICKET_NOT_FOUND"}), 404

            # 權限檢查：工單擁有者或管理員
            with get_main_session() as main_s:
                user = main_s.get(User, user_id)
                if not user:
                    return jsonify({"ok": False, "error": "USER_NOT_FOUND"}), 404

                is_owner = (ticket.user_id == user_id) or (
                    user.email and ticket.guest_email == user.email.lower()
                )
                is_admin = user.role in ['dev_admin', 'campus_admin', 'cross_admin']

                if not is_owner and not is_admin:
                    return jsonify({"ok": False, "error": "ACCESS_DENIED"}), 403

                # 新增訊息
                author_type = AuthorType.ADMIN if is_admin else AuthorType.USER
                message = SupportService.add_message(
                    session=support_s,
                    ticket_id=ticket_id,
                    body=body,
                    author_user_id=user_id,
                    author_type=author_type
                )

                return jsonify({"ok": True, "message_id": message.id})

    except ValueError as e:
        return jsonify({"ok": False, "error": "VALIDATION_ERROR", "msg": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Add ticket message error: {e}")
        return jsonify({"ok": False, "error": "SERVER_ERROR"}), 500


@bp.route("/guest/verify", methods=["POST"])
@rate_limit(10, 60)  # 每60秒最多10次驗證請求
def verify_guest_token():
    """驗證訪客 token 並返回重定向 URL"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"ok": False, "error": "NO_DATA", "msg": "缺少請求數據"}), 400

        token = data.get('token', '').strip()
        if not token:
            return jsonify({"ok": False, "error": "MISSING_TOKEN", "msg": "缺少 token"}), 400

        # 驗證 token
        ticket_info = SupportService.verify_guest_token(
            token,
            current_app.config.get('SECRET_KEY', 'fallback-secret')
        )
        if not ticket_info:
            return jsonify({"ok": False, "error": "INVALID_TOKEN", "msg": "無效或過期的 token"}), 401

        ticket_id, guest_email = ticket_info

        # 查找工單
        with get_support_session() as support_s:
            ticket = support_s.get(SupportTicket, ticket_id)
            if not ticket:
                return jsonify({"ok": False, "error": "TICKET_NOT_FOUND", "msg": "工單不存在"}), 404

            # 生成重定向 URL
            redirect_url = f"/support/track?ticket={ticket.public_id}&token={token}"
            return jsonify({
                "ok": True,
                "redirect_url": redirect_url,
                "ticket": {
                    "id": ticket.public_id,
                    "subject": ticket.subject,
                    "status": ticket.status
                }
            })

    except Exception as e:
        current_app.logger.error(f"Verify guest token error: {e}")
        return jsonify({"ok": False, "error": "SERVER_ERROR", "msg": "伺服器錯誤"}), 500


@bp.route("/guest/track", methods=["POST"])
@rate_limit(10, 60)  # 每60秒最多10次追蹤請求
def track_guest_ticket():
    """訪客追蹤工單（通過 ticket_id + email）"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"ok": False, "error": "NO_DATA", "msg": "缺少請求數據"}), 400

        ticket_id = data.get('ticket_id', '').strip()
        email = data.get('email', '').strip().lower()

        # 至少需要提供一個欄位
        if not ticket_id and not email:
            return jsonify({"ok": False, "error": "MISSING_FIELDS", "msg": "請提供工單編號或 Email"}), 400

        # 驗證 email 格式（如果有提供）
        if email and not validate_email(email):
            return jsonify({"ok": False, "error": "INVALID_EMAIL", "msg": "Email 格式不正確"}), 400

        # 查找工單
        with get_support_session() as support_s:
            # 根據提供的資訊查找工單
            query = support_s.query(SupportTicket)

            if ticket_id and email:
                # 兩者都有：使用 ticket_id 並驗證 email
                ticket = query.filter(SupportTicket.public_id == ticket_id).first()
                if not ticket:
                    return jsonify({"ok": False, "error": "TICKET_NOT_FOUND", "msg": "找不到該工單"}), 404
                if ticket.guest_email != email:
                    return jsonify({"ok": False, "error": "EMAIL_MISMATCH", "msg": "Email 與工單不符"}), 403
            elif ticket_id:
                # 只有 ticket_id：直接查找並返回（需要 token 才能訪問）
                ticket = query.filter(SupportTicket.public_id == ticket_id).first()
                if not ticket:
                    return jsonify({"ok": False, "error": "TICKET_NOT_FOUND", "msg": "找不到該工單"}), 404
                # 沒有 email 時，使用工單已有的 email
                email = ticket.guest_email
                if not email and ticket.user_id:
                    try:
                        email = ticket.user.email
                    except:
                        pass
                if not email:
                    return jsonify({"ok": False, "error": "NO_EMAIL", "msg": "該工單沒有關聯的 Email，請同時提供工單編號和 Email"}), 400
            else:
                # 只有 email：查找該 email 的最新工單
                tickets = query.filter(
                    SupportTicket.guest_email == email
                ).order_by(SupportTicket.created_at.desc()).all()

                if not tickets:
                    return jsonify({"ok": False, "error": "TICKET_NOT_FOUND", "msg": "找不到該 Email 相關的工單"}), 404

                if len(tickets) > 1:
                    # 有多個工單，返回列表讓用戶選擇
                    ticket_list = [
                        {
                            "ticket_id": t.public_id,
                            "subject": t.subject,
                            "status": t.status,
                            "created_at": t.created_at.isoformat()
                        }
                        for t in tickets[:10]  # 最多返回10個
                    ]
                    return jsonify({
                        "ok": True,
                        "multiple": True,
                        "tickets": ticket_list,
                        "msg": "找到多個工單，請選擇一個或提供工單編號"
                    })

                # 只有一個工單
                ticket = tickets[0]

            # 生成新的追蹤 token
            token = SupportService.generate_guest_token(
                ticket.id,
                email,
                current_app.config.get('SECRET_KEY', 'fallback-secret')
            )

            tracking_url = f"/support/track?ticket={ticket.public_id}&token={token}"
            return jsonify({
                "ok": True,
                "tracking_url": tracking_url
            })

    except Exception as e:
        current_app.logger.error(f"Track guest ticket error: {e}")
        return jsonify({"ok": False, "error": "SERVER_ERROR", "msg": "伺服器錯誤"}), 500


@bp.route("/queue", methods=["GET"])
@jwt_required()
def get_queue():
    """客服隊列查詢（後台）
    權限：
      - dev_admin：可檢視全部
      - cross_admin/campus_admin/campus_moderator/cross_moderator：僅能檢視指派給自己的工單
    篩選：status, priority, category, school_id, keyword
    """
    try:
        ident = get_jwt_identity()
        try:
            user_id = int(ident) if ident is not None else None
        except (TypeError, ValueError):
            return jsonify({
                "ok": False,
                "error": "JWT_BAD_ID",
                "msg": f"無效的使用者識別: {ident}"
            }), 401
        status = (request.args.get('status') or '').strip().lower() or None
        priority = (request.args.get('priority') or '').strip().lower() or None
        category = (request.args.get('category') or '').strip().lower() or None
        school_id = request.args.get('school_id', type=int)
        keyword = (request.args.get('q') or '').strip()
        limit = min(int(request.args.get('limit', 50)), 200)
        offset = max(int(request.args.get('offset', 0)), 0)

        with get_main_session() as main_s, get_support_session() as support_s:
            me = main_s.get(User, user_id)
            if not me:
                return jsonify({"ok": False, "error": "AUTH_E_USER_NOT_FOUND", "msg": "用戶不存在，請重新登入"}), 401

            q = support_s.query(SupportTicket)

            # 角色可見範圍
            role = (me.role or '').strip()
            allowed_roles = ['dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator']
            if role not in allowed_roles:
                return jsonify({"ok": False, "error": "PERMISSION_DENIED", "msg": f"權限不足，需要管理員角色。當前角色: {role or '無'}"}), 403
            
            if role != 'dev_admin':
                q = q.filter(SupportTicket.assigned_to == me.id)

            # 篩選條件
            if status:
                q = q.filter(SupportTicket.status == status)
            if priority:
                q = q.filter(SupportTicket.priority == priority)
            if category:
                q = q.filter(SupportTicket.category == category)
            if school_id is not None:
                q = q.filter(SupportTicket.school_id == school_id)
            if keyword:
                kw = f"%{keyword}%"
                q = q.filter(or_(SupportTicket.subject.ilike(kw), SupportTicket.public_id.ilike(kw)))

            total = q.count()
            rows = (
                q.order_by(desc(SupportTicket.last_activity_at))
                 .offset(offset)
                 .limit(limit)
                 .all()
            )

            items = []
            for t in rows:
                # 學校名稱
                school_name = None
                if t.school_id:
                    try:
                        sch = main_s.get(School, t.school_id)
                        school_name = sch.name if sch else None
                    except Exception:
                        school_name = None

                # 指派者名稱
                assignee_name = None
                if t.assigned_to:
                    try:
                        au = main_s.get(User, t.assigned_to)
                        assignee_name = au.username if au else None
                    except Exception:
                        assignee_name = None

                # 申請者顯示
                requester_name = t.get_display_name()
                requester_ip = None  # 如需，未來可在 ticket 增欄位或事件中取得

                item = {
                    "id": t.public_id,
                    "subject": t.subject,
                    "category": t.category,
                    "priority": t.priority,
                    "status": t.status,
                    "school_name": school_name,
                    "source": "Web",  # 佔位：可由 message/attachments 來源判斷
                    "assigned_to": assignee_name,
                    "last_activity_at": t.last_activity_at.isoformat(),
                }
                if role == 'dev_admin':
                    item.update({"requester_name": requester_name, "requester_ip": requester_ip})
                else:
                    item.update({"requester_name": requester_name})
                items.append(item)

            return jsonify({
                "ok": True,
                "data": items,
                "pagination": {"total": total, "limit": limit, "offset": offset, "has_more": offset + limit < total}
            })
    except (OperationalError, SQLAlchemyError) as e:
        current_app.logger.error(f"Support queue DB error: {e}")
        return jsonify({"ok": False, "error": "SUPPORT_E_DB", "msg": "支援系統資料庫錯誤"}), 500
    except Exception as e:
        current_app.logger.error(f"Support queue error: {e}")
        return jsonify({"ok": False, "error": "SUPPORT_E_SERVER"}), 500
