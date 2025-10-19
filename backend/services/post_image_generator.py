"""
純 Pillow 貼文圖片生成器
- 移除所有 Playwright 依賴
- 僅使用 Pillow 進行圖片生成
- 輕量且穩定
"""
from typing import Dict, List, Optional, Union, Tuple
from datetime import datetime
from io import BytesIO
from pathlib import Path
import json
import os
import logging
import time
import textwrap
import re

logger = logging.getLogger(__name__)


class ImageGeneratorError(Exception):
    """圖片生成錯誤"""
    pass


class PostImageGenerator:
    """純 Pillow 貼文圖片生成器"""
    
    def __init__(self, 
                 output_dir: Optional[str] = None):
        """
        初始化圖片生成器
        
        Args:
            output_dir: 輸出目錄路徑
        """
        self.output_dir = Path(output_dir or os.getenv('UPLOAD_ROOT', 'uploads'))
        
        # 確保目錄存在
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # 移除硬編碼預設配置，所有配置必須來自資料庫模板
        self.default_config = None
    
    def generate_image(self,
                      content: Dict,
                      config: Optional[Dict] = None) -> BytesIO:
        """
        生成貼文圖片

        Args:
            content: 貼文內容 {"title": "標題", "text": "內容", "author": "作者", ...}
            config: 完整的模板配置，必須提供所有必要參數

        Returns:
            BytesIO: 圖片資料流
        """
        # 檢查是否提供了必要的配置
        if config is None:
            raise ImageGeneratorError("必須提供完整的模板配置，不可使用硬編碼預設值")

        # 驗證必要配置項
        required_keys = ['width', 'height', 'background_color', 'font_size', 'text_color', 'padding', 'title_color', 'title_size', 'line_spacing']
        missing_keys = [key for key in required_keys if key not in config]
        if missing_keys:
            raise ImageGeneratorError(f"模板配置缺少必要項目: {missing_keys}")

        # 使用 Pillow 生成圖片
        return self._render_with_pillow(content, config)
    
    def _render_with_pillow(self, content: Dict, config: Dict) -> BytesIO:
        """使用 Pillow 渲染圖片"""
        try:
            from PIL import Image, ImageDraw, ImageFont
            
            width = config.get("width", 1080)
            height = config.get("height", 1080)
            padding = config.get("padding", 60)
            
            # 提取內容
            title = self._clean_text(content.get("title", ""))
            text = self._clean_text(content.get("text", content.get("content", "")))
            author = self._clean_text(content.get("author", ""))
            school = content.get("school_name", "")
            
            # 創建圖片
            img = Image.new('RGB', (width, height), color=config.get("background_color", "#ffffff"))
            draw = ImageDraw.Draw(img)
            
            # 載入字體
            title_font, content_font, meta_font = self._load_fonts(config)
            
            # 繪製背景漸變（可選）
            if config.get("gradient", True):
                self._draw_gradient_background(draw, width, height, config.get("background_color", "#ffffff"))
            
            # 計算位置
            y_pos = padding
            content_width = width - (padding * 2)
            
            # 繪製標題
            if title:
                y_pos = self._draw_title(draw, title, y_pos, content_width, title_font, config)
                y_pos += 30  # 標題與內容間距
            
            # 繪製分隔線
            if title:
                draw.line([(padding, y_pos), (width - padding, y_pos)], 
                         fill='#e0e0e0', width=2)
                y_pos += 40
            
            # 繪製內容
            if text:
                y_pos = self._draw_content(draw, text, y_pos, content_width, content_font, config)
            
            # 繪製底部資訊
            self._draw_footer(draw, author, school, width, height, padding, meta_font, config)
            
            # 繪製 Logo 或學校標識
            if school:
                self._draw_school_badge(draw, school, width, height, padding, meta_font)
            
            # 轉換為 BytesIO
            img_buffer = BytesIO()
            img.save(img_buffer, format='JPEG', quality=95, optimize=True)
            img_buffer.seek(0)
            
            return img_buffer
            
        except ImportError:
            raise ImageGeneratorError("Pillow 未安裝，請執行: pip install Pillow")
        except Exception as e:
            logger.error(f"Pillow 渲染錯誤: {e}")
            return self._render_simple_fallback(config)
    
    def _load_fonts(self, config: Dict) -> Tuple:
        """載入字體"""
        try:
            from PIL import ImageFont
            
            # 嘗試載入系統中文字體
            font_paths = [
                '/System/Library/Fonts/PingFang.ttc',  # macOS
                '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',  # Linux
                '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',  # Linux fallback
                '/Windows/Fonts/msyh.ttc',  # Windows
                '/Windows/Fonts/simhei.ttf',  # Windows fallback
            ]
            
            title_size = config.get("title_size", 48)
            content_size = config.get("font_size", 32)
            meta_size = max(20, content_size - 8)
            
            title_font = None
            content_font = None
            meta_font = None
            
            for font_path in font_paths:
                if os.path.exists(font_path):
                    try:
                        title_font = ImageFont.truetype(font_path, title_size)
                        content_font = ImageFont.truetype(font_path, content_size)
                        meta_font = ImageFont.truetype(font_path, meta_size)
                        break
                    except Exception:
                        continue
            
            # 回退到預設字體
            if not title_font:
                title_font = ImageFont.load_default()
                content_font = ImageFont.load_default()
                meta_font = ImageFont.load_default()
            
            return title_font, content_font, meta_font
            
        except Exception as e:
            logger.warning(f"字體載入失敗: {e}，使用預設字體")
            from PIL import ImageFont
            default_font = ImageFont.load_default()
            return default_font, default_font, default_font
    
    def _draw_gradient_background(self, draw, width: int, height: int, base_color: str):
        """繪製漸變背景"""
        try:
            # 解析顏色
            if base_color.startswith('#'):
                base_r = int(base_color[1:3], 16)
                base_g = int(base_color[3:5], 16)
                base_b = int(base_color[5:7], 16)
            else:
                base_r, base_g, base_b = 255, 255, 255  # 白色回退
            
            # 創建輕微的垂直漸變
            for y in range(height):
                alpha = y / height * 0.1  # 只有輕微變化
                r = max(0, min(255, int(base_r * (1 - alpha) + base_r * 0.95 * alpha)))
                g = max(0, min(255, int(base_g * (1 - alpha) + base_g * 0.95 * alpha)))
                b = max(0, min(255, int(base_b * (1 - alpha) + base_b * 0.95 * alpha)))
                draw.line([(0, y), (width, y)], fill=(r, g, b))
                
        except Exception:
            # 如果漸變失敗，忽略錯誤
            pass
    
    def _draw_title(self, draw, title: str, y_pos: int, content_width: int, font, config: Dict) -> int:
        """繪製標題"""
        title_color = config.get("title_color", "#2c3e50")
        
        # 文字換行
        max_chars = max(15, content_width // 30)  # 根據寬度估算字數
        wrapped_title = textwrap.fill(title, width=max_chars)
        
        # 繪製文字
        line_height = config.get("title_size", 48) + config.get("line_spacing", 10)
        draw.multiline_text(
            (config.get("padding", 60), y_pos), 
            wrapped_title, 
            font=font, 
            fill=title_color,
            spacing=config.get("line_spacing", 10)
        )
        
        # 返回下一個 Y 位置
        lines = len(wrapped_title.split('\n'))
        return y_pos + (lines * line_height)
    
    def _draw_content(self, draw, text: str, y_pos: int, content_width: int, font, config: Dict) -> int:
        """繪製內容"""
        text_color = config.get("text_color", "#333333")
        
        # 限制內容長度
        if len(text) > 600:
            text = text[:597] + "..."
        
        # 文字換行
        max_chars = max(20, content_width // 25)  # 根據寬度估算字數
        wrapped_text = textwrap.fill(text, width=max_chars)
        
        # 限制行數
        lines = wrapped_text.split('\n')
        max_lines = config.get("max_content_lines", 12)
        if len(lines) > max_lines:
            lines = lines[:max_lines-1] + [lines[max_lines-1][:50] + "..."]
            wrapped_text = '\n'.join(lines)
        
        # 繪製文字
        line_height = config.get("font_size", 32) + config.get("line_spacing", 10)
        draw.multiline_text(
            (config.get("padding", 60), y_pos), 
            wrapped_text, 
            font=font, 
            fill=text_color,
            spacing=config.get("line_spacing", 10)
        )
        
        # 返回下一個 Y 位置
        return y_pos + (len(lines) * line_height)
    
    def _draw_footer(self, draw, author: str, school: str, width: int, height: int, padding: int, font, config: Dict):
        """繪製底部資訊"""
        footer_color = config.get("meta_color", "#7f8c8d")
        bottom_y = height - padding - 40
        
        # 作者資訊
        if author:
            draw.text((padding, bottom_y), f"👤 {author}", font=font, fill=footer_color)
        
        # 時間
        time_text = datetime.now().strftime('%Y/%m/%d')
        draw.text((padding, bottom_y + 25), f"🗓 {time_text}", font=font, fill=footer_color)
        
        # 學校（右側）
        if school:
            school_text = f"📍 {school}"
            # 簡單的右對齊
            try:
                bbox = draw.textbbox((0, 0), school_text, font=font)
                text_width = bbox[2] - bbox[0]
                x_pos = width - padding - text_width
                draw.text((x_pos, bottom_y), school_text, font=font, fill=footer_color)
            except:
                # 如果 textbbox 不可用，使用固定位置
                draw.text((width - padding - 200, bottom_y), school_text, font=font, fill=footer_color)
    
    def _draw_school_badge(self, draw, school: str, width: int, height: int, padding: int, font):
        """繪製學校徽章"""
        try:
            # 簡單的圓形徽章
            badge_size = 80
            badge_x = width - padding - badge_size
            badge_y = padding
            
            # 繪製圓形背景
            draw.ellipse(
                [badge_x, badge_y, badge_x + badge_size, badge_y + badge_size],
                fill='#3498db',
                outline='#2980b9',
                width=3
            )
            
            # 繪製學校首字
            school_initial = school[0] if school else "校"
            try:
                bbox = draw.textbbox((0, 0), school_initial, font=font)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
                text_x = badge_x + (badge_size - text_width) // 2
                text_y = badge_y + (badge_size - text_height) // 2
                draw.text((text_x, text_y), school_initial, font=font, fill='white')
            except:
                # 如果計算失敗，使用中心位置
                draw.text(
                    (badge_x + badge_size//2 - 15, badge_y + badge_size//2 - 15), 
                    school_initial, 
                    font=font, 
                    fill='white'
                )
                
        except Exception as e:
            logger.debug(f"繪製學校徽章失敗: {e}")
    
    def _clean_text(self, text: str) -> str:
        """清理文字，移除 HTML 標籤和 Markdown 符號"""
        if not text:
            return ""

        text = str(text)

        # 移除 HTML 標籤
        text = re.sub(r'<[^>]+>', '', text)

        # 移除 Markdown 符號
        # 移除圖片 ![alt](url) -> alt (需要在連結之前處理)
        text = re.sub(r'!\[([^\]]*)\]\([^)]+\)', r'\1', text)
        # 移除連結 [text](url) -> text
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
        # 移除粗體 **text** 或 __text__ -> text
        text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
        text = re.sub(r'__([^_]+)__', r'\1', text)
        # 移除斜體 *text* 或 _text_ -> text
        text = re.sub(r'\*([^*]+)\*', r'\1', text)
        text = re.sub(r'(?<!\w)_([^_]+)_(?!\w)', r'\1', text)
        # 移除刪除線 ~~text~~ -> text
        text = re.sub(r'~~([^~]+)~~', r'\1', text)
        # 移除代碼塊 ```code``` -> code
        text = re.sub(r'```[^`]*```', '', text)
        # 移除行內代碼 `code` -> code
        text = re.sub(r'`([^`]+)`', r'\1', text)
        # 移除標題符號 ### Title -> Title
        text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)
        # 移除引用符號 > quote -> quote
        text = re.sub(r'^>\s*', '', text, flags=re.MULTILINE)
        # 移除列表符號 - item 或 * item 或 1. item -> item
        text = re.sub(r'^[\s]*[-*+]\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'^[\s]*\d+\.\s+', '', text, flags=re.MULTILINE)
        # 移除水平線 --- 或 ***
        text = re.sub(r'^[\s]*[-*_]{3,}[\s]*$', '', text, flags=re.MULTILINE)

        # 移除多餘空白
        text = re.sub(r'\s+', ' ', text).strip()

        return text
    
    def _render_simple_fallback(self, config: Dict) -> BytesIO:
        """最簡單的回退方案"""
        try:
            from PIL import Image, ImageDraw, ImageFont
            
            width = config.get("width", 1080)
            height = config.get("height", 1080)
            
            # 創建簡單圖片
            img = Image.new('RGB', (width, height), color='#f8f9fa')
            draw = ImageDraw.Draw(img)
            
            # 載入字體
            try:
                font = ImageFont.load_default()
            except:
                font = None
            
            # 繪製背景圓圈
            center_x, center_y = width // 2, height // 2
            circle_radius = min(width, height) // 6
            draw.ellipse(
                [center_x - circle_radius, center_y - circle_radius - 50,
                 center_x + circle_radius, center_y + circle_radius - 50],
                fill='#3498db'
            )
            
            # 簡單文字
            text = "ForumKit\n校園動態"
            if font:
                try:
                    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=20)
                    text_width = bbox[2] - bbox[0]
                    text_height = bbox[3] - bbox[1]
                    x = (width - text_width) // 2
                    y = center_y + 50
                    draw.multiline_text((x, y), text, font=font, fill='#2c3e50', spacing=20, align='center')
                except:
                    draw.text((width//2 - 100, center_y + 50), text, fill='#2c3e50')
            else:
                draw.text((width//2 - 100, center_y + 50), text, fill='#2c3e50')
            
            # 轉換為 BytesIO
            img_buffer = BytesIO()
            img.save(img_buffer, format='JPEG', quality=80)
            img_buffer.seek(0)
            
            return img_buffer
            
        except Exception as e:
            logger.error(f"簡單回退方案失敗: {e}")
            raise ImageGeneratorError(f"圖片生成完全失敗: {e}")
    
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
                       config: Optional[Dict] = None) -> BytesIO:
    """
    快速生成貼文圖片
    
    Example:
        content = {
            "title": "今天天氣很好",
            "text": "陽光明媚，適合出門走走！",
            "author": "小明",
            "school_name": "範例學校"
        }
        
        image = generate_post_image(content)
    """
    generator = get_generator()
    return generator.generate_image(content, config)