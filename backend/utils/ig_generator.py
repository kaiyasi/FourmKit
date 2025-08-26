"""
Instagram 圖片生成器
使用 Pillow 生成美觀的 IG 貼文圖片
"""
import os
import re
import textwrap
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import requests
from datetime import datetime
from typing import Optional, Dict, Any
import html2text
from pathlib import Path


class InstagramCardGenerator:
    def __init__(self):
        self.default_width = 1080
        self.default_height = 1080
        self.font_cache = {}
        
    def _get_font(self, font_name: str, size: int) -> ImageFont.FreeTypeFont:
        """獲取字體，帶緩存"""
        cache_key = f"{font_name}_{size}"
        if cache_key not in self.font_cache:
            try:
                # 嘗試系統字體
                if os.name == 'nt':  # Windows
                    font_paths = [
                        f"C:/Windows/Fonts/{font_name}.ttf",
                        f"C:/Windows/Fonts/arial.ttf",  # fallback
                    ]
                else:  # Linux/Docker
                    font_paths = [
                        f"/usr/share/fonts/truetype/noto/{font_name}-Regular.ttf",
                        f"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # fallback
                        f"/usr/share/fonts/TTF/{font_name}.ttf",
                    ]
                
                font = None
                for path in font_paths:
                    if os.path.exists(path):
                        font = ImageFont.truetype(path, size)
                        break
                
                if font is None:
                    # 最後備用字體
                    font = ImageFont.load_default()
                    
                self.font_cache[cache_key] = font
            except Exception:
                self.font_cache[cache_key] = ImageFont.load_default()
                
        return self.font_cache[cache_key]
    
    def _clean_html_content(self, html_content: str) -> str:
        """清理 HTML 內容，轉為純文字"""
        # 使用 html2text 轉換
        h = html2text.HTML2Text()
        h.ignore_links = True
        h.ignore_images = True
        h.body_width = 0  # 不限制寬度
        
        text = h.handle(html_content)
        
        # 清理多餘的換行和空格
        text = re.sub(r'\n\s*\n', '\n\n', text)  # 合併多餘換行
        text = re.sub(r'^\s+|\s+$', '', text, flags=re.MULTILINE)  # 去除行首行尾空格
        text = text.strip()
        
        return text
    
    def _wrap_text(self, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list:
        """自動換行文字"""
        words = text.split(' ')
        lines = []
        current_line = []
        
        for word in words:
            test_line = ' '.join(current_line + [word])
            bbox = font.getbbox(test_line)
            text_width = bbox[2] - bbox[0]
            
            if text_width <= max_width:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                    current_line = [word]
                else:
                    # 單詞太長，強制換行
                    lines.append(word)
        
        if current_line:
            lines.append(' '.join(current_line))
            
        return lines
    
    def _draw_rounded_rectangle(self, draw: ImageDraw.Draw, bbox: tuple, radius: int, fill: str):
        """繪製圓角矩形"""
        x1, y1, x2, y2 = bbox
        
        # 繪製圓角
        draw.pieslice([x1, y1, x1 + 2*radius, y1 + 2*radius], 180, 270, fill=fill)
        draw.pieslice([x2 - 2*radius, y1, x2, y1 + 2*radius], 270, 360, fill=fill)
        draw.pieslice([x1, y2 - 2*radius, x1 + 2*radius, y2], 90, 180, fill=fill)
        draw.pieslice([x2 - 2*radius, y2 - 2*radius, x2, y2], 0, 90, fill=fill)
        
        # 繪製邊
        draw.rectangle([x1 + radius, y1, x2 - radius, y2], fill=fill)
        draw.rectangle([x1, y1 + radius, x2, y2 - radius], fill=fill)
    
    def _load_school_logo(self, school_logo_path: str) -> Optional[Image.Image]:
        """載入學校 Logo"""
        if not school_logo_path:
            return None
            
        try:
            if school_logo_path.startswith('http'):
                response = requests.get(school_logo_path, timeout=10)
                response.raise_for_status()
                logo = Image.open(BytesIO(response.content))
            else:
                logo_path = Path("uploads") / school_logo_path.replace("public/", "")
                if logo_path.exists():
                    logo = Image.open(logo_path)
                else:
                    return None
            
            # 轉換為 RGBA
            if logo.mode != 'RGBA':
                logo = logo.convert('RGBA')
                
            return logo
        except Exception as e:
            print(f"載入 Logo 失敗: {e}")
            return None
    
    def generate_card(self, 
                     content: str,
                     template_config: Dict[str, Any],
                     school_name: str = "",
                     school_logo_path: str = "",
                     post_id: int = None) -> bytes:
        """生成 Instagram 卡片"""
        
        # 基本設定
        width = template_config.get('width', self.default_width)
        height = template_config.get('height', self.default_height)
        
        # 色彩設定
        bg_color = template_config.get('background_color', '#ffffff')
        text_color = template_config.get('text_color', '#333333')
        accent_color = template_config.get('accent_color', '#3b82f6')
        
        # 字體設定
        title_font_name = template_config.get('title_font', 'NotoSansTC')
        content_font_name = template_config.get('content_font', 'NotoSansTC')
        title_size = template_config.get('title_size', 28)
        content_size = template_config.get('content_size', 18)
        
        # 建立畫布
        img = Image.new('RGB', (width, height), bg_color)
        draw = ImageDraw.Draw(img)
        
        # 載入字體
        title_font = self._get_font(title_font_name, title_size)
        content_font = self._get_font(content_font_name, content_size)
        small_font = self._get_font(content_font_name, 14)
        
        # 清理內容
        clean_content = self._clean_html_content(content)
        
        # 設定邊距
        margin = 60
        content_width = width - 2 * margin
        
        # 繪製頂部裝飾條
        draw.rectangle([0, 0, width, 8], fill=accent_color)
        
        # 繪製標題區域
        current_y = margin
        
        # 學校名稱（如果有）
        if school_name:
            school_text = f"📍 {school_name}"
            school_bbox = draw.textbbox((0, 0), school_text, font=small_font)
            school_width = school_bbox[2] - school_bbox[0]
            
            # 繪製學校標籤背景
            tag_padding = 12
            tag_x = margin
            tag_y = current_y
            tag_bg = (margin - tag_padding, tag_y - tag_padding//2, 
                     margin + school_width + tag_padding, tag_y + 20 + tag_padding//2)
            
            self._draw_rounded_rectangle(draw, tag_bg, 8, accent_color)
            draw.text((margin, current_y), school_text, fill='white', font=small_font)
            current_y += 45
        
        # ForumKit 標題
        platform_title = "ForumKit 校園匿名討論"
        draw.text((margin, current_y), platform_title, fill=accent_color, font=title_font)
        current_y += 50
        
        # 分隔線
        line_y = current_y
        draw.rectangle([margin, line_y, width - margin, line_y + 2], fill=accent_color)
        current_y += 30
        
        # 主要內容
        content_lines = clean_content.split('\n')
        max_content_height = height - current_y - 120  # 保留底部空間
        
        for line in content_lines[:15]:  # 限制行數
            if not line.strip():
                current_y += content_size // 2
                continue
                
            # 自動換行
            wrapped_lines = self._wrap_text(line, content_font, content_width)
            
            for wrapped_line in wrapped_lines:
                if current_y + content_size > margin + max_content_height:
                    # 內容太多，添加省略號
                    draw.text((margin, current_y), "...", fill=text_color, font=content_font)
                    break
                
                draw.text((margin, current_y), wrapped_line, fill=text_color, font=content_font)
                current_y += content_size + 8
            
            if current_y + content_size > margin + max_content_height:
                break
        
        # 繪製底部區域
        bottom_y = height - 80
        
        # 載入並繪製學校 Logo
        if school_logo_path:
            logo = self._load_school_logo(school_logo_path)
            if logo:
                logo_size = 40
                logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
                logo_x = width - margin - logo_size
                logo_y = bottom_y
                img.paste(logo, (logo_x, logo_y), logo)
        
        # 平台標識
        watermark = template_config.get('watermark_text', 'ForumKit by Serelix Studio')
        draw.text((margin, bottom_y), watermark, fill=accent_color, font=small_font)
        
        # 貼文 ID（如果有）
        if post_id:
            id_text = f"#{post_id}"
            id_bbox = draw.textbbox((0, 0), id_text, font=small_font)
            id_width = id_bbox[2] - id_bbox[0]
            draw.text((width - margin - id_width, bottom_y + 20), id_text, 
                     fill=text_color, font=small_font)
        
        # 轉換為 bytes
        buffer = BytesIO()
        img.save(buffer, format='PNG', quality=95, optimize=True)
        buffer.seek(0)
        
        return buffer.getvalue()
    
    def generate_batch_preview(self, posts_data: list, template_config: Dict[str, Any]) -> bytes:
        """生成批次預覽圖"""
        preview_width = 1080
        preview_height = 1350  # 較高以容納多篇貼文
        
        img = Image.new('RGB', (preview_width, preview_height), template_config.get('background_color', '#ffffff'))
        draw = ImageDraw.Draw(img)
        
        # 繪製標題
        title_font = self._get_font(template_config.get('title_font', 'NotoSansTC'), 24)
        accent_color = template_config.get('accent_color', '#3b82f6')
        
        draw.rectangle([0, 0, preview_width, 6], fill=accent_color)
        draw.text((40, 30), f"📱 準備發送 {len(posts_data)} 篇貼文到 Instagram", 
                 fill=accent_color, font=title_font)
        
        # 繪製貼文列表
        y_offset = 100
        for i, post in enumerate(posts_data[:8], 1):  # 最多顯示8篇
            content_preview = self._clean_html_content(post['content'])[:60] + "..."
            text = f"{i}. #{post['id']} - {content_preview}"
            
            content_font = self._get_font(template_config.get('content_font', 'NotoSansTC'), 16)
            draw.text((40, y_offset), text, fill=template_config.get('text_color', '#333333'), 
                     font=content_font)
            y_offset += 35
        
        if len(posts_data) > 8:
            draw.text((40, y_offset), f"... 還有 {len(posts_data) - 8} 篇", 
                     fill=template_config.get('text_color', '#666666'), 
                     font=self._get_font('NotoSansTC', 14))
        
        # 轉換為 bytes
        buffer = BytesIO()
        img.save(buffer, format='PNG', quality=95)
        buffer.seek(0)
        
        return buffer.getvalue()


# 使用範例
if __name__ == "__main__":
    generator = InstagramCardGenerator()
    
    # 測試配置
    template_config = {
        'background_color': '#ffffff',
        'text_color': '#2c3e50',
        'accent_color': '#e74c3c',
        'title_font': 'NotoSansTC',
        'content_font': 'NotoSansTC',
        'title_size': 28,
        'content_size': 18,
        'watermark_text': 'ForumKit by Serelix Studio'
    }
    
    # 測試內容
    test_content = """
    <h1>校園生活分享</h1>
    <p>最近期中考剛結束，想跟大家分享一下讀書心得！</p>
    <ul>
        <li>圖書館真的很好用</li>
        <li>咖啡廳也是不錯的選擇</li>
        <li>宿舍讀書要注意隔音</li>
    </ul>
    <p>希望對學弟妹有幫助 💪</p>
    """
    
    # 生成卡片
    card_bytes = generator.generate_card(
        content=test_content,
        template_config=template_config,
        school_name="國立成功大學",
        post_id=123
    )
    
    # 儲存測試圖片
    with open("/tmp/test_ig_card.png", "wb") as f:
        f.write(card_bytes)
    
    print("測試卡片已生成: /tmp/test_ig_card.png")