"""
基於 Pillow 的圖片渲染服務
替代 Playwright 實現輕量級的文字和圖片渲染
"""
from __future__ import annotations
from typing import Optional, Dict, Any, List
from io import BytesIO
from datetime import datetime, timezone
import os
import logging
from PIL import Image, ImageDraw, ImageFont
import textwrap

logger = logging.getLogger(__name__)


class PillowRenderError(Exception):
    pass


class PillowRenderer:
    def __init__(
        self,
        *,
        default_width: int = 1080,
        default_height: int = 1350,
        default_font_size: int = 36,
        default_font_path: Optional[str] = None,
    ) -> None:
        self.default_width = default_width
        self.default_height = default_height
        self.default_font_size = default_font_size
        self.default_font_path = default_font_path
        
        # 字體目錄 - 支援多個路徑
        self.font_dirs = [
            os.path.join("/data", "fonts"),
            os.path.join(os.getcwd(), "assets", "fonts"),
            os.path.join(os.getcwd(), "backend", "assets", "fonts")
        ]
        
        # 創建可寫的字體目錄
        self.font_dir = None
        for font_dir in self.font_dirs:
            try:
                os.makedirs(font_dir, exist_ok=True)
                # 測試是否可寫
                test_file = os.path.join(font_dir, '.write_test')
                with open(test_file, 'w') as f:
                    f.write('test')
                os.remove(test_file)
                self.font_dir = font_dir
                break
            except (PermissionError, OSError):
                logger.warning(f"字體目錄 {font_dir} 無法創建或寫入，嘗試下一個")
                continue
        
        if self.font_dir is None:
            # 最後回退：使用當前工作目錄的臨時目錄
            fallback_dir = os.path.join(os.getcwd(), "temp_fonts")
            try:
                os.makedirs(fallback_dir, exist_ok=True)
                self.font_dir = fallback_dir
                self.font_dirs.append(fallback_dir)
                logger.info(f"使用回退字體目錄: {fallback_dir}")
            except Exception as e:
                logger.error(f"無法創建回退字體目錄: {e}")
                self.font_dir = os.getcwd()  # 最後的最後，用當前目錄
    
    def get_font(self, font_name: Optional[str] = None, size: int = None) -> ImageFont.ImageFont:
        """獲取字體對象"""
        if size is None:
            size = self.default_font_size
            
        # 如果指定了字體名稱，嘗試從多個字體目錄加載
        if font_name:
            for font_dir in self.font_dirs:
                font_path = os.path.join(font_dir, font_name)
                if os.path.exists(font_path):
                    try:
                        return ImageFont.truetype(font_path, size)
                    except Exception as e:
                        logger.warning(f"無法載入字體 {font_name} (從 {font_path}): {e}")
                        continue
        
        # 嘗試使用預設字體路徑
        if self.default_font_path and os.path.exists(self.default_font_path):
            try:
                return ImageFont.truetype(self.default_font_path, size)
            except Exception:
                pass
        
        # 嘗試查找系統中文字體
        system_fonts = [
            # Windows 中文字體
            "C:/Windows/Fonts/msjh.ttc",  # 微軟正黑體
            "C:/Windows/Fonts/msjhbd.ttc",
            "C:/Windows/Fonts/kaiu.ttf",  # 標楷體
            # macOS 中文字體  
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
            # Linux 中文字體
            "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
        ]
        
        for system_font in system_fonts:
            if os.path.exists(system_font):
                try:
                    return ImageFont.truetype(system_font, size)
                except Exception:
                    continue
        
        # 最後使用 PIL 預設字體
        try:
            return ImageFont.load_default()
        except Exception:
            # 如果都失敗了，使用 PIL 的基本字體
            return ImageFont.load_default()
    
    def render_text_card(
        self,
        content: str,
        *,
        width: Optional[int] = None,
        height: Optional[int] = None,
        background_color: str = "#ffffff",
        text_color: str = "#000000",
        font_name: Optional[str] = None,
        font_size: Optional[int] = None,
        padding: int = 40,
        line_spacing: int = 10,
        # 新增：排版與輸出控制
        text_align: str = "center",           # left | center | right
        vertical_align: str = "middle",       # top | middle | bottom
        max_lines: Optional[int] = None,       # 最大行數（超出將截斷）
        max_chars_per_line: Optional[int] = None,  # 每行最大字數
        ellipsis: bool = True,                 # 截斷時是否加上 …
        # 文字截斷浮水印
        apply_watermark_on_truncation: bool = False,
        watermark_text: str = "",
        watermark_font_name: Optional[str] = None,
        watermark_font_size: int = 18,
        watermark_color: str = "#666666",
        watermark_position: Optional[object] = None,  # str 位置名 或 {x:int,y:int}
        image_format: str = "JPEG",
        quality: int = 92,
    ) -> BytesIO:
        """渲染文字卡片為圖片"""
        try:
            # 設定尺寸
            img_width = width or self.default_width
            img_height = height or self.default_height
            font_size = font_size or self.default_font_size
            
            # 創建圖片
            img = Image.new("RGB", (img_width, img_height), background_color)
            draw = ImageDraw.Draw(img)
            
            # 獲取字體
            font = self.get_font(font_name, font_size)
            
            # 計算文字區域
            text_width = img_width - (padding * 2)
            text_height = img_height - (padding * 2)
            
            # 自動換行
            wrapped = self._wrap_text(content, font, text_width)

            # 每行最大字數限制（先於 max_lines）
            lines: List[str] = []
            was_truncated = False
            if isinstance(max_chars_per_line, int) and max_chars_per_line > 0:
                for ln in wrapped:
                    if len(ln) > max_chars_per_line:
                        was_truncated = True
                        lines.append(ln[:max_chars_per_line])
                    else:
                        lines.append(ln)
            else:
                lines = wrapped

            # 最大行數限制（若有設定）
            if isinstance(max_lines, int) and max_lines > 0 and len(lines) > max_lines:
                was_truncated = True or was_truncated
                lines = lines[:max_lines]
                if ellipsis and lines:
                    # 盡量在寬度內添加 …
                    last = lines[-1]
                    try:
                        test = last + "…"
                        bbox = font.getbbox(test)
                        lw = bbox[2] - bbox[0]
                        while lw > text_width and len(last) > 0:
                            last = last[:-1]
                            test = last + "…"
                            bbox = font.getbbox(test)
                            lw = bbox[2] - bbox[0]
                        lines[-1] = test
                    except Exception:
                        lines[-1] = last  # 退回原樣
            
            # 計算總文字高度 - 修正：使用實際字體高度而不是 font_size
            # 獲取實際字體高度
            bbox = font.getbbox("測試Ag")  # 使用包含上下部分的字符來測量
            actual_font_height = bbox[3] - bbox[1]
            line_height = actual_font_height + line_spacing
            total_text_height = len(lines) * line_height - line_spacing
            
            # 垂直對齊起始位置
            v = (vertical_align or "middle").lower()
            if v == "top":
                y_start = padding
            elif v in ("bottom", "down"):
                y_start = padding + (text_height - total_text_height)
            else:  # middle default
                y_start = padding + (text_height - total_text_height) // 2
            
            # 繪製文字
            y_position = y_start
            for line in lines:
                # 水平對齊
                text_bbox = draw.textbbox((0, 0), line, font=font)
                text_line_width = text_bbox[2] - text_bbox[0]
                align = (text_align or "center").lower()
                if align == "left":
                    x_position = padding
                elif align == "right":
                    x_position = padding + (text_width - text_line_width)
                else:  # center default
                    x_position = padding + (text_width - text_line_width) // 2
                
                draw.text((x_position, y_position), line, fill=text_color, font=font)
                y_position += line_height
            
            # 文字被截斷時，渲染浮水印
            if was_truncated and apply_watermark_on_truncation and watermark_text:
                try:
                    wm_font = self.get_font(watermark_font_name, watermark_font_size)
                    wm_draw = ImageDraw.Draw(img)
                    tb = wm_draw.textbbox((0, 0), watermark_text, font=wm_font)
                    tw = tb[2] - tb[0]
                    th = tb[3] - tb[1]

                    # 預設右下角
                    wx, wy = img_width - padding - tw, img_height - padding - th

                    pos = watermark_position
                    if isinstance(pos, str):
                        p = pos.lower()
                        if p == 'top-left':
                            wx, wy = padding, padding
                        elif p == 'top-center':
                            wx, wy = (img_width - tw) // 2, padding
                        elif p == 'top-right':
                            wx, wy = img_width - padding - tw, padding
                        elif p in ('middle-left', 'left-center'):
                            wx, wy = padding, (img_height - th) // 2
                        elif p in ('center', 'middle-center'):
                            wx, wy = (img_width - tw) // 2, (img_height - th) // 2
                        elif p in ('middle-right', 'right-center'):
                            wx, wy = img_width - padding - tw, (img_height - th) // 2
                        elif p == 'bottom-left':
                            wx, wy = padding, img_height - padding - th
                        elif p == 'bottom-center':
                            wx, wy = (img_width - tw) // 2, img_height - padding - th
                        else:  # bottom-right
                            wx, wy = img_width - padding - tw, img_height - padding - th
                    elif isinstance(pos, dict):
                        try:
                            wx = int(pos.get('x', wx))
                            wy = int(pos.get('y', wy))
                        except Exception:
                            pass

                    wm_draw.text((wx, wy), watermark_text, fill=watermark_color, font=wm_font)
                except Exception:
                    pass

            # 保存到 BytesIO
            buf = BytesIO()
            if image_format.upper() == "PNG":
                img.save(buf, format="PNG")
            else:
                img.save(buf, format="JPEG", quality=quality)
            
            buf.seek(0)
            return buf
            
        except Exception as e:
            raise PillowRenderError(f"文字卡片渲染失敗：{e}")
    
    def _wrap_text(self, text: str, font: ImageFont.ImageFont, max_width: int) -> List[str]:
        """自動換行文字"""
        lines = []
        paragraphs = text.split('\n')
        
        for paragraph in paragraphs:
            if not paragraph.strip():
                lines.append("")
                continue
                
            # 使用 textwrap 進行初步換行
            wrapped = textwrap.wrap(paragraph, width=40)  # 大概的字符數
            
            for line in wrapped:
                # 檢查實際寬度
                bbox = font.getbbox(line)
                text_width = bbox[2] - bbox[0]
                
                if text_width <= max_width:
                    lines.append(line)
                else:
                    # 如果還是太寬，進一步分割
                    words = line.split()
                    current_line = ""
                    
                    for word in words:
                        test_line = current_line + (" " if current_line else "") + word
                        bbox = font.getbbox(test_line)
                        test_width = bbox[2] - bbox[0]
                        
                        if test_width <= max_width:
                            current_line = test_line
                        else:
                            if current_line:
                                lines.append(current_line)
                            current_line = word
                    
                    if current_line:
                        lines.append(current_line)
        
        return lines
    
    def list_available_fonts(self) -> List[Dict[str, Any]]:
        """列出可用的字體檔案"""
        fonts = []
        if os.path.exists(self.font_dir):
            for filename in os.listdir(self.font_dir):
                if filename.lower().endswith(('.ttf', '.otf', '.ttc')):
                    file_path = os.path.join(self.font_dir, filename)
                    try:
                        # 嘗試載入字體以驗證
                        test_font = ImageFont.truetype(file_path, 20)
                        fonts.append({
                            'filename': filename,
                            'name': filename.split('.')[0],
                            'path': file_path,
                            'size': os.path.getsize(file_path),
                            'valid': True
                        })
                    except Exception as e:
                        fonts.append({
                            'filename': filename,
                            'name': filename.split('.')[0],
                            'path': file_path,
                            'size': os.path.getsize(file_path),
                            'valid': False,
                            'error': str(e)
                        })
        return fonts
    
    def save_font_file(self, font_data: bytes, filename: str) -> str:
        """保存字體檔案"""
        if not filename.lower().endswith(('.ttf', '.otf', '.ttc')):
            raise PillowRenderError("不支持的字體檔案格式")
        
        file_path = os.path.join(self.font_dir, filename)
        
        try:
            with open(file_path, 'wb') as f:
                f.write(font_data)
            
            # 驗證字體檔案
            test_font = ImageFont.truetype(file_path, 20)
            
            return file_path
        except Exception as e:
            # 如果檔案已創建但驗證失敗，刪除它
            if os.path.exists(file_path):
                os.remove(file_path)
            raise PillowRenderError(f"字體檔案保存或驗證失敗: {e}")
    
    def delete_font_file(self, filename: str) -> bool:
        """刪除字體檔案"""
        file_path = os.path.join(self.font_dir, filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                return True
            except Exception as e:
                logger.error(f"刪除字體檔案失敗: {e}")
                return False
        return False

    def _map_font_family(self, font_family: Optional[str]) -> Optional[str]:
        """將通用字體名稱映射到系統可用字體檔名或直接返回可用檔名。
        備註：不下載網路字體，只嘗試常見 Noto/系統字體。
        """
        if not font_family:
            return None
        name = font_family.strip().lower()
        # 常見映射
        mapping = {
            'noto sans tc': 'NotoSansCJK-Regular.ttc',
            'noto serif tc': 'NotoSerifCJK-Regular.ttc',
            'inter': None,
            'roboto': None,
            'arial': None,
            'system-ui': None,
        }
        mapped = mapping.get(name)
        if mapped:
            return mapped
        # 嘗試直接用傳入名稱作為字體檔名
        for d in self.font_dirs:
            candidate = os.path.join(d, font_family)
            if os.path.exists(candidate):
                return font_family
        return None

    def _resolve_font(self, family: Optional[str], size: int) -> ImageFont.ImageFont:
        """綜合映射與系統 fallback 取得字體。"""
        filename = self._map_font_family(family)
        if filename:
            try:
                for d in self.font_dirs:
                    path = os.path.join(d, filename)
                    if os.path.exists(path):
                        return ImageFont.truetype(path, size)
            except Exception:
                pass
        return self.get_font(None, size)

    def _place_anchor(self, img_w: int, img_h: int, box_w: int, box_h: int, position: str, padding: int,
                      custom_x: Optional[float] = None, custom_y: Optional[float] = None) -> tuple[int, int]:
        """根據九宮格位置或百分比自訂位置，回傳方塊左上角座標。"""
        px, py = padding, padding
        pos = (position or 'center').lower()
        if pos == 'custom' and isinstance(custom_x, (int, float)) and isinstance(custom_y, (int, float)):
            # 百分比 → 中心對齊轉左上
            cx = max(0, min(100, float(custom_x))) / 100.0 * img_w
            cy = max(0, min(100, float(custom_y))) / 100.0 * img_h
            return int(cx - box_w / 2), int(cy - box_h / 2)

        # 預設九宮格
        left = padding
        right = img_w - padding - box_w
        top = padding
        bottom = img_h - padding - box_h
        center_x = (img_w - box_w) // 2
        center_y = (img_h - box_h) // 2

        grid = {
            'top-left': (left, top),
            'top-center': (center_x, top),
            'top-right': (right, top),
            'middle-left': (left, center_y),
            'center': (center_x, center_y),
            'middle-right': (right, center_y),
            'bottom-left': (left, bottom),
            'bottom-center': (center_x, bottom),
            'bottom-right': (right, bottom),
        }
        return grid.get(pos, grid['center'])

    def _draw_logo(self, base: Image.Image, logo_path: Optional[str], size: int, opacity: float,
                   position: str, padding: int, custom_x: Optional[float], custom_y: Optional[float]) -> None:
        if not logo_path:
            return
        logo_img: Optional[Image.Image] = None
        try:
            path = logo_path
            # 1) data URL
            if isinstance(path, str) and path.startswith('data:') and ';base64,' in path:
                import base64
                header, b64 = path.split(',', 1)
                raw = base64.b64decode(b64)
                logo_img = Image.open(BytesIO(raw)).convert('RGBA')
            # 2) http(s) URL（盡力下載，超時就放棄）
            elif isinstance(path, str) and (path.startswith('http://') or path.startswith('https://')):
                try:
                    import requests
                    resp = requests.get(path, timeout=3)
                    if resp.ok:
                        logo_img = Image.open(BytesIO(resp.content)).convert('RGBA')
                    else:
                        logger.warning(f"下載 Logo 失敗: {resp.status_code} {path}")
                except Exception as e:
                    logger.warning(f"下載 Logo 例外: {e}")
            # 3) 以 "/" 開頭 → 轉為專案相對路徑
            if logo_img is None and isinstance(path, str) and path.startswith('/'):
                local = path.lstrip('/')
                if os.path.exists(local):
                    logo_img = Image.open(local).convert('RGBA')
            # 4) 直接視為檔案路徑
            if logo_img is None and isinstance(path, str) and os.path.exists(path):
                logo_img = Image.open(path).convert('RGBA')

            if logo_img is None:
                logger.warning(f"Logo 無法載入: {logo_path}")
                return

            logo = logo_img
            logo = logo.resize((size, size))
            # 透明度
            alpha = logo.split()[3]
            alpha = alpha.point(lambda p: int(p * max(0, min(1, opacity))))
            logo.putalpha(alpha)

            box_w = size
            box_h = size
            x, y = self._place_anchor(base.width, base.height, box_w, box_h, position, padding, custom_x, custom_y)
            # 貼上
            base_alpha = base.convert('RGBA')
            base_alpha.paste(logo, (x, y), logo)
            base.paste(base_alpha, (0, 0))
        except Exception as e:
            logger.warning(f"繪製 Logo 失敗: {e}")

    def _draw_text_block(self, draw: ImageDraw.ImageDraw, text_lines: list[str], font: ImageFont.ImageFont,
                          color: str, box: tuple[int, int, int, int], align: str, line_spacing: int) -> None:
        x0, y0, w, h = box
        # 計算每行高度
        bbox = font.getbbox("測試Ag")
        actual_h = bbox[3] - bbox[1]
        line_h = actual_h + line_spacing
        total_h = len(text_lines) * line_h - line_spacing
        # 垂直置中於方塊
        start_y = y0 + (h - total_h) // 2
        for line in text_lines:
            tb = draw.textbbox((0, 0), line, font=font)
            lw = tb[2] - tb[0]
            if align == 'left':
                x = x0
            elif align == 'right':
                x = x0 + (w - lw)
            else:
                x = x0 + (w - lw) // 2
            draw.text((x, start_y), line, fill=color, font=font)
            start_y += line_h

    def _load_image(self, source: str) -> Optional[Image.Image]:
        """嘗試用多種來源載入圖片：data URL, http(s), 本機路徑, 以 / 開頭相對路徑。"""
        try:
            if not source:
                return None
            if source.startswith('data:') and ';base64,' in source:
                import base64
                header, b64 = source.split(',', 1)
                raw = base64.b64decode(b64)
                return Image.open(BytesIO(raw)).convert('RGBA')
            if source.startswith('http://') or source.startswith('https://'):
                try:
                    import requests
                    resp = requests.get(source, timeout=5)
                    if resp.ok:
                        return Image.open(BytesIO(resp.content)).convert('RGBA')
                except Exception:
                    return None
            # 以 / 開頭轉為相對專案路徑
            path = source
            if path.startswith('/'):
                local = path.lstrip('/')
                if os.path.exists(local):
                    path = local
            if os.path.exists(path):
                return Image.open(path).convert('RGBA')
        except Exception:
            return None
        return None

    def _draw_photo_grid(self, base: Image.Image, image_urls: list[str], square_size: int, border_radius: int, padding: int,
                         anchor_percent: Optional[Dict[str, float]] = None) -> None:
        """在畫布中央繪製 1~4 張圖片的方格：
        - 1: 中央單格
        - 2: 左右並排
        - 3: 左一張、右上/右下兩張
        - 4: 2x2 方格
        """
        urls = [u for u in (image_urls or []) if isinstance(u, str) and u.strip()]
        if not urls:
            return
        urls = urls[:4]
        gap = max(8, int(square_size * 0.06))

        def group_dims(n: int) -> tuple[int, int]:
            if n == 1:
                return square_size, square_size
            if n == 2:
                return 2 * square_size + gap, square_size
            if n == 3:
                return 2 * square_size + gap, 2 * square_size + gap
            return 2 * square_size + gap, 2 * square_size + gap

        gw, gh = group_dims(len(urls))
        # 放置整個群組：預設置中；如有 anchor 百分比，使用其作為左上角
        if anchor_percent and 'x' in anchor_percent and 'y' in anchor_percent:
            ax = max(0.0, min(100.0, float(anchor_percent['x']))) / 100.0
            ay = max(0.0, min(100.0, float(anchor_percent['y']))) / 100.0
            x0 = int(ax * base.width)
            y0 = int(ay * base.height)
            # 限制不超出畫布
            x0 = max(0, min(base.width - gw, x0))
            y0 = max(0, min(base.height - gh, y0))
        else:
            x0 = (base.width - gw) // 2
            y0 = (base.height - gh) // 2

        # 預先建立遮罩（圓角）
        mask = Image.new('L', (square_size, square_size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle([0, 0, square_size, square_size], radius=border_radius, fill=255)

        def paste_img(img: Image.Image, cx: int, cy: int):
            # 將圖片以 cover 方式裁切縮放到 square_size
            iw, ih = img.size
            scale = max(square_size / iw, square_size / ih)
            rw, rh = int(iw * scale), int(ih * scale)
            img_resized = img.resize((rw, rh))
            # 中心裁切
            left = (rw - square_size) // 2
            top = (rh - square_size) // 2
            tile = img_resized.crop((left, top, left + square_size, top + square_size))
            base.paste(tile.convert('RGB'), (cx, cy), mask)

        # 計算每一格的位置並貼上
        positions: list[tuple[int, int]] = []
        n = len(urls)
        if n == 1:
            positions = [(x0, y0)]
        elif n == 2:
            positions = [(x0, y0), (x0 + square_size + gap, y0)]
        elif n == 3:
            # 左一張置中，右上/右下
            left_y = y0 + (gh - square_size) // 2
            positions = [
                (x0, left_y),
                (x0 + square_size + gap, y0),
                (x0 + square_size + gap, y0 + square_size + gap)
            ]
        else:
            # 2x2 方格
            positions = [
                (x0, y0),
                (x0 + square_size + gap, y0),
                (x0, y0 + square_size + gap),
                (x0 + square_size + gap, y0 + square_size + gap)
            ]

        for i, pos in enumerate(positions):
            src = self._load_image(urls[i])
            if src is None:
                # 失敗則略過
                continue
            paste_img(src, pos[0], pos[1])

    def _parse_datetime(self, value: object) -> datetime:
        """將各種輸入轉為 datetime（盡量容錯）。"""
        if isinstance(value, datetime):
            return value
        if value is None:
            return datetime.now(timezone.utc)
        try:
            s = str(value)
            # 處理結尾 Z
            if s.endswith('Z'):
                s = s.replace('Z', '+00:00')
            return datetime.fromisoformat(s)
        except Exception:
            try:
                # Unix timestamp（秒）
                return datetime.fromtimestamp(float(value), tz=timezone.utc)
            except Exception:
                return datetime.now(timezone.utc)

    def _convert_human_format_to_strftime(self, fmt: str) -> str:
        """將常見格式字串（如 YYYY-MM-DD HH:mm）轉為 Python strftime 格式。"""
        mapping = {
            'YYYY': '%Y',
            'MM': '%m',
            'DD': '%d',
            'HH': '%H',  # 24h
            'hh': '%I',  # 12h
            'mm': '%M',
            'ss': '%S',
        }
        out = fmt
        for k, v in mapping.items():
            out = out.replace(k, v)
        return out

    def _format_timestamp(self, created_at: object, fmt: Optional[str]) -> str:
        """根據格式輸出時間：
        - None 或 'relative'：輸出相對時間（剛剛/分鐘/小時/天）
        - 'absolute'：預設 '%Y-%m-%d %H:%M'
        - 其他：支援 'YYYY-MM-DD HH:mm'、'MM-DD' 等人類可讀格式
        若 fmt 含 '%'，直接視為 strftime 格式。
        """
        dt = self._parse_datetime(created_at)
        # 相對時間
        if not fmt or fmt.lower() == 'relative':
            now = datetime.now(dt.tzinfo or timezone.utc)
            delta = now - dt
            secs = int(delta.total_seconds())
            if secs < 60:
                return '剛剛'
            mins = secs // 60
            if mins < 60:
                return f'{mins}分鐘前'
            hours = mins // 60
            if hours < 24:
                return f'{hours}小時前'
            days = hours // 24
            return f'{days}天前'

        # 絕對時間（預設格式）
        if fmt.lower() == 'absolute':
            return dt.strftime('%Y-%m-%d %H:%M')

        # 自訂格式
        pyfmt = fmt if '%' in fmt else self._convert_human_format_to_strftime(fmt)
        try:
            return dt.strftime(pyfmt)
        except Exception:
            return dt.strftime('%Y-%m-%d %H:%M')

    def render_instagram_post(
        self,
        *,
        content: Dict[str, Any],
        config: Dict[str, Any],
        quality: int = 92,
    ) -> BytesIO:
        """依據模板設定，使用 Pillow 直接渲染 IG 預覽圖片。
        支援：畫布尺寸/顏色、文字樣式與位置、Logo、Meta（時間/ID）。
        """
        # 基本設定
        width = int(config.get('width') or self.default_width)
        height = int(config.get('height') or self.default_height)
        bg = config.get('background_color', '#ffffff')
        primary = config.get('primary_color', '#333333')
        metadata_color = config.get('metadata_color', '#666666')
        padding = int(config.get('padding', 60))
        line_height = float(config.get('line_height', 1.5))

        # 建立底圖
        img = Image.new('RGB', (width, height), bg)
        draw = ImageDraw.Draw(img)

        # 字體
        title_size = int(config.get('font_size_title', 36))
        content_size = int(config.get('font_size_content', 28))
        meta_size = int(config.get('metadata_size', int(config.get('font_size_meta', 12))))
        family = config.get('font_family')
        title_font = self._resolve_font(family, title_size)
        content_font = self._resolve_font(family, content_size)
        meta_font = self._resolve_font(family, meta_size)

        # 照片方格（合併到貼文模板）
        image_urls = config.get('image_urls') or []
        photo_square_size = int(config.get('photo_square_size', max(120, int(min(width, height) * 0.35))))
        photo_border_radius = int(config.get('photo_border_radius', 12))
        with_photo_stacked = bool(config.get('with_photo_stacked', True))
        img_anchor = {'x': float(config.get('image_pos_x', 10)), 'y': float(config.get('image_pos_y', 55))}

        if isinstance(image_urls, list) and len(image_urls) > 0:
            try:
                self._draw_photo_grid(img, image_urls, photo_square_size, photo_border_radius, padding,
                                      anchor_percent=img_anchor if with_photo_stacked else None)
            except Exception as e:
                logger.warning(f"繪製相片方格失敗：{e}")

        # 文字內容
        title = str(content.get('title') or '').strip()
        text = str(content.get('text') or '').strip()
        # 換行與限制參數
        has_images = isinstance(image_urls, list) and len(image_urls) > 0
        if has_images:
            max_cpl = int(config.get('text_max_chars_per_line_with_photo', 24))
            max_lines = int(config.get('text_max_lines_with_photo', 6))
        else:
            max_cpl = int(config.get('text_max_chars_per_line_text_only', 30))
            max_lines = int(config.get('text_max_lines_text_only', 8))

        # 換行計算寬度（保守使用整體內距）
        box_w = max(10, width - padding * 2)
        # 先將標題與內文各自換行，然後合併
        title_lines = self._wrap_text(title, title_font, box_w) if title else []
        text_lines = self._wrap_text(text, content_font, box_w) if text else []
        lines: List[tuple[str, ImageFont.ImageFont]] = []
        for ln in title_lines:
            lines.append((ln, title_font))
        if title_lines and text_lines:
            lines.append(("", content_font))  # 空行分隔
        for ln in text_lines:
            lines.append((ln, content_font))

        # 限制每行字數
        def clamp_line(txt: str, limit: int) -> str:
            return txt if len(txt) <= limit else txt[:limit]

        tmp_lines: List[tuple[str, ImageFont.ImageFont]] = []
        for ln in title_lines:
            tmp_lines.append((clamp_line(ln, max_cpl), title_font))
        if title_lines and text_lines:
            tmp_lines.append(("", content_font))
        for ln in text_lines:
            tmp_lines.append((clamp_line(ln, max_cpl), content_font))

        # 限制最大行數
        if max_lines > 0 and len(tmp_lines) > max_lines:
            tmp_lines = tmp_lines[:max_lines]
            # 對最後一行添加省略（簡化：直接追加…）
            last_txt, last_font = tmp_lines[-1]
            if not last_txt.endswith('…'):
                if len(last_txt) >= 1:
                    last_txt = last_txt[:-1] + '…'
                else:
                    last_txt = '…'
            tmp_lines[-1] = (last_txt, last_font)

        lines = tmp_lines

        # 計算整塊文字高度
        def font_line_h(f: ImageFont.ImageFont) -> int:
            bb = f.getbbox("測試Ag")
            return int((bb[3] - bb[1]) * line_height)

        total_h = 0
        per_line_h: List[int] = []
        for _, f in lines:
            lh = font_line_h(f)
            per_line_h.append(lh)
            total_h += lh
        if lines:
            total_h -= int(per_line_h[-1] - (per_line_h[-1] / line_height))  # 近似移除最後一行的額外行距

        # 文字區塊位置：有照片時採用上下排列與自訂座標（不疊加）
        align = (config.get('text_align', 'center') or 'center').lower()
        if has_images and with_photo_stacked:
            tx = float(config.get('text_pos_x', 10))
            ty = float(config.get('text_pos_y', 15))
            x0 = max(0, min(width - box_w, int(tx / 100.0 * width)))
            y0 = max(0, min(height - total_h, int(ty / 100.0 * height)))
        else:
            # 沒有照片時置中（或未指定堆疊）
            x0, y0 = self._place_anchor(width, height, box_w, total_h, 'center', padding, None, None)

        # 繪製每行（在 box_w 寬度範圍內對齊）
        y = y0
        for (ln, f), lh in zip(lines, per_line_h):
            tb = draw.textbbox((0, 0), ln, font=f)
            lw = tb[2] - tb[0]
            if align == 'left':
                x = x0
            elif align == 'right':
                x = x0 + (box_w - lw)
            else:
                x = x0 + (box_w - lw) // 2
            draw.text((x, y), ln, fill=primary, font=f)
            y += lh

        # 繪製 Meta：時間與貼文 ID
        show_ts = bool(config.get('show_timestamp', False))
        show_id = bool(config.get('show_post_id', False))
        ts_pos = config.get('timestamp_position', 'bottom-left')
        id_pos = config.get('post_id_position', 'bottom-right')
        post_id_fmt = str(config.get('post_id_format', '#{id}'))

        meta_items: List[tuple[str, str]] = []  # (text, position)
        if show_ts:
            ts_raw = content.get('created_at') or content.get('time')
            # 支援兩種鍵名（timestamp_format / timestampFormat）
            fmt_cfg = config.get('timestamp_format')
            if fmt_cfg is None:
                fmt_cfg = config.get('timestampFormat')
            ts_text = self._format_timestamp(ts_raw, str(fmt_cfg or 'relative'))
            meta_items.append((ts_text, ts_pos))
        if show_id and content.get('id'):
            meta_items.append((post_id_fmt.replace('{id}', str(content.get('id'))), id_pos))

        for text_value, pos in meta_items:
            tb = draw.textbbox((0, 0), text_value, font=meta_font)
            tw = tb[2] - tb[0]
            th = tb[3] - tb[1]
            mx, my = self._place_anchor(width, height, tw, th, pos or 'bottom-left', padding, None, None)
            draw.text((mx, my), text_value, fill=metadata_color, font=meta_font)

        # Logo
        if bool(config.get('logo_enabled', False)):
            self._draw_logo(
                img,
                config.get('logo_url') or '',
                int(config.get('logo_size', 80)),
                float(config.get('logo_opacity', 0.85)),
                str(config.get('logo_position', 'bottom-right')),
                padding,
                config.get('logo_custom_x'),
                config.get('logo_custom_y'),
            )

        # 輸出
        out = BytesIO()
        img.save(out, format='JPEG', quality=quality)
        out.seek(0)
        return out


# 全域實例
_pillow_renderer_instance = None

def get_pillow_renderer() -> PillowRenderer:
    """獲取全域 Pillow 渲染器實例"""
    global _pillow_renderer_instance
    if _pillow_renderer_instance is None:
        _pillow_renderer_instance = PillowRenderer()
    return _pillow_renderer_instance
