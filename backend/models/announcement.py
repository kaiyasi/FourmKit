"""
Module: backend/models/announcement.py
Unified comment style: module docstring + minimal inline notes.
"""
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, Text, ForeignKey, Boolean, func, UniqueConstraint
from utils.db import Base


class Announcement(Base):
    __tablename__ = "announcements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    school: Mapped["School | None"] = relationship("School", foreign_keys=[school_id])
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    reads: Mapped[list["AnnouncementRead"]] = relationship("AnnouncementRead", back_populates="announcement", cascade="all, delete-orphan")


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    announcement_id: Mapped[int] = mapped_column(ForeignKey("announcements.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    announcement: Mapped["Announcement"] = relationship("Announcement", back_populates="reads")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    
    __table_args__ = (
        UniqueConstraint('announcement_id', 'user_id', name='uq_announcement_read'),
    )
