"""
聊天服務
負責處理聊天記錄的持久化和管理
"""

from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from models import ChatMessage, ChatRoom


class ChatService:
    """聊天服務類"""
    
    @classmethod
    def save_message(
        cls,
        session: Session,
        room_id: str,
        message: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        client_id: Optional[str] = None,
        message_type: str = "text"
    ) -> ChatMessage:
        """
        保存聊天消息
        
        Args:
            session: 數據庫會話
            room_id: 房間ID
            message: 消息內容
            user_id: 用戶ID（可選）
            username: 用戶名（可選）
            client_id: 客戶端ID（可選）
            message_type: 消息類型 (text, system, join, leave)
        
        Returns:
            ChatMessage: 保存的消息記錄
        """
        chat_message = ChatMessage(
            room_id=room_id,
            user_id=user_id,
            username=username,
            client_id=client_id,
            message=message,
            message_type=message_type,
            created_at=datetime.now(timezone.utc)
        )
        
        session.add(chat_message)
        session.flush()  # 獲取ID但不提交
        
        return chat_message
    
    @classmethod
    def get_room_messages(
        cls,
        session: Session,
        room_id: str,
        limit: int = 50,
        offset: int = 0,
        before_id: Optional[int] = None
    ) -> List[ChatMessage]:
        """
        獲取房間消息歷史
        
        Args:
            session: 數據庫會話
            room_id: 房間ID
            limit: 限制數量
            offset: 偏移量
            before_id: 在此ID之前的消息
        
        Returns:
            List[ChatMessage]: 消息列表
        """
        query = session.query(ChatMessage).filter(
            ChatMessage.room_id == room_id
        )
        
        if before_id:
            query = query.filter(ChatMessage.id < before_id)
        
        # 按創建時間倒序排列，然後反轉以獲得正確的時間順序
        messages = query.order_by(ChatMessage.created_at.desc()).offset(offset).limit(limit).all()
        return list(reversed(messages))  # 反轉以獲得正確的時間順序
    
    @classmethod
    def get_room_info(cls, session: Session, room_id: str) -> Optional[ChatRoom]:
        """
        獲取房間信息
        
        Args:
            session: 數據庫會話
            room_id: 房間ID
        
        Returns:
            ChatRoom: 房間信息
        """
        return session.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    
    @classmethod
    def create_room(
        cls,
        session: Session,
        room_id: str,
        name: str,
        description: Optional[str] = None,
        room_type: str = "system",
        owner_id: Optional[int] = None,
        school_id: Optional[int] = None
    ) -> ChatRoom:
        """
        創建聊天房間
        
        Args:
            session: 數據庫會話
            room_id: 房間ID
            name: 房間名稱
            description: 房間描述
            room_type: 房間類型 (system, custom)
            owner_id: 擁有者ID
            school_id: 學校ID
        
        Returns:
            ChatRoom: 創建的房間
        """
        room = ChatRoom(
            id=room_id,
            name=name,
            description=description,
            room_type=room_type,
            owner_id=owner_id,
            school_id=school_id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        session.add(room)
        session.flush()
        
        return room
    
    @classmethod
    def update_room(
        cls,
        session: Session,
        room_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> Optional[ChatRoom]:
        """
        更新房間信息
        
        Args:
            session: 數據庫會話
            room_id: 房間ID
            name: 房間名稱
            description: 房間描述
            is_active: 是否啟用
        
        Returns:
            ChatRoom: 更新後的房間
        """
        room = session.query(ChatRoom).filter(ChatRoom.id == room_id).first()
        if not room:
            return None
        
        if name is not None:
            room.name = name
        if description is not None:
            room.description = description
        if is_active is not None:
            room.is_active = is_active
        
        room.updated_at = datetime.now(timezone.utc)
        session.flush()
        
        return room
    
    @classmethod
    def delete_room(cls, session: Session, room_id: str) -> bool:
        """
        刪除房間（軟刪除）
        
        Args:
            session: 數據庫會話
            room_id: 房間ID
        
        Returns:
            bool: 是否成功刪除
        """
        room = session.query(ChatRoom).filter(ChatRoom.id == room_id).first()
        if not room:
            return False
        
        room.is_active = False
        room.updated_at = datetime.now(timezone.utc)
        session.flush()
        
        return True
    
    @classmethod
    def get_active_rooms(cls, session: Session, room_type: Optional[str] = None) -> List[ChatRoom]:
        """
        獲取活躍房間列表
        
        Args:
            session: 數據庫會話
            room_type: 房間類型過濾
        
        Returns:
            List[ChatRoom]: 房間列表
        """
        query = session.query(ChatRoom).filter(ChatRoom.is_active == True)
        
        if room_type:
            query = query.filter(ChatRoom.room_type == room_type)
        
        return query.order_by(ChatRoom.updated_at.desc()).all()
    
    @classmethod
    def cleanup_old_messages(cls, session: Session, room_id: str, keep_days: int = 30) -> int:
        """
        清理舊消息
        
        Args:
            session: 數據庫會話
            room_id: 房間ID
            keep_days: 保留天數
        
        Returns:
            int: 刪除的消息數量
        """
        from datetime import timedelta
        
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=keep_days)
        
        deleted = session.query(ChatMessage).filter(
            ChatMessage.room_id == room_id,
            ChatMessage.created_at < cutoff_date
        ).delete()
        
        session.flush()
        return deleted
