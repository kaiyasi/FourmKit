"""
通知服務
處理用戶狀態管理和始終在線的通知系統
"""

from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from models.user_status import UserStatus, UserNotification, UserStatusEnum
from models.base import User
from utils.db import get_session


class NotificationService:
    """通知服務類"""

    @classmethod
    def update_user_status(
        cls,
        user_id: int,
        status: UserStatusEnum,
        session: Optional[Session] = None
    ) -> UserStatus:
        """更新用戶狀態"""
        def _update(db: Session) -> UserStatus:
            user_status = db.query(UserStatus).filter(UserStatus.user_id == user_id).first()

            if not user_status:
                user_status = UserStatus(
                    user_id=user_id,
                    status=status,
                    last_seen=datetime.now(timezone.utc),
                    last_activity=datetime.now(timezone.utc)
                )
                db.add(user_status)
            else:
                user_status.status = status
                user_status.last_activity = datetime.now(timezone.utc)
                if status != UserStatusEnum.OFFLINE:
                    user_status.last_seen = datetime.now(timezone.utc)

            db.commit()
            return user_status

        if session:
            return _update(session)
        else:
            with get_session() as db:
                return _update(db)

    @classmethod
    def get_user_status(cls, user_id: int, session: Optional[Session] = None) -> Optional[UserStatus]:
        """獲取用戶狀態"""
        def _get(db: Session) -> Optional[UserStatus]:
            return db.query(UserStatus).filter(UserStatus.user_id == user_id).first()

        if session:
            return _get(session)
        else:
            with get_session() as db:
                return _get(db)

    @classmethod
    def should_notify_user(cls, user_id: int, notification_type: str) -> bool:
        """檢查是否應該通知用戶"""
        with get_session() as db:
            user_status = db.query(UserStatus).filter(UserStatus.user_id == user_id).first()

            if not user_status:
                return True

            if user_status.status == UserStatusEnum.DND:
                return notification_type in ['system', 'mention']

            if notification_type == 'chat_message':
                return user_status.chat_notifications
            elif notification_type == 'mention':
                return user_status.mention_notifications
            elif notification_type == 'system':
                return user_status.system_notifications

            return True

    @classmethod
    def create_notification(
        cls,
        user_id: int,
        notification_type: str,
        title: str,
        content: Optional[str] = None,
        room_id: Optional[str] = None,
        message_id: Optional[int] = None,
        from_user_id: Optional[int] = None,
        session: Optional[Session] = None
    ) -> Optional[UserNotification]:
        """創建通知"""
        if not cls.should_notify_user(user_id, notification_type):
            return None

        def _create(db: Session) -> UserNotification:
            notification = UserNotification(
                user_id=user_id,
                notification_type=notification_type,
                title=title,
                content=content,
                room_id=room_id,
                message_id=message_id,
                from_user_id=from_user_id
            )
            db.add(notification)
            db.commit()
            return notification

        if session:
            return _create(session)
        else:
            with get_session() as db:
                return _create(db)


    @classmethod
    def _extract_mentions(cls, message: str, session: Session) -> List[int]:
        """從文本中提取被提及的用戶ID。
        相容目前的暱稱規則：允許中英文、數字、底線與句點（2–20 字）。
        大小寫不敏感匹配使用者名稱。
        """
        import re

        if not message:
            return []

        pattern = r"@([A-Za-z0-9_.\u4e00-\u9fff\u3400-\u4dbf]{2,20})"
        raw = re.findall(pattern, str(message))
        if not raw:
            return []

        cand_lower = sorted({s.lower() for s in raw})
        if not cand_lower:
            return []

        users = (
            session.query(User)
            .filter(func.lower(User.username).in_(cand_lower))
            .all()
        )
        seen: set[int] = set()
        out: List[int] = []
        for u in users:
            try:
                uid = int(u.id)
            except Exception:
                continue
            if uid not in seen:
                seen.add(uid)
                out.append(uid)
        return out

    @classmethod
    def get_user_notifications(
        cls,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
        unread_only: bool = False
    ) -> List[UserNotification]:
        """獲取用戶通知"""
        with get_session() as db:
            query = db.query(UserNotification).filter(
                and_(
                    UserNotification.user_id == user_id,
                    UserNotification.is_deleted == False
                )
            )

            if unread_only:
                query = query.filter(UserNotification.is_read == False)

            return query.order_by(
                UserNotification.created_at.desc()
            ).offset(offset).limit(limit).all()

    @classmethod
    def mark_notification_read(cls, notification_id: int, user_id: int) -> bool:
        """標記通知為已讀"""
        with get_session() as db:
            notification = db.query(UserNotification).filter(
                and_(
                    UserNotification.id == notification_id,
                    UserNotification.user_id == user_id
                )
            ).first()

            if notification and not notification.is_read:
                notification.is_read = True
                notification.read_at = datetime.now(timezone.utc)
                db.commit()
                return True

            return False

    @classmethod
    def get_unread_count(cls, user_id: int) -> int:
        """獲取未讀通知數量"""
        with get_session() as db:
            return db.query(UserNotification).filter(
                and_(
                    UserNotification.user_id == user_id,
                    UserNotification.is_read == False,
                    UserNotification.is_deleted == False
                )
            ).count()

    @classmethod
    def cleanup_old_notifications(cls, days: int = 30) -> int:
        """清理舊通知"""
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

        with get_session() as db:
            deleted_count = db.query(UserNotification).filter(
                UserNotification.created_at < cutoff_date
            ).delete()
            db.commit()
            return deleted_count

    @classmethod
    def update_notification_settings(
        cls,
        user_id: int,
        chat_notifications: Optional[bool] = None,
        mention_notifications: Optional[bool] = None,
        system_notifications: Optional[bool] = None
    ) -> UserStatus:
        """更新通知設置"""
        with get_session() as db:
            user_status = db.query(UserStatus).filter(UserStatus.user_id == user_id).first()

            if not user_status:
                user_status = UserStatus(user_id=user_id)
                db.add(user_status)

            if chat_notifications is not None:
                user_status.chat_notifications = chat_notifications
            if mention_notifications is not None:
                user_status.mention_notifications = mention_notifications
            if system_notifications is not None:
                user_status.system_notifications = system_notifications

            db.commit()
            return user_status
