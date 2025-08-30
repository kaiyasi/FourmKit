"""
Instagram 整合系統資料表模型
"""

from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, Boolean, Text, ForeignKey, func, JSON
from utils.db import Base

if TYPE_CHECKING:
    from .base import User, School


class InstagramAccount(Base):
    """Instagram 帳號表"""
    __tablename__ = "instagram_accounts"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[Optional[int]] = mapped_column(ForeignKey("schools.id"), nullable=True, comment="學校ID，null表示總平台帳號")
    ig_user_id: Mapped[str] = mapped_column(String(64), nullable=False, comment="Instagram User ID")
    page_id: Mapped[str] = mapped_column(String(64), nullable=False, comment="Facebook Page ID")
    account_name: Mapped[str] = mapped_column(String(128), nullable=False, comment="帳號顯示名稱")
    token_encrypted: Mapped[str] = mapped_column(Text, nullable=False, comment="加密的長期存取權杖")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, comment="權杖到期時間")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, comment="是否啟用")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # 關聯
    school: Mapped[Optional["School"]] = relationship("School", back_populates="instagram_accounts")
    settings: Mapped["InstagramSetting"] = relationship("InstagramSetting", back_populates="account", uselist=False, cascade="all, delete-orphan")
    templates: Mapped[List["InstagramTemplate"]] = relationship("InstagramTemplate", back_populates="account", cascade="all, delete-orphan")
    posts: Mapped[List["InstagramPost"]] = relationship("InstagramPost", back_populates="account", cascade="all, delete-orphan")


class InstagramSetting(Base):
    """Instagram 發布設定表"""
    __tablename__ = "instagram_settings"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("instagram_accounts.id"), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, comment="是否啟用自動發布")
    post_interval_count: Mapped[int] = mapped_column(Integer, default=10, nullable=False, comment="每X篇貼文觸發發布")
    post_interval_hours: Mapped[int] = mapped_column(Integer, default=6, nullable=False, comment="每X小時觸發發布")
    daily_limit: Mapped[int] = mapped_column(Integer, default=50, nullable=False, comment="每日發布限制")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # 關聯
    account: Mapped["InstagramAccount"] = relationship("InstagramAccount", back_populates="settings")


class InstagramTemplate(Base):
    """Instagram 模板表"""
    __tablename__ = "instagram_templates"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("instagram_accounts.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False, comment="模板名稱")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="是否為預設模板")
    
    # 布局設定 (JSON)
    layout: Mapped[dict] = mapped_column(JSON, nullable=False, comment="布局設定JSON")
    
    # 文字設定
    text_font: Mapped[str] = mapped_column(String(64), default="Arial", nullable=False, comment="文字字體")
    text_size: Mapped[int] = mapped_column(Integer, default=24, nullable=False, comment="文字大小")
    text_color: Mapped[str] = mapped_column(String(7), default="#000000", nullable=False, comment="文字顏色")
    text_position: Mapped[str] = mapped_column(String(16), default="center", nullable=False, comment="文字位置")
    
    # 校徽設定
    logo_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, comment="是否顯示校徽")
    logo_position: Mapped[str] = mapped_column(String(16), default="top-right", nullable=False, comment="校徽位置")
    logo_size: Mapped[int] = mapped_column(Integer, default=100, nullable=False, comment="校徽大小")
    
    # 背景設定
    background_type: Mapped[str] = mapped_column(String(16), default="color", nullable=False, comment="背景類型：color/image")
    background_color: Mapped[str] = mapped_column(String(7), default="#FFFFFF", nullable=False, comment="背景顏色")
    background_image: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="背景圖片路徑")
    overlay_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, comment="是否啟用白色遮罩")
    overlay_color: Mapped[str] = mapped_column(String(7), default="#FFFFFF", nullable=False, comment="遮罩顏色")
    overlay_opacity: Mapped[float] = mapped_column(Integer, default=80, nullable=False, comment="遮罩透明度(0-100)")
    overlay_size: Mapped[dict] = mapped_column(JSON, default=lambda: {"width": 0.8, "height": 0.6}, nullable=False, comment="遮罩大小")
    overlay_radius: Mapped[int] = mapped_column(Integer, default=20, nullable=False, comment="遮罩圓角")
    
    # 時間戳設定
    timestamp_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, comment="是否顯示時間戳")
    timestamp_format: Mapped[str] = mapped_column(String(32), default="YYYY/MM/DD HH:mm", nullable=False, comment="時間格式")
    timestamp_position: Mapped[str] = mapped_column(String(16), default="bottom-left", nullable=False, comment="時間位置")
    timestamp_size: Mapped[int] = mapped_column(Integer, default=16, nullable=False, comment="時間大小")
    timestamp_color: Mapped[str] = mapped_column(String(7), default="#666666", nullable=False, comment="時間顏色")
    
    # Caption 模板
    caption_template: Mapped[str] = mapped_column(Text, default="📚 {school_name}\n\n{post_title}\n\n👤 作者：{author_name}\n📅 發布時間：{post_time}\n\n#校園生活 #學生分享", nullable=False, comment="Caption模板")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # 關聯
    account: Mapped["InstagramAccount"] = relationship("InstagramAccount", back_populates="templates")


class InstagramPost(Base):
    """Instagram 發布記錄表"""
    __tablename__ = "instagram_posts"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("instagram_accounts.id"), nullable=False)
    forum_post_ids: Mapped[List[int]] = mapped_column(JSON, nullable=False, comment="ForumKit貼文ID列表")
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False, comment="狀態：draft/queued/publishing/published/failed")
    ig_media_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, comment="Instagram Media ID")
    ig_post_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, comment="Instagram Post ID")
    caption: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="發布的Caption")
    image_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="生成的圖片路徑")
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, comment="錯誤代碼")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="錯誤訊息")
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, comment="重試次數")
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="實際發布時間")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # 關聯
    account: Mapped["InstagramAccount"] = relationship("InstagramAccount", back_populates="posts")
    events: Mapped[List["InstagramEvent"]] = relationship("InstagramEvent", back_populates="post", cascade="all, delete-orphan")


class InstagramEvent(Base):
    """Instagram 事件記錄表"""
    __tablename__ = "instagram_events"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ig_post_id: Mapped[int] = mapped_column(ForeignKey("instagram_posts.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False, comment="事件類型")
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, comment="事件資料")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 關聯
    post: Mapped["InstagramPost"] = relationship("InstagramPost", back_populates="events")


# 更新 School 模型以支援 Instagram 關聯
if TYPE_CHECKING:
    from .school import School
    
    # 在 School 類中添加 Instagram 關聯
    School.instagram_accounts = relationship("InstagramAccount", back_populates="school")
