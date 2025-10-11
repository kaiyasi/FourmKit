"""
Platform Theme System Models
平台主題系統配置模型
"""

from __future__ import annotations
from datetime import datetime
from typing import TYPE_CHECKING, List, Dict, Any, Optional
import enum
import json

from sqlalchemy import (
    Integer, String, Text, Boolean, DateTime, 
    ForeignKey, JSON, Index, func, Float
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from utils.db import Base

if TYPE_CHECKING:
    from models.base import User
    from models.school import School


class ThemeType(str, enum.Enum):
    """主題類型"""
    SYSTEM = "system"           # 系統預設主題
    CUSTOM = "custom"           # 自訂主題
    SCHOOL = "school"           # 學校專屬主題
    COMMUNITY = "community"     # 社群分享主題
    PREMIUM = "premium"         # 付費主題


class ThemeCategory(str, enum.Enum):
    """主題分類"""
    MINIMAL = "minimal"
    MODERN = "modern"
    CLASSIC = "classic"
    DARK = "dark"
    COLORFUL = "colorful"
    ACADEMIC = "academic"
    TECH = "tech"
    CREATIVE = "creative"


class ComponentType(str, enum.Enum):
    """UI 組件類型"""
    HEADER = "header"           # 頁首
    SIDEBAR = "sidebar"         # 側邊欄
    FOOTER = "footer"           # 頁尾
    CARD = "card"              # 卡片
    BUTTON = "button"          # 按鈕
    FORM = "form"              # 表單
    NAVIGATION = "navigation"   # 導航
    MODAL = "modal"            # 彈窗
    NOTIFICATION = "notification"  # 通知
    CHAT = "chat"              # 聊天


class Theme(Base):
    """主題配置表"""
    __tablename__ = 'themes'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="主題名稱")
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, comment="主題標識符")
    description: Mapped[Optional[str]] = mapped_column(Text, comment="主題描述")
    
    theme_type: Mapped[ThemeType] = mapped_column(String(20), default=ThemeType.CUSTOM, comment="主題類型")
    category: Mapped[ThemeCategory] = mapped_column(String(20), default=ThemeCategory.MODERN, comment="主題分類")
    version: Mapped[str] = mapped_column(String(20), default="1.0.0", comment="主題版本")
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), comment="作者ID")
    
    color_config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="色彩配置")
    layout_config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="佈局配置")
    typography_config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="字型配置")
    component_config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="組件配置")
    animation_config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="動畫配置")
    
    custom_css: Mapped[Optional[str]] = mapped_column(Text, comment="自訂CSS")
    custom_js: Mapped[Optional[str]] = mapped_column(Text, comment="自訂JavaScript")
    
    preview_image: Mapped[Optional[str]] = mapped_column(String(255), comment="預覽圖片")
    thumbnail: Mapped[Optional[str]] = mapped_column(String(255), comment="縮圖")
    screenshots: Mapped[List[str]] = mapped_column(JSON, default=list, comment="截圖列表")
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否啟用")
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否公開")
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否推薦")
    
    usage_count: Mapped[int] = mapped_column(Integer, default=0, comment="使用次數")
    rating: Mapped[Optional[float]] = mapped_column(Float, comment="評分")
    download_count: Mapped[int] = mapped_column(Integer, default=0, comment="下載次數")
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), comment="創建時間")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), comment="更新時間")
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, comment="發布時間")
    
    author: Mapped[Optional["User"]] = relationship("User", back_populates="created_themes")
    user_themes: Mapped[List["UserTheme"]] = relationship("UserTheme", back_populates="theme")
    school_themes: Mapped[List["SchoolTheme"]] = relationship("SchoolTheme", back_populates="theme")
    theme_ratings: Mapped[List["ThemeRating"]] = relationship("ThemeRating", back_populates="theme")
    
    __table_args__ = (
        Index('idx_theme_type_category', 'theme_type', 'category'),
        Index('idx_theme_active_public', 'is_active', 'is_public'),
        Index('idx_theme_featured', 'is_featured'),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        """轉換為字典格式"""
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'description': self.description,
            'theme_type': self.theme_type,
            'category': self.category,
            'version': self.version,
            'color_config': self.color_config,
            'layout_config': self.layout_config,
            'typography_config': self.typography_config,
            'component_config': self.component_config,
            'animation_config': self.animation_config,
            'custom_css': self.custom_css,
            'custom_js': self.custom_js,
            'preview_image': self.preview_image,
            'thumbnail': self.thumbnail,
            'screenshots': self.screenshots,
            'is_active': self.is_active,
            'is_public': self.is_public,
            'is_featured': self.is_featured,
            'usage_count': self.usage_count,
            'rating': self.rating,
            'download_count': self.download_count,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
        }


