"""
Instagram 整合系統資料模型
支援多帳號管理、模板系統、發布追蹤
"""

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey,
    JSON, Enum as SQLEnum, Index, CheckConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base
from enum import Enum



class PublishMode(str, Enum):
    """發布模式"""
    INSTANT = "instant"      # 即時發布（公告專用）
    BATCH = "batch"          # 批次發布（累積 N 篇後發布輪播）
    SCHEDULED = "scheduled"  # 排程發布（固定時間發布輪播）


class TemplateType(str, Enum):
    """模板類型"""
    ANNOUNCEMENT = "announcement"
    GENERAL = "general"


class PostStatus(str, Enum):
    """Instagram 貼文狀態（資料庫以小寫字串存）"""
    PENDING = "pending"          # 等待渲染
    RENDERING = "rendering"      # 渲染中
    READY = "ready"              # 渲染完成，等待發布
    PUBLISHING = "publishing"    # 發布中
    PUBLISHED = "published"      # 已發布
    FAILED = "failed"            # 發布失敗
    CANCELLED = "cancelled"      # 已取消



class InstagramAccount(Base):
    """Instagram 帳號管理"""
    __tablename__ = "instagram_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)

    school_id = Column(Integer, ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True)
    ig_user_id = Column(String(100), nullable=False, unique=True, comment="Instagram User ID")
    username = Column(String(100), nullable=False, comment="Instagram 用戶名")

    access_token_encrypted = Column(Text, nullable=False, comment="加密的 Access Token")
    token_expires_at = Column(DateTime, nullable=False, comment="Token 過期時間")
    last_token_refresh = Column(DateTime, comment="最後刷新時間")

    app_id = Column(String(100), comment="Facebook App ID")
    app_secret_encrypted = Column(Text, comment="加密的 App Secret")

    publish_mode = Column(SQLEnum(PublishMode), nullable=False, default=PublishMode.BATCH, comment="發布模式")
    batch_count = Column(Integer, default=10, comment="批次發布數量（batch 模式）")
    scheduled_times = Column(JSON, comment="排程時間列表（scheduled 模式），格式：['09:00', '15:00', '21:00']")

    announcement_template_id = Column(Integer, ForeignKey("ig_templates.id", ondelete="SET NULL"), comment="公告模板 ID")
    general_template_id = Column(Integer, ForeignKey("ig_templates.id", ondelete="SET NULL"), comment="一般模板 ID")

    is_active = Column(Boolean, default=True, nullable=False, comment="是否啟用")
    last_publish_at = Column(DateTime, comment="最後發布時間")
    last_error = Column(Text, comment="最後錯誤訊息")
    last_error_at = Column(DateTime, comment="最後錯誤時間")

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    school = relationship("School", foreign_keys=[school_id], backref="instagram_accounts")
    announcement_template = relationship("IGTemplate", foreign_keys=[announcement_template_id], backref="announcement_accounts")
    general_template = relationship("IGTemplate", foreign_keys=[general_template_id], backref="general_accounts")
    posts = relationship("InstagramPost", back_populates="account", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint('batch_count >= 1 AND batch_count <= 10', name='valid_batch_count'),
        Index('idx_ig_account_school_active', 'school_id', 'is_active'),
        Index('idx_ig_account_token_expires', 'token_expires_at'),
    )

    def __repr__(self):
        return f"<InstagramAccount(id={self.id}, username={self.username}, school_id={self.school_id})>"


