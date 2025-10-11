"""
聊天記錄 API 路由
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.authz import require_role
from utils.db import get_session
from models import User
from services.chat_service import ChatService

bp = Blueprint("chat", __name__, url_prefix="/api/chat")


@bp.get("/rooms")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_chat_rooms():
    """獲取聊天房間列表"""
    try:
        room_type = request.args.get("type")  # system, custom, all
        
        with get_session() as s:
            rooms = ChatService.get_active_rooms(s, room_type)
            
            rooms_data = []
            for room in rooms:
                room_data = {
                    "id": room.id,
                    "name": room.name,
                    "description": room.description,
                    "room_type": room.room_type,
                    "owner_id": room.owner_id,
                    "school_id": room.school_id,
                    "is_active": room.is_active,
                    "created_at": room.created_at.isoformat() if room.created_at else None,
                    "updated_at": room.updated_at.isoformat() if room.updated_at else None
                }
                rooms_data.append(room_data)
            
            return jsonify({
                "ok": True,
                "rooms": rooms_data
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取房間列表失敗: {str(e)}"}), 500


@bp.get("/rooms/<string:room_id>/messages")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_room_messages(room_id: str):
    """獲取房間消息歷史"""
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
        offset = int(request.args.get("offset", 0))
        before_id = request.args.get("before_id", type=int)
        
        with get_session() as s:
            # 檢查房間是否存在
            room = ChatService.get_room_info(s, room_id)
            if not room:
                return jsonify({"ok": False, "error": "房間不存在"}), 404
            
            # 獲取消息歷史
            messages = ChatService.get_room_messages(
                session=s,
                room_id=room_id,
                limit=limit,
                offset=offset,
                before_id=before_id
            )
            
            messages_data = []
            for msg in messages:
                msg_data = {
                    "id": msg.id,
                    "room_id": msg.room_id,
                    "user_id": msg.user_id,
                    "username": msg.username,
                    "client_id": msg.client_id,
                    "message": msg.message,
                    "message_type": msg.message_type,
                    "created_at": msg.created_at.isoformat() if msg.created_at else None
                }
                messages_data.append(msg_data)
            
            return jsonify({
                "ok": True,
                "room": {
                    "id": room.id,
                    "name": room.name,
                    "description": room.description,
                    "room_type": room.room_type
                },
                "messages": messages_data,
                "pagination": {
                    "limit": limit,
                    "offset": offset,
                    "total": len(messages_data)
                }
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取消息歷史失敗: {str(e)}"}), 500


@bp.post("/rooms")
@jwt_required()
@require_role("dev_admin")
def create_chat_room():
    """創建聊天房間（僅 dev_admin）"""
    try:
        data = request.get_json() or {}
        room_id = data.get("room_id")
        name = data.get("name")
        description = data.get("description")
        room_type = data.get("room_type", "custom")
        school_id = data.get("school_id", type=int)
        
        if not room_id or not name:
            return jsonify({"ok": False, "error": "房間ID和名稱不能為空"}), 400
        
        user_id = get_jwt_identity()
        
        with get_session() as s:
            # 檢查房間是否已存在
            existing_room = ChatService.get_room_info(s, room_id)
            if existing_room:
                return jsonify({"ok": False, "error": "房間ID已存在"}), 400
            
            # 創建房間
            room = ChatService.create_room(
                session=s,
                room_id=room_id,
                name=name,
                description=description,
                room_type=room_type,
                owner_id=user_id,
                school_id=school_id
            )
            
            s.commit()
            
            return jsonify({
                "ok": True,
                "room": {
                    "id": room.id,
                    "name": room.name,
                    "description": room.description,
                    "room_type": room.room_type,
                    "owner_id": room.owner_id,
                    "school_id": room.school_id,
                    "created_at": room.created_at.isoformat() if room.created_at else None
                }
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"創建房間失敗: {str(e)}"}), 500


@bp.put("/rooms/<string:room_id>")
@jwt_required()
@require_role("dev_admin")
def update_chat_room(room_id: str):
    """更新聊天房間（僅 dev_admin）"""
    try:
        data = request.get_json() or {}
        name = data.get("name")
        description = data.get("description")
        is_active = data.get("is_active")
        
        with get_session() as s:
            room = ChatService.update_room(
                session=s,
                room_id=room_id,
                name=name,
                description=description,
                is_active=is_active
            )
            
            if not room:
                return jsonify({"ok": False, "error": "房間不存在"}), 404
            
            s.commit()
            
            return jsonify({
                "ok": True,
                "room": {
                    "id": room.id,
                    "name": room.name,
                    "description": room.description,
                    "room_type": room.room_type,
                    "owner_id": room.owner_id,
                    "school_id": room.school_id,
                    "is_active": room.is_active,
                    "updated_at": room.updated_at.isoformat() if room.updated_at else None
                }
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"更新房間失敗: {str(e)}"}), 500


@bp.delete("/rooms/<string:room_id>")
@jwt_required()
@require_role("dev_admin")
def delete_chat_room(room_id: str):
    """刪除聊天房間（僅 dev_admin）"""
    try:
        user_id = get_jwt_identity()
        
        with get_session() as s:
            # 獲取用戶信息
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 404
            
            # 獲取房間信息（在刪除前）
            room_info = ChatService.get_room_info(s, room_id)
            if not room_info:
                return jsonify({"ok": False, "error": "房間不存在"}), 404
            
            success = ChatService.delete_room(s, room_id)
            
            if not success:
                return jsonify({"ok": False, "error": "房間不存在"}), 404
            
            s.commit()
            
            # 記錄聊天室刪除事件
            try:
                from services.event_service import EventService
                from utils.ratelimit import get_client_ip
                
                EventService.log_event(
                    session=s,
                    event_type="chat.room.deleted",
                    title=f"刪除聊天室: {room_info.get('name', room_id)}",
                    description=f"管理員 {user.username} 刪除了聊天室「{room_info.get('name', room_id)}」\n"
                               f"房間ID: {room_id}\n"
                               f"描述: {room_info.get('description', '無')}",
                    severity="high",
                    actor_id=user.id,
                    actor_name=user.username,
                    actor_role=user.role,
                    target_type="chat_room",
                    target_id=room_id,
                    target_name=room_info.get('name', room_id),
                    school_id=room_info.get('school_id'),
                    metadata={
                        "room_id": room_id,
                        "room_name": room_info.get('name'),
                        "room_description": room_info.get('description'),
                        "room_type": room_info.get('room_type'),
                        "owner_id": room_info.get('owner_id')
                    },
                    client_ip=get_client_ip(),
                    user_agent=request.headers.get('User-Agent'),
                    is_important=True,
                    send_webhook=True
                )
            except Exception as e:
                print(f"記錄聊天室刪除事件失敗: {e}")
                pass  # 事件記錄失敗不影響主要功能
            
            return jsonify({
                "ok": True,
                "message": "房間已刪除"
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"刪除房間失敗: {str(e)}"}), 500


@bp.post("/rooms/<string:room_id>/cleanup")
@jwt_required()
@require_role("dev_admin")
def cleanup_room_messages(room_id: str):
    """清理房間舊消息（僅 dev_admin）"""
    try:
        keep_days = int(request.args.get("keep_days", 30))
        
        with get_session() as s:
            # 檢查房間是否存在
            room = ChatService.get_room_info(s, room_id)
            if not room:
                return jsonify({"ok": False, "error": "房間不存在"}), 404
            
            # 清理舊消息
            deleted_count = ChatService.cleanup_old_messages(s, room_id, keep_days)
            s.commit()
            
            return jsonify({
                "ok": True,
                "deleted_count": deleted_count,
                "keep_days": keep_days
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"清理消息失敗: {str(e)}"}), 500
