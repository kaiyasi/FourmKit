# backend/models/social_publishing.py
"""
社交媒體自動發布系統 - 重新設計
支援論壇貼文審核通過後自動轉換並發布到社交平台
"""
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, ForeignKey, Text, Boolean, JSON, func, Enum
import enum
from typing import TYPE_CHECKING
from utils.db import Base

if TYPE_CHECKING:
    from .base import User, Post
    from .school import School

class PlatformType(str, enum.Enum):
    """支援的社交平台"""
    INSTAGRAM = "instagram"
    TWITTER = "twitter"
    FACEBOOK = "facebook"

class AccountStatus(str, enum.Enum):
    """帳號狀態"""
    ACTIVE = "active"           # 正常運作
    DISABLED = "disabled"       # 已停用
    ERROR = "error"            # Token 失效或其他錯誤
    PENDING = "pending"        # 待驗證

class PublishTrigger(str, enum.Enum):
    """發布觸發條件"""
    IMMEDIATE = "immediate"     # 立即發布（單一貼文）
    SCHEDULED = "scheduled"     # 定時發布（輪播）
    BATCH_COUNT = "batch_count" # 定量觸發（累積到閾值發布輪播）

class PostStatus(str, enum.Enum):
    """發文處理狀態"""
    PENDING = "pending"        # 待處理
    PROCESSING = "processing"  # 處理中（生成圖片/文案）
    QUEUED = "queued"         # 已排隊等待發布
    PUBLISHED = "published"   # 已發布
    FAILED = "failed"         # 發布失敗

class SocialAccount(Base):
    """社交媒體帳號管理"""
    __tablename__ = "social_accounts"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 基本資訊
    platform: Mapped[str] = mapped_column(String(20), nullable=False)  # instagram, twitter, etc.
    # DEPRECATE: platform_user_id（舊欄位，歷史上誤存過 User ID）
    # 新欄位 page_id 存放 Facebook Page ID（Page-based Instagram 流程需要 Page ID）
    platform_user_id: Mapped[str] = mapped_column(String(64), nullable=False)  # 平台用戶 ID（舊）
    page_id: Mapped[str | None] = mapped_column(String(64), nullable=True)     # 正確的 Page ID（新）
    platform_username: Mapped[str] = mapped_column(String(64), nullable=False)  # 平台用戶名
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)  # 顯示名稱
    
    # 認證資訊
    # 認證資訊
    access_token: Mapped[str | None] = mapped_column(Text, nullable=True) # 用戶提供的原始 Token 或短期 Token
    long_lived_access_token: Mapped[str | None] = mapped_column(Text, nullable=True) # 儲存的長期 Token
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True) # 長期 Token 的過期時間
    
    # 帳號設定
    status: Mapped[str] = mapped_column(String(16), default=AccountStatus.PENDING, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # 發布設定
    publish_trigger: Mapped[str] = mapped_column(String(16), default=PublishTrigger.BATCH_COUNT, nullable=False)
    batch_size: Mapped[int] = mapped_column(Integer, default=5, nullable=False)  # 輪播批次大小
    schedule_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 定時發布時間（小時）
    auto_hashtags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)  # 預設標籤
    
    # 關聯設定
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    default_template_id: Mapped[int | None] = mapped_column(ForeignKey("content_templates.id"), nullable=True)
    
    # 管理資訊
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 統計
    total_posts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_post_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 關係
    school: Mapped["School | None"] = relationship("School")
    creator: Mapped["User"] = relationship("User")
    templates: Mapped[list["ContentTemplate"]] = relationship(
        "ContentTemplate", 
        back_populates="account",
        foreign_keys="[ContentTemplate.account_id]"
    )
    default_template: Mapped["ContentTemplate | None"] = relationship(
        "ContentTemplate",
        foreign_keys="[SocialAccount.default_template_id]"
    )
    posts: Mapped[list["SocialPost"]] = relationship("SocialPost", back_populates="account")

class TemplateType(str, enum.Enum):
    """模板類型"""
    IMAGE = "image"           # 圖片模板
    TEXT = "text"             # 文案模板
    COMBINED = "combined"     # 圖文組合模板

