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
        渲染為圖片 - 使用完全相同的 HTML
        """
        # 先生成 HTML（和預覽完全一樣）
        html_content = self.render_html(content, size, template, config, logo_url)
        
        # 獲取尺寸
        dimensions = self.SIZES[size]
        
        # 使用 Playwright 渲染
        return self._html_to_image(html_content, dimensions, quality)
    
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
            width: {width}px;
            height: {height}px;
            font-family: '{config["font_family"]}', 'Noto Sans TC', sans-serif;
            background: {config["background_color"]};
            color: {config["primary_color"]};
            overflow: hidden;
            position: relative;
        }}
        
        .container {{
            width: 100%;
            height: 100%;
            padding: {config["padding"]}px;
            display: flex;
            flex-direction: column;
            position: relative;
        }}
        
        .logo {{
            position: absolute;
            top: {config["padding"]}px;
            right: {config["padding"]}px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
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
        
        .title {{
            font-size: {config["font_size_title"]}px;
            font-weight: 700;
            line-height: 1.2;
            margin-bottom: 20px;
            color: {config["primary_color"]};
        }}
        
        .content {{
            font-size: {config["font_size_content"]}px;
            line-height: {config["line_height"]};
            color: {config["primary_color"]};
            flex: 1;
            display: flex;
            align-items: center;
        }}
        
        .meta {{
            font-size: {config["font_size_meta"]}px;
            color: {config["secondary_color"]};
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 30px;
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
        """現代風格模板"""
        return f"""
        <div class="title">{content['title']}</div>
        <div class="content">
            <div>{content['text']}</div>
        </div>
        <div class="meta">
            <span class="author">{content['author']}</span>
            <span class="time">{content['time']}</span>
        </div>"""
    
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
        """將 HTML 轉換為圖片"""
        try:
            from playwright.sync_api import sync_playwright
            
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
                )
                
                page = browser.new_page(
                    viewport={
                        "width": dimensions["width"],
                        "height": dimensions["height"]
                    }
                )
                
                # 設定內容並等待所有資源載入
                page.set_content(html, wait_until="networkidle", timeout=20000)
                
                # 等待字體載入完成
                page.wait_for_function("document.fonts.ready", timeout=5000)
                
                # 等待圖片載入完成（包括 Logo）
                try:
                    page.wait_for_function("""
                        () => {
                            const images = document.querySelectorAll('img');
                            return Array.from(images).every(img => img.complete && img.naturalWidth > 0);
                        }
                    """, timeout=10000)
                except:
                    # 如果圖片載入超時，繼續渲染（避免阻塞）
                    logger.warning("圖片載入超時，繼續渲染")
                    pass
                
                # 截圖
                screenshot = page.screenshot(
                    type="jpeg",
                    quality=quality,
                    full_page=False
                )
                
                browser.close()
                return BytesIO(screenshot)
                
        except ImportError:
            raise Exception("Playwright 未安裝，請執行: pip install playwright && playwright install chromium")
        except Exception as e:
            logger.error(f"HTML 轉圖片失敗: {e}")
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