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
    guest = "guest"
    user = "user"
    dev_admin = "dev_admin"
    campus_admin = "campus_admin"
    campus_moder = "campus_moder"
    cross_admin = "cross_admin"
    cross_moder = "cross_moder"

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.user)
    school_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("schools.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

class School(Base):
    __tablename__ = "schools"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    __table_args__ = (UniqueConstraint("slug", name="uq_school_slug"),)

class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    author_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # 匿名雜湊而非 user ID
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False, index=True)

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
