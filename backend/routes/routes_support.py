"""
Support API routes - 前台支援系統 API
處理用戶創建支援單、查看支援單、訊息回覆等功能
"""
from __future__ import annotations
import re
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from sqlalchemy import desc, or_

from models.support import SupportTicket, SupportMessage, TicketStatus, TicketCategory, TicketPriority, AuthorType
from models.base import User
from models.school import School
from services.support_service import SupportService
from utils.db import get_session
from utils.ratelimit import rate_limit
from utils.sanitize import sanitize_html
from utils.notify import send_admin_event

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
@rate_limit(calls=5, per_seconds=60, by='client')  # 每分鐘最多 5 個支援單
def create_ticket():
    """創建支援單
    
    支援 JSON 和 multipart/form-data 格式
    登入用戶: {subject, body, category?, priority?, school_slug?, attachments?}
    訪客用戶: {email, subject, body, category?, priority?, school_slug?, attachments?}
    """
    
    # 檢查是否為檔案上傳
    if request.content_type and 'multipart/form-data' in request.content_type:
        # 處理檔案上傳
        subject = clean_input(request.form.get('subject', ''), 500)
        body = clean_input(request.form.get('body', ''), 10000)
        category = request.form.get('category', TicketCategory.OTHER)
        priority = request.form.get('priority', TicketPriority.MEDIUM)
        school_slug = request.form.get('school_slug')
        email = request.form.get('email', '').strip()
        
        # 處理上傳的檔案
        attachments = {}
        files = request.files.getlist('files')
        
        if files:
            from services.media_service import MediaService
            
            uploaded_files = []
            for file in files:
                if file and file.filename:
                    try:
                        # 使用 MediaService 處理檔案上傳
                        media_result = MediaService.upload_file(
                            file=file,
                            upload_dir='support',
                            allowed_extensions=['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt'],
                            max_size=10 * 1024 * 1024  # 10MB
                        )
                        
                        if media_result['success']:
                            uploaded_files.append({
                                'filename': file.filename,
                                'path': media_result['path'],
                                'size': media_result['size'],
                                'mime_type': file.content_type
                            })
                        else:
                            current_app.logger.warning(f"File upload failed: {media_result['error']}")
                    except Exception as e:
                        current_app.logger.error(f"File upload error: {e}")
            
            if uploaded_files:
                attachments = {
                    'files': uploaded_files
                }
    else:
        # 處理 JSON 請求
        data = request.get_json() or {}
        
        # 基本驗證
        subject = clean_input(data.get('subject', ''), 500)
        body = clean_input(data.get('body', ''), 10000)
        category = data.get('category', TicketCategory.OTHER)
        priority = data.get('priority', TicketPriority.MEDIUM)
        school_slug = data.get('school_slug')
        attachments = data.get('attachments', {})
    
    if not subject:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_MISSING_SUBJECT', 'msg': '請輸入支援單主題'}), 400
    
    if not body:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_MISSING_BODY', 'msg': '請輸入支援單內容'}), 400
    
    # 驗證分類和優先級
    if category not in [c.value for c in TicketCategory]:
        category = TicketCategory.OTHER
    if priority not in [p.value for p in TicketPriority]:
        priority = TicketPriority.MEDIUM
    
    try:
        # 檢查用戶身份
        user_id = None
        guest_email = None
        
        try:
            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
            if user_id:
                user_id = int(user_id)
        except:
            pass
        
        # 檢查登入用戶的權限：dev_admin 不能創建支援單
        if user_id:
            with get_session() as session:
                user = session.get(User, user_id)
                if user and user.role == "dev_admin":
                    return jsonify({'ok': False, 'error': 'SUPPORT_E_DEV_ADMIN_FORBIDDEN', 'msg': 'dev_admin 不能創建支援單，您是支援單的處理者'}), 403
        
        # 如果不是登入用戶，需要驗證 Email
        if not user_id:
            # 根據請求類型取得 email
            if request.content_type and 'multipart/form-data' in request.content_type:
                guest_email = email
            else:
                guest_email = data.get('email', '').strip().lower()
            
            if not guest_email:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_MISSING_EMAIL', 'msg': '請提供聯絡 Email'}), 400
            
            if not validate_email(guest_email):
                return jsonify({'ok': False, 'error': 'SUPPORT_E_INVALID_EMAIL', 'msg': 'Email 格式不正確'}), 400
        
        # 取得學校 ID
        school_id = None
        if school_slug:
            with get_session() as session:
                school = session.query(School).filter_by(slug=school_slug).first()
                if school:
                    school_id = school.id
        
        # 如果是登入用戶但沒指定學校，使用用戶所屬學校
        if user_id and not school_id:
            with get_session() as session:
                user = session.get(User, user_id)
                if user and user.school_id:
                    school_id = user.school_id
        
        # 創建支援單
        with get_session() as session:
            ticket = SupportService.create_ticket(
                session=session,
                subject=subject,
                body=body,
                category=category,
                priority=priority,
                user_id=user_id,
                guest_email=guest_email,
                school_id=school_id,
                attachments=attachments
            )
            
            # 記錄審計事件
            try:
                send_admin_event(
                    kind="support_ticket_created",
                    title=f"新支援單：{subject}",
                    description=f"{'用戶' if user_id else '訪客'}創建了新的支援單",
                    fields=[
                        {"name": "支援單編號", "value": ticket.public_id, "inline": True},
                        {"name": "分類", "value": category, "inline": True},
                        {"name": "優先級", "value": priority, "inline": True},
                        {"name": "提交者", "value": ticket.get_display_name(), "inline": True}
                    ],
                    source=f"/api/support/tickets",
                    actor=ticket.get_display_name()
                )
            except Exception as e:
                current_app.logger.warning(f"Failed to send admin event: {e}")
            
            # 為訪客生成追蹤 Token
            tracking_token = None
            if guest_email:
                secret_key = current_app.config.get('SECRET_KEY', 'dev-secret')
                tracking_token = SupportService.generate_guest_token(
                    ticket.id, guest_email, secret_key
                )
            
            response_data = {
                'ok': True,
                'ticket': {
                    'id': ticket.public_id,
                    'subject': ticket.subject,
                    'status': ticket.status,
                    'created_at': ticket.created_at.isoformat()
                },
                'msg': '支援單已成功創建'
            }
            
            if tracking_token:
                response_data['tracking_token'] = tracking_token
                response_data['tracking_url'] = f"/support/track?token={tracking_token}"
            
            return jsonify(response_data), 201
    
    except ValueError as e:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_VALIDATION', 'msg': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Create ticket error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤，請稍後再試'}), 500