class ContentTemplate(Base):
    """內容生成模板"""
    __tablename__ = "content_templates"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 基本資訊
    account_id: Mapped[int] = mapped_column(ForeignKey("social_accounts.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    template_type: Mapped[str] = mapped_column(String(16), nullable=False)
    
    # 模板配置（JSON 格式）
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    # 範例配置：
    # {
    #   "image": {
    #     "width": 1080, "height": 1080,
    #     "background": {"type": "color", "value": "#ffffff"},
    #     "logo": {"enabled": true, "position": "top-right", "size": 80},
    #     "text": {"font": "Noto Sans TC", "size": 32, "color": "#333333"}
    #   },
    #   "caption": {
    #     "template": "📢 {title}\n\n{content}\n\n{hashtags}",
    #     "max_length": 2200,
    #     "auto_hashtags": ["#校園生活", "#學生"]
    #   }
    # }
    
    # 狀態
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # 管理資訊
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 統計
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # 關係
    account: Mapped["SocialAccount"] = relationship(
        "SocialAccount", 
        back_populates="templates",
        foreign_keys="[ContentTemplate.account_id]"
    )
    creator: Mapped["User"] = relationship("User")
    posts: Mapped[list["SocialPost"]] = relationship("SocialPost", back_populates="template")

class CarouselGroup(Base):
    """輪播群組 - 管理一組要合併發布的貼文"""
    __tablename__ = "carousel_groups"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 基本資訊
    group_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)  # 唯一群組 ID
    account_id: Mapped[int] = mapped_column(ForeignKey("social_accounts.id"), nullable=False)
    
    # 群組設定
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_count: Mapped[int] = mapped_column(Integer, nullable=False)  # 目標貼文數量
    
    # 狀態
    status: Mapped[str] = mapped_column(String(16), default="collecting", nullable=False)  # collecting, ready, published
    collected_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # 發布資訊
    platform_post_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # 平台貼文 ID
    platform_post_url: Mapped[str | None] = mapped_column(String(500), nullable=True)  # 平台貼文 URL
    
    # 時間記錄
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 關係
    account: Mapped["SocialAccount"] = relationship("SocialAccount")
    posts: Mapped[list["SocialPost"]] = relationship("SocialPost", back_populates="carousel_group")

class SocialPost(Base):
    """社交媒體發布記錄"""
    __tablename__ = "social_posts"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 關聯資訊
    account_id: Mapped[int] = mapped_column(ForeignKey("social_accounts.id"), nullable=False)
    forum_post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), nullable=False)  # 原始論壇貼文
    template_id: Mapped[int | None] = mapped_column(ForeignKey("content_templates.id"), nullable=True)
    carousel_group_id: Mapped[int | None] = mapped_column(ForeignKey("carousel_groups.id"), nullable=True)
    
    # 生成內容
    generated_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)  # 生成的圖片 URL
    generated_caption: Mapped[str | None] = mapped_column(Text, nullable=True)  # 生成的文案
    custom_caption: Mapped[str | None] = mapped_column(Text, nullable=True)  # 自訂文案
    hashtags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    
    # 發布設定
    status: Mapped[str] = mapped_column(String(16), default=PostStatus.PENDING, nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    position_in_carousel: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 在輪播中的位置
    
    # 平台資訊
    platform_post_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    platform_post_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # 處理記錄
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # 時間戳
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 關係
    account: Mapped["SocialAccount"] = relationship("SocialAccount", back_populates="posts")
    forum_post: Mapped["Post"] = relationship("Post")
    template: Mapped["ContentTemplate | None"] = relationship("ContentTemplate", back_populates="posts")
    carousel_group: Mapped["CarouselGroup | None"] = relationship("CarouselGroup", back_populates="posts")

class PublishingSettings(Base):
    """全域發布設定"""
    __tablename__ = "publishing_settings"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 設定鍵值
    key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # 複雜設定
    
    # 設定分類
    category: Mapped[str] = mapped_column(String(64), default="general", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # 管理資訊
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 關係
    creator: Mapped["User"] = relationship("User")
