"""
HTML 渲染服務：使用 Pillow 替代 Playwright 進行簡單的 HTML 渲染
移除 Playwright 依賴，使用純 Python 解決方案
"""
from __future__ import annotations
from typing import Optional
from io import BytesIO
import os
import logging
import re
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class HtmlRenderError(Exception):
    pass


class HtmlRenderer:
    def __init__(
        self,
        *,
        viewport_width: int = 1080,
        viewport_height: int = 1350,
        device_scale: float = 2.0,
        browser_args: Optional[list[str]] = None,
        executable_path: Optional[str] = None,
    ) -> None:
        self.viewport_width = viewport_width
        self.viewport_height = viewport_height
        self.device_scale = device_scale
        
        # 檢查 Pillow 是否可用
        try:
            from PIL import Image, ImageDraw, ImageFont  # noqa: F401
        except ImportError as e:
            raise HtmlRenderError(f"Pillow 未安裝：{e}. 請安裝 'Pillow'")

    def render_html_to_image(
        self,
        html_content: str,
        *,
        width: Optional[int] = None,
        height: Optional[int] = None,
        full_page: bool = False,
        background: Optional[str] = "white",
        wait_until: str = "networkidle",
        timeout_ms: int = 15000,
        image_type: str = "jpeg",
        quality: int = 92,
    ) -> BytesIO:
        """使用 Pillow 將 HTML 渲染為圖片"""
        try:
            from services.post_image_generator import PostImageGenerator
            
            # 解析 HTML 內容
            content_data = self._parse_html_content(html_content)
            
            # 使用 PostImageGenerator 生成圖片
            generator = PostImageGenerator()
            config = {
                "width": width or self.viewport_width,
                "height": height or self.viewport_height,
                "background_color": self._normalize_color(background),
                "gradient": False  # HTML 渲染不使用漸變
            }
            
            return generator.generate_image(content_data, config)
            
        except Exception as e:
            raise HtmlRenderError(f"HTML 渲染失敗：{e}")
    
    def _parse_html_content(self, html_content: str) -> dict:
        """解析 HTML 內容為結構化數據"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # 提取標題
            title_elem = soup.find(['h1', 'h2', 'h3', '.title', '.post-title'])
            title = title_elem.get_text(strip=True) if title_elem else ''
            
            # 提取內容
            content_elem = soup.find(['.content', '.post-content', 'p', '.text'])
            content = content_elem.get_text(strip=True) if content_elem else ''
            
            # 如果沒有找到結構化內容，提取所有文字
            if not title and not content:
                # 移除 script 和 style 標籤
                for script in soup(["script", "style"]):
                    script.decompose()
                
                all_text = soup.get_text()
                lines = [line.strip() for line in all_text.splitlines() if line.strip()]
                
                if lines:
                    title = lines[0][:100]  # 第一行作為標題
                    content = '\n'.join(lines[1:])[:500]  # 其餘作為內容
            
            # 提取其他資訊
            author_elem = soup.find(['.author', '.by', '.username'])
            author = author_elem.get_text(strip=True) if author_elem else ''
            
            school_elem = soup.find(['.school', '.location', '.meta'])
            school = school_elem.get_text(strip=True) if school_elem else ''
            
            return {
                'title': title,
                'text': content,
                'content': content,  # 兼容性
                'author': author,
                'school_name': school
            }
            
        except Exception as e:
            logger.warning(f"HTML 解析失敗: {e}")
            # 回退：直接提取所有文字
            clean_text = re.sub(r'<[^>]+>', '', html_content)
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()
            
            return {
                'title': 'HTML 內容',
                'text': clean_text[:500],
                'content': clean_text[:500],
                'author': '',
                'school_name': ''
            }
    
    def _normalize_color(self, color: Optional[str]) -> str:
        """標準化顏色值"""
        if not color:
            return "#ffffff"
        
        color = color.lower().strip()
        
        # 預定義顏色對應
        color_map = {
            'white': '#ffffff',
            'black': '#000000',
            'red': '#ff0000',
            'green': '#00ff00',
            'blue': '#0000ff',
            'yellow': '#ffff00',
            'cyan': '#00ffff',
            'magenta': '#ff00ff',
            'gray': '#808080',
            'grey': '#808080'
        }
        
        if color in color_map:
            return color_map[color]
        
        # 如果已經是 hex 格式
        if color.startswith('#') and len(color) in [4, 7]:
            return color
        
        # 嘗試解析 rgb() 格式
        rgb_match = re.match(r'rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', color)
        if rgb_match:
            r, g, b = map(int, rgb_match.groups())
            return f"#{r:02x}{g:02x}{b:02x}"
        
        # 預設回退
        return "#ffffff"


# 為了向後兼容，提供原有的接口
def get_html_renderer(**kwargs) -> HtmlRenderer:
    """獲取 HTML 渲染器實例"""
    return HtmlRenderer(**kwargs)