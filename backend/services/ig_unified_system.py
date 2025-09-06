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
from models.instagram import IGAccount, IGTemplate, IGPost, SchoolLogo, PostStatus
from models.base import Post as ForumPost
from services.instagram_api_service import InstagramAPIService, InstagramAPIError


class IGSystemError(Exception):
    """IG 系統錯誤基類"""
    def __init__(self, message: str, error_code: str = None, details: Dict = None):
        self.message = message
        self.error_code = error_code or "UNKNOWN_ERROR"
        self.details = details or {}
        super().__init__(self.message)


@dataclass
class TemplateConfig:
    """統一的模板配置結構"""
    # 基本設定
    width: int = 1080
    height: int = 1080
    background_color: str = "#ffffff"
    
    # 內容設定
    font_family: str = "Noto Sans TC"
    font_size: int = 28
    text_color: str = "#333333"
    text_align: str = "left"
    line_height: float = 1.5
    max_lines: int = 12
    padding: int = 60
    
    # Logo 設定
    logo_enabled: bool = True
    logo_size: int = 80
    logo_position: str = "top-right"  # top-right, top-left, bottom-right, bottom-left
    logo_shape: str = "circle"  # circle, square, rounded
    
    # 元數據設定
    show_author: bool = True
    show_timestamp: bool = True
    show_school: bool = True
    
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
                       logo_url: str = None) -> RenderResult:
        """渲染內容為圖片"""
        try:
            # 先生成 HTML
            html = self.render_to_html(config, content, logo_url)
            
            # 使用 Playwright 渲染圖片
            from services.html_renderer import HtmlRenderer
            
            renderer = HtmlRenderer(
                viewport_width=config.width,
                viewport_height=config.height
            )
            
            # 渲染為 JPEG
            image_buffer = renderer.render_html_to_image(
                html, 
                width=config.width, 
                height=config.height,
                image_type='jpeg', 
                quality=92
            )
            
            # 保存圖片
            timestamp = int(time.time() * 1000)
            filename = f"ig_post_{timestamp}.jpg"
            
            # 創建輸出目錄
            output_dir = Path(self.upload_root) / 'public' / 'instagram'
            output_dir.mkdir(parents=True, exist_ok=True)
            
            image_path = output_dir / filename
            with open(image_path, 'wb') as f:
                f.write(image_buffer.getvalue())
            
            # 生成公開 URL
            if self.cdn_base_url:
                image_url = f"{self.cdn_base_url}/instagram/{filename}"
            elif self.public_base_url:
                image_url = f"{self.public_base_url}/uploads/public/instagram/{filename}"
            else:
                image_url = f"/uploads/public/instagram/{filename}"
            
            file_size = image_path.stat().st_size
            
            return RenderResult(
                success=True,
                html_content=html,
                image_url=image_url,
                image_path=str(image_path),
                width=config.width,
                height=config.height,
                file_size=file_size
            )
            
        except Exception as e:
            return RenderResult(
                success=False,
                error_message=str(e),
                error_code="RENDER_IMAGE_ERROR"
            )
    
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
                template = db.query(IGTemplate).filter(IGTemplate.id == template_id).first()
                
                if not template:
                    raise IGSystemError(f"模板 {template_id} 不存在", "TEMPLATE_NOT_FOUND")
                
                # 從舊格式轉換為新格式
                template_data = template.template_data or {}
                
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
                account = db.query(IGAccount).filter(IGAccount.id == account_id).first()
                
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
            
            # 渲染圖片
            result = self.template_engine.render_to_image(template_config, content_data, logo_url)
            
            return result
            
        except Exception as e:
            if isinstance(e, IGSystemError):
                raise
            raise IGSystemError(f"預覽貼文失敗: {str(e)}", "PREVIEW_ERROR")
    
    def publish_post(self, ig_post_id: int) -> Dict[str, Any]:
        """發布貼文到 Instagram"""
        try:
            with get_session() as db:
                ig_post = db.query(IGPost).filter(IGPost.id == ig_post_id).first()
                
                if not ig_post:
                    raise IGSystemError(f"IG 貼文 {ig_post_id} 不存在", "IG_POST_NOT_FOUND")
                
                # 獲取相關資源
                account = ig_post.account
                template = ig_post.template
                
                if not account or account.status != 'active':
                    raise IGSystemError("Instagram 帳號不可用", "ACCOUNT_UNAVAILABLE")
                
                # 生成圖片（如果還沒生成）
                if not ig_post.generated_image:
                    template_config = self.get_template_config(template.id)
                    content_data = self.get_content_data(
                        ig_post.forum_post_id,
                        ig_post.custom_caption,
                        ig_post.hashtags
                    )
                    logo_url = self.get_logo_url(account.id, template_config)
                    
                    render_result = self.template_engine.render_to_image(
                        template_config, content_data, logo_url
                    )
                    
                    if not render_result.success:
                        raise IGSystemError(f"圖片生成失敗: {render_result.error_message}", 
                                          "IMAGE_GENERATION_ERROR")
                    
                    # 更新圖片 URL
                    ig_post.generated_image = render_result.image_url
                    db.commit()
                
                # 準備發布內容
                caption = self._prepare_caption(ig_post, content_data)
                
                # 發布到 Instagram
                result = self.api_service.publish_post(
                    account.ig_user_id,
                    account.page_token,
                    ig_post.generated_image,
                    caption
                )
                
                # 更新發布狀態
                if result.get('success'):
                    ig_post.status = PostStatus.published
                    ig_post.ig_media_id = result.get('media_id')
                    ig_post.ig_post_url = result.get('post_url')
                    ig_post.published_at = datetime.now(timezone.utc)
                    ig_post.error_message = None
                    
                    # 更新帳號統計
                    account.total_posts += 1
                    account.last_post_at = ig_post.published_at
                    
                    # 更新模板使用次數
                    template.usage_count += 1
                    
                else:
                    ig_post.status = PostStatus.failed
                    ig_post.error_message = result.get('error', '發布失敗')
                    ig_post.retry_count += 1
                
                db.commit()
                
                return {
                    "success": result.get('success', False),
                    "ig_post_id": ig_post.id,
                    "media_id": result.get('media_id'),
                    "post_url": result.get('post_url'),
                    "error_message": result.get('error')
                }
                
        except Exception as e:
            if isinstance(e, IGSystemError):
                raise
            raise IGSystemError(f"發布貼文失敗: {str(e)}", "PUBLISH_ERROR")
    
    def _convert_legacy_template_data(self, template_data: Dict) -> Dict:
        """轉換舊版模板數據格式為新格式"""
        config = {}
        
        # 背景設定
        if 'background' in template_data:
            bg = template_data['background']
            if isinstance(bg, dict):
                config['background_color'] = bg.get('color', '#ffffff')
        
        # 內容設定
        if 'content_block' in template_data:
            content = template_data['content_block']
            if isinstance(content, dict):
                config['font_size'] = content.get('font_size', 28)
                config['text_color'] = content.get('color', '#333333')
                config['text_align'] = content.get('align', 'left')
                config['max_lines'] = content.get('max_lines', 12)
                config['font_family'] = content.get('font_family', 'Noto Sans TC')
        
        # Logo 設定
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
        
        return config
    
    def _prepare_caption(self, ig_post: IGPost, content_data: ContentData) -> str:
        """準備 Instagram 文案"""
        caption_parts = []
        
        # 使用自訂文案或內容
        if ig_post.custom_caption:
            caption_parts.append(ig_post.custom_caption)
        elif content_data.title:
            caption_parts.append(content_data.title)
        elif content_data.content:
            # 截取前 100 字符作為文案
            short_content = content_data.content[:100]
            if len(content_data.content) > 100:
                short_content += "..."
            caption_parts.append(short_content)
        
        # 添加標籤
        if ig_post.hashtags:
            hashtags = [f"#{tag}" for tag in ig_post.hashtags if tag]
            if hashtags:
                caption_parts.append(" ".join(hashtags))
        
        return "\n\n".join(caption_parts)


# 導出主要類
__all__ = ['IGUnifiedSystem', 'IGTemplateEngine', 'TemplateConfig', 'ContentData', 'RenderResult', 'IGSystemError']