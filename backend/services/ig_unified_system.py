# backend/services/ig_unified_system.py
"""
Instagram 統一整合系統
完全重構的 IG 模板與發布系統，解決所有架構問題
"""
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import time
import traceback
from io import BytesIO
import base64

from utils.db import get_session
from models.social_publishing import SocialAccount, ContentTemplate, SocialPost, PostStatus
from models.instagram import SchoolLogo  # 保留 SchoolLogo，如果需要的話
from models.base import Post as ForumPost
from services.instagram_api_service import InstagramAPIService, InstagramAPIError
from services.unified_post_renderer import get_renderer


class IGSystemError(Exception):
    """IG 系統錯誤基類"""
    def __init__(self, message: str, error_code: str = None, details: Dict = None):
        self.message = message
        self.error_code = error_code or "UNKNOWN_ERROR"
        self.details = details or {}
        super().__init__(self.message)


@dataclass
class TemplateConfig:
    """統一的模板配置結構 - 不提供預設值，強制使用資料庫模板"""
    # 基本設定 - 必須從資料庫模板提供
    width: int
    height: int
    background_color: str

    # 內容設定 - 必須從資料庫模板提供
    font_family: str
    font_size: int
    text_color: str
    padding: int
    text_align: str = "left"  # 只保留非關鍵的預設值
    line_height: float = 1.5
    max_lines: int = 12

    # 文字截斷設定
    max_chars_per_line: int = 24  # 每行最大字元數
    max_lines_with_photo: int = 6  # 有圖片時的最大行數
    max_chars_per_line_with_photo: int = 24  # 有圖片時每行最大字元數
    stacked_layout: bool = True  # 是否使用堆疊佈局
    
    # Logo 設定
    logo_enabled: bool = True
    logo_size: int = 80
    logo_position: str = "top-right"  # top-right, top-left, bottom-right, bottom-left
    logo_shape: str = "circle"  # circle, square, rounded
    
    # 元數據設定
    show_author: bool = True
    show_timestamp: bool = True
    show_school: bool = True

    # 貼文ID設定
    post_id_enabled: bool = True
    post_id_format: str = "#{ID}"
    post_id_position: str = "bottom-right"
    post_id_size: int = 12
    post_id_color: str = "#666666"
    post_id_font: str = "Noto Sans TC"

    # 時間戳設定
    timestamp_enabled: bool = True
    timestamp_format: str = "relative"
    timestamp_position: str = "bottom-left"
    timestamp_size: int = 12
    timestamp_color: str = "#666666"
    timestamp_font: str = "Noto Sans TC"

    # 樣式主題
    theme: str = "modern"  # modern, minimal, card
    
    def to_dict(self) -> Dict[str, Any]:
        """轉換為字典"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TemplateConfig':
        """從字典創建配置"""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class ContentData:
    """統一的內容數據結構"""
    title: str = ""
    content: str = ""
    author: str = ""
    school_name: str = ""
    created_at: datetime = None
    
    # Instagram 特定
    custom_caption: str = ""
    hashtags: List[str] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now(timezone.utc)
        if self.hashtags is None:
            self.hashtags = []


@dataclass
class RenderResult:
    """渲染結果"""
    success: bool
    html_content: str = ""
    image_url: str = ""
    image_path: str = ""
    width: int = 0
    height: int = 0
    file_size: int = 0
    error_message: str = ""
    error_code: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """轉換為字典"""
        return asdict(self)


class IGTemplateEngine:
    """統一的 IG 模板渲染引擎"""
    
    def __init__(self):
        self.upload_root = os.getenv('UPLOAD_ROOT', 'uploads')
        self.public_base_url = (os.getenv('PUBLIC_BASE_URL') or '').rstrip('/')
        self.cdn_base_url = (os.getenv('PUBLIC_CDN_URL') or '').rstrip('/')
        
        # 支持的主題樣式
        self.themes = {
            'modern': self._get_modern_theme,
            'minimal': self._get_minimal_theme, 
            'card': self._get_card_theme
        }
    
    def render_to_html(self, config: TemplateConfig, content: ContentData, 
                      logo_url: str = None) -> str:
        """渲染內容為 HTML"""
        try:
            # 獲取主題樣式
            theme_generator = self.themes.get(config.theme, self._get_modern_theme)
            theme_css = theme_generator(config)
            
            # 處理 Logo
            logo_html = ""
            if config.logo_enabled and logo_url:
                logo_html = self._generate_logo_html(logo_url, config)
            
            # 處理內容
            content_html = self._generate_content_html(content, config)
            
            # 處理元數據
            metadata_html = self._generate_metadata_html(content, config)
            
            # 組合完整 HTML
            html = f"""
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&display=swap" rel="stylesheet">
    <style>
        {theme_css}
    </style>
