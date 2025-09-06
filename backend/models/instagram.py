# backend/models/instagram.py
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, ForeignKey, Text, Boolean, JSON, func
import enum
from typing import TYPE_CHECKING
from utils.db import Base

if TYPE_CHECKING:
    from .base import User, Post
    from .school import School

class IGAccountStatus(str, enum.Enum):
    """Instagram 帳號狀態"""
    active = "active"           # 正常運作
    disabled = "disabled"       # 已停用
    error = "error"            # Token 失效或其他錯誤
    pending = "pending"        # 待驗證

class PublishMode(str, enum.Enum):
    """發布模式"""
    immediate = "immediate"     # 立即發布
    batch = "batch"            # 批量發布
    scheduled = "scheduled"    # 定時發布

class PostStatus(str, enum.Enum):
    """貼文處理狀態"""
    pending = "pending"        # 待處理
    processing = "processing"  # 處理中
    queued = "queued"         # 已排隊
    published = "published"   # 已發布
    failed = "failed"         # 發布失敗

class IGAccount(Base):
    """Instagram 帳號管理"""
    __tablename__ = "ig_accounts"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 基本資訊
    ig_user_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)  # Instagram Business Account ID
    ig_username: Mapped[str] = mapped_column(String(64), nullable=False)  # Instagram 用戶名
    page_id: Mapped[str] = mapped_column(String(64), nullable=False)  # Facebook Page ID
    page_name: Mapped[str] = mapped_column(String(255), nullable=False)  # Facebook Page 名稱
    
    # Token 相關
    page_token: Mapped[str] = mapped_column(Text, nullable=False)  # Page Access Token
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 帳號設定
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)  # 顯示名稱
    description: Mapped[str | None] = mapped_column(Text, nullable=True)  # 帳號描述
    profile_picture: Mapped[str | None] = mapped_column(String(500), nullable=True)  # 頭像 URL
    
    # 發布設定
    publish_mode: Mapped[str] = mapped_column(String(16), default="immediate", nullable=False)
    batch_threshold: Mapped[int] = mapped_column(Integer, default=5, nullable=False)  # 批量發布閾值
    auto_hashtags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)  # 預設標籤
    
    # 學校關聯 (可選)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    
    # 管理員設定
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 統計資訊
    total_posts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_post_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 反向關係
    templates: Mapped[list["IGTemplate"]] = relationship("IGTemplate", back_populates="account")
    posts: Mapped[list["IGPost"]] = relationship("IGPost", back_populates="account")
    
    # 外鍵關係
    school: Mapped["School | None"] = relationship("School")
    creator: Mapped["User"] = relationship("User")

class IGTemplate(Base):
    """Instagram 貼文模板"""
    __tablename__ = "ig_templates"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 基本資訊
    account_id: Mapped[int] = mapped_column(ForeignKey("ig_accounts.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # 模板名稱
    description: Mapped[str | None] = mapped_column(Text, nullable=True)  # 模板描述
    
    # 模板設定 (JSON 格式儲存)
    template_data: Mapped[dict] = mapped_column(JSON, nullable=False)  # 完整模板配置
    
    # 狀態
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # 管理資訊
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 統計
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # 反向關係
    account: Mapped["IGAccount"] = relationship("IGAccount", back_populates="templates")
    posts: Mapped[list["IGPost"]] = relationship("IGPost", back_populates="template")
    creator: Mapped["User"] = relationship("User")

class IGPost(Base):
    """Instagram 發布記錄"""
    __tablename__ = "ig_posts"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 關聯資訊
    account_id: Mapped[int] = mapped_column(ForeignKey("ig_accounts.id"), nullable=False)
    forum_post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), nullable=False)  # 原始論壇貼文
    template_id: Mapped[int] = mapped_column(ForeignKey("ig_templates.id"), nullable=False)
    
    # 發布內容
    custom_caption: Mapped[str | None] = mapped_column(Text, nullable=True)  # 自訂文案
    hashtags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)  # 標籤
    generated_image: Mapped[str | None] = mapped_column(String(500), nullable=True)  # 生成的圖片 URL
    
    # 發布設定
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # 預約時間
    
    # Instagram 資訊
    ig_media_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # IG 媒體 ID
    ig_post_url: Mapped[str | None] = mapped_column(String(500), nullable=True)  # IG 貼文連結
    
    # 處理記錄
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # 時間戳
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 反向關係
    account: Mapped["IGAccount"] = relationship("IGAccount", back_populates="posts")
    forum_post: Mapped["Post"] = relationship("Post")
    template: Mapped["IGTemplate"] = relationship("IGTemplate", back_populates="posts")

class SchoolLogo(Base):
    """學校 Logo 資源管理"""
    __tablename__ = "school_logos"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 學校關聯
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), nullable=False)
    
    # Logo 資訊
    logo_url: Mapped[str] = mapped_column(String(500), nullable=False)  # Logo 檔案路徑
    logo_type: Mapped[str] = mapped_column(String(32), default="primary", nullable=False)  # primary, secondary, icon
    alt_text: Mapped[str | None] = mapped_column(String(255), nullable=True)  # 替代文字
    
    # 設定
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # 管理資訊
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 外鍵關係
    school: Mapped["School"] = relationship("School")
    uploader: Mapped["User"] = relationship("User")

class IGSettings(Base):
    """Instagram 全域設定"""
    __tablename__ = "ig_settings"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 設定鍵值
    key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # 複雜設定
    
    # 設定類型
    category: Mapped[str] = mapped_column(String(64), default="general", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # 管理資訊
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 外鍵關係
    creator: Mapped["User"] = relationship("User")