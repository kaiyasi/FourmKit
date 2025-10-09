"""
管理員聊天室資料模型 - 增強版
支援多頻道、投票決策、貼文審核討論、檔案分享、@提及通知
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Enum as SQLEnum, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, timezone
import enum
from .base import Base


class ChatRoomType(str, enum.Enum):
    """聊天室類型"""
    SCHOOL = "school"           # 學校專屬頻道
    CROSS = "cross"             # 跨校管理員頻道
    EMERGENCY = "emergency"     # 緊急事件頻道
    SYSTEM = "system"           # 系統通知頻道
    DEVELOPER = "developer"     # 開發人員頻道
    GLOBAL = "global"           # 總聊天群
    CUSTOM = "custom"           # 自訂頻道


class MessageType(str, enum.Enum):
    """訊息類型"""
    TEXT = "text"               # 純文字
    SYSTEM = "system"           # 系統通知
    POST_REVIEW = "post_review" # 貼文審核
    VOTE = "vote"               # 投票
    FILE = "file"               # 檔案
    MENTION = "mention"         # @提及


class VoteStatus(str, enum.Enum):
    """投票狀態"""
    ACTIVE = "active"           # 進行中
    PASSED = "passed"           # 通過
    REJECTED = "rejected"       # 拒絕
    EXPIRED = "expired"         # 過期


class AdminChatRoom(Base):
    """管理員聊天室"""
    __tablename__ = "admin_chat_rooms"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    type = Column(SQLEnum(ChatRoomType), nullable=False)
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    is_private = Column(Boolean, default=False)  # 私有頻道需要邀請
    max_members = Column(Integer, default=100)   # 最大成員數
    
    # 關聯
    school = relationship("School", backref="admin_chat_rooms")
    creator = relationship("User", backref="created_chat_rooms")
    messages = relationship("AdminChatMessage", back_populates="room", cascade="all, delete-orphan")
    members = relationship("AdminChatMember", back_populates="room", cascade="all, delete-orphan")

    # 索引優化
    __table_args__ = (
        Index('idx_chat_room_type_school', 'type', 'school_id'),
        Index('idx_chat_room_active', 'is_active'),
    )


class AdminChatMessage(Base):
    """聊天訊息"""
    __tablename__ = "admin_chat_messages"

    id = Column(Integer, primary_key=True)
    room_id = Column(Integer, ForeignKey("admin_chat_rooms.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    message_type = Column(SQLEnum(MessageType), default=MessageType.TEXT)
    
    # 貼文審核相關
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=True)
    
    # 投票相關
    vote_id = Column(Integer, ForeignKey("admin_chat_votes.id"), nullable=True)
    
    # 檔案相關
    file_path = Column(String(500), nullable=True)
    file_name = Column(String(200), nullable=True)
    file_size = Column(Integer, nullable=True)
    file_type = Column(String(50), nullable=True)
    
    # @提及相關
    mentioned_users = Column(Text, nullable=True)  # JSON 格式儲存被提及的用戶ID
    
    # 訊息狀態
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    edited_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, default=False)
    is_pinned = Column(Boolean, default=False)
    
    # 關聯
    room = relationship("AdminChatRoom", back_populates="messages")
    user = relationship("User", backref="chat_messages")
    post = relationship("Post", backref="chat_discussions")
    vote = relationship("AdminChatVote", back_populates="message")

    # 索引優化
    __table_args__ = (
        Index('idx_chat_message_room_time', 'room_id', 'created_at'),
        Index('idx_chat_message_user', 'user_id'),
        Index('idx_chat_message_type', 'message_type'),
    )


class AdminChatMember(Base):
    """聊天室成員"""
    __tablename__ = "admin_chat_members"

    id = Column(Integer, primary_key=True)
    room_id = Column(Integer, ForeignKey("admin_chat_rooms.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(50), default="member")  # admin, moderator, member
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    last_read_at = Column(DateTime(timezone=True), nullable=True)
    last_active_at = Column(DateTime(timezone=True), server_default=func.now())
    is_muted = Column(Boolean, default=False)
    notification_enabled = Column(Boolean, default=True)
    
    # 關聯
    room = relationship("AdminChatRoom", back_populates="members")
    user = relationship("User", backref="chat_memberships")

    # 索引優化
    __table_args__ = (
        Index('idx_chat_member_room_user', 'room_id', 'user_id'),
        Index('idx_chat_member_last_read', 'room_id', 'last_read_at'),
    )


class AdminChatVote(Base):
    """聊天室投票"""
    __tablename__ = "admin_chat_votes"

    id = Column(Integer, primary_key=True)
    room_id = Column(Integer, ForeignKey("admin_chat_rooms.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    
    # 投票選項 (JSON 格式存儲)
    options = Column(Text, nullable=False)  # JSON: [{"id": 1, "text": "通過"}, {"id": 2, "text": "拒絕"}]
    
    # 投票設定
    require_majority = Column(Boolean, default=True)  # 需要過半數
    min_votes = Column(Integer, default=1)            # 最少投票數
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    # 狀態
    status = Column(SQLEnum(VoteStatus), default=VoteStatus.ACTIVE)
    result_option_id = Column(Integer, nullable=True)  # 獲勝選項ID
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)
    
    # 關聯
    room = relationship("AdminChatRoom", backref="votes")
    creator = relationship("User", backref="created_votes")
    message = relationship("AdminChatMessage", back_populates="vote", uselist=False)
    ballot_entries = relationship("AdminChatVoteBallot", back_populates="vote", cascade="all, delete-orphan")

    # 索引優化
    __table_args__ = (
        Index('idx_chat_vote_room_status', 'room_id', 'status'),
        Index('idx_chat_vote_expires', 'expires_at'),
    )


class AdminChatVoteBallot(Base):
    """投票記錄"""
    __tablename__ = "admin_chat_vote_ballots"

    id = Column(Integer, primary_key=True)
    vote_id = Column(Integer, ForeignKey("admin_chat_votes.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    option_id = Column(Integer, nullable=False)  # 對應 vote.options 中的 ID
    voted_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 關聯
    vote = relationship("AdminChatVote", back_populates="ballot_entries")
    user = relationship("User", backref="vote_ballots")

    # 索引優化
    __table_args__ = (
        Index('idx_chat_ballot_vote_user', 'vote_id', 'user_id'),
    )


class AdminChatMention(Base):
    """@提及記錄"""
    __tablename__ = "admin_chat_mentions"

    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, ForeignKey("admin_chat_messages.id"), nullable=False)
    mentioned_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    mentioned_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    room_id = Column(Integer, ForeignKey("admin_chat_rooms.id"), nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    read_at = Column(DateTime(timezone=True), nullable=True)
    
    # 關聯
    message = relationship("AdminChatMessage", backref="mentions")
    mentioned_user = relationship("User", foreign_keys=[mentioned_user_id], backref="received_mentions")
    mentioned_by_user = relationship("User", foreign_keys=[mentioned_by_user_id], backref="sent_mentions")
    room = relationship("AdminChatRoom", backref="mentions")

    # 索引優化
    __table_args__ = (
        Index('idx_chat_mention_user_read', 'mentioned_user_id', 'is_read'),
        Index('idx_chat_mention_room', 'room_id'),
    )


class AdminChatFile(Base):
    """聊天室檔案記錄"""
    __tablename__ = "admin_chat_files"

    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, ForeignKey("admin_chat_messages.id"), nullable=False)
    room_id = Column(Integer, ForeignKey("admin_chat_rooms.id"), nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # 檔案資訊
    original_name = Column(String(200), nullable=False)
    stored_name = Column(String(200), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_type = Column(String(50), nullable=False)
    mime_type = Column(String(100), nullable=False)
    
    # 預覽資訊（圖片/影片）
    thumbnail_path = Column(String(500), nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    duration = Column(Integer, nullable=True)  # 影片長度（秒）
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 關聯
    message = relationship("AdminChatMessage", backref="files")
    room = relationship("AdminChatRoom", backref="files")
    uploader = relationship("User", backref="uploaded_chat_files")

    # 索引優化
    __table_args__ = (
        Index('idx_chat_file_room', 'room_id'),
        Index('idx_chat_file_type', 'file_type'),
    )