"""
Module: backend/models/school_setting.py
Unified comment style: module docstring + minimal inline notes.
"""
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, ForeignKey, DateTime, Text, UniqueConstraint, func
from utils.db import Base


class SchoolSetting(Base):
    __tablename__ = "school_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(Integer, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    data: Mapped[str] = mapped_column(Text, nullable=False, default='{}')
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint('school_id', name='uq_school_settings_school'),
    )


