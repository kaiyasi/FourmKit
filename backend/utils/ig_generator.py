"""
Instagram 圖片生成器
使用 Pillow 生成美觀的 IG 貼文圖片
"""
import os
import re
import textwrap
import hashlib
import zipfile
from urllib.parse import quote_plus
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
        """獲取字體（本機字型路徑/家族名），帶緩存"""
        cache_key = f"local::{font_name}_{size}"
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

    def _font_cache_dir(self) -> str:
        d = os.getenv('IG_FONT_CACHE', '/tmp/ig_fonts')
        try:
            os.makedirs(d, exist_ok=True)
        except Exception:
            pass
        return d

    def _load_font_from_url(self, url: str, size: int) -> ImageFont.FreeTypeFont:
        """從遠端 URL 下載 .ttf/.otf 字型後載入（含快取）。"""
        key = f"url::{url}_{size}"
        if key in self.font_cache:
            return self.font_cache[key]
        try:
            ext = os.path.splitext(url.split('?')[0])[1].lower()
            if ext not in {'.ttf', '.otf'}:
                # 不支援 woff/woff2，交由上層 fallback
                raise RuntimeError('Unsupported font extension (expect .ttf or .otf)')
            h = hashlib.sha1(url.encode('utf-8')).hexdigest()[:16]
            cache_path = os.path.join(self._font_cache_dir(), f"{h}{ext}")
            if not os.path.exists(cache_path):
                r = requests.get(url, timeout=15)
                r.raise_for_status()
                with open(cache_path, 'wb') as f:
                    f.write(r.content)
            font = ImageFont.truetype(cache_path, size)
            self.font_cache[key] = font
            return font
        except Exception:
            return ImageFont.load_default()

    def _load_font_from_google(self, family: str, size: int, weight: str | None = None) -> ImageFont.FreeTypeFont:
        """從 Google Fonts 直接下載 ZIP 並取出 TTF。
        注意：此方法偏向離線快取，避免每次生成都打外網。
        """
        weight_pref = (weight or 'Regular').lower()
        key = f"gfont::{family}:{weight_pref}:{size}"
        if key in self.font_cache:
            return self.font_cache[key]
        try:
            slug = family.strip()
            url = f"https://fonts.google.com/download?family={quote_plus(slug)}"
            # 快取 ZIP
            h = hashlib.sha1(f"{slug}|{weight_pref}".encode('utf-8')).hexdigest()[:16]
            zip_path = os.path.join(self._font_cache_dir(), f"g_{h}.zip")
            if not os.path.exists(zip_path):
                r = requests.get(url, timeout=20)
                r.raise_for_status()
                with open(zip_path, 'wb') as f:
                    f.write(r.content)
            # 搜尋 TTF
            cand_names = [weight_pref, 'regular', 'book', 'medium', 'bold']
            chosen_bytes: bytes | None = None
            with zipfile.ZipFile(zip_path, 'r') as zf:
                names = zf.namelist()
                # 先過濾 .ttf
                ttfs = [n for n in names if n.lower().endswith('.ttf')]
                # 盡量挑含權重關鍵字的
                for pref in cand_names:
                    for n in ttfs:
                        if pref in n.lower():
                            chosen_bytes = zf.read(n)
                            break
                    if chosen_bytes:
                        break
                # 還是沒有就拿第一個 .ttf
                if not chosen_bytes and ttfs:
                    chosen_bytes = zf.read(ttfs[0])
            if not chosen_bytes:
                raise RuntimeError('No TTF found in Google Fonts ZIP')
            # 寫入快取檔案
            ttf_cache = os.path.join(self._font_cache_dir(), f"g_{h}_{weight_pref}.ttf")
            if not os.path.exists(ttf_cache):
                with open(ttf_cache, 'wb') as f:
                    f.write(chosen_bytes)
            font = ImageFont.truetype(ttf_cache, size)
            self.font_cache[key] = font
            return font
        except Exception:
            return ImageFont.load_default()
    
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
                     post_id: int | None = None) -> bytes:
        """生成 Instagram 卡片"""
        
        # 基本設定
        width = int(template_config.get('width', self.default_width))
        height = int(template_config.get('height', self.default_height))
        
        # 色彩設定
        bg_color = template_config.get('background_color', '#ffffff')
        text_color = template_config.get('text_color', '#333333')
        accent_color = template_config.get('accent_color', '#3b82f6')
        
        # 字體設定
        title_font_name = template_config.get('title_font', 'NotoSansTC')
        content_font_name = template_config.get('content_font', 'NotoSansTC')
        title_size = template_config.get('title_size', 28)
        content_size = template_config.get('content_size', 18)
        
        # 版面布局設定（layout_config）
        layout = template_config.get('layout_config') or {}
        try:
            # 允許傳入 JSON 字串
            if isinstance(layout, str):
                import json
                layout = json.loads(layout)
        except Exception:
            layout = {}

        margin = int(layout.get('margin', 60))
        top_accent_height = int(layout.get('top_accent_height', 8))
        content_max_lines = int(layout.get('content_max_lines', 15))
        line_spacing = int(layout.get('line_spacing', 8))
        logo_size_cfg = int(layout.get('logo_size', 40))
        logo_position = layout.get('logo_position', template_config.get('logo_position', 'bottom-right'))

        # 可選：自訂內容區塊（優先於 margin 預設模式）
        content_box = None
        try:
            cx = layout.get('content_x'); cy = layout.get('content_y')
            cw = layout.get('content_width'); ch = layout.get('content_height')
            if all(v is not None for v in (cx, cy, cw, ch)):
                content_box = (int(cx), int(cy), int(cw), int(ch))
        except Exception:
            content_box = None

        # 時間戳設定
        show_ts = bool(layout.get('timestamp_show', False))
        ts_format = str(layout.get('timestamp_format', ''))
        ts_12h = bool(layout.get('timestamp_12h', layout.get('clock_12h', False)))
        ts_x = layout.get('timestamp_x'); ts_y = layout.get('timestamp_y')
        ts_color = layout.get('timestamp_color', accent_color)
        ts_size = int(layout.get('timestamp_size', 14))
        ts_font_google = layout.get('timestamp_font_google')
        ts_font_url = layout.get('timestamp_font_url')

        # 建立畫布
        img = Image.new('RGB', (width, height), bg_color)
        draw = ImageDraw.Draw(img)
        
        # 遠端 / Google Fonts 參數（可用 URL 或 family 名稱）
        title_font_url = template_config.get('title_font_url')
        content_font_url = template_config.get('content_font_url')
        title_font_google = template_config.get('title_font_google')
        content_font_google = template_config.get('content_font_google')
        title_font_weight = str(template_config.get('title_font_weight', 'Regular'))
        content_font_weight = str(template_config.get('content_font_weight', 'Regular'))

        # 載入字體（優先順序：URL -> Google family -> 本機）
        if isinstance(title_font_url, str) and title_font_url.startswith('http'):
            title_font = self._load_font_from_url(title_font_url, int(title_size))
        elif isinstance(title_font_google, str) and title_font_google.strip():
            title_font = self._load_font_from_google(title_font_google, int(title_size), title_font_weight)
        else:
            title_font = self._get_font(title_font_name, int(title_size))

        if isinstance(content_font_url, str) and content_font_url.startswith('http'):
            content_font = self._load_font_from_url(content_font_url, int(content_size))
        elif isinstance(content_font_google, str) and content_font_google.strip():
            content_font = self._load_font_from_google(content_font_google, int(content_size), content_font_weight)
        else:
            content_font = self._get_font(content_font_name, int(content_size))
        small_font = self._get_font(content_font_name, 14)
        
        # 清理內容
        clean_content = self._clean_html_content(content)
        
        # 設定內容區域
        content_width = width - 2 * margin
        
        # 繪製頂部裝飾條
        if top_accent_height > 0:
            draw.rectangle([0, 0, width, top_accent_height], fill=accent_color)

        # 繪製標題區域
        current_y = margin if not content_box else int(content_box[1])
        
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
        current_y += int(title_size * 1.8)
        
        # 分隔線
        line_y = current_y
        draw.rectangle([margin, line_y, width - margin, line_y + 2], fill=accent_color)
        current_y += 30
        
        # 主要內容
        content_lines = clean_content.split('\n')
        if content_box:
            usable_w = int(content_box[2])
            max_content_bottom = int(content_box[1] + content_box[3])
            content_width = usable_w
        else:
            max_content_bottom = height - 120  # 保留底部空間
        max_content_height = max_content_bottom - current_y
        
        lines_drawn = 0
        for line in content_lines:
            if not line.strip():
                current_y += max(2, content_size // 2)
                continue
                
            # 自動換行
            wrapped_lines = self._wrap_text(line, content_font, max(10, content_width))
            
            for wrapped_line in wrapped_lines:
                if lines_drawn >= content_max_lines:
                    break
                if current_y + content_size > (margin + max_content_height if not content_box else max_content_bottom):
                    # 內容太多，添加省略號
                    draw.text((margin, current_y), "...", fill=text_color, font=content_font)
                    break
                
                draw.text((margin, current_y), wrapped_line, fill=text_color, font=content_font)
                current_y += content_size + line_spacing
                lines_drawn += 1
            
            if current_y + content_size > (margin + max_content_height if not content_box else max_content_bottom) or lines_drawn >= content_max_lines:
                break
        
        # 繪製底部區域
        bottom_y = height - 80

        # 時間戳（可選）
        if show_ts:
            try:
                now = datetime.now()
                if ts_format:
                    fmt = ts_format
                else:
                    fmt = '%Y-%m-%d %I:%M %p' if ts_12h else '%Y-%m-%d %H:%M'
                ts_text = now.strftime(fmt)
            except Exception:
                ts_text = ''
            if ts_text:
                ts_font = (
                    self._load_font_from_url(ts_font_url, ts_size) if isinstance(ts_font_url, str) and ts_font_url.startswith('http') else
                    self._load_font_from_google(ts_font_google, ts_size) if isinstance(ts_font_google, str) and ts_font_google.strip() else
                    self._get_font(content_font_name, ts_size)
                )
                draw_x = int(ts_x) if ts_x is not None else margin
                draw_y = int(ts_y) if ts_y is not None else max(margin, bottom_y - 30)
                draw.text((draw_x, draw_y), ts_text, fill=ts_color or text_color, font=ts_font)
        
        # 載入並繪製學校 Logo
        if school_logo_path:
            logo = self._load_school_logo(school_logo_path)
            if logo:
                logo_size = max(20, min(200, logo_size_cfg))
                logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
                # 位置：top-left/top-right/bottom-left/bottom-right
                pos = str(logo_position or 'bottom-right').lower()
                if pos == 'top-left':
                    logo_x, logo_y = margin, margin
                elif pos == 'top-right':
                    logo_x, logo_y = width - margin - logo_size, margin
                elif pos == 'bottom-left':
                    logo_x, logo_y = margin, bottom_y
                else:  # bottom-right
                    logo_x, logo_y = width - margin - logo_size, bottom_y
                img.paste(logo, (int(logo_x), int(logo_y)), logo)
        
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
        title_font = (
            self._load_font_from_google(template_config.get('title_font_google', '') or 'NotoSansTC', 24)
            if template_config.get('title_font_google') else
            self._get_font(template_config.get('title_font', 'NotoSansTC'), 24)
        )
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
