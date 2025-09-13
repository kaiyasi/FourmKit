# backend/models/base.py
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, ForeignKey, Text, Boolean, Index, func
import enum
from typing import TYPE_CHECKING
from utils.db import Base

if TYPE_CHECKING:
    from .media import Media
    from .comments import Comment, PostReaction
    from .support import SupportTicket, SupportMessage, SupportEvent, TicketWatcher
    from .school import School

class UserRole(str, enum.Enum):
    user = "user"                    # 一般用戶
    campus_moderator = "campus_moderator"  # 校內審核
    cross_moderator = "cross_moderator"    # 跨校審核
    campus_admin = "campus_admin"      # 校內板主
    cross_admin = "cross_admin"        # 跨校板主
    dev_admin = "dev_admin"            # 開發人員
    commercial = "commercial"          # 廣告專用帳號（統一為 commercial）

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    avatar_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # 會員相關欄位
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    premium_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 反向關係
    posts: Mapped[list["Post"]] = relationship("Post", foreign_keys="Post.author_id", back_populates="author")
    deleted_posts: Mapped[list["Post"]] = relationship("Post", foreign_keys="Post.deleted_by", back_populates="deleted_by_user")
    comments: Mapped[list["Comment"]] = relationship("Comment", foreign_keys="Comment.author_id", back_populates="author")
    deleted_comments: Mapped[list["Comment"]] = relationship("Comment", foreign_keys="Comment.deleted_by")
    authored_media: Mapped[list["Media"]] = relationship("Media", foreign_keys="Media.author_id", back_populates="author")
    deleted_media: Mapped[list["Media"]] = relationship("Media", foreign_keys="Media.deleted_by")
    reviewed_delete_requests: Mapped[list["DeleteRequest"]] = relationship("DeleteRequest", foreign_keys="DeleteRequest.reviewed_by", back_populates="reviewed_by_user")
    
    # 支援工單系統關聯
    submitted_tickets: Mapped[list["SupportTicket"]] = relationship("SupportTicket", foreign_keys="SupportTicket.user_id", back_populates="user")
    assigned_tickets: Mapped[list["SupportTicket"]] = relationship("SupportTicket", foreign_keys="SupportTicket.assigned_to", back_populates="assigned_user")
    support_messages: Mapped[list["SupportMessage"]] = relationship("SupportMessage", back_populates="author_user")
    support_events: Mapped[list["SupportEvent"]] = relationship("SupportEvent", back_populates="actor")
    watched_tickets: Mapped[list["TicketWatcher"]] = relationship("TicketWatcher", back_populates="user")
class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    rejected_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 刪文相關欄位
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    delete_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    delete_request_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # 置頂相關欄位
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pinned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    
    # 廣告貼文標記 (school_id=null 且作者具廣告權限時標記為廣告)
    is_advertisement: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # 公告貼文標記
    is_announcement: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    announcement_type: Mapped[str | None] = mapped_column(String(16), nullable=True)  # platform, cross, school

    delete_requests: Mapped[list["DeleteRequest"]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )
    media: Mapped[list["Media"]] = relationship("Media", back_populates="post", lazy="selectin")
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="post", cascade="all, delete-orphan")
    reactions: Mapped[list["PostReaction"]] = relationship("PostReaction", back_populates="post", cascade="all, delete-orphan")
    
    # Instagram 關聯 (已移除，因為 models.instagram 不存在)
    
    # 明確指定外鍵關係
    author: Mapped["User"] = relationship("User", foreign_keys=[author_id], back_populates="posts")
    deleted_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[deleted_by], back_populates="deleted_posts")
    pinned_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[pinned_by])
    school: Mapped["School | None"] = relationship("School", foreign_keys=[school_id])

class DeleteRequest(Base):
    __tablename__ = "delete_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    requester_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    requester_user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)  # pending, approved, rejected
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    post: Mapped[Post] = relationship(back_populates="delete_requests")
    
    # 明確指定外鍵關係
    reviewed_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[reviewed_by], back_populates="reviewed_delete_requests")

# 方便依建立時間查詢
Index("idx_posts_created_desc", Post.created_at.desc())
