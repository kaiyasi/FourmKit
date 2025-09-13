"""
無需 Chrome 的圖片生成替代方案
使用 Pillow (PIL) + HTML2Image 或純 Python 方案
"""
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from pathlib import Path
from io import BytesIO
import os
import tempfile

logger = logging.getLogger(__name__)


class AlternativeImageGenerator:
    """不依賴瀏覽器的圖片生成器"""
    
    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = Path(output_dir or os.getenv('UPLOAD_ROOT', 'uploads'))
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def generate_post_image_pillow(self, post_data: Dict, template_config: Dict) -> str:
        """方案 1: 使用 Pillow 純 Python 生成圖片"""
        try:
            from PIL import Image, ImageDraw, ImageFont
            import textwrap
            
            # 圖片尺寸設定
            width = template_config.get('width', 1080)
            height = template_config.get('height', 1080)
            
            # 創建畫布
            img = Image.new('RGB', (width, height), color='white')
            draw = ImageDraw.Draw(img)
            
            # 字體設定（嘗試使用系統字體）
            try:
                # Linux/macOS 常見字體路徑
                font_paths = [
                    '/System/Library/Fonts/Helvetica.ttc',  # macOS
                    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',  # Ubuntu
                    '/usr/share/fonts/TTF/arial.ttf',  # Arch Linux
                    '/Windows/Fonts/arial.ttf',  # Windows
                ]
                
                title_font = None
                content_font = None
                
                for font_path in font_paths:
                    if os.path.exists(font_path):
                        title_font = ImageFont.truetype(font_path, 48)
                        content_font = ImageFont.truetype(font_path, 32)
                        break
                
                if not title_font:
                    title_font = ImageFont.load_default()
                    content_font = ImageFont.load_default()
                    
            except Exception as e:
                logger.warning(f"字體載入失敗，使用預設字體: {e}")
                title_font = ImageFont.load_default()
                content_font = ImageFont.load_default()
            
            # 繪製內容
            y_offset = 50
            
            # 標題
            title = post_data.get('title', '校園動態')
            wrapped_title = textwrap.fill(title, width=30)
            draw.multiline_text((50, y_offset), wrapped_title, font=title_font, fill='black')
            y_offset += 120
            
            # 內容
            content = post_data.get('content', '')
            # 簡單去除 HTML 標籤
            import re
            content = re.sub(r'<[^>]+>', '', content)
            wrapped_content = textwrap.fill(content, width=40)
            draw.multiline_text((50, y_offset), wrapped_content[:500] + '...' if len(wrapped_content) > 500 else wrapped_content, font=content_font, fill='#333333')
            y_offset += 300
            
            # 學校資訊
            school = post_data.get('school_name', '')
            if school:
                draw.text((50, height - 150), f"📍 {school}", font=content_font, fill='#666666')
            
            # 時間戳
            timestamp = datetime.now().strftime('%Y/%m/%d')
            draw.text((50, height - 100), timestamp, font=content_font, fill='#999999')
            
            # 儲存圖片
            filename = f"post_{post_data.get('id', 'temp')}_{int(datetime.now().timestamp())}.png"
            filepath = self.output_dir / filename
            img.save(filepath, 'PNG')
            
            return str(filepath)
            
        except ImportError:
            logger.error("Pillow 未安裝，請執行: pip install Pillow")
            raise
        except Exception as e:
            logger.error(f"Pillow 圖片生成失敗: {e}")
            raise
    
    def generate_post_image_html2image(self, post_data: Dict, template_config: Dict) -> str:
        """方案 2: 使用 html2image (不需要完整瀏覽器)"""
        try:
            from html2image import Html2Image
            
            # HTML 模板
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {{
                        font-family: 'Arial', 'Microsoft JhengHei', sans-serif;
                        margin: 0;
                        padding: 40px;
                        width: 1000px;
                        height: 1000px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                    }}
                    .title {{
                        font-size: 48px;
                        font-weight: bold;
                        margin-bottom: 30px;
                        text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
                    }}
                    .content {{
                        font-size: 24px;
                        line-height: 1.6;
                        margin-bottom: 40px;
                        opacity: 0.9;
                    }}
                    .meta {{
                        font-size: 18px;
                        opacity: 0.8;
                        border-top: 1px solid rgba(255,255,255,0.3);
                        padding-top: 20px;
                    }}
                </style>
            </head>
            <body>
                <div class="title">{post_data.get('title', '校園動態')}</div>
                <div class="content">{post_data.get('content', '')[:300]}...</div>
                <div class="meta">
                    📍 {post_data.get('school_name', '未知學校')} | {datetime.now().strftime('%Y/%m/%d')}
                </div>
            </body>
            </html>
            """
            
            hti = Html2Image()
            filename = f"post_{post_data.get('id', 'temp')}_{int(datetime.now().timestamp())}.png"
            
            hti.screenshot(
                html_str=html_content,
                save_as=filename,
                size=(1080, 1080)
            )
            
            # 移動到正確目錄
            source_path = Path(filename)
            target_path = self.output_dir / filename
            
            if source_path.exists():
                source_path.rename(target_path)
                return str(target_path)
            else:
                raise Exception("HTML2Image 生成失敗")
                
        except ImportError:
            logger.error("html2image 未安裝，請執行: pip install html2image")
            raise
        except Exception as e:
            logger.error(f"HTML2Image 生成失敗: {e}")
            raise
    
    def generate_simple_text_image(self, post_data: Dict, template_config: Dict) -> str:
        """方案 3: 極簡文字圖片生成（純 Pillow，無需外部字體）"""
        try:
            from PIL import Image, ImageDraw, ImageFont
            import textwrap
            
            # 簡單配色方案
            colors = [
                ('#FF6B6B', '#4ECDC4'),  # 紅綠
                ('#A8E6CF', '#FF8B94'),  # 綠粉
                ('#FFD93D', '#6BCF7F'),  # 黃綠
                ('#4DABF7', '#69DB7C'),  # 藍綠
            ]
            
            color_scheme = colors[hash(post_data.get('title', '')) % len(colors)]
            
            width, height = 1080, 1080
            
            # 漸變背景
            img = Image.new('RGB', (width, height), color=color_scheme[0])
            draw = ImageDraw.Draw(img)
            
            # 簡單漸變效果
            for i in range(height):
                alpha = i / height
                r1, g1, b1 = tuple(int(color_scheme[0][j:j+2], 16) for j in (1, 3, 5))
                r2, g2, b2 = tuple(int(color_scheme[1][j:j+2], 16) for j in (1, 3, 5))
                
                r = int(r1 * (1 - alpha) + r2 * alpha)
                g = int(g1 * (1 - alpha) + g2 * alpha)
                b = int(b1 * (1 - alpha) + b2 * alpha)
                
                draw.line([(0, i), (width, i)], fill=(r, g, b))
            
            # 使用預設字體，但調整大小
            try:
                # 嘗試載入更大的預設字體
                font_large = ImageFont.load_default()
                font_medium = ImageFont.load_default()
                font_small = ImageFont.load_default()
            except:
                font_large = font_medium = font_small = ImageFont.load_default()
            
            # 文字內容
            title = post_data.get('title', '校園動態')
            content = post_data.get('content', '')
            school = post_data.get('school_name', '')
            
            # 去除 HTML 標籤
            import re
            content = re.sub(r'<[^>]+>', '', content)
            
            # 添加白色背景的文字區域
            text_bg = Image.new('RGBA', (width-100, height-200), (255, 255, 255, 200))
            img.paste(text_bg, (50, 100), text_bg)
            
            # 繪製文字
            y = 150
            
            # 標題（黑色）
            wrapped_title = textwrap.fill(title, width=25)
            draw.multiline_text((80, y), wrapped_title, font=font_large, fill='black', spacing=10)
            y += len(wrapped_title.split('\n')) * 60
            
            # 內容（深灰色）
            if content:
                wrapped_content = textwrap.fill(content[:200] + '...' if len(content) > 200 else content, width=35)
                draw.multiline_text((80, y), wrapped_content, font=font_medium, fill='#333333', spacing=8)
                y += len(wrapped_content.split('\n')) * 40
            
            # 學校和日期
            if school:
                draw.text((80, height-150), f"📍 {school}", font=font_small, fill='#666666')
            
            draw.text((80, height-100), f"🗓 {datetime.now().strftime('%Y/%m/%d')}", font=font_small, fill='#666666')
            
            # 儲存
            filename = f"post_{post_data.get('id', 'temp')}_{int(datetime.now().timestamp())}.png"
            filepath = self.output_dir / filename
            img.save(filepath, 'PNG')
            
            return str(filepath)
            
        except Exception as e:
            logger.error(f"簡單文字圖片生成失敗: {e}")
            raise
    
    def generate_post_image(self, post_data: Dict, template_config: Dict = None) -> str:
        """主要生成接口 - 按優先級嘗試不同方案"""
        if template_config is None:
            template_config = {}
        
        methods = [
            ('html2image', self.generate_post_image_html2image),
            ('pillow_enhanced', self.generate_post_image_pillow),
            ('simple_text', self.generate_simple_text_image),
        ]
        
        for method_name, method in methods:
            try:
                logger.info(f"嘗試使用 {method_name} 生成圖片...")
                return method(post_data, template_config)
            except Exception as e:
                logger.warning(f"{method_name} 生成失敗: {e}")
                continue
        
        raise Exception("所有圖片生成方案都失敗了")


# 全域實例
_alternative_generator = None


def get_alternative_image_generator() -> AlternativeImageGenerator:
    """獲取替代圖片生成器實例"""
    global _alternative_generator
    if _alternative_generator is None:
        _alternative_generator = AlternativeImageGenerator()
    return _alternative_generator