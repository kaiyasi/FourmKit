"""
全新的貼文圖片生成器 
- 基於 HTML/CSS 模板
- 使用 Playwright 渲染成圖片
- 簡潔的 API 設計
- 內建預覽功能
"""
from typing import Dict, List, Optional, Union, Tuple
from datetime import datetime
from io import BytesIO
from pathlib import Path
import json
import os
import logging
import tempfile
import time

logger = logging.getLogger(__name__)


class ImageGeneratorError(Exception):
    """圖片生成錯誤"""
    pass


class PostImageGenerator:
    """貼文圖片生成器"""
    
    def __init__(self, 
                 templates_dir: Optional[str] = None,
                 fonts_dir: Optional[str] = None,
                 output_dir: Optional[str] = None):
        """
        初始化圖片生成器
        
        Args:
            templates_dir: 模板目錄路徑
            fonts_dir: 字體目錄路徑  
            output_dir: 輸出目錄路徑
        """
        self.templates_dir = Path(templates_dir or "assets/templates")
        self.fonts_dir = Path(fonts_dir or "assets/fonts")
        self.output_dir = Path(output_dir or os.getenv('UPLOAD_ROOT', 'uploads'))
        
        # 確保目錄存在
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # 預設配置
        self.default_config = {
            "width": 1080,
            "height": 1080,
            "background_color": "#ffffff",
            "font_family": "Noto Sans TC",
            "font_size": 32,
            "text_color": "#333333",
            "padding": 60,
            "line_height": 1.6
        }
        
        # 檢查 Playwright
        self._check_playwright()
    
    def _check_playwright(self):
        """檢查 Playwright 是否可用"""
        try:
            from playwright.sync_api import sync_playwright
            self._playwright_available = True
        except ImportError:
            logger.warning("Playwright 未安裝，無法進行圖片渲染")
            self._playwright_available = False
    
    def generate_image(self, 
                      content: Dict,
                      template: Optional[str] = None,
                      config: Optional[Dict] = None,
                      logo_url: Optional[str] = None) -> BytesIO:
        """
        生成貼文圖片
        
        Args:
            content: 貼文內容 {"title": "標題", "text": "內容", "author": "作者", ...}
            template: 模板名稱，預設使用 "default"
            config: 自訂配置，會覆蓋預設值
            logo_url: Logo 圖片 URL
            
        Returns:
            BytesIO: 圖片資料流
        """
        if not self._playwright_available:
            raise ImageGeneratorError("Playwright 未安裝，請執行: pip install playwright && playwright install chromium")
        
        # 合併配置
        final_config = {**self.default_config, **(config or {})}
        
        # 建立 HTML
        html = self._build_html(content, template or "default", final_config, logo_url)
        
        # 渲染圖片
        return self._render_html_to_image(html, final_config)
    
    def preview_html(self,
                    content: Dict,
                    template: Optional[str] = None,
                    config: Optional[Dict] = None,
                    logo_url: Optional[str] = None) -> str:
        """
        預覽 HTML（不渲染圖片）
        
        Returns:
            str: HTML 字符串
        """
        final_config = {**self.default_config, **(config or {})}
        return self._build_html(content, template or "default", final_config, logo_url)
    
    def _build_html(self, content: Dict, template: str, config: Dict, logo_url: Optional[str]) -> str:
        """建立 HTML"""
        
        # 清理內容
        title = self._clean_text(content.get("title", ""))
        text = self._clean_text(content.get("text", ""))
        author = self._clean_text(content.get("author", ""))
        created_at = content.get("created_at", datetime.now())
        
        # 時間格式化
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except:
                created_at = datetime.now()
        
        time_text = created_at.strftime("%Y年%m月%d日 %H:%M")
        
        # 載入模板
        template_html = self._load_template(template)
        
        # 替換變數
        html = template_html.format(
            # 基本配置
            width=config["width"],
            height=config["height"],
            background_color=config["background_color"],
            font_family=config["font_family"],
            font_size=config["font_size"],
            text_color=config["text_color"],
            padding=config["padding"],
            line_height=config["line_height"],
            
            # 內容
            title=title,
            text=text,
            author=author,
            time_text=time_text,
            
            # Logo
            logo_html=self._build_logo_html(logo_url) if logo_url else "",
            
            # Google Fonts
            google_fonts=self._get_google_fonts_url(config["font_family"])
        )
        
        return html
    
    def _load_template(self, template_name: str) -> str:
        """載入模板"""
        template_file = self.templates_dir / f"{template_name}.html"
        
        if template_file.exists():
            return template_file.read_text(encoding='utf-8')
        else:
            # 使用內建預設模板
            return self._get_default_template()
    
    def _get_default_template(self) -> str:
        """預設模板"""
        return """<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="{google_fonts}" rel="stylesheet">
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: '{font_family}', 'Noto Sans TC', sans-serif;
            background: {background_color};
            color: {text_color};
            overflow: hidden;
            line-height: {line_height};
        }}
        
        .container {{
            width: {width}px;
            height: {height}px;
            padding: {padding}px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            position: relative;
        }}
        
        .title {{
            font-size: {font_size}px;
            font-weight: 700;
            margin-bottom: 30px;
            line-height: 1.3;
        }}
        
        .content {{
            font-size: {font_size}px;
            line-height: {line_height};
            flex: 1;
            display: flex;
            align-items: center;
        }}
        
        .footer {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 40px;
            font-size: {font_size}px;
            opacity: 0.7;
        }}
        
        .logo {{
            position: absolute;
            top: {padding}px;
            right: {padding}px;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            object-fit: cover;
        }}
    </style>
</head>
<body>
    <div class="container">
        {logo_html}
        <div class="title">{title}</div>
        <div class="content">
            <div>{text}</div>
        </div>
        <div class="footer">
            <span>{author}</span>
            <span>{time_text}</span>
        </div>
    </div>
</body>
</html>"""
    
    def _build_logo_html(self, logo_url: str) -> str:
        """建立 Logo HTML"""
        return f'<img src="{logo_url}" class="logo" alt="Logo" />'
    
    def _get_google_fonts_url(self, font_family: str) -> str:
        """獲取 Google Fonts URL"""
        font_map = {
            "Noto Sans TC": "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&display=swap",
            "Noto Serif TC": "https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@300;400;500;700&display=swap",
            "Roboto": "https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap",
        }
        
        return font_map.get(font_family, font_map["Noto Sans TC"])
    
    def _clean_text(self, text: str) -> str:
        """清理文字"""
        if not text:
            return ""
        
        # 移除 HTML 標籤
        import re
        text = re.sub(r'<[^>]+>', '', text)
        
        # 移除多餘空白
        text = re.sub(r'\s+', ' ', text).strip()
        
        # 限制長度
        if len(text) > 800:
            text = text[:797] + "..."
        
        # HTML 轉義
        import html
        return html.escape(text)
    
    def _render_html_to_image(self, html: str, config: Dict) -> BytesIO:
        """將 HTML 渲染為圖片"""
        try:
            from playwright.sync_api import sync_playwright
            
            with sync_playwright() as p:
                # 啟動瀏覽器
                browser = p.chromium.launch(
                    args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
                )
                
                # 建立頁面
                page = browser.new_page(
                    viewport={
                        "width": config["width"],
                        "height": config["height"]
                    }
                )
                
                # 設定內容
                page.set_content(html, wait_until="networkidle")
                
                # 截圖
                screenshot_bytes = page.screenshot(
                    type="jpeg",
                    quality=95,
                    full_page=False
                )
                
                # 清理
                browser.close()
                
                # 返回 BytesIO
                return BytesIO(screenshot_bytes)
                
        except Exception as e:
            logger.error(f"渲染 HTML 失敗: {e}")
            raise ImageGeneratorError(f"渲染失敗: {e}")
    
    def save_image(self, image_data: BytesIO, filename: Optional[str] = None) -> str:
        """
        儲存圖片到檔案
        
        Args:
            image_data: 圖片資料
            filename: 檔案名稱，預設自動生成
            
        Returns:
            str: 檔案路徑
        """
        if not filename:
            timestamp = int(time.time() * 1000)
            filename = f"post_image_{timestamp}.jpg"
        
        # 確保輸出目錄存在
        output_path = self.output_dir / "images"
        output_path.mkdir(parents=True, exist_ok=True)
        
        # 儲存檔案
        file_path = output_path / filename
        with open(file_path, 'wb') as f:
            f.write(image_data.getvalue())
        
        return str(file_path)
    
    def create_template(self, name: str, html_content: str) -> None:
        """
        建立自訂模板
        
        Args:
            name: 模板名稱
            html_content: HTML 內容
        """
        template_file = self.templates_dir / f"{name}.html"
        template_file.write_text(html_content, encoding='utf-8')
        logger.info(f"模板已建立: {template_file}")
    
    def list_templates(self) -> List[str]:
        """列出所有可用模板"""
        templates = []
        
        # 掃描模板目錄
        if self.templates_dir.exists():
            for file in self.templates_dir.glob("*.html"):
                templates.append(file.stem)
        
        # 加入內建模板
        if "default" not in templates:
            templates.insert(0, "default")
        
        return templates


# 方便的單例實例
_generator_instance = None

def get_generator() -> PostImageGenerator:
    """獲取全局圖片生成器實例"""
    global _generator_instance
    if _generator_instance is None:
        _generator_instance = PostImageGenerator()
    return _generator_instance


# 快速 API 函數
def generate_post_image(content: Dict, 
                       template: str = "default",
                       config: Optional[Dict] = None,
                       logo_url: Optional[str] = None) -> BytesIO:
    """
    快速生成貼文圖片
    
    Example:
        content = {
            "title": "今天天氣很好",
            "text": "陽光明媚，適合出門走走！",
            "author": "小明",
            "created_at": "2025-01-15T10:30:00"
        }
        
        image = generate_post_image(content, template="modern")
    """
    generator = get_generator()
    return generator.generate_image(content, template, config, logo_url)


def preview_post_html(content: Dict,
                     template: str = "default", 
                     config: Optional[Dict] = None,
                     logo_url: Optional[str] = None) -> str:
    """
    快速預覽貼文 HTML
    """
    generator = get_generator()
    return generator.preview_html(content, template, config, logo_url)