class UserTheme(Base):
    """用戶主題關聯表"""
    __tablename__ = 'user_themes'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, comment="用戶ID")
    theme_id: Mapped[int] = mapped_column(ForeignKey("themes.id"), nullable=False, comment="主題ID")
    
    custom_config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="個人化配置")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否為當前使用主題")
    
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), comment="應用時間")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), comment="創建時間")
    
    user: Mapped["User"] = relationship("User", back_populates="user_themes")
    theme: Mapped["Theme"] = relationship("Theme", back_populates="user_themes")
    
    __table_args__ = (
        Index('idx_user_theme_active', 'user_id', 'is_active'),
    )


class SchoolTheme(Base):
    """學校主題關聯表"""
    __tablename__ = 'school_themes'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), nullable=False, comment="學校ID")
    theme_id: Mapped[int] = mapped_column(ForeignKey("themes.id"), nullable=False, comment="主題ID")
    
    school_config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="學校客製化配置")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否為學校預設主題")
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否為強制主題")
    
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), comment="應用時間")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), comment="創建時間")
    
    school: Mapped["School"] = relationship("School", back_populates="school_themes")
    theme: Mapped["Theme"] = relationship("Theme", back_populates="school_themes")


class ThemeComponent(Base):
    """主題組件配置表"""
    __tablename__ = 'theme_components'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    theme_id: Mapped[int] = mapped_column(ForeignKey("themes.id"), nullable=False, comment="主題ID")
    
    component_type: Mapped[ComponentType] = mapped_column(String(30), nullable=False, comment="組件類型")
    component_name: Mapped[str] = mapped_column(String(100), nullable=False, comment="組件名稱")
    
    style_config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="樣式配置")
    behavior_config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="行為配置")
    
    component_css: Mapped[Optional[str]] = mapped_column(Text, comment="組件CSS")
    component_js: Mapped[Optional[str]] = mapped_column(Text, comment="組件JavaScript")
    component_html: Mapped[Optional[str]] = mapped_column(Text, comment="組件HTML模板")
    
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否啟用")
    order_index: Mapped[int] = mapped_column(Integer, default=0, comment="排序索引")
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), comment="創建時間")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), comment="更新時間")
    
    theme: Mapped["Theme"] = relationship("Theme")
    
    __table_args__ = (
        Index('idx_theme_component_type', 'theme_id', 'component_type'),
        Index('idx_theme_component_enabled', 'theme_id', 'is_enabled'),
    )


class ThemeRating(Base):
    """主題評分表"""
    __tablename__ = 'theme_ratings'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    theme_id: Mapped[int] = mapped_column(ForeignKey("themes.id"), nullable=False, comment="主題ID")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, comment="評分用戶ID")
    
    rating: Mapped[float] = mapped_column(Float, nullable=False, comment="評分(1-5)")
    review: Mapped[Optional[str]] = mapped_column(Text, comment="評論內容")
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), comment="創建時間")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), comment="更新時間")
    
    theme: Mapped["Theme"] = relationship("Theme", back_populates="theme_ratings")
    user: Mapped["User"] = relationship("User")
    
    __table_args__ = (
        Index('idx_theme_rating_unique', 'theme_id', 'user_id', unique=True),
    )


class ThemePreset(Base):
    """主題預設模板表"""
    __tablename__ = 'theme_presets'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="預設名稱")
    description: Mapped[Optional[str]] = mapped_column(Text, comment="預設描述")
    
    preset_config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="預設配置")
    category: Mapped[ThemeCategory] = mapped_column(String(20), comment="預設分類")
    
    preview_data: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, comment="預覽數據")
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否啟用")
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否為系統預設")
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), comment="創建時間")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), comment="更新時間")