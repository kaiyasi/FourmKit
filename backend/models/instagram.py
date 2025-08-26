from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from .base import Base
from datetime import datetime
import uuid


class InstagramAccount(Base):
    """Instagram 帳號管理"""
    __tablename__ = 'instagram_accounts'
    
    id = Column(Integer, primary_key=True)
    account_name = Column(String(100), nullable=False, comment='帳號顯示名稱')
    username = Column(String(50), nullable=False, unique=True, comment='Instagram 用戶名')
    access_token = Column(Text, comment='Instagram API Access Token')
    account_id = Column(String(50), comment='Instagram 商業帳號 ID')
    is_active = Column(Boolean, default=True, comment='是否啟用')
    school_id = Column(Integer, ForeignKey('schools.id'), nullable=True, comment='關聯學校ID，null為跨校帳號')
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 關聯
    school = relationship("School", back_populates="instagram_accounts")
    posts = relationship("InstagramPost", back_populates="account")


class InstagramTemplate(Base):
    """Instagram 貼文模板"""
    __tablename__ = 'instagram_templates'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, comment='模板名稱')
    description = Column(Text, comment='模板描述')
    
    # 樣式設定
    background_color = Column(String(7), default='#ffffff', comment='背景色')
    background_image = Column(String(200), comment='背景圖片路徑')
    text_color = Column(String(7), default='#333333', comment='文字顏色')
    accent_color = Column(String(7), default='#3b82f6', comment='強調色')
    
    # 字體設定
    title_font = Column(String(50), default='Noto Sans TC', comment='標題字體')
    content_font = Column(String(50), default='Noto Sans TC', comment='內文字體')
    title_size = Column(Integer, default=24, comment='標題字體大小')
    content_size = Column(Integer, default=16, comment='內文字體大小')
    
    # 佈局設定
    layout_config = Column(JSON, comment='佈局配置JSON')
    
    # 品牌元素
    show_logo = Column(Boolean, default=True, comment='是否顯示Logo')
    logo_position = Column(String(20), default='bottom-right', comment='Logo位置')
    watermark_text = Column(String(100), comment='浮水印文字')
    
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False, comment='是否為預設模板')
    school_id = Column(Integer, ForeignKey('schools.id'), nullable=True, comment='專屬學校，null為通用')
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 關聯
    school = relationship("School", back_populates="instagram_templates")
    posts = relationship("InstagramPost", back_populates="template")


class InstagramPost(Base):
    """Instagram 貼文記錄"""
    __tablename__ = 'instagram_posts'
    
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey('posts.id'), nullable=False, comment='關聯的原始貼文')
    account_id = Column(Integer, ForeignKey('instagram_accounts.id'), nullable=False)
    template_id = Column(Integer, ForeignKey('instagram_templates.id'), nullable=False)
    
    # IG相關
    instagram_media_id = Column(String(50), comment='Instagram 媒體 ID')
    instagram_permalink = Column(String(500), comment='Instagram 貼文連結')
    
    # 生成的圖片
    generated_image_path = Column(String(200), comment='生成的圖片路徑')
    image_width = Column(Integer, default=1080)
    image_height = Column(Integer, default=1080)
    
    # 貼文內容
    caption = Column(Text, comment='IG 貼文文字')
    hashtags = Column(Text, comment='標籤')
    
    # 狀態管理
    status = Column(String(20), default='pending', comment='狀態: pending, generated, published, failed')
    error_message = Column(Text, comment='錯誤訊息')
    
    # 排程
    scheduled_at = Column(DateTime, comment='排程發送時間')
    published_at = Column(DateTime, comment='實際發送時間')
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 關聯
    post = relationship("Post", back_populates="instagram_posts")
    account = relationship("InstagramAccount", back_populates="posts")
    template = relationship("InstagramTemplate", back_populates="posts")


class InstagramScheduler(Base):
    """Instagram 發送排程設定"""
    __tablename__ = 'instagram_schedulers'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, comment='排程名稱')
    school_id = Column(Integer, ForeignKey('schools.id'), nullable=True, comment='關聯學校，null為全局')
    account_id = Column(Integer, ForeignKey('instagram_accounts.id'), nullable=False)
    
    # 觸發條件
    trigger_type = Column(String(20), nullable=False, comment='觸發類型: count, time, manual')
    trigger_count = Column(Integer, comment='積累數量觸發(5篇)')
    trigger_time = Column(String(8), comment='定時觸發(00:00:00)')
    
    # 過濾條件
    filter_school_only = Column(Boolean, default=False, comment='僅發送本校貼文')
    filter_min_length = Column(Integer, default=10, comment='最小內容長度')
    filter_exclude_media = Column(Boolean, default=False, comment='排除包含媒體的貼文')
    
    # 模板設定
    template_id = Column(Integer, ForeignKey('instagram_templates.id'), nullable=False)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 關聯
    school = relationship("School")
    account = relationship("InstagramAccount")
    template = relationship("InstagramTemplate")


class InstagramQueue(Base):
    """Instagram 發送佇列"""
    __tablename__ = 'instagram_queue'
    
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey('posts.id'), nullable=False)
    scheduler_id = Column(Integer, ForeignKey('instagram_schedulers.id'), nullable=False)
    
    batch_id = Column(String(36), default=lambda: str(uuid.uuid4()), comment='批次ID')
    priority = Column(Integer, default=100, comment='優先度，數字越小越優先')
    
    status = Column(String(20), default='queued', comment='狀態: queued, processing, completed, failed')
    attempts = Column(Integer, default=0, comment='嘗試次數')
    max_attempts = Column(Integer, default=3, comment='最大嘗試次數')
    
    scheduled_at = Column(DateTime, nullable=False, comment='預計處理時間')
    processed_at = Column(DateTime, comment='實際處理時間')
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 關聯
    post = relationship("Post")
    scheduler = relationship("InstagramScheduler")