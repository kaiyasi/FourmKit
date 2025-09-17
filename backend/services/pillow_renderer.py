"""
基於 Pillow 的圖片渲染服務
替代 Playwright 實現輕量級的文字和圖片渲染
"""
from __future__ import annotations
from typing import Optional, Dict, Any, List
from io import BytesIO
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


# 全域實例
_pillow_renderer_instance = None

def get_pillow_renderer() -> PillowRenderer:
    """獲取全域 Pillow 渲染器實例"""
    global _pillow_renderer_instance
    if _pillow_renderer_instance is None:
        _pillow_renderer_instance = PillowRenderer()
    return _pillow_renderer_instance