@bp.route("/files/<filename>")
def get_support_file(filename: str):
    """取得支援檔案
    
    需要權限：支援單建立者或管理員
    """
    try:
        from pathlib import Path
        
        # 安全檢查檔案名
        if '..' in filename or '/' in filename:
            return jsonify({'ok': False, 'error': 'SUPPORT_E_INVALID_FILENAME'}), 400
        
        # 構建檔案路徑
        file_path = Path(UPLOAD_ROOT) / "support" / filename
        
        # 檢查檔案是否存在
        if not file_path.exists():
            return jsonify({'ok': False, 'error': 'SUPPORT_E_FILE_NOT_FOUND'}), 404
        
        # 檢查檔案是否在正確的目錄下
        upload_root = Path(UPLOAD_ROOT).resolve()
        file_path_resolved = file_path.resolve()
        
        if not str(file_path_resolved).startswith(str(upload_root)):
            return jsonify({'ok': False, 'error': 'SUPPORT_E_INVALID_PATH'}), 400
        
        # 返回檔案
        return send_file(
            file_path,
            as_attachment=False,
            download_name=filename
        )
        
    except Exception as e:
        current_app.logger.error(f"Support file access error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER'}), 500


@bp.route("/tickets/<public_id>", methods=["GET"])
def get_ticket(public_id: str):
    """取得支援單詳情
    
    需要權限：支援單建立者或有效的訪客 token
    """
    
    # 取得簽章參數
    sig_token = request.args.get('sig') or request.args.get('token')
    
    try:
        user_id = None
        try:
            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
            if user_id:
                user_id = int(user_id)
        except:
            pass
        
        with get_session() as session:
            # 查找支援單
            ticket = session.query(SupportTicket).filter_by(public_id=public_id).first()
            if not ticket:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_NOT_FOUND', 'msg': '支援單不存在'}), 404
            
            # 權限檢查
            has_access = False
            
            # 登入用戶：必須是建立者或之前以訪客身份建立
            if user_id:
                if ticket.user_id == user_id:
                    has_access = True
                elif ticket.guest_email:
                    # 檢查用戶的 email 是否與支援單的 guest_email 匹配
                    user = session.get(User, user_id)
                    if user and user.email and user.email.lower() == ticket.guest_email.lower():
                        has_access = True
            
            # 訪客：需要有效簽章
            elif sig_token and ticket.guest_email:
                secret_key = current_app.config.get('SECRET_KEY', 'dev-secret')
                token_data = SupportService.verify_guest_token(sig_token, secret_key)
                if token_data:
                    token_ticket_id, token_email = token_data
                    if token_ticket_id == ticket.id and token_email == ticket.guest_email:
                        has_access = True
            
            if not has_access:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_FORBIDDEN', 'msg': '無權限查看此支援單'}), 403
            
            # 載入訊息（排除內部備註）
            messages = session.query(SupportMessage).filter(
                SupportMessage.ticket_id == ticket.id,
                SupportMessage.is_internal == False
            ).order_by(SupportMessage.created_at).all()
            
            # 格式化回應
            ticket_data = {
                'id': ticket.public_id,
                'subject': ticket.subject,
                'status': ticket.status,
                'category': ticket.category,
                'priority': ticket.priority,
                'created_at': ticket.created_at.isoformat(),
                'updated_at': ticket.updated_at.isoformat(),
                'last_activity_at': ticket.last_activity_at.isoformat(),
                'message_count': len(messages),
                'submitter': ticket.get_display_name(),
                'messages': []
            }
            
            for msg in messages:
                message_data = {
                    'id': msg.id,
                    'body': msg.body,
                    'author_type': msg.author_type,
                    'author_name': msg.get_author_display_name(),
                    'created_at': msg.created_at.isoformat(),
                    'attachments': msg.attachments or {}
                }
                ticket_data['messages'].append(message_data)
            
            return jsonify({'ok': True, 'ticket': ticket_data})
    
    except Exception as e:
        current_app.logger.error(f"Get ticket error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/tickets/<public_id>/messages", methods=["POST"])
@rate_limit(calls=10, per_seconds=60, by='client')  # 每分鐘最多 10 條訊息
def add_message(public_id: str):
    """新增支援單訊息
    
    登入用戶或訪客皆可使用
    """
    
    data = request.get_json() or {}
    body = clean_input(data.get('body', ''), 10000)
    attachments = data.get('attachments', {})
    sig_token = data.get('sig') or request.args.get('sig') or request.args.get('token')
    
    if not body:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_MISSING_BODY', 'msg': '請輸入訊息內容'}), 400
    
    try:
        user_id = None
        try:
            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
            if user_id:
                user_id = int(user_id)
        except:
            pass
        
        with get_session() as session:
            # 查找支援單
            ticket = session.query(SupportTicket).filter_by(public_id=public_id).first()
            if not ticket:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_NOT_FOUND', 'msg': '支援單不存在'}), 404
            
            # 權限檢查（同 get_ticket）
            has_access = False
            author_type = AuthorType.USER
            
            if user_id:
                if ticket.user_id == user_id:
                    has_access = True
                    author_type = AuthorType.USER
                elif ticket.guest_email:
                    # 檢查用戶的 email 是否與支援單的 guest_email 匹配
                    user = session.get(User, user_id)
                    if user and user.email and user.email.lower() == ticket.guest_email.lower():
                        has_access = True
                        author_type = AuthorType.USER
            elif sig_token and ticket.guest_email:
                secret_key = current_app.config.get('SECRET_KEY', 'dev-secret')
                token_data = SupportService.verify_guest_token(sig_token, secret_key)
                if token_data:
                    token_ticket_id, token_email = token_data
                    if token_ticket_id == ticket.id and token_email == ticket.guest_email:
                        has_access = True
                        author_type = AuthorType.GUEST
            
            if not has_access:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_FORBIDDEN', 'msg': '無權限回覆此支援單'}), 403
            
            # 新增訊息
            message = SupportService.add_message(
                session=session,
                ticket_id=ticket.id,
                body=body,
                author_user_id=user_id,
                author_type=author_type,
                attachments=attachments
            )
            
            # 發送通知
            try:
                send_admin_event(
                    kind="support_message_added",
                    title=f"支援單新訊息：{ticket.subject}",
                    description=f"{message.get_author_display_name()} 回覆了支援單",
                    fields=[
                        {"name": "支援單編號", "value": ticket.public_id, "inline": True},
                        {"name": "作者", "value": message.get_author_display_name(), "inline": True},
                        {"name": "內容預覽", "value": body[:100] + ('...' if len(body) > 100 else ''), "inline": False}
                    ],
                    source=f"/api/support/tickets/{public_id}/messages",
                    actor=message.get_author_display_name()
                )
            except Exception as e:
                current_app.logger.warning(f"Failed to send admin event: {e}")
            
            return jsonify({
                'ok': True,
                'message': {
                    'id': message.id,
                    'body': message.body,
                    'author_type': message.author_type,
                    'author_name': message.get_author_display_name(),
                    'created_at': message.created_at.isoformat()
                },
                'msg': '訊息已發送'
            }), 201
    
    except ValueError as e:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_VALIDATION', 'msg': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Add message error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/my-tickets", methods=["GET"])
@jwt_required()
def get_my_tickets():
    """取得我的支援單列表（僅登入用戶）"""
    
    try:
        user_id = int(get_jwt_identity())
        status_filter = request.args.get('status')
        limit = min(int(request.args.get('limit', 20)), 100)
        offset = int(request.args.get('offset', 0))
        
        with get_session() as session:
            tickets = SupportService.get_tickets_by_user(
                session=session,
                user_id=user_id,
                status=status_filter,
                limit=limit,
                offset=offset
            )
            
            tickets_data = []
            for ticket in tickets:
                ticket_data = {
                    'id': ticket.public_id,
                    'subject': ticket.subject,
                    'status': ticket.status,
                    'category': ticket.category,
                    'priority': ticket.priority,
                    'message_count': ticket.message_count,
                    'created_at': ticket.created_at.isoformat(),
                    'last_activity_at': ticket.last_activity_at.isoformat()
                }
                tickets_data.append(ticket_data)
            
            return jsonify({'ok': True, 'tickets': tickets_data})
    
    except Exception as e:
        current_app.logger.error(f"Get my tickets error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/guest/verify", methods=["POST"])
def verify_guest():
    """訪客一鍵驗證（通過 Email 連結）"""
    
    data = request.get_json() or {}
    token = data.get('token') or request.args.get('token')
    
    if not token:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_MISSING_TOKEN', 'msg': '缺少驗證 Token'}), 400
    
    try:
        secret_key = current_app.config.get('SECRET_KEY', 'dev-secret')
        token_data = SupportService.verify_guest_token(token, secret_key)
        
        if not token_data:
            return jsonify({'ok': False, 'error': 'SUPPORT_E_INVALID_TOKEN', 'msg': 'Token 無效或已過期'}), 400
        
        ticket_id, guest_email = token_data
        
        with get_session() as session:
            ticket = session.get(SupportTicket, ticket_id)
            if not ticket or ticket.guest_email != guest_email:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_TOKEN_MISMATCH', 'msg': 'Token 與支援單不匹配'}), 400
            
            # 標記為已驗證
            if not ticket.guest_verified:
                ticket.guest_verified = True
                session.commit()
            
            return jsonify({
                'ok': True,
                'ticket_id': ticket.public_id,
                'msg': '驗證成功',
                'redirect_url': f"/support/ticket/{ticket.public_id}?token={token}"
            })
    
    except Exception as e:
        current_app.logger.error(f"Guest verify error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/guest/track", methods=["POST"])
@rate_limit(calls=5, per_seconds=60, by='client')
def track_guest():
    """訪客支援單追蹤（支援單號 或 Email 任一即可）

    - 只輸入支援單號：以 public_id 尋找，若為訪客單則回傳追蹤連結。
    - 只輸入 Email：取該 Email 最新的一筆訪客單並回傳追蹤連結。
    - 同時提供兩者：以兩者匹配進行回傳（與舊行為相容）。
    """

    data = request.get_json() or {}
    ticket_id = clean_input(data.get('ticket_id', ''), 50)
    email = clean_input(data.get('email', ''), 255).lower()

    # 允許任一即可，但不能都為空
    if not ticket_id and not email:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_MISSING_PARAMS', 'msg': '請提供支援單編號或 Email'}), 400

    try:
        with get_session() as session:
            ticket = None

            if ticket_id and email:
                # 舊行為：必須同時匹配
                if not validate_email(email):
                    return jsonify({'ok': False, 'error': 'SUPPORT_E_INVALID_EMAIL', 'msg': 'Email 格式不正確'}), 400
                ticket = session.query(SupportTicket).filter_by(public_id=ticket_id, guest_email=email).first()
                if not ticket:
                    return jsonify({'ok': False, 'error': 'SUPPORT_E_NOT_FOUND', 'msg': '找不到對應的支援單'}), 404
            elif ticket_id:
                # 僅以單號查找（訪客單即可，狀態不再限制）
                ticket = session.query(SupportTicket).filter_by(public_id=ticket_id).first()
                if not ticket or not ticket.guest_email:
                    return jsonify({'ok': False, 'error': 'SUPPORT_E_NOT_FOUND', 'msg': '找不到對應的支援單'}), 404
                email = ticket.guest_email  # 使用單內留存的 Email 生成 token
            else:
                # 僅 Email：取最新一筆
                if not validate_email(email):
                    return jsonify({'ok': False, 'error': 'SUPPORT_E_INVALID_EMAIL', 'msg': 'Email 格式不正確'}), 400
                ticket = (
                    session.query(SupportTicket)
                    .filter(SupportTicket.guest_email == email)
                    .order_by(desc(SupportTicket.created_at))
                    .first()
                )
                if not ticket:
                    return jsonify({'ok': False, 'error': 'SUPPORT_E_NOT_FOUND', 'msg': '此 Email 尚無支援單'}), 404

            # 生成追蹤 Token 與連結
            secret_key = current_app.config.get('SECRET_KEY', 'dev-secret')
            tracking_token = SupportService.generate_guest_token(ticket.id, email, secret_key)

            return jsonify({
                'ok': True,
                'ticket': {
                    'id': ticket.public_id,
                    'subject': ticket.subject,
                    'status': ticket.status,
                    'created_at': ticket.created_at.isoformat()
                },
                'tracking_token': tracking_token,
                'tracking_url': f"/support/ticket/{ticket.public_id}?token={tracking_token}",
                'msg': '找到您的支援單'
            })

    except Exception as e:
        current_app.logger.error(f"Guest track error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/tickets/<public_id>/close", methods=["POST"])
def close_ticket(public_id: str):
    """關閉支援單（用戶或訪客皆可）"""
    
    sig_token = request.args.get('sig') or request.args.get('token')
    data = request.get_json() or {}
    reason = clean_input(data.get('reason', ''), 500)
    
    try:
        user_id = None
        try:
            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
            if user_id:
                user_id = int(user_id)
        except:
            pass
        
        with get_session() as session:
            ticket = session.query(SupportTicket).filter_by(public_id=public_id).first()
            if not ticket:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_NOT_FOUND', 'msg': '支援單不存在'}), 404
            
            # 權限檢查
            has_access = False
            if user_id:
                if ticket.user_id == user_id:
                    has_access = True
                elif ticket.guest_email:
                    # 檢查用戶的 email 是否與支援單的 guest_email 匹配
                    user = session.get(User, user_id)
                    if user and user.email and user.email.lower() == ticket.guest_email.lower():
                        has_access = True
            elif sig_token and ticket.guest_email:
                secret_key = current_app.config.get('SECRET_KEY', 'dev-secret')
                token_data = SupportService.verify_guest_token(sig_token, secret_key)
                if token_data:
                    token_ticket_id, token_email = token_data
                    if token_ticket_id == ticket.id and token_email == ticket.guest_email:
                        has_access = True
            
            if not has_access:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_FORBIDDEN', 'msg': '無權限關閉此工單'}), 403
            
            # 檢查支援單狀態
            if ticket.status in [TicketStatus.CLOSED]:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_ALREADY_CLOSED', 'msg': '支援單已經關閉'}), 400
            
            # 關閉支援單
            SupportService.change_status(
                session=session,
                ticket_id=ticket.id,
                new_status=TicketStatus.CLOSED,
                reason=reason or "用戶關閉"
            )
            
            # 如果有原因，添加關閉訊息
            if reason:
                SupportService.add_message(
                    session=session,
                    ticket_id=ticket.id,
                    body=f"支援單關閉原因：{reason}",
                    author_user_id=user_id,
                    author_type=AuthorType.USER if user_id else AuthorType.GUEST
                )
            
            return jsonify({
                'ok': True,
                'msg': '支援單已關閉',
                'status': TicketStatus.CLOSED
            })
    
    except Exception as e:
        current_app.logger.error(f"Close ticket error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/healthz", methods=["GET"])
def support_health():
    """支援系統健康檢查"""
    
    try:
        with get_session() as session:
            # 簡單查詢測試資料庫連接
            count = session.query(SupportTicket).count()
            
            return jsonify({
                'ok': True,
                'status': 'healthy',
                'total_tickets': count,
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
    
    except Exception as e:
        current_app.logger.error(f"Support health check failed: {e}")
        return jsonify({
            'ok': False,
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 500


@bp.route("/recent", methods=["GET"])
@jwt_required()
def get_recent_tickets():
    """取得最近的支援單（用於首頁小工具）"""
    
    try:
        user_id = int(get_jwt_identity())
        limit = min(int(request.args.get('limit', 5)), 20)
        
        with get_session() as session:
            tickets = SupportService.get_tickets_by_user(
                session=session,
                user_id=user_id,
                limit=limit
            )
            
            tickets_data = []
            for ticket in tickets:
                ticket_data = {
                    'id': ticket.public_id,
                    'subject': ticket.subject,
                    'status': ticket.status,
                    'created_at': ticket.created_at.isoformat(),
                    'last_activity_at': ticket.last_activity_at.isoformat()
                }
                tickets_data.append(ticket_data)
            
            return jsonify({'ok': True, 'tickets': tickets_data})
    
    except Exception as e:
        current_app.logger.error(f"Get recent tickets error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500
