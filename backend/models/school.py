from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, func
from utils.db import Base


class School(Base):
    __tablename__ = "schools"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # 公開校徽路徑（相對於 uploads/，例如：public/schools/{id}/logo.webp）
    logo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Instagram 關聯
    instagram_accounts = relationship("InstagramAccount", back_populates="school", cascade="all, delete-orphan")
    instagram_templates = relationship("InstagramTemplate", back_populates="school", cascade="all, delete-orphan")
