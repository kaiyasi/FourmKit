# backend/models/base.py
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, Enum, DateTime, ForeignKey, UniqueConstraint, Text, Boolean, Index, func
import enum
from typing import TYPE_CHECKING
from utils.db import Base

if TYPE_CHECKING:
    from .media import Media

class UserRole(str, enum.Enum):
    user = "user"
    moderator = "moderator"
    admin = "admin"
    dev_admin = "dev_admin"
    campus_admin = "campus_admin"
    cross_admin = "cross_admin"

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)



class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    rejected_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    delete_requests: Mapped[list["DeleteRequest"]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )
    media: Mapped[list["Media"]] = relationship("Media", back_populates="post", lazy="selectin")

class DeleteRequest(Base):
    __tablename__ = "delete_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    post: Mapped[Post] = relationship(back_populates="delete_requests")

# 方便依建立時間查詢
Index("idx_posts_created_desc", Post.created_at.desc())
