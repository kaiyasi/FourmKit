"""
管理員聊天室服務 - 增強版
處理聊天室管理、訊息收發、投票決策、檔案分享、@提及通知、訊息搜尋
"""

import json
import re
import os
import shutil
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, desc, text

from models.admin_chat import (
    AdminChatRoom, AdminChatMessage, AdminChatMember, AdminChatVote, AdminChatVoteBallot,
    AdminChatMention, AdminChatFile, ChatRoomType, MessageType, VoteStatus
)
from models.base import User, Post
from models.school import School
from utils.db import get_session


class AdminChatService:
    """管理員聊天室服務 - 增強版"""

    @classmethod
    def create_room(cls, name: str, description: str, room_type: ChatRoomType, 
                   created_by: int, school_id: Optional[int] = None, 
                   is_private: bool = False, max_members: int = 100) -> Optional[Dict[str, Any]]:
        """創建聊天室"""
        with get_session() as db:
            user = db.get(User, created_by)
            if not user or user.role not in ["dev_admin", "campus_admin", "cross_admin"]:
                return None
            
            existing = db.query(AdminChatRoom)\
                .filter(AdminChatRoom.name == name)\
                .filter(AdminChatRoom.is_active == True)\
                .first()
            
            if existing:
                return None
            
            room = AdminChatRoom(
                name=name,
                description=description,
                type=room_type,
                school_id=school_id,
                created_by=created_by,
                is_private=is_private,
                max_members=max_members
            )
            
            db.add(room)
            db.commit()
            db.refresh(room)
            
            cls.add_user_to_room(room.id, created_by, role="admin")
            
            return {
                "id": room.id,
                "name": room.name,
                "description": room.description,
                "type": room.type.value,
                "school_name": room.school.name if room.school else None,
                "is_private": room.is_private,
                "max_members": room.max_members,
                "created_at": room.created_at.isoformat()
            }

    @classmethod
    def get_user_accessible_rooms(cls, user_id: int, user_role: str, school_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """獲取用戶可訪問的聊天室"""
        with get_session() as db:
            query = db.query(AdminChatRoom).filter(AdminChatRoom.is_active == True)
            
            if user_role == "dev_admin":
                pass
            elif user_role == "cross_admin":
                query = query.filter(AdminChatRoom.type.in_([
                    ChatRoomType.CROSS, ChatRoomType.EMERGENCY, ChatRoomType.GLOBAL
                ]))
            elif user_role in ["campus_admin", "campus_moderator"]:
                if school_id:
                    query = query.filter(or_(
                        AdminChatRoom.school_id == school_id,
                        AdminChatRoom.type.in_([ChatRoomType.CROSS, ChatRoomType.GLOBAL])
                    ))
                else:
                    query = query.filter(AdminChatRoom.type.in_([ChatRoomType.CROSS, ChatRoomType.GLOBAL]))
            else:
                return []
                
            rooms = query.order_by(AdminChatRoom.type, AdminChatRoom.name).all()
            
            result = []
            for room in rooms:
                if room.is_private:
                    member = db.query(AdminChatMember)\
                        .filter(AdminChatMember.room_id == room.id)\
                        .filter(AdminChatMember.user_id == user_id)\
                        .first()
                    if not member:
                        continue
                
                latest_message = db.query(AdminChatMessage)\
                    .filter(AdminChatMessage.room_id == room.id)\
                    .filter(AdminChatMessage.is_deleted == False)\
                    .order_by(desc(AdminChatMessage.created_at))\
                    .first()
                
                member = db.query(AdminChatMember)\
                    .filter(AdminChatMember.room_id == room.id)\
                    .filter(AdminChatMember.user_id == user_id)\
                    .first()
                
                unread_count = 0
                mention_count = 0
                
                if member and member.last_read_at:
                    unread_count = db.query(AdminChatMessage)\
                        .filter(AdminChatMessage.room_id == room.id)\
                        .filter(AdminChatMessage.created_at > member.last_read_at)\
                        .filter(AdminChatMessage.is_deleted == False)\
                        .count()
                    
                    mention_count = db.query(AdminChatMention)\
                        .filter(AdminChatMention.room_id == room.id)\
                        .filter(AdminChatMention.mentioned_user_id == user_id)\
                        .filter(AdminChatMention.is_read == False)\
                        .count()
                        
                elif not member:
                    cls.add_user_to_room(room.id, user_id)
                    unread_count = db.query(AdminChatMessage)\
                        .filter(AdminChatMessage.room_id == room.id)\
                        .filter(AdminChatMessage.is_deleted == False)\
                        .count()
                
                online_count = db.query(AdminChatMember)\
                    .filter(AdminChatMember.room_id == room.id)\
                    .filter(AdminChatMember.last_active_at > datetime.now(timezone.utc) - timedelta(minutes=5))\
                    .count()
                
                result.append({
                    "id": room.id,
                    "name": room.name,
                    "description": room.description,
                    "type": room.type.value,
                    "school_name": room.school.name if room.school else None,
                    "is_private": room.is_private,
                    "is_active": room.is_active,
                    "member_count": online_count,  # 使用在線成員數作為成員數
                    "unread_count": unread_count,
                    "mention_count": mention_count,
                    "online_count": online_count,
                    "created_at": room.created_at.isoformat(),
                    "latest_message": {
                        "content": latest_message.content[:100] if latest_message else None,
                        "created_at": latest_message.created_at.isoformat() if latest_message else None,
                        "user_name": latest_message.user.username if latest_message else None,
                        "user_role": latest_message.user.role if latest_message else None,
                        "message_type": latest_message.message_type.value if latest_message else None,
                    } if latest_message else None
                })
            
            return result

    @classmethod
    def search_messages(cls, room_id: int, user_id: int, query: str, 
                       message_type: Optional[str] = None, 
                       date_from: Optional[datetime] = None,
                       date_to: Optional[datetime] = None,
                       limit: int = 50) -> List[Dict[str, Any]]:
        """搜尋訊息"""
        with get_session() as db:
            if not cls.can_user_access_room(user_id, room_id):
                return []
            
            search_query = db.query(AdminChatMessage)\
                .filter(AdminChatMessage.room_id == room_id)\
                .filter(AdminChatMessage.is_deleted == False)
            
            if query:
                search_query = search_query.filter(
                    AdminChatMessage.content.ilike(f'%{query}%')
                )
            
            if message_type:
                search_query = search_query.filter(
                    AdminChatMessage.message_type == message_type
                )
            
            if date_from:
                search_query = search_query.filter(
                    AdminChatMessage.created_at >= date_from
                )
            if date_to:
                search_query = search_query.filter(
                    AdminChatMessage.created_at <= date_to
                )
            
            messages = search_query.order_by(desc(AdminChatMessage.created_at))\
                .limit(limit)\
                .all()
            
            result = []
            for msg in messages:
                result.append({
                    "id": msg.id,
                    "content": msg.content,
                    "message_type": msg.message_type.value,
                    "user": {
                        "id": msg.user.id,
                        "username": msg.user.username,
                        "role": msg.user.role
                    },
                    "created_at": msg.created_at.isoformat(),
                    "room_name": msg.room.name
                })
            
            return result

    @classmethod
    def send_message(cls, room_id: int, user_id: int, content: str,
                    message_type: MessageType = MessageType.TEXT,
                    post_id: Optional[int] = None,
                    file_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """發送訊息（含@提及處理）"""
        with get_session() as db:
<<<<<<< Updated upstream
            # 檢查發送訊息權限
=======
>>>>>>> Stashed changes
            if not cls.can_user_send_message(user_id, room_id):
                return None

            room = db.get(AdminChatRoom, room_id)
            
            mentioned_users = []
            if content:
                mention_pattern = r'@(\w+)'
                mentions = re.findall(mention_pattern, content)
                
                if mentions:
                    mentioned_users = db.query(User)\
                        .filter(User.username.in_(mentions))\
                        .filter(User.role.in_(["dev_admin", "campus_admin", "campus_moderator", "cross_admin"]))\
                        .all()
            
            message = AdminChatMessage(
                room_id=room_id,
                user_id=user_id,
                content=content,
                message_type=message_type,
                post_id=post_id,
                mentioned_users=json.dumps([u.id for u in mentioned_users]) if mentioned_users else None
            )
            
            if file_path:
                message.file_path = file_path
                if os.path.exists(file_path):
                    message.file_name = os.path.basename(file_path)
                    message.file_size = os.path.getsize(file_path)
                    message.file_type = os.path.splitext(file_path)[1].lower()
            
            db.add(message)
            db.commit()
            db.refresh(message)
            
            for mentioned_user in mentioned_users:
                mention = AdminChatMention(
                    message_id=message.id,
                    mentioned_user_id=mentioned_user.id,
                    mentioned_by_user_id=user_id,
                    room_id=room_id
                )
                db.add(mention)
                
                try:
                    room = db.get(AdminChatRoom, room_id)
                    sender = db.get(User, user_id)
                    
                    print(f"Admin chat mention: {sender.username} mentioned {mentioned_user.username} in {room.name}")
                    
                except Exception as e:
                    print(f"Failed to send mention notification: {e}")
            
            db.commit()
            
            cls.update_user_activity(room_id, user_id)
            
            return {
                "id": message.id,
                "content": message.content,
                "message_type": message.message_type.value,
                "user": {
                    "id": message.user.id,
                    "username": message.user.username,
                    "role": message.user.role
                },
                "created_at": message.created_at.isoformat(),
                "mentioned_users": [{"id": u.id, "username": u.username} for u in mentioned_users],
                "post": {
                    "id": message.post.id,
                    "title": message.post.title,
                    "content": message.post.content[:200]
                } if message.post else None,
                "file": {
                    "name": message.file_name,
                    "size": message.file_size,
                    "type": message.file_type,
                    "path": message.file_path
                } if message.file_path else None
            }

    @classmethod
    def get_room_messages(cls, room_id: int, user_id: int, limit: int = 50, before: Optional[int] = None) -> List[Dict[str, Any]]:
        """獲取聊天室訊息（增強版）"""
        with get_session() as db:
            if not cls.can_user_access_room(user_id, room_id):
                return []
            
            query = db.query(AdminChatMessage)\
                .filter(AdminChatMessage.room_id == room_id)\
                .filter(AdminChatMessage.is_deleted == False)
            
            if before:
                query = query.filter(AdminChatMessage.id < before)
            
            messages = query.order_by(desc(AdminChatMessage.created_at))\
                .limit(limit)\
                .all()
            
            cls.update_last_read(room_id, user_id)
            
            db.query(AdminChatMention)\
                .filter(AdminChatMention.room_id == room_id)\
                .filter(AdminChatMention.mentioned_user_id == user_id)\
                .filter(AdminChatMention.is_read == False)\
                .update({"is_read": True, "read_at": datetime.now(timezone.utc)})
            db.commit()
            
            result = []
            for msg in reversed(messages):
                mentioned_users = []
                if msg.mentioned_users:
                    try:
                        mentioned_user_ids = json.loads(msg.mentioned_users)
                        mentioned_users = db.query(User)\
                            .filter(User.id.in_(mentioned_user_ids))\
                            .all()
                    except:
                        pass
                
                msg_data = {
                    "id": msg.id,
                    "content": msg.content,
                    "message_type": msg.message_type.value,
                    "user": {
                        "id": msg.user.id,
                        "username": msg.user.username,
                        "role": msg.user.role
                    },
                    "created_at": msg.created_at.isoformat(),
                    "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
                    "is_pinned": msg.is_pinned,
                    "mentioned_users": [{"id": u.id, "username": u.username} for u in mentioned_users]
                }
                
                if msg.vote:
                    vote_data = cls.get_vote_details(msg.vote.id, user_id)
                    msg_data["vote"] = vote_data
                
                if msg.post:
                    msg_data["post"] = {
                        "id": msg.post.id,
                        "title": msg.post.title,
                        "content": msg.post.content[:200],
                        "status": msg.post.status,
                        "created_at": msg.post.created_at.isoformat()
                    }
                
                if msg.file_path:
                    msg_data["file"] = {
                        "name": msg.file_name,
                        "size": msg.file_size,
                        "type": msg.file_type,
                        "path": msg.file_path
                    }
                
                result.append(msg_data)
            
            return result

    @classmethod
    def initialize_default_rooms(cls) -> None:
        """初始化預設聊天室（增強版）"""
        with get_session() as db:
            admin_user = db.query(User).filter(User.role == "dev_admin").first()
            if not admin_user:
                return
            
            default_rooms = [
                {
                    "name": "開發人員頻道",
                    "description": "系統開發與技術討論專用",
                    "type": ChatRoomType.DEVELOPER,
                    "school_id": None,
                    "is_private": True
                },
                {
                    "name": "總聊天群",
                    "description": "所有管理員的公共討論區",
                    "type": ChatRoomType.GLOBAL,
                    "school_id": None,
                    "is_private": False
                },
                {
                    "name": "跨校管理員頻道",
                    "description": "跨校管理員討論與協調",
                    "type": ChatRoomType.CROSS,
                    "school_id": None,
                    "is_private": False
                },
                {
                    "name": "緊急事件頻道",
                    "description": "緊急事件處理與協調",
                    "type": ChatRoomType.EMERGENCY,
                    "school_id": None,
                    "is_private": False
                },
                {
                    "name": "系統通知頻道",
                    "description": "系統公告與自動通知",
                    "type": ChatRoomType.SYSTEM,
                    "school_id": None,
                    "is_private": False
                }
            ]
            
            for room_data in default_rooms:
                existing = db.query(AdminChatRoom)\
                    .filter(AdminChatRoom.name == room_data["name"])\
                    .filter(AdminChatRoom.is_active == True)\
                    .first()
                
                if not existing:
                    room = AdminChatRoom(
                        name=room_data["name"],
                        description=room_data["description"],
                        type=room_data["type"],
                        school_id=room_data["school_id"],
                        created_by=admin_user.id,
                        is_private=room_data["is_private"]
                    )
                    db.add(room)
            
            schools = db.query(School).all()
            for school in schools:
                school_room_name = f"{school.name} 管理頻道"
                existing = db.query(AdminChatRoom)\
                    .filter(AdminChatRoom.name == school_room_name)\
                    .filter(AdminChatRoom.is_active == True)\
                    .first()
                
                if not existing:
                    room = AdminChatRoom(
                        name=school_room_name,
                        description=f"{school.name} 校內管理員專用討論區",
                        type=ChatRoomType.SCHOOL,
                        school_id=school.id,
                        created_by=admin_user.id,
                        is_private=False
                    )
                    db.add(room)
            
            db.commit()

    @classmethod
    def get_user_room_role(cls, user_id: int, room_id: int) -> Optional[str]:
        """獲取用戶在聊天室中的角色"""
        with get_session() as db:
            member = db.query(AdminChatMember)\
                .filter(AdminChatMember.room_id == room_id)\
                .filter(AdminChatMember.user_id == user_id)\
                .first()
            return member.role if member else None

    @classmethod
    def can_user_send_message(cls, user_id: int, room_id: int) -> bool:
        """檢查用戶是否可以在聊天室發送訊息"""
        with get_session() as db:
<<<<<<< Updated upstream
            # 檢查基本訪問權限
=======
>>>>>>> Stashed changes
            if not cls.can_user_access_room(user_id, room_id):
                return False

            room = db.get(AdminChatRoom, room_id)
            user = db.get(User, user_id)

            if not room or not user:
                return False

<<<<<<< Updated upstream
            # 系統通知頻道只有 dev_admin 可以發送
            if room.type == ChatRoomType.SYSTEM:
                return user.role == "dev_admin"

            # 開發人員頻道只有 dev_admin 可以發送
            if room.type == ChatRoomType.DEVELOPER:
                return user.role == "dev_admin"

            # 私有頻道需要檢查是否被禁言
=======
            if room.type == ChatRoomType.SYSTEM:
                return user.role == "dev_admin"

            if room.type == ChatRoomType.DEVELOPER:
                return user.role == "dev_admin"

>>>>>>> Stashed changes
            if room.is_private:
                member = db.query(AdminChatMember)\
                    .filter(AdminChatMember.room_id == room_id)\
                    .filter(AdminChatMember.user_id == user_id)\
                    .first()
                if member and member.is_muted:
                    return False

            return True

    @classmethod
    def can_user_manage_room(cls, user_id: int, room_id: int) -> bool:
        """檢查用戶是否可以管理聊天室（刪除、修改設置等）"""
        with get_session() as db:
            user = db.get(User, user_id)
            room = db.get(AdminChatRoom, room_id)

            if not user or not room:
                return False

<<<<<<< Updated upstream
            # dev_admin 可以管理所有聊天室
            if user.role == "dev_admin":
                return True

            # 創建者可以管理
            if room.created_by == user_id:
                return True

            # 檢查是否為聊天室管理員
=======
            if user.role == "dev_admin":
                return True

            if room.created_by == user_id:
                return True

>>>>>>> Stashed changes
            member = db.query(AdminChatMember)\
                .filter(AdminChatMember.room_id == room_id)\
                .filter(AdminChatMember.user_id == user_id)\
                .first()

            return member and member.role == "admin"

    @classmethod
    def delete_room(cls, room_id: int, user_id: int) -> Tuple[bool, str]:
        """刪除聊天室"""
        with get_session() as db:
            room = db.get(AdminChatRoom, room_id)

            if not room:
                return False, "聊天室不存在"

<<<<<<< Updated upstream
            # 檢查權限
            if not cls.can_user_manage_room(user_id, room_id):
                return False, "權限不足"

            # 系統預設聊天室不能刪除
=======
            if not cls.can_user_manage_room(user_id, room_id):
                return False, "權限不足"

>>>>>>> Stashed changes
            if room.type in [ChatRoomType.SYSTEM, ChatRoomType.DEVELOPER,
                            ChatRoomType.GLOBAL, ChatRoomType.CROSS,
                            ChatRoomType.EMERGENCY]:
                return False, "系統預設聊天室不能刪除"

<<<<<<< Updated upstream
            # 軟刪除（設為非活躍狀態）
=======
>>>>>>> Stashed changes
            room.is_active = False
            db.commit()

            return True, "聊天室已刪除"

    @classmethod
    def update_room(cls, room_id: int, user_id: int, **kwargs) -> Tuple[bool, str, Optional[Dict]]:
        """更新聊天室設置"""
        with get_session() as db:
            room = db.get(AdminChatRoom, room_id)

            if not room:
                return False, "聊天室不存在", None

<<<<<<< Updated upstream
            # 檢查權限
            if not cls.can_user_manage_room(user_id, room_id):
                return False, "權限不足", None

            # 允許更新的欄位
=======
            if not cls.can_user_manage_room(user_id, room_id):
                return False, "權限不足", None

>>>>>>> Stashed changes
            allowed_fields = ['name', 'description', 'is_private', 'max_members']

            for field, value in kwargs.items():
                if field in allowed_fields and hasattr(room, field):
                    setattr(room, field, value)

            db.commit()
            db.refresh(room)

            return True, "聊天室設置已更新", {
                "id": room.id,
                "name": room.name,
                "description": room.description,
                "is_private": room.is_private,
                "max_members": room.max_members
            }

    @classmethod
    def remove_member(cls, room_id: int, user_id: int, target_user_id: int) -> Tuple[bool, str]:
        """移除聊天室成員"""
        with get_session() as db:
            room = db.get(AdminChatRoom, room_id)

            if not room:
                return False, "聊天室不存在"

<<<<<<< Updated upstream
            # 檢查操作者權限
            if not cls.can_user_manage_room(user_id, room_id):
                return False, "權限不足"

            # 不能移除創建者
            if target_user_id == room.created_by:
                return False, "不能移除創建者"

            # 移除成員
=======
            if not cls.can_user_manage_room(user_id, room_id):
                return False, "權限不足"

            if target_user_id == room.created_by:
                return False, "不能移除創建者"

>>>>>>> Stashed changes
            member = db.query(AdminChatMember)\
                .filter(AdminChatMember.room_id == room_id)\
                .filter(AdminChatMember.user_id == target_user_id)\
                .first()

            if not member:
                return False, "該用戶不是成員"

            db.delete(member)
            db.commit()

            return True, "成員已移除"

    @classmethod
    def update_member_role(cls, room_id: int, user_id: int, target_user_id: int, new_role: str) -> Tuple[bool, str]:
        """更新成員角色"""
        with get_session() as db:
            room = db.get(AdminChatRoom, room_id)

            if not room:
                return False, "聊天室不存在"

<<<<<<< Updated upstream
            # 檢查操作者權限
            if not cls.can_user_manage_room(user_id, room_id):
                return False, "權限不足"

            # 驗證新角色
            if new_role not in ["admin", "moderator", "member"]:
                return False, "無效的角色"

            # 更新成員角色
=======
            if not cls.can_user_manage_room(user_id, room_id):
                return False, "權限不足"

            if new_role not in ["admin", "moderator", "member"]:
                return False, "無效的角色"

>>>>>>> Stashed changes
            member = db.query(AdminChatMember)\
                .filter(AdminChatMember.room_id == room_id)\
                .filter(AdminChatMember.user_id == target_user_id)\
                .first()

            if not member:
                return False, "該用戶不是成員"

            member.role = new_role
            db.commit()

            return True, f"成員角色已更新為 {new_role}"

    @classmethod
    def mute_member(cls, room_id: int, user_id: int, target_user_id: int, mute: bool = True) -> Tuple[bool, str]:
        """禁言/解禁成員"""
        with get_session() as db:
            room = db.get(AdminChatRoom, room_id)

            if not room:
                return False, "聊天室不存在"

<<<<<<< Updated upstream
            # 檢查操作者權限（需要是管理員或版主）
=======
>>>>>>> Stashed changes
            operator_role = cls.get_user_room_role(user_id, room_id)
            if operator_role not in ["admin", "moderator"]:
                user = db.get(User, user_id)
                if not user or user.role != "dev_admin":
                    return False, "權限不足"

<<<<<<< Updated upstream
            # 不能禁言創建者
            if target_user_id == room.created_by:
                return False, "不能禁言創建者"

            # 更新成員禁言狀態
=======
            if target_user_id == room.created_by:
                return False, "不能禁言創建者"

>>>>>>> Stashed changes
            member = db.query(AdminChatMember)\
                .filter(AdminChatMember.room_id == room_id)\
                .filter(AdminChatMember.user_id == target_user_id)\
                .first()

            if not member:
                return False, "該用戶不是成員"

            member.is_muted = mute
            db.commit()

            return True, f"成員已{'禁言' if mute else '解禁'}"

<<<<<<< Updated upstream
    # 其他已有的方法保持不變...
=======
>>>>>>> Stashed changes
    @classmethod
    def can_user_access_room(cls, user_id: int, room_id: int) -> bool:
        """檢查用戶是否可訪問聊天室"""
        with get_session() as db:
            user = db.get(User, user_id)
            room = db.get(AdminChatRoom, room_id)
            
            if not user or not room or not room.is_active:
                return False
            
            if room.is_private:
                member = db.query(AdminChatMember)\
                    .filter(AdminChatMember.room_id == room_id)\
                    .filter(AdminChatMember.user_id == user_id)\
                    .first()
                if not member:
                    return False
            
            if user.role == "dev_admin":
                return True
            elif user.role == "cross_admin":
                return room.type in [ChatRoomType.CROSS, ChatRoomType.EMERGENCY, ChatRoomType.GLOBAL]
            elif user.role in ["campus_admin", "campus_moderator"]:
                return (room.type in [ChatRoomType.CROSS, ChatRoomType.GLOBAL] or 
                       room.school_id == user.school_id)
            
            return False

    @classmethod
    def add_user_to_room(cls, room_id: int, user_id: int, role: str = "member") -> bool:
        """添加用戶到聊天室"""
        with get_session() as db:
            
            existing = db.query(AdminChatMember)\
                .filter(AdminChatMember.room_id == room_id)\
                .filter(AdminChatMember.user_id == user_id)\
                .first()
            
            if not existing:
                member = AdminChatMember(
                    room_id=room_id,
                    user_id=user_id,
                    role=role
                )
                db.add(member)
                db.commit()
            
            return True

    @classmethod
    def invite_users_to_room(cls, room_id: int, inviter_id: int, user_ids: List[int]) -> Tuple[bool, str, int]:
        """邀請多名用戶加入房間，僅限房間管理員/創建者/dev_admin。

        Returns: (ok, message, added_count)
        """
        with get_session() as db:
            room = db.get(AdminChatRoom, room_id)
            inviter = db.get(User, inviter_id)
            if not room or not inviter:
                return False, "房間或邀請者不存在", 0

            inviter_member = db.query(AdminChatMember)\
                .filter(AdminChatMember.room_id == room_id)\
                .filter(AdminChatMember.user_id == inviter_id)\
                .first()

            is_room_admin = bool(inviter_member and inviter_member.role in ("admin","moderator"))
            is_creator = (room.created_by == inviter_id)
            is_dev = (inviter.role == "dev_admin")
            if not (is_room_admin or is_creator or is_dev):
                return False, "權限不足，僅房間管理員/創建者可邀請", 0

            allowed_roles = {"dev_admin","cross_admin","campus_admin","campus_moderator","cross_moderator"}

            current_count = db.query(AdminChatMember).filter(AdminChatMember.room_id == room_id).count()
            capacity_left = max(0, (room.max_members or 100) - current_count)
            if capacity_left <= 0:
                return False, "房間人數已達上限", 0

            added = 0
            for uid in user_ids[:capacity_left]:
                u = db.get(User, uid)
                if not u or (u.role not in allowed_roles):
                    continue
                exists = db.query(AdminChatMember)\
                    .filter(AdminChatMember.room_id == room_id, AdminChatMember.user_id == uid)\
                    .first()
                if exists:
                    continue
                db.add(AdminChatMember(room_id=room_id, user_id=uid, role="member"))
                added += 1
            db.commit()
            return True, "已加入成員", added

    @classmethod
    def list_room_members(cls, room_id: int) -> List[Dict[str, Any]]:
        with get_session() as db:
            members = db.query(AdminChatMember).filter(AdminChatMember.room_id == room_id).all()
            out: List[Dict[str, Any]] = []
            for m in members:
                out.append({
                    'user_id': m.user_id,
                    'username': m.user.username if m.user else None,
                    'role': m.role,
                    'joined_at': m.joined_at.isoformat() if m.joined_at else None,
                })
            return out

    @classmethod
    def update_last_read(cls, room_id: int, user_id: int) -> None:
        """更新最後閱讀時間"""
        with get_session() as db:
            member = db.query(AdminChatMember)\
                .filter(AdminChatMember.room_id == room_id)\
                .filter(AdminChatMember.user_id == user_id)\
                .first()
            
            if member:
                member.last_read_at = datetime.now(timezone.utc)
                member.last_active_at = datetime.now(timezone.utc)
                db.commit()

    @classmethod
    def update_user_activity(cls, room_id: int, user_id: int) -> None:
        """更新用戶活躍時間"""
        with get_session() as db:
            member = db.query(AdminChatMember)\
                .filter(AdminChatMember.room_id == room_id)\
                .filter(AdminChatMember.user_id == user_id)\
                .first()
            
            if member:
                member.last_active_at = datetime.now(timezone.utc)
                db.commit()

    @staticmethod
    def _parse_options_raw(options_text: str) -> tuple[bool, list[dict]]:
        """解析投票 options 欄位
        支援兩種格式：
          1) 舊版：純陣列 [{id, text}, ...] → allow_multiple = False
          2) 新版：物件 { allow_multiple: bool, items: [{id, text}, ...] }
        """
        try:
            data = json.loads(options_text or "[]")
            if isinstance(data, dict):
                allow_multiple = bool(data.get("allow_multiple", False))
                items = data.get("items") or []
                if isinstance(items, list):
                    return allow_multiple, items
                return allow_multiple, []
            elif isinstance(data, list):
                return False, data
            else:
                return False, []
        except Exception:
            return False, []

    @staticmethod
    def _build_options_text(allow_multiple: bool, options: list[str]) -> str:
        items = []
        next_id = 1
        for t in options:
            items.append({"id": next_id, "text": t})
            next_id += 1
        return json.dumps({"allow_multiple": bool(allow_multiple), "items": items}, ensure_ascii=False)

    @classmethod
    def create_vote(
        cls,
        room_id: int,
        user_id: int,
        title: str,
        description: str,
        options: list[str],
        post_id: int | None = None,
        expires_hours: int = 24,
        allow_multiple: bool = False,
    ) -> Optional[Dict[str, Any]]:
        with get_session() as db:
            if not cls.can_user_access_room(user_id, room_id):  # type: ignore[attr-defined]
                return None

            opt_text = cls._build_options_text(allow_multiple, options)
            expires_at = datetime.now(timezone.utc) + timedelta(hours=max(1, int(expires_hours)))
            vote = AdminChatVote(
                room_id=room_id,
                created_by=user_id,
                title=title.strip(),
                description=description.strip() if description else None,
                options=opt_text,
                expires_at=expires_at,
                status=VoteStatus.ACTIVE,
            )
            db.add(vote)
            db.commit()
            db.refresh(vote)

            msg = AdminChatMessage(
                room_id=room_id,
                user_id=user_id,
                content=f"[投票] {title}",
                message_type=MessageType.VOTE,
                vote_id=vote.id,
                post_id=post_id,
            )
            db.add(msg)
            db.commit()

            return cls.get_vote_details(vote.id, user_id)

    @classmethod
    def get_vote_details(cls, vote_id: int, user_id: int) -> Optional[Dict[str, Any]]:
        with get_session() as db:
            vote = db.get(AdminChatVote, vote_id)
            if not vote:
                return None

            allow_multiple, items = cls._parse_options_raw(vote.options or "[]")

            counts: dict[int, int] = {}
            my_options: set[int] = set()
            ballots = db.query(AdminChatVoteBallot).filter(AdminChatVoteBallot.vote_id == vote_id).all()
            for b in ballots:
                counts[b.option_id] = counts.get(b.option_id, 0) + 1
                if b.user_id == user_id:
                    my_options.add(b.option_id)

            options_out = []
            for it in items:
                oid = int(it.get("id"))
                options_out.append({
                    "id": oid,
                    "text": it.get("text", ""),
                    "votes": counts.get(oid, 0),
                    "me": (oid in my_options),
                })

            now = datetime.now(timezone.utc)
            is_expired = bool(vote.expires_at and vote.expires_at <= now)
            status = vote.status.value if hasattr(vote.status, 'value') else str(vote.status)

            return {
                "id": vote.id,
                "room_id": vote.room_id,
                "title": vote.title,
                "description": vote.description,
                "allow_multiple": allow_multiple,
                "status": "expired" if is_expired else status,
                "expires_at": vote.expires_at.isoformat() if vote.expires_at else None,
                "options": options_out,
            }

    @classmethod
    def cast_vote(cls, vote_id: int, user_id: int, option_id: int) -> tuple[bool, str]:
        with get_session() as db:
            vote = db.get(AdminChatVote, vote_id)
            if not vote:
                return False, "投票不存在"

            if not cls.can_user_access_room(user_id, vote.room_id):  # type: ignore[attr-defined]
                return False, "無權訪問該投票"

            now = datetime.now(timezone.utc)
            status_val = vote.status.value if hasattr(vote.status, 'value') else str(vote.status)
            if (vote.expires_at and vote.expires_at <= now) or (status_val.lower() != VoteStatus.ACTIVE.value):
                return False, "投票已結束"

            allow_multiple, items = cls._parse_options_raw(vote.options or "[]")
            valid_ids = {int(it.get("id")) for it in items}
            if option_id not in valid_ids:
                return False, "選項無效"

            my_ballots = db.query(AdminChatVoteBallot).filter(
                AdminChatVoteBallot.vote_id == vote_id,
                AdminChatVoteBallot.user_id == user_id
            ).all()

            if not allow_multiple:
                if my_ballots:
                    same = [b for b in my_ballots if b.option_id == option_id]
                    if same:
                        for b in same:
                            db.delete(b)
                        db.commit()
                        return True, "已取消投票"
                    else:
                        return False, "單選模式，請先取消原投票再選擇其他選項"
                else:
                    db.add(AdminChatVoteBallot(vote_id=vote_id, user_id=user_id, option_id=option_id))
                    db.commit()
                    return True, "投票成功"

            existing = [b for b in my_ballots if b.option_id == option_id]
            if existing:
                for b in existing:
                    db.delete(b)
                db.commit()
                return True, "已取消該選項"
            else:
                db.add(AdminChatVoteBallot(vote_id=vote_id, user_id=user_id, option_id=option_id))
                db.commit()
                return True, "已新增該選項"