</head>
<body>
    <div class="ig-container">
        {logo_html}
        {content_html}
        {metadata_html}
    </div>
</body>
</html>
            """.strip()
            
            return html
            
        except Exception as e:
            raise IGSystemError(f"HTML 渲染失敗: {str(e)}", "RENDER_HTML_ERROR")
    
    def render_to_image(self, config: TemplateConfig, content: ContentData,
                       logo_url: str = None, instagram_template_data: dict = None) -> RenderResult:
        """渲染內容為圖片 - 使用統一渲染器"""
        try:
            # 準備內容數據 - 統一格式
            unified_content = {
                "title": content.title or "",
                "text": content.content or "",
                "author": content.author or "",
                "school_name": content.school_name or "",
                "created_at": content.created_at.isoformat() if content.created_at else None,
                "id": str(getattr(content, 'post_id', ''))
            }

            # 將 TemplateConfig 和 instagram_template_data 合併為統一配置
            unified_config = self._convert_to_unified_config(config, instagram_template_data)

            # 使用統一渲染器
            from services.unified_post_renderer import get_renderer
            renderer = get_renderer()

            # 調用統一渲染器生成並保存圖片
            save_result = renderer.save_image(
                content=unified_content,
                size="instagram_square",
                template="modern",
                config=unified_config,
                logo_url=logo_url,
                quality=95,
                purpose="publish"  # 發布用高品質
            )

            if save_result["success"]:
                return RenderResult(
                    success=True,
                    html_content="",  # 不再需要 HTML
                    image_url=save_result["full_url"],
                    image_path=save_result["file_path"],
                    width=save_result["dimensions"].get("width", config.width),
                    height=save_result["dimensions"].get("height", config.height),
                    file_size=save_result["file_size"]
                )
            else:
                raise IGSystemError("統一渲染器保存失敗", "UNIFIED_RENDER_ERROR")

        except Exception as e:
            return RenderResult(
                success=False,
                error_message=str(e),
                error_code="RENDER_IMAGE_ERROR"
            )

    def _convert_to_unified_config(self, config: TemplateConfig, instagram_template_data: dict = None) -> dict:
        """將 TemplateConfig 和 Instagram 模板數據轉換為統一配置格式"""
        # 基礎配置從 TemplateConfig 轉換 - 不提供預設值，必須有完整配置
        unified_config = {
            # 畫布設定 - 必須提供
            "background_color": config.background_color,
            "width": config.width,
            "height": config.height,

            # 文字樣式設定 - 必須提供
            "font_family": config.font_family,
            "primary_color": config.text_color,
            "font_size_title": int(config.font_size * 1.2),
            "font_size_content": config.font_size,
            "line_height": config.line_height,
            "padding": config.padding,

            # 文字位置和對齊
            "text_align": getattr(config, 'text_align', 'center'),
            "text_position": "center",  # 預設置中

            # 文字截斷設定 - 從 TemplateConfig 讀取
            "max_lines": getattr(config, 'max_lines', 12),
            "max_chars_per_line": getattr(config, 'max_chars_per_line', 24),
            "max_lines_with_photo": getattr(config, 'max_lines_with_photo', 6),
            "max_chars_per_line_with_photo": getattr(config, 'max_chars_per_line_with_photo', 24),

            # Logo 設定
            "logo_enabled": getattr(config, 'logo_enabled', True),
            "logo_size": getattr(config, 'logo_size', 80),
            "logo_position": getattr(config, 'logo_position', 'bottom-right'),
            "logo_opacity": getattr(config, 'logo_opacity', 0.85),

            # 其他預設值
            "secondary_color": "#666666",
            "accent_color": "#007acc",
            "border_radius": 12,
            "font_size_meta": 18,
        }

        # 如果有 Instagram 模板數據，進行詳細配置轉換
        if instagram_template_data:
            # 處理嵌套的圖片配置
            if "image" in instagram_template_data:
                image_config = instagram_template_data["image"]

                # 基本設定
                if "width" in image_config:
                    unified_config["width"] = image_config["width"]
                if "height" in image_config:
                    unified_config["height"] = image_config["height"]
                if "background" in image_config and "value" in image_config["background"]:
                    unified_config["background_color"] = image_config["background"]["value"]
                if "padding" in image_config:
                    unified_config["padding"] = image_config["padding"]

                # 卡片配置
                if "cards" in image_config:
                    cards = image_config["cards"]

                    # 文字配置
                    if "text" in cards:
                        text_config = cards["text"]
                        if "font" in text_config:
                            unified_config["font_family"] = text_config["font"]
                        if "size" in text_config:
                            unified_config["font_size_content"] = text_config["size"]
                        if "color" in text_config:
                            unified_config["primary_color"] = text_config["color"]
                        if "align" in text_config:
                            unified_config["text_align"] = text_config["align"]
                        if "lineSpacing" in text_config:
                            unified_config["line_spacing"] = text_config["lineSpacing"]
                        if "maxLines" in text_config:
                            unified_config["max_lines"] = text_config["maxLines"]

                    # Logo 配置
                    if "logo" in cards:
                        logo_config = cards["logo"]
                        unified_config["logo_enabled"] = logo_config.get("enabled", False)
                        unified_config["logo_size"] = logo_config.get("size", 80)
                        unified_config["logo_position"] = logo_config.get("position", "top-right")
                        unified_config["logo_opacity"] = logo_config.get("opacity", 0.8)

                    # 時間戳配置
                    if "timestamp" in cards:
                        ts_config = cards["timestamp"]
                        unified_config["timestamp_enabled"] = ts_config.get("enabled", False)
                        unified_config["timestamp_position"] = ts_config.get("position", "bottom-right")
                        unified_config["timestamp_size"] = ts_config.get("size", 18)
                        unified_config["timestamp_color"] = ts_config.get("color", "#666666")

                    # 貼文ID配置
                    if "postId" in cards:
                        pid_config = cards["postId"]
                        unified_config["post_id_enabled"] = pid_config.get("enabled", False)
                        unified_config["post_id_position"] = pid_config.get("position", "top-left")
                        unified_config["post_id_size"] = pid_config.get("size", 20)
                        unified_config["post_id_color"] = pid_config.get("color", "#0066cc")
                        unified_config["post_id_text"] = pid_config.get("text", "")

        # **重要修復**: 處理新的 TemplateConfig 平面字段
        # 這些字段會覆蓋上面的嵌套配置，確保新模板系統優先

        # 貼文ID設定 (新的平面字段)
        if hasattr(config, 'post_id_enabled'):
            unified_config["post_id_enabled"] = getattr(config, 'post_id_enabled', False)
        if hasattr(config, 'post_id_format'):
            unified_config["post_id_format"] = getattr(config, 'post_id_format', '#{ID}')
        if hasattr(config, 'post_id_position'):
            unified_config["post_id_position"] = getattr(config, 'post_id_position', 'bottom-right')
        if hasattr(config, 'post_id_size'):
            unified_config["post_id_size"] = getattr(config, 'post_id_size', 12)
        if hasattr(config, 'post_id_color'):
            unified_config["post_id_color"] = getattr(config, 'post_id_color', '#666666')
        if hasattr(config, 'post_id_font'):
            unified_config["post_id_font"] = getattr(config, 'post_id_font', 'Noto Sans TC')

        # 時間戳設定 (新的平面字段)
        if hasattr(config, 'timestamp_enabled'):
            unified_config["timestamp_enabled"] = getattr(config, 'timestamp_enabled', False)
        if hasattr(config, 'timestamp_format'):
            unified_config["timestamp_format"] = getattr(config, 'timestamp_format', 'relative')
        if hasattr(config, 'timestamp_position'):
            unified_config["timestamp_position"] = getattr(config, 'timestamp_position', 'bottom-left')
        if hasattr(config, 'timestamp_size'):
            unified_config["timestamp_size"] = getattr(config, 'timestamp_size', 12)
        if hasattr(config, 'timestamp_color'):
            unified_config["timestamp_color"] = getattr(config, 'timestamp_color', '#666666')
        if hasattr(config, 'timestamp_font'):
            unified_config["timestamp_font"] = getattr(config, 'timestamp_font', 'Noto Sans TC')

        print(f"[DEBUG] _convert_to_unified_config 最終結果:")
        print(f"[DEBUG] post_id_enabled: {unified_config.get('post_id_enabled')}")
        print(f"[DEBUG] post_id_format: {unified_config.get('post_id_format')}")
        print(f"[DEBUG] post_id_position: {unified_config.get('post_id_position')}")
        print(f"[DEBUG] post_id_size: {unified_config.get('post_id_size')}")

        return unified_config
    
    def _get_modern_theme(self, config: TemplateConfig) -> str:
        """現代風格主題 CSS"""
        return f"""
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            width: {config.width}px;
            height: {config.height}px;
            font-family: '{config.font_family}', sans-serif;
            background: {config.background_color};
            color: {config.text_color};
            overflow: hidden;
        }}
        
        .ig-container {{
            width: 100%;
            height: 100%;
            position: relative;
            padding: {config.padding}px;
            display: flex;
            flex-direction: column;
        }}
        
        .logo {{
            position: absolute;
            top: {config.padding}px;
            right: {config.padding}px;
            width: {config.logo_size}px;
            height: {config.logo_size}px;
            border-radius: {'50%' if config.logo_shape == 'circle' else '8px' if config.logo_shape == 'rounded' else '0'};
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        
        .logo img {{
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: inherit;
        }}
        
        .content {{
            font-size: {config.font_size}px;
            line-height: {config.line_height};
            text-align: {config.text_align};
            flex: 1;
            display: flex;
            align-items: center;
            word-wrap: break-word;
            overflow: hidden;
        }}
        
        .metadata {{
            font-size: {int(config.font_size * 0.6)}px;
            color: #666;
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        
        .author {{
            font-weight: 500;
        }}
        
        .timestamp {{
            opacity: 0.8;
        }}
        """
    
    def _get_minimal_theme(self, config: TemplateConfig) -> str:
        """極簡風格主題 CSS"""
        return f"""
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            width: {config.width}px;
            height: {config.height}px;
            font-family: '{config.font_family}', sans-serif;
            background: {config.background_color};
            color: {config.text_color};
            overflow: hidden;
        }}
        
        .ig-container {{
            width: 100%;
            height: 100%;
            position: relative;
            padding: {config.padding}px;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }}
        
        .logo {{
            position: absolute;
            top: {config.padding}px;
            right: {config.padding}px;
            width: {int(config.logo_size * 0.8)}px;
            height: {int(config.logo_size * 0.8)}px;
            border-radius: {'50%' if config.logo_shape == 'circle' else '4px' if config.logo_shape == 'rounded' else '0'};
            overflow: hidden;
            opacity: 0.9;
        }}
        
        .logo img {{
            width: 100%;
            height: 100%;
            object-fit: cover;
        }}
        
        .content {{
            font-size: {config.font_size}px;
            line-height: {config.line_height};
            text-align: center;
            font-weight: 300;
            max-width: 80%;
            margin: 0 auto;
        }}
        
        .metadata {{
            position: absolute;
            bottom: {config.padding}px;
            left: {config.padding}px;
            right: {config.padding}px;
            font-size: {int(config.font_size * 0.5)}px;
            color: #999;
            text-align: center;
        }}
        """
    
    def _get_card_theme(self, config: TemplateConfig) -> str:
        """卡片風格主題 CSS"""
        return f"""
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            width: {config.width}px;
            height: {config.height}px;
            font-family: '{config.font_family}', sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            color: {config.text_color};
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        
        .ig-container {{
            width: calc(100% - {config.padding * 2}px);
            height: calc(100% - {config.padding * 2}px);
            background: {config.background_color};
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            position: relative;
            padding: {config.padding}px;
            display: flex;
            flex-direction: column;
        }}
        
        .logo {{
            position: absolute;
            top: {config.padding}px;
            right: {config.padding}px;
            width: {config.logo_size}px;
            height: {config.logo_size}px;
            border-radius: 50%;
            overflow: hidden;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            border: 3px solid #fff;
        }}
        
        .logo img {{
            width: 100%;
            height: 100%;
            object-fit: cover;
        }}
        
        .content {{
            font-size: {config.font_size}px;
            line-height: {config.line_height};
            text-align: {config.text_align};
            flex: 1;
            display: flex;
            align-items: center;
            margin-top: {config.logo_size + 20}px;
        }}
        
        .metadata {{
            font-size: {int(config.font_size * 0.6)}px;
            color: #888;
            padding-top: 20px;
            border-top: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        """
    
    def _generate_logo_html(self, logo_url: str, config: TemplateConfig) -> str:
        """生成 Logo HTML"""
        if not logo_url:
            return ""
        
        return f"""
        <div class="logo">
            <img src="{logo_url}" alt="Logo" 
                 onerror="this.parentElement.style.display='none';"
                 onload="this.parentElement.style.display='flex';" />
        </div>
        """
    
    def _generate_content_html(self, content: ContentData, config: TemplateConfig) -> str:
        """生成內容 HTML"""
        text = content.content or content.title or "預覽內容"
        
        # 處理長文本截斷
        lines = text.split('\n')
        if len(lines) > config.max_lines:
            lines = lines[:config.max_lines]
            lines[-1] = lines[-1][:50] + "..." if len(lines[-1]) > 50 else lines[-1]
        
        formatted_text = '<br>'.join(lines)
        
        return f"""
        <div class="content">
            <div>{formatted_text}</div>
        </div>
        """
    
    def _generate_metadata_html(self, content: ContentData, config: TemplateConfig) -> str:
        """生成元數據 HTML"""
        if not (config.show_author or config.show_timestamp or config.show_school):
            return ""
        
        metadata_parts = []
        
        if config.show_author and content.author:
            metadata_parts.append(f'<span class="author">{content.author}</span>')
        
        if config.show_school and content.school_name:
            metadata_parts.append(f'<span class="school">{content.school_name}</span>')
        
        if config.show_timestamp and content.created_at:
            timestamp = content.created_at.strftime("%m月%d日 %H:%M")
            metadata_parts.append(f'<span class="timestamp">{timestamp}</span>')
        
        if not metadata_parts:
            return ""
        
        return f"""
        <div class="metadata">
            <div>{metadata_parts[0] if metadata_parts else ""}</div>
            <div>{" · ".join(metadata_parts[1:]) if len(metadata_parts) > 1 else ""}</div>
        </div>
        """


class IGUnifiedSystem:
    """IG 統一整合系統主類"""
    
    def __init__(self):
        self.template_engine = IGTemplateEngine()
        self.api_service = InstagramAPIService()
    
    def get_template_config(self, template_id: int) -> TemplateConfig:
        """獲取模板配置"""
        try:
            with get_session() as db:
                template = db.query(ContentTemplate).filter(ContentTemplate.id == template_id).first()

                if not template:
                    raise IGSystemError(f"模板 {template_id} 不存在", "TEMPLATE_NOT_FOUND")

                # 從模板配置轉換為新格式
                template_data = template.config or {}

                # 轉換邏輯：支持舊有的 JSON 結構
                config_dict = self._convert_legacy_template_data(template_data)

                return TemplateConfig.from_dict(config_dict)
                
        except Exception as e:
            if isinstance(e, IGSystemError):
                raise
            raise IGSystemError(f"獲取模板配置失敗: {str(e)}", "GET_TEMPLATE_ERROR")
    
    def get_content_data(self, forum_post_id: int, custom_caption: str = None, 
                        hashtags: List[str] = None) -> ContentData:
        """獲取內容數據"""
        try:
            with get_session() as db:
                forum_post = db.query(ForumPost).filter(ForumPost.id == forum_post_id).first()
                
                if not forum_post:
                    raise IGSystemError(f"論壇貼文 {forum_post_id} 不存在", "FORUM_POST_NOT_FOUND")
                
                # 獲取學校名稱
                school_name = ""
                if hasattr(forum_post, 'school') and forum_post.school:
                    school_name = forum_post.school.name
                elif hasattr(forum_post, 'school_name'):
                    school_name = forum_post.school_name or ""
                
                return ContentData(
                    title=getattr(forum_post, 'title', '') or '',
                    content=forum_post.content or '',
                    author=getattr(forum_post, 'author_name', '') or 
                           (forum_post.author.username if hasattr(forum_post, 'author') and forum_post.author else ''),
                    school_name=school_name,
                    created_at=forum_post.created_at,
                    custom_caption=custom_caption or '',
                    hashtags=hashtags or []
                )
                
        except Exception as e:
            if isinstance(e, IGSystemError):
                raise
            raise IGSystemError(f"獲取內容數據失敗: {str(e)}", "GET_CONTENT_ERROR")
    
    def get_logo_url(self, account_id: int, template_config: TemplateConfig = None) -> str:
        """獲取 Logo URL - 使用新的 Logo 處理系統"""
        try:
            from services.logo_handler import get_logo_handler

            with get_session() as db:
                account = db.query(SocialAccount).filter(SocialAccount.id == account_id).first()

                if not account:
                    return ""
                
                logo_handler = get_logo_handler()
                
                # 1. 優先使用模板中的 Logo
                if template_config and hasattr(template_config, 'logo_url') and template_config.logo_url:
                    return template_config.logo_url
                
                # 2. 嘗試使用 IG 帳號專用 Logo
                ig_logo_path = f"public/instagram/accounts/{account_id}/logo.webp"
                logo_url = logo_handler.get_logo_url(ig_logo_path)
                if logo_url:
                    return logo_url
                
                # 3. 使用學校 Logo（新格式）
                if account.school_id:
                    school_logo_path = f"public/schools/{account.school_id}/logo.webp"
                    logo_url = logo_handler.get_logo_url(school_logo_path)
                    if logo_url:
                        return logo_url
                    
                    # 4. 回退到數據庫中的 SchoolLogo（兼容舊系統）
                    school_logo = db.query(SchoolLogo).filter(
                        SchoolLogo.school_id == account.school_id,
                        SchoolLogo.is_active == True,
                        SchoolLogo.logo_type == 'primary'
                    ).first()
                    
                    if school_logo and school_logo.logo_url:
                        # 如果是相對路徑，使用 logo_handler 處理
                        if not school_logo.logo_url.startswith(('http://', 'https://')):
                            return logo_handler.get_logo_url(school_logo.logo_url) or school_logo.logo_url
                        return school_logo.logo_url
                
                return ""
                
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"獲取 Logo URL 失敗 [account_id={account_id}]: {e}")
            return ""
    
    def preview_post(self, account_id: int, template_id: int, forum_post_id: int = None, 
                    content: str = None, custom_caption: str = None, 
                    hashtags: List[str] = None) -> RenderResult:
        """預覽貼文"""
        try:
            # 獲取模板配置
            template_config = self.get_template_config(template_id)
            
            # 獲取內容數據
            if forum_post_id:
                content_data = self.get_content_data(forum_post_id, custom_caption, hashtags)
            else:
                # 使用預設測試內容
                content_data = ContentData(
                    title="預覽標題",
                    content=content or "這是預覽內容，用於測試模板效果。",
                    author="預覽作者",
                    school_name="預覽學校",
                    created_at=datetime.now(timezone.utc),
                    custom_caption=custom_caption or "",
                    hashtags=hashtags or []
                )
            
            # 獲取 Logo URL
            logo_url = self.get_logo_url(account_id, template_config)
            
            # 渲染圖片，傳遞原始模板數據以獲取獨立的時間戳和貼文ID設定
            with get_session() as db:
                template = db.query(ContentTemplate).filter(ContentTemplate.id == template_id).first()
                instagram_template_data = template.config if template else {}

            result = self.template_engine.render_to_image(template_config, content_data, logo_url, instagram_template_data)
            
            return result
            
        except Exception as e:
            if isinstance(e, IGSystemError):
                raise
            raise IGSystemError(f"預覽貼文失敗: {str(e)}", "PREVIEW_ERROR")
    
    def publish_post(self, social_post_id: int) -> Dict[str, Any]:
        """發布貼文到 Instagram"""
        try:
            with get_session() as db:
                social_post = db.query(SocialPost).filter(SocialPost.id == social_post_id).first()

                if not social_post:
                    raise IGSystemError(f"社交貼文 {social_post_id} 不存在", "SOCIAL_POST_NOT_FOUND")
                
                # 獲取相關資源
                account = social_post.account
                template = social_post.template

                if not account or account.status != 'active':
                    raise IGSystemError("Instagram 帳號不可用", "ACCOUNT_UNAVAILABLE")

                # 獲取內容數據（無論是否已生成圖片都需要）
                content_data = self.get_content_data(
                    social_post.forum_post_id,
                    getattr(social_post, 'custom_caption', ''),
                    getattr(social_post, 'hashtags', [])
                )

                # 生成圖片（如果還沒生成）
                if not social_post.generated_image_url:
                    template_config = self.get_template_config(template.id)
                    logo_url = self.get_logo_url(account.id, template_config)

                    # 獲取原始模板數據以支持獨立的時間戳和貼文ID設定
                    instagram_template_data = template.config if template.config else {}

                    render_result = self.template_engine.render_to_image(
                        template_config, content_data, logo_url, instagram_template_data
                    )

                    if not render_result.success:
                        raise IGSystemError(f"圖片生成失敗: {render_result.error_message}",
                                          "IMAGE_GENERATION_ERROR")

                    # 更新圖片 URL
                    social_post.generated_image_url = render_result.image_url
                    db.commit()

                # 準備發布內容
                caption = self._prepare_caption(social_post, content_data)
                
                # 發布到 Instagram - 使用 Page ID 和 Token 動態解析 IG User ID
                page_id = account.page_id or account.platform_user_id  # 優先使用 page_id，回退到 platform_user_id
                page_token = account.long_lived_access_token or account.access_token

                if not page_id or not page_token:
                    raise IGSystemError("帳號缺少 Instagram 配置 (page_id 或 token)", "MISSING_IG_CONFIG")

                # 動態解析 Instagram Business Account ID
                try:
                    ig_user_id = self.api_service.resolve_ig_user_id(page_id, page_token)
                except Exception as e:
                    raise IGSystemError(f"無法解析 Instagram Business Account ID: {str(e)}", "IG_USER_ID_RESOLVE_ERROR")

                result = self.api_service.publish_post(
                    ig_user_id,
                    page_token,
                    social_post.generated_image_url,
                    caption
                )

                # 更新發布狀態
                if result.get('success'):
                    social_post.status = PostStatus.published
                    if hasattr(social_post, 'published_at'):
                        social_post.published_at = datetime.now(timezone.utc)
                    if hasattr(social_post, 'error_message'):
                        social_post.error_message = None

                    # 更新模板使用次數（如果模板有該欄位）
                    if hasattr(template, 'usage_count'):
                        template.usage_count += 1

                else:
                    social_post.status = PostStatus.failed
                    if hasattr(social_post, 'error_message'):
                        social_post.error_message = result.get('error', '發布失敗')

                db.commit()

                return {
                    "success": result.get('success', False),
                    "social_post_id": social_post.id,
                    "media_id": result.get('media_id'),
                    "post_url": result.get('post_url'),
                    "error_message": result.get('error')
                }
                
        except Exception as e:
            if isinstance(e, IGSystemError):
                raise
            raise IGSystemError(f"發布貼文失敗: {str(e)}", "PUBLISH_ERROR")
    
    def _convert_legacy_template_data(self, template_data: Dict) -> Dict:
        """轉換舊版和新版模板數據格式為標準格式"""
        if not template_data:
            return {}

        # 如果已經是新格式（直接包含 TemplateConfig 欄位），則直接返回
        if any(key in template_data for key in ['background_color', 'font_family', 'text_color']):
            return template_data

        # 轉換舊版嵌套格式
        config = {}

        # 背景設定
        if 'background' in template_data:
            bg = template_data['background']
            if isinstance(bg, dict) and 'color' in bg:
                config['background_color'] = bg['color']

        # Canvas 設定（新版前端格式）
        if 'canvas' in template_data:
            canvas = template_data['canvas']
            if isinstance(canvas, dict):
                if 'background' in canvas:
                    config['background_color'] = canvas['background']
                if 'width' in canvas:
                    config['width'] = canvas['width']
                if 'height' in canvas:
                    config['height'] = canvas['height']

        # Post 設定（新版前端格式）
        if 'post' in template_data:
            post = template_data['post']
            if isinstance(post, dict):
                # 文字設定
                if 'text' in post:
                    text = post['text']
                    if isinstance(text, dict):
                        config['font_family'] = text.get('font', 'Noto Sans TC')
                        config['font_size'] = text.get('size', 28)
                        config['text_color'] = text.get('color', '#333333')
                        config['text_align'] = text.get('align', 'center')

                # Logo 設定
                if 'logo' in post:
                    logo = post['logo']
                    if isinstance(logo, dict):
                        config['logo_enabled'] = logo.get('enabled', True)
                        config['logo_size'] = logo.get('size', 80)

                # 文字排版設定
                if 'textLayout' in post:
                    text_layout = post['textLayout']
                    if isinstance(text_layout, dict):
                        # 預設使用 textOnly 的設定，如果是有圖片的貼文會動態調整
                        if 'textOnly' in text_layout:
                            text_only = text_layout['textOnly']
                            if isinstance(text_only, dict):
                                config['max_lines'] = text_only.get('maxLines', 8)
                                config['max_chars_per_line'] = text_only.get('maxCharsPerLine', 24)

                        # 同時保存 withPhoto 的設定以備後用
                        if 'withPhoto' in text_layout:
                            with_photo = text_layout['withPhoto']
                            if isinstance(with_photo, dict):
                                config['max_lines_with_photo'] = with_photo.get('maxLines', 6)
                                config['max_chars_per_line_with_photo'] = with_photo.get('maxCharsPerLine', 24)
                                config['stacked_layout'] = with_photo.get('stacked', True)

        # 內容設定（舊版格式）
        if 'content_block' in template_data:
            content = template_data['content_block']
            if isinstance(content, dict):
                config['font_size'] = content.get('font_size', 28)
                config['text_color'] = content.get('color', '#333333')
                config['text_align'] = content.get('align', 'left')
                config['max_lines'] = content.get('max_lines', 12)
                config['font_family'] = content.get('font_family', 'Noto Sans TC')

        # Logo 設定（舊版格式）
        if 'logo' in template_data:
            logo = template_data['logo']
            if isinstance(logo, dict):
                config['logo_enabled'] = logo.get('enabled', True)
                config['logo_size'] = logo.get('size', 80)
                config['logo_shape'] = logo.get('shape', 'circle')

        # 時間戳設定
        if 'timestamp' in template_data:
            ts = template_data['timestamp']
            if isinstance(ts, dict):
                config['show_timestamp'] = ts.get('enabled', True)
                config['timestamp_font_size'] = ts.get('font_size', 16)
                config['timestamp_color'] = ts.get('color', '#666666')
                config['timestamp_font_family'] = ts.get('font_family', 'Noto Sans TC')

        # 貼文ID設定
        if 'post_id' in template_data:
            pid = template_data['post_id']
            if isinstance(pid, dict):
                config['show_post_id'] = pid.get('enabled', True)
                config['post_id_font_size'] = pid.get('font_size', 14)
                config['post_id_color'] = pid.get('color', '#999999')
                config['post_id_font_family'] = pid.get('font_family', 'Noto Sans TC')

        # 添加預設值以確保配置完整
        defaults = {
            'width': 1080,
            'height': 1080,
            'background_color': '#FFFFFF',
            'font_family': 'Noto Sans TC',
            'font_size': 28,
            'text_color': '#333333',
            'padding': 20,
            'text_align': 'center',
            'line_height': 1.5,
            'max_lines': 12,
            'max_chars_per_line': 24,
            'max_lines_with_photo': 6,
            'max_chars_per_line_with_photo': 24,
            'stacked_layout': True
        }

        for key, default_value in defaults.items():
            if key not in config:
                config[key] = default_value

        # 檢查必要配置項，現在所有項目都應該有值
        required_keys = ['width', 'height', 'background_color', 'font_family', 'font_size', 'text_color', 'padding']
        missing_keys = [key for key in required_keys if key not in config]
        if missing_keys:
            raise ValueError(f"模板配置仍然缺少必要項目: {missing_keys}。")

        return config
    
    def _prepare_caption(self, social_post: SocialPost, content_data: ContentData) -> str:
        """準備 Instagram 文案 - 使用新的 caption 模板結構"""
        try:
            # 獲取模板配置
            template = social_post.template
            if not template or not template.config:
                raise IGSystemError("貼文缺少必要的模板配置", "MISSING_TEMPLATE")

            caption_config = template.config.get('caption', {})
            if not caption_config or not caption_config.get('enabled', False):
                raise IGSystemError("模板未啟用文案生成功能", "CAPTION_DISABLED")

            # 使用新的模板結構生成文案
            return self._generate_caption_from_template(
                caption_config,
                social_post,
                content_data,
                [social_post]  # 單一貼文作為輪播列表
            )

        except IGSystemError:
            # 重新拋出 IGSystemError
            raise
        except Exception as e:
            logger.error(f"文案生成失敗: {e}")
            raise IGSystemError(f"文案生成失敗: {str(e)}", "CAPTION_GENERATION_FAILED")


    def _generate_caption_from_template(self, caption_config: dict, social_post: SocialPost, content_data: ContentData, posts_list: list) -> str:
        """使用新的 caption 模板生成文案"""
        caption_parts = []

        # 處理開頭區段
        single_config = caption_config.get('single', {})
        header_config = single_config.get('header', {})
        if header_config.get('enabled', False) and header_config.get('content'):
            header_text = self._replace_template_variables(
                header_config['content'],
                content_data,
                social_post,
                is_footer=False
            )
            caption_parts.append(header_text)

        # 處理重複區段（每個貼文）
        repeating_config = caption_config.get('repeating', {})
        for post in posts_list:
            post_content_data = content_data  # 目前只有一個貼文

            post_parts = []

            # ID 格式
            id_format_config = repeating_config.get('idFormat', {})
            if id_format_config.get('enabled', False) and id_format_config.get('format'):
                id_text = self._replace_template_variables(
                    id_format_config['format'],
                    post_content_data,
                    post,
                    is_footer=False
                )
                post_parts.append(id_text)

            # 貼文內容
            content_config = repeating_config.get('content', {})
            if content_config.get('enabled', False) and content_config.get('template'):
                content_text = self._replace_template_variables(
                    content_config['template'],
                    post_content_data,
                    post,
                    is_footer=False
                )
                post_parts.append(content_text)

            # 分隔線
            separator_config = repeating_config.get('separator', {})
            if separator_config.get('enabled', False) and separator_config.get('style'):
                post_parts.append(separator_config['style'])

            if post_parts:
                caption_parts.append('\n'.join(post_parts))

        # 處理結尾區段
        footer_config = single_config.get('footer', {})
        if footer_config.get('enabled', False) and footer_config.get('content'):
            footer_text = self._replace_template_variables(
                footer_config['content'],
                content_data,
                social_post,
                is_footer=True
            )
            caption_parts.append(footer_text)

        # 處理 hashtags
        hashtags_config = caption_config.get('hashtags', {})
        if hashtags_config.get('enabled', False) and hashtags_config.get('tags'):
            tags = hashtags_config['tags'][:hashtags_config.get('maxTags', 5)]
            hashtag_text = ' '.join([f'#{tag}' for tag in tags if tag.strip()])
            if hashtag_text:
                caption_parts.append(hashtag_text)

        return '\n\n'.join(caption_parts)

    def _replace_template_variables(self, template: str, content_data: ContentData, social_post: SocialPost, is_footer: bool = False) -> str:
        """替換模板變數
        注意: 已移除 {link} 參數支援，因為 Instagram 不支援在說明文字放連結
        """
        result = template

        # 基本變數替換
        variables = {
            'id': str(getattr(social_post, 'forum_post_id', '') or getattr(social_post, 'id', '')),
            'content': content_data.content or '',
            'author': content_data.author or '',
            'reply_to_author': getattr(content_data, 'reply_to_author', '') or '',
            'reply_to_content': getattr(content_data, 'reply_to_content', '') or '',
        }

        # 執行變數替換
        for key, value in variables.items():
            result = result.replace(f'{{{key}}}', str(value))

        return result


# 導出主要類
__all__ = ['IGUnifiedSystem', 'IGTemplateEngine', 'TemplateConfig', 'ContentData', 'RenderResult', 'IGSystemError']