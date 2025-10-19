"""
Module: backend/models/school.py
Unified comment style: module docstring + minimal inline notes.
"""
from __future__ import annotations
from datetime import datetime
from typing import TYPE_CHECKING, List
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, func
from utils.db import Base

if TYPE_CHECKING:
    from .support import SupportTicket


class School(Base):
    __tablename__ = "schools"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    logo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gmail_domain: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="學校專用 Gmail 網域")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    support_tickets: Mapped[List["SupportTicket"]] = relationship("SupportTicket", back_populates="school")
