from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, Text, ForeignKey, func
from utils.db import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("chat_rooms.id"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    message_type: Mapped[str] = mapped_column(String(16), default="text", nullable=False)  # text, system, join, leave
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 關聯到用戶和房間
    user: Mapped["User | None"] = relationship("User", foreign_keys=[user_id])
    room: Mapped["ChatRoom"] = relationship("ChatRoom", back_populates="messages")


class ChatRoom(Base):
    __tablename__ = "chat_rooms"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    room_type: Mapped[str] = mapped_column(String(16), default="system", nullable=False)  # system, custom
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # 關聯
    owner: Mapped["User | None"] = relationship("User", foreign_keys=[owner_id])
    school: Mapped["School | None"] = relationship("School", foreign_keys=[school_id])
    messages: Mapped[list["ChatMessage"]] = relationship("ChatMessage", back_populates="room", cascade="all, delete-orphan")
    members: Mapped[list["ChatRoomMember"]] = relationship("ChatRoomMember", back_populates="room", cascade="all, delete-orphan")


class ChatRoomMember(Base):
    """聊天室成員關係表"""
    __tablename__ = "chat_room_members"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("chat_rooms.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    
    # 關聯
    room: Mapped["ChatRoom"] = relationship("ChatRoom", back_populates="members")
    user: Mapped["User"] = relationship("User")


# 反向關聯已移至 ChatMessage 類別內
