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
            # 檢查權限
            user = db.get(User, created_by)
            if not user or user.role not in ["dev_admin", "campus_admin", "cross_admin"]:
                return None
            
            # 檢查同名聊天室
            existing = db.query(AdminChatRoom)\
                .filter(AdminChatRoom.name == name)\
                .filter(AdminChatRoom.is_active == True)\
                .first()
            
            if existing:
                return None
            
            # 創建聊天室
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
            
            # 自動添加創建者為管理員
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
                # dev_admin 可訪問所有頻道
                pass
            elif user_role == "cross_admin":
                # cross_admin 可訪問跨校、緊急、總聊天群
                query = query.filter(AdminChatRoom.type.in_([
                    ChatRoomType.CROSS, ChatRoomType.EMERGENCY, ChatRoomType.GLOBAL
                ]))
            elif user_role in ["campus_admin", "campus_moderator"]:
                # 校園管理員可訪問自己學校、跨校、總聊天群
                if school_id:
                    query = query.filter(or_(
                        AdminChatRoom.school_id == school_id,
                        AdminChatRoom.type.in_([ChatRoomType.CROSS, ChatRoomType.GLOBAL])
                    ))
                else:
                    query = query.filter(AdminChatRoom.type.in_([ChatRoomType.CROSS, ChatRoomType.GLOBAL]))
            else:
                # 其他角色無權訪問
                return []
                
            rooms = query.order_by(AdminChatRoom.type, AdminChatRoom.name).all()
            
            result = []
            for room in rooms:
                # 檢查私有頻道權限
                if room.is_private:
                    member = db.query(AdminChatMember)\
                        .filter(AdminChatMember.room_id == room.id)\
                        .filter(AdminChatMember.user_id == user_id)\
                        .first()
                    if not member:
                        continue
                
                # 獲取最新訊息
                latest_message = db.query(AdminChatMessage)\
                    .filter(AdminChatMessage.room_id == room.id)\
                    .filter(AdminChatMessage.is_deleted == False)\
                    .order_by(desc(AdminChatMessage.created_at))\
                    .first()
                
                # 獲取未讀數量
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
                    
                    # 未讀提及數量
                    mention_count = db.query(AdminChatMention)\
                        .filter(AdminChatMention.room_id == room.id)\
                        .filter(AdminChatMention.mentioned_user_id == user_id)\
                        .filter(AdminChatMention.is_read == False)\
                        .count()
                        
                elif not member:
                    # 自動加入用戶到聊天室
                    cls.add_user_to_room(room.id, user_id)
                    unread_count = db.query(AdminChatMessage)\
                        .filter(AdminChatMessage.room_id == room.id)\
                        .filter(AdminChatMessage.is_deleted == False)\
                        .count()
                
                # 獲取在線成員數
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
            # 檢查權限
            if not cls.can_user_access_room(user_id, room_id):
                return []
            
            search_query = db.query(AdminChatMessage)\
                .filter(AdminChatMessage.room_id == room_id)\
                .filter(AdminChatMessage.is_deleted == False)
            
            # 文字搜尋
            if query:
                search_query = search_query.filter(
                    AdminChatMessage.content.ilike(f'%{query}%')
                )
            
            # 訊息類型過濾
            if message_type:
                search_query = search_query.filter(
                    AdminChatMessage.message_type == message_type
                )
            
            # 日期範圍過濾
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
            # 檢查基本權限
            if not cls.can_user_access_room(user_id, room_id):
                return None
            
            # 檢查系統通知頻道的特殊權限
            room = db.get(AdminChatRoom, room_id)
            if room and room.type == ChatRoomType.SYSTEM:
                user = db.get(User, user_id)
                if not user or user.role != "dev_admin":
                    return None  # 只有 dev_admin 可以在系統頻道發送訊息
            
            # 處理@提及
            mentioned_users = []
            if content:
                mention_pattern = r'@(\w+)'
                mentions = re.findall(mention_pattern, content)
                
                if mentions:
                    # 查找被提及的用戶
                    mentioned_users = db.query(User)\
                        .filter(User.username.in_(mentions))\
                        .filter(User.role.in_(["dev_admin", "campus_admin", "campus_moderator", "cross_admin"]))\
                        .all()
            
            # 創建訊息
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
                # 從檔案路徑提取檔案資訊
                if os.path.exists(file_path):
                    message.file_name = os.path.basename(file_path)
                    message.file_size = os.path.getsize(file_path)
                    message.file_type = os.path.splitext(file_path)[1].lower()
            
            db.add(message)
            db.commit()
            db.refresh(message)
            
            # 處理@提及通知
            for mentioned_user in mentioned_users:
                # 創建提及記錄
                mention = AdminChatMention(
                    message_id=message.id,
                    mentioned_user_id=mentioned_user.id,
                    mentioned_by_user_id=user_id,
                    room_id=room_id
                )
                db.add(mention)
                
                # 發送通知
                try:
                    room = db.get(AdminChatRoom, room_id)
                    sender = db.get(User, user_id)
                    
                    # 簡單的通知處理 - 可以後續整合到完整的通知系統
                    print(f"Admin chat mention: {sender.username} mentioned {mentioned_user.username} in {room.name}")
                    
                    # TODO: 整合到通知系統
                    # addNotification({
                    #     'type': 'admin_chat.mention',
                    #     'text': f'{sender.username} 在 {room.name} 中提及了您',
                    #     'user_id': mentioned_user.id,
                    #     'school': room.school.slug if room.school else 'cross',
                    #     'urgent': True,
                    #     'data': {
                    #         'room_id': room_id,
                    #         'message_id': message.id,
                    #         'room_name': room.name,
                    #         'sender': sender.username
                    #     }
                    # })
                except Exception as e:
                    print(f"Failed to send mention notification: {e}")
            
            db.commit()
            
            # 更新發送者活躍時間
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
            # 檢查權限
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
            
            # 更新最後閱讀時間
            cls.update_last_read(room_id, user_id)
            
            # 標記提及為已讀
            db.query(AdminChatMention)\
                .filter(AdminChatMention.room_id == room_id)\
                .filter(AdminChatMention.mentioned_user_id == user_id)\
                .filter(AdminChatMention.is_read == False)\
                .update({"is_read": True, "read_at": datetime.now(timezone.utc)})
            db.commit()
            
            result = []
            for msg in reversed(messages):  # 反轉以時間順序顯示
                # 解析被提及用戶
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
                
                # 如果是投票訊息，添加投票詳情
                if msg.vote:
                    vote_data = cls.get_vote_details(msg.vote.id, user_id)
                    msg_data["vote"] = vote_data
                
                # 如果是貼文審核訊息，添加貼文詳情
                if msg.post:
                    msg_data["post"] = {
                        "id": msg.post.id,
                        "title": msg.post.title,
                        "content": msg.post.content[:200],
                        "status": msg.post.status,
                        "created_at": msg.post.created_at.isoformat()
                    }
                
                # 如果有檔案，添加檔案資訊
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
            # 創建系統管理員用戶
            admin_user = db.query(User).filter(User.role == "dev_admin").first()
            if not admin_user:
                return
            
            # 預設房間配置
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
            
            # 為每個學校創建專屬頻道
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

    # 其他已有的方法保持不變...
    @classmethod
    def can_user_access_room(cls, user_id: int, room_id: int) -> bool:
        """檢查用戶是否可訪問聊天室"""
        with get_session() as db:
            user = db.get(User, user_id)
            room = db.get(AdminChatRoom, room_id)
            
            if not user or not room or not room.is_active:
                return False
            
            # 檢查私有頻道
            if room.is_private:
                member = db.query(AdminChatMember)\
                    .filter(AdminChatMember.room_id == room_id)\
                    .filter(AdminChatMember.user_id == user_id)\
                    .first()
                if not member:
                    return False
            
            # 檢查角色權限
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
            # 這裡允許由外部驗證後強制加入（邀請流程會先驗證邀請者權限）
            
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

            # 檢查邀請者是否具備管理權限
            inviter_member = db.query(AdminChatMember)\
                .filter(AdminChatMember.room_id == room_id)\
                .filter(AdminChatMember.user_id == inviter_id)\
                .first()

            is_room_admin = bool(inviter_member and inviter_member.role in ("admin","moderator"))
            is_creator = (room.created_by == inviter_id)
            is_dev = (inviter.role == "dev_admin")
            if not (is_room_admin or is_creator or is_dev):
                return False, "權限不足，僅房間管理員/創建者可邀請", 0

            # 可加入的角色白名單（僅管理端用戶）
            allowed_roles = {"dev_admin","cross_admin","campus_admin","campus_moderator","cross_moderator"}

            # 計算已有人數
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

    # 投票相關方法保持不變...（為了簡潔，這裡省略）
