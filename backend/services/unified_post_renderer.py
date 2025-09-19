"""
統一的貼文渲染器 - 確保預覽和生成完全一致
核心原則：ONE SOURCE OF TRUTH - 同一套模板，同一套邏輯，同一個尺寸
"""
from typing import Dict, Optional, Union, Tuple, List
from datetime import datetime
from io import BytesIO
import json
import os
import logging
import html
import re
from pathlib import Path

logger = logging.getLogger(__name__)


class PostRenderer:
    """統一的貼文渲染器"""
    
    # 標準尺寸配置 - 這是唯一的真相來源
    SIZES = {
        "instagram_square": {"width": 1080, "height": 1080},
        "instagram_portrait": {"width": 1080, "height": 1350}, 
        "instagram_story": {"width": 1080, "height": 1920},
        "facebook_post": {"width": 1200, "height": 630},
        "twitter_card": {"width": 1200, "height": 675},
    }
    
    def __init__(self):
        """初始化渲染器"""
        self.default_size = "instagram_square"
        self.default_config = {
            "background_color": "#ffffff",
            "font_family": "Noto Sans TC",
            "primary_color": "#333333",
            "secondary_color": "#666666",
            "accent_color": "#007acc",
            "padding": 60,
            "border_radius": 12,
            "font_size_title": 36,
            "font_size_content": 28,
            "font_size_meta": 18,
            "line_height": 1.5,
        }
    
    def render_html(self, 
                   content: Dict,
                   size: str = "instagram_square",
                   template: str = "modern",
                   config: Optional[Dict] = None,
                   logo_url: Optional[str] = None) -> str:
        """
        渲染 HTML - 這是預覽和生成的共同入口
        
        Args:
            content: 內容字典 {"title": "標題", "text": "內容", "author": "作者"}
            size: 尺寸類型
            template: 模板名稱
            config: 自訂配置
            logo_url: Logo URL
            
        Returns:
            完整的 HTML 字符串
        """
        # 獲取尺寸
        if size not in self.SIZES:
            size = self.default_size
        dimensions = self.SIZES[size]
        
        # 合併配置
        final_config = {**self.default_config, **(config or {})}
        
        # 清理和準備內容
        processed_content = self._process_content(content)
        
        # 生成 HTML
        html_content = self._build_html(
            processed_content, 
            dimensions, 
            template, 
            final_config, 
            logo_url
        )
        
        return html_content
    
    def render_to_image(self,
                       content: Dict,
                       size: str = "instagram_square", 
                       template: str = "modern",
                       config: Optional[Dict] = None,
                       logo_url: Optional[str] = None,
                       quality: int = 95) -> BytesIO:
        """
        渲染為圖片 - 直接使用 Pillow 根據模板設定畫圖（不走 HTML 預覽）。
        若 Pillow 繪製發生異常，回退到 HTML→圖片確保不會整體失敗。
        """
        # 直接使用 Pillow 渲染，完全依照 config 作畫
        safe_config = {**(config or {})}
        if logo_url:
            safe_config['logo_url'] = logo_url
            # 若未顯式指定，預設視為啟用
            if 'logo_enabled' not in safe_config:
                safe_config['logo_enabled'] = True

        try:
            from services.pillow_renderer import PillowRenderer
            renderer = PillowRenderer(
                default_width=self.SIZES.get(size, self.SIZES[self.default_size])["width"],
                default_height=self.SIZES.get(size, self.SIZES[self.default_size])["height"]
            )
            return renderer.render_instagram_post(content=content, config=safe_config, quality=quality)
        except Exception as e:
            logger.error(f"Pillow 渲染失敗，改用 HTML 回退: {e}")
            # 回退：使用 HTML → 圖片（保底）
            html_content = self.render_html(content, size, template, config, logo_url)
            dimensions = self.SIZES[size]
            custom_w = None
            custom_h = None
            try:
                if config and isinstance(config, dict):
                    cw = config.get("width")
                    ch = config.get("height")
                    if isinstance(cw, (int, float)) and isinstance(ch, (int, float)) and cw > 0 and ch > 0:
                        custom_w = int(cw)
                        custom_h = int(ch)
            except Exception:
                pass
            dims = {"width": custom_w or dimensions["width"], "height": custom_h or dimensions["height"]}
            return self._html_to_image(html_content, dims, quality)
    
    def get_preview_data(self,
                        content: Dict,
                        size: str = "instagram_square",
                        template: str = "modern", 
                        config: Optional[Dict] = None,
                        logo_url: Optional[str] = None) -> Dict:
        """
        獲取預覽數據 - 包含 HTML 和元信息
        """
        html_content = self.render_html(content, size, template, config, logo_url)
        dimensions = self.SIZES[size]
        
        return {
            "html": html_content,
            "width": dimensions["width"],
            "height": dimensions["height"],
            "aspect_ratio": dimensions["width"] / dimensions["height"],
            "size_name": size,
            "template": template,
            "processed_content": self._process_content(content),
            "config": {**self.default_config, **(config or {})}
        }
    
    def _process_content(self, content: Dict) -> Dict:
        """處理和清理內容"""
        processed = {}
        
        # 標題
        processed["title"] = self._clean_text(content.get("title", ""))
        
        # 內容文字
        processed["text"] = self._clean_text(content.get("text", ""))
        
        # 作者
        processed["author"] = self._clean_text(content.get("author", ""))
        
        # 時間
        created_at = content.get("created_at", datetime.now())
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except:
                created_at = datetime.now()
        processed["time"] = created_at.strftime("%m月%d日 %H:%M")
        processed["date"] = created_at.strftime("%Y年%m月%d日")
        
        # 其他元數據
        processed["id"] = content.get("id", "")
        processed["school"] = self._clean_text(content.get("school_name", ""))
        
        return processed
    
    def _clean_text(self, text: str) -> str:
        """清理文字"""
        if not text:
            return ""
        
        # 移除 HTML 標籤
        text = re.sub(r'<[^>]+>', '', str(text))
        
        # 移除多餘空白
        text = re.sub(r'\s+', ' ', text).strip()
        
        # 限制長度
        if len(text) > 600:
            text = text[:597] + "..."
        
        # HTML 轉義
        return html.escape(text)
    
    def _build_html(self, 
                   processed_content: Dict,
                   dimensions: Dict,
                   template: str,
                   config: Dict,
                   logo_url: Optional[str]) -> str:
        """建立 HTML"""
        
        width = dimensions["width"]
        height = dimensions["height"]
        
        # Google Fonts
        fonts_link = self._get_google_fonts_link(config["font_family"])
        
        # Logo HTML - 加入錯誤處理和載入狀態
        logo_html = ""
        if logo_url:
            # 處理相對路徑 URL
            processed_logo_url = self._process_logo_url(logo_url)
            logo_html = f"""
            <div class="logo">
                <img src="{processed_logo_url}" alt="Logo" 
                     onerror="this.parentElement.classList.add('loading'); this.style.display='none';"
                     onload="this.parentElement.classList.remove('loading');" />
            </div>"""
        
        # 根據模板選擇布局
        if template == "minimal":
            content_html = self._build_minimal_template(processed_content, config)
        elif template == "card":
            content_html = self._build_card_template(processed_content, config)
        else:  # modern (default)
            content_html = self._build_modern_template(processed_content, config)
        
        # 完整 HTML
        html_template = f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    {fonts_link}
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            width: {config.get("width", width)}px;
            height: {config.get("height", height)}px;
            font-family: '{config["font_family"]}', 'Noto Sans TC', sans-serif;
            background: {config["background_color"]};
            color: {config["primary_color"]};
            overflow: hidden;
            position: relative;
            font-size: {config.get("font_size_content", 28)}px;
            line-height: {config.get("line_height", 1.5)};
        }}
        
        .container {{
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
        }}
        
        .logo {{
            position: absolute;
            {self._get_logo_position_styles(config)}
            width: {config.get("logo_size", 60)}px;
            height: {config.get("logo_size", 60)}px;
            border-radius: 50%;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: {config.get("logo_opacity", 0.85)};
        }}
        
        .logo img {{
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
            display: block;
        }}
        
        /* Logo 載入狀態 */
        .logo img[src=""] {{
            display: none;
        }}
        
        .logo.loading::before {{
            content: "📷";
            font-size: 20px;
            color: #ccc;
        }}
        
        .content-wrapper {{
            position: absolute;
            max-width: calc(100% - {config.get("padding", 60) * 2}px);
            word-wrap: break-word;
            z-index: 1;
        }}

        .title {{
            font-size: {config.get("font_size_title", config.get("font_size_content", 28))}px;
            font-weight: 700;
            line-height: 1.2;
            margin-bottom: 10px;
            color: {config["primary_color"]};
        }}

        .content {{
            font-size: {config.get("font_size_content", 28)}px;
            line-height: {config.get("line_height", 1.5)};
            color: {config["primary_color"]};
        }}

        .meta {{
            position: absolute;
            font-size: {config.get("metadata_size", config.get("font_size_meta", 12))}px;
            color: {config.get("metadata_color", config.get("secondary_color", "#666666"))};
            z-index: 2;
        }}
        
        .author {{
            font-weight: 500;
        }}
        
        .time {{
            opacity: 0.8;
        }}
        
        /* 模板特定樣式 */
        .modern-gradient {{
            background: linear-gradient(135deg, {config["background_color"]} 0%, #f8f9fa 100%);
        }}
        
        .card-style {{
            background: white;
            border-radius: {config["border_radius"]}px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            margin: {config["padding"]//2}px;
        }}
        
        .minimal-clean {{
            background: {config["background_color"]};
        }}
    </style>
</head>
<body class="{self._get_body_class(template)}">
    <div class="container">
        {logo_html}
        {content_html}
    </div>
</body>
</html>"""
        
        return html_template
    
    def _get_body_class(self, template: str) -> str:
        """獲取 body 的 CSS class"""
        class_map = {
            "modern": "modern-gradient", 
            "card": "card-style",
            "minimal": "minimal-clean"
        }
        return class_map.get(template, "modern-gradient")
    
    def _build_modern_template(self, content: Dict, config: Dict) -> str:
        """現代風格模板 - 完全支援用戶配置的所有參數"""

        # 獲取文字位置和對齊設定
        text_position = config.get('text_position', 'center')
        text_align = config.get('text_align', 'center')
        text_valign = config.get('text_valign', 'middle')

        # 計算實際位置
        position_styles = self._calculate_position_styles(text_position, config)

        # 構建元數據區塊 - 根據配置決定顯示內容
        meta_parts = []

        # 作者 - 檢查是否為匿名貼文
        author = content.get('author', '')
        if author and author.lower() not in ['匿名', 'anonymous', ''] and author.strip():
            meta_parts.append(f'<span class="author">{author}</span>')

        # 時間戳 - 檢查配置是否啟用
        show_timestamp = config.get('show_timestamp', False)
        if show_timestamp and content.get('time'):
            meta_parts.append(f'<span class="time">{content["time"]}</span>')

        # 貼文ID - 檢查配置是否啟用
        show_post_id = config.get('show_post_id', False)
        if show_post_id and content.get('id'):
            post_id_format = config.get('post_id_format', '#{id}')
            formatted_id = post_id_format.replace('{id}', str(content['id']))
            meta_parts.append(f'<span class="post-id">{formatted_id}</span>')

        # 學校名稱
        school = content.get('school', '')
        if school and school.strip():
            meta_parts.append(f'<span class="school">{school}</span>')

        # 構建元數據HTML，根據配置決定位置
        meta_html = ''
        if meta_parts:
            meta_position = self._get_metadata_position_styles(config)
            meta_html = f'<div class="meta" style="{meta_position}">' + ' · '.join(meta_parts) + '</div>'

        # 應用文字位置和對齊設定
        content_styles = f"text-align: {text_align}; {position_styles}"

        return f"""
        <div class="content-wrapper" style="{content_styles}">
            <div class="title">{content.get('title', '') if content.get('title') and content.get('title').strip() else ''}</div>
            <div class="content">{content.get('text', '')}</div>
        </div>
        {meta_html}"""
    
    def _build_card_template(self, content: Dict, config: Dict) -> str:
        """卡片風格模板"""
        return f"""
        <div class="title" style="border-left: 4px solid {config['accent_color']}; padding-left: 16px;">
            {content['title']}
        </div>
        <div class="content">
            <div style="padding: 20px; background: rgba(0,0,0,0.02); border-radius: 8px;">
                {content['text']}
            </div>
        </div>
        <div class="meta">
            <span class="author" style="color: {config['accent_color']};">{content['author']}</span>
            <span class="time">{content['time']}</span>
        </div>"""
    
    def _build_minimal_template(self, content: Dict, config: Dict) -> str:
        """極簡風格模板"""
        return f"""
        <div class="content" style="text-align: center; justify-content: center;">
            <div>
                <div class="title" style="margin-bottom: 40px;">{content['title']}</div>
                <div style="font-size: {config['font_size_content']}px; margin-bottom: 40px;">
                    {content['text']}
                </div>
                <div class="meta" style="justify-content: center; gap: 20px;">
                    <span class="author">{content['author']}</span>
                    <span style="opacity: 0.5;">•</span>
                    <span class="time">{content['time']}</span>
                </div>
            </div>
        </div>"""
    
    def _get_google_fonts_link(self, font_family: str) -> str:
        """獲取 Google Fonts 連結"""
        font_urls = {
            "Noto Sans TC": "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&display=swap",
            "Noto Serif TC": "https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@300;400;500;700&display=swap",
            "Inter": "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap",
            "Roboto": "https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap",
        }
        
        url = font_urls.get(font_family, font_urls["Noto Sans TC"])
        return f'<link href="{url}" rel="stylesheet">'
    
    def _process_logo_url(self, logo_url: str) -> str:
        """處理 Logo URL - 將相對路徑轉換為完整 URL"""
        if not logo_url:
            return ""
        
        # 如果已經是完整 URL，直接返回
        if logo_url.startswith(('http://', 'https://')):
            return logo_url
        
        # 如果是相對路徑，嘗試轉換為完整 URL
        if logo_url.startswith('/'):
            base_url = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
            if base_url:
                return f"{base_url}{logo_url}"
            else:
                # 如果沒有配置基礎 URL，嘗試使用本地檔案
                # 在實際部署中應該配置 PUBLIC_BASE_URL
                local_file_path = logo_url.lstrip('/')
                if os.path.exists(local_file_path):
                    # 將本地檔案轉換為 data URL（適合小檔案）
                    try:
                        return self._file_to_data_url(local_file_path)
                    except:
                        pass
                        
                # 最後回退：直接返回相對路徑（可能無法載入）
                logger.warning(f"無法處理相對路徑 Logo URL: {logo_url}")
                return logo_url
        
        return logo_url
    
    def _calculate_position_styles(self, position: str, config: Dict) -> str:
        """計算文字位置的 CSS 樣式"""
        position_map = {
            'top-left': 'position: absolute; top: 10%; left: 10%;',
            'top-center': 'position: absolute; top: 10%; left: 50%; transform: translateX(-50%);',
            'top-right': 'position: absolute; top: 10%; right: 10%;',
            'middle-left': 'position: absolute; top: 50%; left: 10%; transform: translateY(-50%);',
            'center': 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);',
            'middle-right': 'position: absolute; top: 50%; right: 10%; transform: translateY(-50%);',
            'bottom-left': 'position: absolute; bottom: 10%; left: 10%;',
            'bottom-center': 'position: absolute; bottom: 10%; left: 50%; transform: translateX(-50%);',
            'bottom-right': 'position: absolute; bottom: 10%; right: 10%;',
        }

        if position == 'custom':
            x = config.get('text_custom_x', 50)
            y = config.get('text_custom_y', 50)
            return f'position: absolute; top: {y}%; left: {x}%; transform: translate(-50%, -50%);'

        return position_map.get(position, position_map['center'])

    def _get_metadata_position_styles(self, config: Dict) -> str:
        """獲取元數據的位置樣式"""
        # 簡化處理：元數據通常放在底部
        metadata_size = config.get('metadata_size', 12)
        metadata_color = config.get('metadata_color', '#666666')
        return f'position: absolute; bottom: 20px; left: 20px; font-size: {metadata_size}px; color: {metadata_color};'

    def _get_logo_position_styles(self, config: Dict) -> str:
        """獲取 LOGO 位置的 CSS 樣式"""
        logo_position = config.get('logo_position', 'bottom-right')
        padding = config.get('padding', 60)

        position_map = {
            'top-left': f'top: {padding}px; left: {padding}px;',
            'top-center': f'top: {padding}px; left: 50%; transform: translateX(-50%);',
            'top-right': f'top: {padding}px; right: {padding}px;',
            'middle-left': f'top: 50%; left: {padding}px; transform: translateY(-50%);',
            'center': f'top: 50%; left: 50%; transform: translate(-50%, -50%);',
            'middle-right': f'top: 50%; right: {padding}px; transform: translateY(-50%);',
            'bottom-left': f'bottom: {padding}px; left: {padding}px;',
            'bottom-center': f'bottom: {padding}px; left: 50%; transform: translateX(-50%);',
            'bottom-right': f'bottom: {padding}px; right: {padding}px;',
        }

        if logo_position == 'custom':
            x = config.get('logo_custom_x', 90)
            y = config.get('logo_custom_y', 90)
            return f'top: {y}%; left: {x}%; transform: translate(-50%, -50%);'

        return position_map.get(logo_position, position_map['bottom-right'])

    def _file_to_data_url(self, file_path: str) -> str:
        """將本地檔案轉換為 data URL"""
        import mimetypes
        import base64
        
        # 獲取 MIME 類型
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        # 讀取檔案內容
        with open(file_path, 'rb') as f:
            file_data = f.read()
        
        # 轉換為 base64
        base64_data = base64.b64encode(file_data).decode('utf-8')
        
        # 建立 data URL
        return f"data:{mime_type};base64,{base64_data}"
    
    def _html_to_image(self, html: str, dimensions: Dict, quality: int = 95) -> BytesIO:
        """使用 Pillow 將內容轉換為圖片（替代 Playwright）"""
        try:
            from services.pillow_renderer import PillowRenderer
            
            # 從 HTML 中提取文字內容（簡化版本）
            import re
            from html import unescape
            
            # 提取標題
            title_match = re.search(r'<div class="title"[^>]*>(.*?)</div>', html, re.DOTALL)
            title = unescape(re.sub(r'<[^>]+>', '', title_match.group(1))) if title_match else ""
            
            # 提取內容
            content_match = re.search(r'<div class="content"[^>]*>.*?<div[^>]*>(.*?)</div>', html, re.DOTALL)
            content_text = unescape(re.sub(r'<[^>]+>', '', content_match.group(1))) if content_match else ""
            
            # 提取作者
            author_match = re.search(r'<span class="author"[^>]*>(.*?)</span>', html)
            author = unescape(re.sub(r'<[^>]+>', '', author_match.group(1))) if author_match else ""
            
            # 提取時間
            time_match = re.search(r'<span class="time"[^>]*>(.*?)</span>', html)
            time_text = unescape(re.sub(r'<[^>]+>', '', time_match.group(1))) if time_match else ""
            
            # 合併文字內容
            full_text = f"{title}\n\n{content_text}"
            if author or time_text:
                full_text += f"\n\n{author} {time_text}".strip()
            
            # 使用 Pillow 渲染器
            renderer = PillowRenderer(
                default_width=dimensions["width"],
                default_height=dimensions["height"]
            )
            
            return renderer.render_text_card(
                content=full_text,
                width=dimensions["width"],
                height=dimensions["height"],
                background_color="#ffffff",
                text_color="#333333",
                font_size=32,
                padding=60,
                image_format="JPEG",
                quality=quality
            )
                
        except Exception as e:
            logger.error(f"Pillow 渲染失敗: {e}")
            raise Exception(f"渲染失敗: {e}")
    
    def list_available_sizes(self) -> Dict[str, Dict]:
        """列出所有可用的尺寸"""
        return self.SIZES.copy()
    
    def list_available_templates(self) -> List[str]:
        """列出所有可用的模板"""
        return ["modern", "card", "minimal"]


# 全局實例
_renderer_instance = None

def get_renderer() -> PostRenderer:
    """獲取全局渲染器實例"""
    global _renderer_instance
    if _renderer_instance is None:
        _renderer_instance = PostRenderer()
    return _renderer_instance
