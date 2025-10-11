"""
用戶狀態模型
管理用戶的在線狀態、勿打擾模式等
"""

from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, Boolean, ForeignKey, func, Enum
from utils.db import Base
import enum


class UserStatusEnum(enum.Enum):
    """用戶狀態枚舉"""
    ONLINE = "online"          # 在線
    OFFLINE = "offline"        # 離線
    AWAY = "away"             # 離開
    DND = "dnd"               # 勿打擾 (Do Not Disturb)


class UserStatus(Base):
    """用戶狀態表"""
    __tablename__ = "user_status"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True, index=True)
    status: Mapped[UserStatusEnum] = mapped_column(Enum(UserStatusEnum), default=UserStatusEnum.OFFLINE, nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_activity: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    chat_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mention_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    system_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user: Mapped["User"] = relationship("User", backref="status")


class UserNotification(Base):
    """用戶通知表"""
    __tablename__ = "user_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    notification_type: Mapped[str] = mapped_column(String(32), nullable=False)  # chat_message, mention, system
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(String(1000), nullable=True)

    room_id: Mapped[str] = mapped_column(String(64), nullable=True)  # 聊天室ID
    message_id: Mapped[int] = mapped_column(Integer, nullable=True)  # 消息ID
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)  # 發送者ID

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    from_user: Mapped["User"] = relationship("User", foreign_keys=[from_user_id])