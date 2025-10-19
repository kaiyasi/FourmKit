"""
Module: backend/models/comments.py
Unified comment style: module docstring + minimal inline notes.
"""
from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, Boolean, func, UniqueConstraint
from utils.db import Base
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .base import User, Post

class Comment(Base):
    """貼文留言"""
    __tablename__ = "comments"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)  # "pending", "approved", "rejected"
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    post: Mapped["Post"] = relationship("Post", back_populates="comments")
    author: Mapped["User"] = relationship("User", foreign_keys=[author_id], back_populates="comments")
    deleted_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[deleted_by], back_populates="deleted_comments")

class PostReaction(Base):
    """貼文反應（點讚/點踩等）"""
    __tablename__ = "post_reactions"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reaction_type: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    __table_args__ = (UniqueConstraint('post_id', 'user_id', 'reaction_type', name='unique_user_post_reaction_type'),)

    post: Mapped["Post"] = relationship("Post", back_populates="reactions")
    user: Mapped["User"] = relationship("User")

class CommentReaction(Base):
    """留言反應（點讚/點踩等）"""
    __tablename__ = "comment_reactions"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    comment_id: Mapped[int] = mapped_column(ForeignKey("comments.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reaction_type: Mapped[str] = mapped_column(String(16), nullable=False)  # "like", "dislike"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    __table_args__ = (UniqueConstraint('comment_id', 'user_id', name='unique_user_comment_reaction'),)

    comment: Mapped["Comment"] = relationship("Comment")
    user: Mapped["User"] = relationship("User")
