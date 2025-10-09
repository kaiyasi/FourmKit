"""
管理員聊天室 API 路由 - 增強版
支援檔案分享、訊息搜尋、@提及通知、自訂聊天室創建
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import Session
from datetime import datetime
import os

from utils.db import get_session
from models.base import User
from models.admin_chat import MessageType, ChatRoomType
from services.admin_chat_service import AdminChatService
from utils.ratelimit import rate_limit as ratelimit
from sqlalchemy import or_

bp = Blueprint("admin_chat", __name__, url_prefix="/api/admin/chat")


@bp.route("/rooms", methods=["GET"])
@jwt_required()
@ratelimit(calls=60, per_seconds=60)  # 增加聊天室列表的請求限制
def get_rooms():
    """獲取用戶可訪問的聊天室列表"""
    user_id = get_jwt_identity()
    
    with get_session() as db:
        user = db.get(User, user_id)
        if not user or user.role not in ["dev_admin", "campus_admin", "campus_moderator", "cross_admin"]:
            return jsonify({"error": "權限不足"}), 403
        
        rooms = AdminChatService.get_user_accessible_rooms(
            user_id=user_id,
            user_role=user.role,
            school_id=user.school_id
        )
        
        return jsonify({"rooms": rooms})


@bp.route("/rooms", methods=["POST"])
@jwt_required()
@ratelimit(calls=5, per_seconds=60)
def create_room():
    """創建自訂聊天室"""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    room_type = data.get("type", "custom")
    school_id = data.get("school_id")
    is_private = data.get("is_private", False)
    max_members = data.get("max_members", 100)
    
    # 驗證輸入
    if not name:
        return jsonify({"error": "聊天室名稱不能為空"}), 400
    
    if len(name) > 100:
        return jsonify({"error": "聊天室名稱過長"}), 400
    
    if len(description) > 500:
        return jsonify({"error": "描述過長"}), 400
    
    # 轉換類型
    try:
        chat_room_type = ChatRoomType(room_type)
    except ValueError:
        chat_room_type = ChatRoomType.CUSTOM
    
    room = AdminChatService.create_room(
        name=name,
        description=description,
        room_type=chat_room_type,
        created_by=user_id,
        school_id=school_id,
        is_private=is_private,
        max_members=min(max_members, 500)
    )
    
    if not room:
        return jsonify({"error": "創建失敗，可能名稱重複或權限不足"}), 400
    
    return jsonify({"room": room})


@bp.route('/admin-users', methods=['GET'])
@jwt_required()
@ratelimit(calls=30, per_seconds=60)
def list_admin_users():
    """提供可邀請的管理端使用者清單（支援關鍵字過濾）。"""
    user_id = get_jwt_identity()
    q = (request.args.get('q') or '').strip()
    school_id = request.args.get('school_id', type=int)

    with get_session() as db:
        me = db.get(User, user_id)
        if not me or me.role not in ["dev_admin","campus_admin","cross_admin","campus_moderator","cross_moderator"]:
            return jsonify({'error': '權限不足'}), 403

        allowed_roles = ["dev_admin","cross_admin","campus_admin","campus_moderator","cross_moderator"]
        query = db.query(User).filter(User.role.in_(allowed_roles))
        if school_id:
            query = query.filter(User.school_id == school_id)
        if q:
            like = f"%{q}%"
            query = query.filter(or_(User.username.ilike(like), User.email.ilike(like)))

        users = query.order_by(User.username.asc()).limit(50).all()
        out = [{'id': u.id, 'username': u.username, 'email': u.email, 'role': u.role, 'school_id': u.school_id} for u in users]
        return jsonify({'users': out})


@bp.route('/rooms/<int:room_id>/invite', methods=['POST'])
@jwt_required()
@ratelimit(calls=10, per_seconds=60)
def invite_to_room(room_id: int):
    """邀請成員加入房間。body: { user_ids: number[] }"""
    inviter_id = get_jwt_identity()
    data = request.get_json() or {}
    user_ids = data.get('user_ids') or []
    if not isinstance(user_ids, list) or not all(isinstance(x, int) for x in user_ids):
        return jsonify({'error': 'user_ids 必須為整數陣列'}), 400

    ok, msg, added = AdminChatService.invite_users_to_room(room_id, inviter_id, user_ids)
    if not ok:
        return jsonify({'error': msg}), 400
    return jsonify({'message': msg, 'added': added})


@bp.route('/rooms/<int:room_id>/members', methods=['GET'])
@jwt_required()
@ratelimit(calls=60, per_seconds=60)
def room_members(room_id: int):
    user_id = get_jwt_identity()
    with get_session() as db:
        if not AdminChatService.can_user_access_room(user_id, room_id):
            return jsonify({'error': '權限不足'}), 403
    return jsonify({'members': AdminChatService.list_room_members(room_id)})


@bp.route("/rooms/<int:room_id>/messages", methods=["GET"])
@jwt_required()
@ratelimit(calls=120, per_seconds=60)  # 增加到每分鐘120次請求
def get_messages(room_id: int):
    """獲取聊天室訊息"""
    user_id = get_jwt_identity()
    
    # 分頁參數
    limit = min(int(request.args.get("limit", 50)), 100)
    before = request.args.get("before", type=int)
    
    messages = AdminChatService.get_room_messages(
        room_id=room_id,
        user_id=user_id,
        limit=limit,
        before=before
    )
    
    if messages is None:
        return jsonify({"error": "權限不足或聊天室不存在"}), 403
    
    return jsonify({"messages": messages})


@bp.route("/rooms/<int:room_id>/messages/search", methods=["GET"])
@jwt_required()
@ratelimit(calls=20, per_seconds=60)
def search_messages(room_id: int):
    """搜尋聊天室訊息"""
    user_id = get_jwt_identity()
    
    query = request.args.get("q", "").strip()
    message_type = request.args.get("type")
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    limit = min(int(request.args.get("limit", 50)), 100)
    
    # 解析日期
    date_from_obj = None
    date_to_obj = None
    
    if date_from:
        try:
            date_from_obj = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        except:
            pass
    
    if date_to:
        try:
            date_to_obj = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        except:
            pass
    
    if not query and not message_type and not date_from and not date_to:
        return jsonify({"error": "至少需要提供一個搜尋條件"}), 400
    
    results = AdminChatService.search_messages(
        room_id=room_id,
        user_id=user_id,
        query=query,
        message_type=message_type,
        date_from=date_from_obj,
        date_to=date_to_obj,
        limit=limit
    )
    
    return jsonify({"results": results})


@bp.route("/rooms/<int:room_id>/messages", methods=["POST"])
@jwt_required()
@ratelimit(calls=20, per_seconds=60)
def send_message(room_id: int):
    """發送訊息"""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    content = data.get("content", "").strip()
    if not content:
        return jsonify({"error": "訊息內容不能為空"}), 400
    
    if len(content) > 2000:
        return jsonify({"error": "訊息內容過長"}), 400
    
    # 檢查系統通知頻道的特殊權限
    with get_session() as db:
        room = db.get(AdminChatRoom, room_id)
        if room and room.type.value == "system":
            user = db.get(User, user_id)
            if not user or user.role != "dev_admin":
                return jsonify({"error": "只有系統管理員可以在系統通知頻道發送訊息"}), 403
    
    message_type = MessageType.TEXT
    post_id = data.get("post_id")
    
    # 如果包含貼文ID，設為貼文審核訊息
    if post_id:
        message_type = MessageType.POST_REVIEW
    
    message = AdminChatService.send_message(
        room_id=room_id,
        user_id=user_id,
        content=content,
        message_type=message_type,
        post_id=post_id
    )
    
    if not message:
        return jsonify({"error": "發送失敗"}), 403
    
    return jsonify({"message": message})


@bp.route("/rooms/<int:room_id>/upload", methods=["POST"])
@jwt_required()
@ratelimit(calls=10, per_seconds=60)
def upload_file(room_id: int):
    """上傳檔案到聊天室"""
    user_id = get_jwt_identity()
    
    if 'file' not in request.files:
        return jsonify({"error": "沒有選擇檔案"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "檔案名稱為空"}), 400
    
    # 檔案大小檢查 (10MB)
    file.seek(0, 2)  # 移動到檔案末尾
    file_size = file.tell()
    file.seek(0)     # 重置到開頭
    
    if file_size > 10 * 1024 * 1024:
        return jsonify({"error": "檔案大小不能超過 10MB"}), 400
    
    # 檔案類型檢查
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.txt', '.zip'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        return jsonify({"error": "不支援的檔案類型"}), 400
    
    # 讀取檔案數據
    file_data = file.read()
    
    result = AdminChatService.upload_file(
        room_id=room_id,
        user_id=user_id,
        file_data=file_data,
        filename=file.filename,
        content_type=file.content_type or 'application/octet-stream'
    )
    
    if not result:
        return jsonify({"error": "檔案上傳失敗"}), 400
    
    return jsonify({"file": result})


@bp.route("/mentions", methods=["GET"])
@jwt_required()
@ratelimit(calls=30, per_seconds=60)
def get_mentions():
    """獲取用戶的@提及"""
    user_id = get_jwt_identity()
    
    is_read = request.args.get("read")
    if is_read is not None:
        is_read = is_read.lower() == 'true'
    
    limit = min(int(request.args.get("limit", 50)), 100)
    
    mentions = AdminChatService.get_mentions(
        user_id=user_id,
        is_read=is_read,
        limit=limit
    )
    
    return jsonify({"mentions": mentions})


@bp.route("/rooms/<int:room_id>/votes", methods=["POST"])
@jwt_required()
@ratelimit(calls=5, per_seconds=60)
def create_vote(room_id: int):
    """創建投票"""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    title = data.get("title", "").strip()
    description = data.get("description", "").strip()
    options = data.get("options", [])
    post_id = data.get("post_id")
    expires_hours = data.get("expires_hours", 24)
    
    # 驗證輸入
    if not title:
        return jsonify({"error": "投票標題不能為空"}), 400
    
    if len(options) < 2:
        return jsonify({"error": "至少需要兩個選項"}), 400
    
    if len(options) > 10:
        return jsonify({"error": "選項數量不能超過10個"}), 400
    
    # 過濾空選項
    options = [opt.strip() for opt in options if opt.strip()]
    if len(options) < 2:
        return jsonify({"error": "有效選項至少需要兩個"}), 400
    
    vote = AdminChatService.create_vote(
        room_id=room_id,
        user_id=user_id,
        title=title,
        description=description,
        options=options,
        post_id=post_id,
        expires_hours=min(max(expires_hours, 1), 168)  # 1小時到7天
    )
    
    if not vote:
        return jsonify({"error": "創建投票失敗"}), 403
    
    return jsonify({"vote": vote})


@bp.route("/votes/<int:vote_id>/cast", methods=["POST"])
@jwt_required()
@ratelimit(calls=10, per_seconds=60)
def cast_vote(vote_id: int):
    """投票"""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    option_id = data.get("option_id")
    if not option_id or not isinstance(option_id, int):
        return jsonify({"error": "請選擇有效選項"}), 400
    
    success, message = AdminChatService.cast_vote(
        vote_id=vote_id,
        user_id=user_id,
        option_id=option_id
    )
    
    if not success:
        return jsonify({"error": message}), 400
    
    # 返回更新後的投票詳情
    vote_details = AdminChatService.get_vote_details(vote_id, user_id)
    return jsonify({"message": message, "vote": vote_details})


@bp.route("/votes/<int:vote_id>", methods=["GET"])
@jwt_required()
@ratelimit(calls=30, per_seconds=60)
def get_vote(vote_id: int):
    """獲取投票詳情"""
    user_id = get_jwt_identity()
    
    vote = AdminChatService.get_vote_details(vote_id, user_id)
    if not vote:
        return jsonify({"error": "投票不存在或無權限"}), 404
    
    return jsonify({"vote": vote})


@bp.route("/initialize", methods=["POST"])
@jwt_required()
@ratelimit(calls=1, per_seconds=60)
def initialize_chat():
    """初始化聊天室（僅限 dev_admin）"""
    user_id = get_jwt_identity()
    
    with get_session() as db:
        user = db.get(User, user_id)
        if not user or user.role != "dev_admin":
            return jsonify({"error": "權限不足"}), 403
    
    AdminChatService.initialize_default_rooms()
    return jsonify({"message": "聊天室初始化完成"})