class IGTemplate(Base):
    """Instagram 貼文模板"""
    __tablename__ = "ig_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)

    name = Column(String(100), nullable=False, comment="模板名稱")
    description = Column(Text, comment="模板描述")
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True, comment="學校 ID（NULL 表示全域模板）")
    template_type = Column(SQLEnum(TemplateType, values_callable=lambda x: [e.value for e in x]), nullable=False, comment="模板類型")

    canvas_config = Column(JSON, nullable=False, comment="""
    Canvas 配置，格式：
    {
        "width": 1080,
        "height": 1080,
        "background_type": "color" | "image",
        "background_color": "#FFFFFF",
        "background_image": "cdn_path"
    }
    """)

    text_with_attachment = Column(JSON, comment="""
    有附件時的文字配置，格式：
    {
        "font_family": "font_id",
        "font_size": 32,
        "color": "#000000",
        "max_chars_per_line": 20,
        "max_lines": 8,
        "truncate_text": "...",
        "align": "left" | "center" | "right",
        "start_y": 700,
        "line_spacing": 10
    }
    """)

    text_without_attachment = Column(JSON, comment="""
    無附件時的文字配置，格式同上
    """)

    attachment_config = Column(JSON, comment="""
    附件圖片配置，格式：
    {
        "enabled": true,
        "base_width": 450,
        "base_height": 450,
        "border_radius": 20,
        "spacing": 15,
        "position_x": 70,
        "position_y": 70
    }
    """)

    logo_config = Column(JSON, comment="""
    Logo 配置，格式：
    {
        "enabled": true,
        "source": "school_logo" | "platform_logo" | "custom",
        "custom_image": "cdn_path",
        "position_x": 50,
        "position_y": 950,
        "width": 150,
        "height": 80,
        "opacity": 1.0,
        "layer_order": 100
    }
    """)

    watermark_config = Column(JSON, comment="""
    浮水印配置，格式：
    {
        "enabled": true,
        "text": "ForumKit",
        "font_family": "font_id",
        "font_size": 14,
        "color": "#000000",
        "opacity": 0.3,
        "position_x": 950,
        "position_y": 1050,
        "layer_order": 200
    }
    """)

    caption_template = Column(JSON, nullable=False, comment="""
    Caption 模板配置，格式：
    {
        "structure": ["header", "divider", "content", "divider", "post_id", "footer", "hashtags"],
        "header": {
            "enabled": true,
            "text": "📢 校園公告"
        },
        "footer": {
            "enabled": true,
            "text": "ForumKit 校園討論平台"
        },
        "post_id_format": {
            "enabled": true,
            "template": "#{school_short_name}_{post_type}_{post_id}",
            "style": "hashtag"
        },
        "hashtags": {
            "enabled": true,
            "tags": ["校園", "公告", "學生"]
        },
        "divider": {
            "enabled": true,
            "text": "━━━━━━━━━━"
        }
    }
    """)

    is_active = Column(Boolean, default=True, nullable=False, comment="是否啟用")
    usage_count = Column(Integer, default=0, nullable=False, comment="使用次數")
    last_used_at = Column(DateTime, comment="最後使用時間")

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    school = relationship("School", foreign_keys=[school_id], backref="ig_templates")
    posts = relationship("InstagramPost", back_populates="template")

    __table_args__ = (
        Index('idx_ig_template_school_type', 'school_id', 'template_type', 'is_active'),
    )

    def __repr__(self):
        return f"<IGTemplate(id={self.id}, name={self.name}, type={self.template_type})>"


class InstagramPost(Base):
    """Instagram 發布記錄"""
    __tablename__ = "instagram_posts"

    id = Column(Integer, primary_key=True, autoincrement=True)

    public_id = Column(String(50), unique=True, nullable=False, index=True, comment="公開 ID（用於外部查詢）")
    forum_post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True, comment="論壇貼文 ID")
    ig_account_id = Column(Integer, ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False, index=True, comment="IG 帳號 ID")
    template_id = Column(Integer, ForeignKey("ig_templates.id", ondelete="SET NULL"), comment="使用的模板 ID")

    rendered_image_cdn_path = Column(String(500), comment="渲染後圖片的 CDN 路徑")
    rendered_caption = Column(Text, comment="渲染後的 Caption（最終發布內容）")

    carousel_group_id = Column(String(50), index=True, comment="輪播組 ID（10 篇一組）")
    carousel_position = Column(Integer, comment="在輪播中的位置（1-10）")
    carousel_total = Column(Integer, comment="輪播總數")

    ig_media_id = Column(String(100), unique=True, comment="Instagram Media ID")
    ig_container_id = Column(String(100), comment="Instagram Container ID")
    ig_permalink = Column(String(500), comment="Instagram 連結")

    status = Column(String(20), nullable=False, default=PostStatus.PENDING.value, index=True, comment="發布狀態（小寫字串）")
    publish_mode = Column(SQLEnum(PublishMode, values_callable=lambda x: [e.value for e in x]), nullable=False, comment="發布模式")
    scheduled_at = Column(DateTime, index=True, comment="排程發布時間")
    published_at = Column(DateTime, comment="實際發布時間")

    error_message = Column(Text, comment="錯誤訊息")
    error_code = Column(String(50), comment="錯誤代碼")
    retry_count = Column(Integer, default=0, nullable=False, comment="重試次數")
    last_retry_at = Column(DateTime, comment="最後重試時間")
    max_retries = Column(Integer, default=3, nullable=False, comment="最大重試次數")

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    forum_post = relationship("Post", backref="instagram_posts")
    account = relationship("InstagramAccount", back_populates="posts")
    template = relationship("IGTemplate", back_populates="posts")

    __table_args__ = (
        Index('idx_ig_post_status_mode', 'status', 'publish_mode'),
        Index('idx_ig_post_carousel', 'carousel_group_id', 'carousel_position'),
        Index('idx_ig_post_scheduled', 'scheduled_at', 'status'),
        CheckConstraint('retry_count <= max_retries', name='valid_retry_count'),
        CheckConstraint('carousel_position >= 1 AND carousel_position <= 10', name='valid_carousel_position'),
    )

    def __repr__(self):
        return f"<InstagramPost(id={self.id}, public_id={self.public_id}, status={self.status})>"
