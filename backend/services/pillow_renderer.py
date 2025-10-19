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
import re  # 新增：用於 Markdown 清理
from PIL import Image, ImageDraw, ImageFont
import textwrap

logger = logging.getLogger(__name__)


class PillowRenderError(Exception):
    pass


class PillowRenderer:
    def __init__(
        self,
        *,
        default_width: int = None,
        default_height: int = None,
        default_font_size: int = None,
        default_font_path: Optional[str] = None,
    ) -> None:
        # 移除硬編碼預設值，所有配置必須來自資料庫模板
        self.default_width = default_width  # 將由模板配置提供
        self.default_height = default_height  # 將由模板配置提供
        self.default_font_size = default_font_size  # 將由模板配置提供
        self.default_font_path = default_font_path
        
        # 字體目錄 - 支援多個路徑，按優先級排序
        self.font_dirs = [
            "/mnt/data_pool_b/kaiyasi/ForumKit/data/fonts",  # 實際字體目錄（最高優先級）
            os.path.join("/app", "data", "fonts"),  # 主要字體目錄（對應容器掛載）
            os.path.join(os.getcwd(), "assets", "fonts"),
            os.path.join(os.getcwd(), "backend", "assets", "fonts"),
            os.path.join("/data", "fonts")          # 備用路徑
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
        """
        獲取字體對象 - 支援檔案名和font_family查詢，增強錯誤處理

        Args:
            font_name: 字體檔案名稱或font_family名稱
            size: 字體大小

        Returns:
            ImageFont.ImageFont: 字體對象

        Raises:
            PillowRenderError: 當字體載入失敗時拋出錯誤
        """
        if size is None:
            if self.default_font_size is None:
                raise PillowRenderError("字體大小必須由模板配置提供，不可使用硬編碼預設值")
            size = self.default_font_size

        # 如果指定了字體名稱，先嘗試檔案系統查詢（優先級更高）
        if font_name:
            logger.info(f"[DEBUG] 嘗試載入指定字體: {font_name}")

            # 1. 首先嘗試直接檔案名匹配
            possible_names = [
                font_name,
                f"{font_name}.ttf",
                f"{font_name}.otf",
                f"{font_name}.ttc"
            ]

            # 2. 如果是 "Noto Sans TC" 或類似，嘗試對應的檔案名
            if "Noto Sans TC" in font_name:
                possible_names.extend([
                    "NotoSansTC-Medium.ttf",
                    "NotoSansTC-Regular.ttf",
                    "NotoSansTC-Bold.ttf"
                ])

            for font_dir in self.font_dirs:
                for name in possible_names:
                    font_path = os.path.join(font_dir, name)
                    if os.path.exists(font_path):
                        try:
                            font = ImageFont.truetype(font_path, size)
                            logger.info(f"[DEBUG] 成功從檔案系統載入字體: {font_path}")
                            return font
                        except Exception as e:
                            logger.warning(f"[DEBUG] 字體載入失敗 {font_path}: {e}")
                            continue

            # 3. 如果檔案系統找不到，記錄警告
            logger.warning(f"[DEBUG] 在檔案系統中找不到字體: {font_name}，嘗試使用預設字體")

        # 嘗試使用平台主要字體 NotoSansTC-Medium.ttf
        for font_dir in self.font_dirs:
            noto_path = os.path.join(font_dir, "NotoSansTC-Medium.ttf")
            if os.path.exists(noto_path):
                try:
                    font = ImageFont.truetype(noto_path, size)
                    logger.info(f"[DEBUG] 使用平台主要字體: {noto_path}")
                    return font
                except Exception as e:
                    logger.error(f"[DEBUG] 平台主要字體載入失敗: {e}")

        # 如果有自定義預設字體路徑，嘗試使用
        if self.default_font_path and os.path.exists(self.default_font_path):
            try:
                font = ImageFont.truetype(self.default_font_path, size)
                logger.info(f"[DEBUG] 使用自定義預設字體: {self.default_font_path}")
                return font
            except Exception as e:
                logger.error(f"[DEBUG] 自定義預設字體載入失敗: {e}")

        # 最後回退到系統字體
        logger.warning("嘗試使用系統字體作為最後回退")
        system_fonts = [
            '/System/Library/Fonts/PingFang.ttc',  # macOS
            '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',  # Linux
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',  # Linux fallback
            '/Windows/Fonts/msyh.ttc',  # Windows
            '/Windows/Fonts/simhei.ttf',  # Windows fallback
        ]

        for system_font in system_fonts:
            if os.path.exists(system_font):
                try:
                    font = ImageFont.truetype(system_font, size)
                    logger.info(f"使用系統字體: {system_font}")
                    return font
                except Exception as e:
                    logger.warning(f"系統字體載入失敗 {system_font}: {e}")
                    continue

        # 最後的最後，使用 Pillow 預設字體
        logger.warning("使用 Pillow 預設字體")
        try:
            return ImageFont.load_default()
        except Exception as e:
            logger.error(f"預設字體載入失敗: {e}")
            raise PillowRenderError(f"所有字體載入失敗，包括預設字體: {str(e)}")
    
    def render_text_card(
        self,
        content: str,
        *,
        width: int,
        height: int,
        background_color: str,
        text_color: str,
        font_name: Optional[str] = None,
        font_size: int,
        padding: int,
        line_spacing: int,
        # 新增：排版與輸出控制 - 移除預設值，強制使用模板配置
        text_align: str,           # left | center | right
        vertical_align: str,       # top | middle | bottom
        max_lines: int,       # 最大行數（超出將截斷）
        max_chars_per_line: Optional[int] = None,  # 每行最大字數
        ellipsis: bool = True,                 # 截斷時是否加上 …
        # 文字截斷浮水印
        apply_watermark_on_truncation: bool = False,
        watermark_text: str = "",
        watermark_font_name: Optional[str] = None,
        watermark_font_size: int,
        watermark_color: str,
        watermark_position: Optional[object] = None,  # str 位置名 或 {x:int,y:int}
        image_format: str = "JPEG",
        quality: int = 92,
    ) -> BytesIO:
        """渲染文字卡片為圖片"""
        try:
            # 驗證必要參數 - 不提供預設值
            if not width or not height or not font_size:
                raise ValueError("width, height, font_size 必須由模板配置提供，不可為空或使用預設值")

            logger.info(f"[DEBUG] render_text_card 開始，尺寸: {width}x{height}，字體大小: {font_size}")
            logger.info(f"[DEBUG] 內容長度: {len(content)} 字符")
            logger.info(f"[DEBUG] 文字排版參數: max_chars_per_line={max_chars_per_line}, max_lines={max_lines}")
            logger.info(f"[DEBUG] 對齊方式: text_align={text_align}, vertical_align={vertical_align}")

            # 檢查內容是否為空
            if not content or not content.strip():
                raise ValueError("內容不可為空，必須提供有效內容")
            
            # 創建圖片
            img = Image.new("RGB", (width, height), background_color)
            draw = ImageDraw.Draw(img)
            
            # 獲取字體
            logger.info(f"[DEBUG] 嘗試載入字體: {font_name}")
            font = self.get_font(font_name, font_size)
            logger.info(f"[DEBUG] 字體載入成功")
            
            # 計算文字區域
            text_width = width - (padding * 2)
            text_height = height - (padding * 2)
            
            # 簡化：直接按字符數分行，不提供預設值
            lines: List[str] = []
            was_truncated = False

            # 檢查 max_chars_per_line 參數
            if not isinstance(max_chars_per_line, int) or max_chars_per_line <= 0:
                # 向後相容：為舊的自動發文系統提供預設值
                max_chars_per_line = 30  # 預設每行30字
                logger.warning(f"[向後相容] 使用預設每行字數: {max_chars_per_line}")
                logger.warning("建議更新模板配置，添加 textLayout 字段以獲得更好的控制")

            logger.info(f"[DEBUG] 使用字符數分行: 每行{max_chars_per_line}字")

            # 移除換行符，將所有內容連成一行
            clean_content = content.replace('\n', ' ').replace('\r', ' ')

            # 按字符數切割
            current_pos = 0
            while current_pos < len(clean_content):
                end_pos = current_pos + max_chars_per_line
                line = clean_content[current_pos:end_pos]
                lines.append(line)
                current_pos = end_pos

            logger.info(f"[DEBUG] 按字符數分行完成，共{len(lines)}行")

            # 最大行數限制（若有設定）
            if isinstance(max_lines, int) and max_lines > 0 and len(lines) > max_lines:
                was_truncated = True or was_truncated
                # 檢查總字數是否超過上限 (max_lines * max_chars_per_line)
                total_chars_limit = max_lines * max_chars_per_line
                total_chars = len(clean_content)

                if total_chars > total_chars_limit:
                    # 總字數超過上限，截取前 max_lines 行，並在新的一行加上提示
                    lines = lines[:max_lines]
                    lines.append("⁕詳見平台原文⁕")
                    logger.info(f"[DEBUG] 總字數({total_chars})超過上限({total_chars_limit})，添加詳見提示")
                else:
                    # 總字數未超過，但行數超過，使用舊的省略號邏輯
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
                    logger.info(f"[DEBUG] 行數超過但總字數未超過，使用省略號")
            
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
                logger.info(f"[DEBUG] 圖片已保存為 PNG 格式")
            else:
                img.save(buf, format="JPEG", quality=quality)
                logger.info(f"[DEBUG] 圖片已保存為 JPEG 格式，品質: {quality}")

            buf.seek(0, 2)  # 移動到結尾檢查大小
            buffer_size = buf.tell()
            buf.seek(0)  # 重置到開頭

            logger.info(f"[DEBUG] render_text_card 完成，buffer 大小: {buffer_size} bytes")

            if buffer_size == 0:
                raise PillowRenderError("生成的圖片 buffer 為空")

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
        """綜合映射與系統 fallback 取得字體 - 使用統一的字體載入邏輯"""
        # 直接使用統一的 get_font 方法，支援 font_family 和檔案名查詢
        return self.get_font(family, size)

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

    def _clean_markdown(self, text: str) -> str:
        """清理 HTML 標籤和 Markdown 符號，移除所有格式化標記"""
        if not text:
            return ""

        text = str(text)

        # 修復：先移除 HTML 標籤，再處理 Markdown
        # 1. 移除 HTML 標籤
        text = re.sub(r'<[^>]+>', '', text)

        # 2. HTML 實體解碼
        from html import unescape
        text = unescape(text)

        # 3. 移除 Markdown 符號
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
        # 移除代碼區塊 ```code``` -> code
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
            # 修復：確保返回的 datetime 有時區資訊
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value
        if value is None:
            return datetime.now(timezone.utc)
        try:
            s = str(value)
            # 處理結尾 Z
            if s.endswith('Z'):
                s = s.replace('Z', '+00:00')
            dt = datetime.fromisoformat(s)
            # 確保有時區資訊
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
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
        # 相對時間 - 修復時區問題
        if not fmt or fmt.lower() == 'relative':
            # 確保兩個時間都有相同的時區資訊
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            now = datetime.now(dt.tzinfo)
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
        # 修復：確保 content 和 config 不為空，提供預設值
        content = content or {}
        config = config or {}

        # 基本設定
        width = int(config.get('width') or self.default_width)
        height = int(config.get('height') or self.default_height)
        # 移除預設值，強制使用模板配置
        if 'background_color' not in config:
            raise ValueError("模板配置缺少 background_color")
        if 'primary_color' not in config:
            raise ValueError("模板配置缺少 primary_color")
        if 'padding' not in config:
            raise ValueError("模板配置缺少 padding")
        if 'line_height' not in config:
            raise ValueError("模板配置缺少 line_height")

        bg = config['background_color']
        primary = config['primary_color']
        padding = int(config['padding'])
        line_height = float(config['line_height'])

        # 修復：記錄調試訊息
        logger.info(f"[Pillow渲染] 開始渲染，尺寸: {width}x{height}, 內容: {content.keys() if content else 'None'}, 配置: {list(config.keys()) if config else 'None'}")

        # 建立底圖
        img = Image.new('RGB', (width, height), bg)
        draw = ImageDraw.Draw(img)

        # 字體 - 移除預設值，強制使用模板配置
        if 'font_size_title' not in config:
            raise ValueError("模板配置缺少 font_size_title")
        if 'font_size_content' not in config:
            raise ValueError("模板配置缺少 font_size_content")

        title_size = int(config['font_size_title'])
        content_size = int(config['font_size_content'])
        family = config.get('font_family')

        # 修復：安全地載入字體，並記錄過程
        logger.info(f"[Pillow渲染] 載入字體：family={family}, title_size={title_size}, content_size={content_size}")
        try:
            title_font = self._resolve_font(family, title_size)
            logger.info(f"[Pillow渲染] 標題字體載入成功")
        except Exception as e:
            logger.warning(f"[Pillow渲染] 標題字體載入失敗，使用預設字體: {e}")
            title_font = ImageFont.load_default()

        try:
            content_font = self._resolve_font(family, content_size)
            logger.info(f"[Pillow渲染] 內容字體載入成功")
        except Exception as e:
            logger.warning(f"[Pillow渲染] 內容字體載入失敗，使用預設字體: {e}")
            content_font = ImageFont.load_default()

        # 照片方格（合併到貼文模板）
        image_urls = config.get('image_urls') or []
        # 照片配置 - 移除硬編碼預設值
        if 'photo_square_size' not in config:
            raise ValueError("模板配置缺少 photo_square_size")
        if 'photo_border_radius' not in config:
            raise ValueError("模板配置缺少 photo_border_radius")
        if 'with_photo_stacked' not in config:
            raise ValueError("模板配置缺少 with_photo_stacked")
        if 'image_pos_x' not in config:
            raise ValueError("模板配置缺少 image_pos_x")
        if 'image_pos_y' not in config:
            raise ValueError("模板配置缺少 image_pos_y")

        photo_square_size = int(config['photo_square_size'])
        photo_border_radius = int(config['photo_border_radius'])
        with_photo_stacked = bool(config['with_photo_stacked'])
        img_anchor = {'x': float(config['image_pos_x']), 'y': float(config['image_pos_y'])}

        if isinstance(image_urls, list) and len(image_urls) > 0:
            try:
                self._draw_photo_grid(img, image_urls, photo_square_size, photo_border_radius, padding,
                                      anchor_percent=img_anchor if with_photo_stacked else None)
            except Exception as e:
                logger.warning(f"繪製相片方格失敗：{e}")

        # 文字內容 - 修復：加入 Markdown 清理
        title = str(content.get('title') or '').strip()
        text = str(content.get('text') or '').strip()

        # 清理 Markdown 符號
        title = self._clean_markdown(title)
        text = self._clean_markdown(text)
        # 換行與限制參數
        has_images = isinstance(image_urls, list) and len(image_urls) > 0
        if has_images:
            if 'text_max_chars_per_line_with_photo' not in config:
                raise ValueError("模板配置缺少 text_max_chars_per_line_with_photo")
            if 'text_max_lines_with_photo' not in config:
                raise ValueError("模板配置缺少 text_max_lines_with_photo")
            max_cpl = int(config['text_max_chars_per_line_with_photo'])
            max_lines = int(config['text_max_lines_with_photo'])
        else:
            if 'text_max_chars_per_line_text_only' not in config:
                raise ValueError("模板配置缺少 text_max_chars_per_line_text_only")
            if 'text_max_lines_text_only' not in config:
                raise ValueError("模板配置缺少 text_max_lines_text_only")
            max_cpl = int(config['text_max_chars_per_line_text_only'])
            max_lines = int(config['text_max_lines_text_only'])

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
        # 文字對齊 - 移除硬編碼預設值
        if 'text_align' not in config:
            raise ValueError("模板配置缺少 text_align")
        align = config['text_align'].lower()
        if has_images and with_photo_stacked:
            if 'text_pos_x' not in config:
                raise ValueError("模板配置缺少 text_pos_x")
            if 'text_pos_y' not in config:
                raise ValueError("模板配置缺少 text_pos_y")
            tx = float(config['text_pos_x'])
            ty = float(config['text_pos_y'])
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
        # 時間戳
        # 時間戳 - 移除硬編碼預設值
        if 'show_timestamp' not in config:
            raise ValueError("模板配置缺少 show_timestamp")

        if bool(config['show_timestamp']):
            if 'timestamp_position' not in config:
                raise ValueError("模板配置缺少 timestamp_position")
            if 'timestamp_format' not in config:
                raise ValueError("模板配置缺少 timestamp_format")
            if 'timestamp_font' not in config:
                raise ValueError("模板配置缺少 timestamp_font")
            if 'timestamp_size' not in config:
                raise ValueError("模板配置缺少 timestamp_size")

            ts_pos = config['timestamp_position']
            ts_raw = content.get('created_at') or content.get('time')
            ts_text = self._format_timestamp(ts_raw, str(config['timestamp_format']))

            ts_family = config['timestamp_font']
            ts_size = int(config['timestamp_size'])
            if 'timestamp_color' not in config:
                raise ValueError("模板配置缺少 timestamp_color")
            ts_color = config['timestamp_color']
            ts_font = self._resolve_font(ts_family, ts_size)

            logger.info(f"[Pillow渲染] 渲染時間戳: {ts_text}, 字體大小: {ts_size}, 位置: {ts_pos}")

            tb = draw.textbbox((0, 0), ts_text, font=ts_font)
            tw, th = tb[2] - tb[0], tb[3] - tb[1]
            mx, my = self._place_anchor(width, height, tw, th, ts_pos or 'bottom-left', padding, None, None)
            draw.text((mx, my), ts_text, fill=ts_color, font=ts_font)

        # 貼文 ID
        # 貼文ID - 移除硬編碼預設值
        if 'post_id_enabled' not in config and 'show_post_id' not in config:
            raise ValueError("模板配置缺少 post_id_enabled 或 show_post_id")
        post_id_enabled = bool(config.get('post_id_enabled') or config.get('show_post_id'))
        post_id = content.get('id')
        logger.info(f"[DEBUG] 貼文ID檢查: enabled={post_id_enabled}, post_id={post_id}, config={config.get('post_id_enabled')}")

        if post_id_enabled and post_id:
            if 'post_id_position' not in config:
                raise ValueError("模板配置缺少 post_id_position")
            if 'post_id_format' not in config:
                raise ValueError("模板配置缺少 post_id_format")
            id_pos = config['post_id_position']
            post_id_fmt = str(config['post_id_format'])
            # 支援多種格式：{id}, {ID}, #{id}, #{ID}
            id_text = (post_id_fmt
                      .replace('#{ID}', f'#{post_id}')
                      .replace('#{id}', f'#{post_id}')
                      .replace('{ID}', str(post_id))
                      .replace('{id}', str(post_id)))

            # Post ID-specific font - 修復：增大字體大小使其可見
            if 'post_id_font' not in config:
                raise ValueError("模板配置缺少 post_id_font")
            if 'post_id_size' not in config:
                raise ValueError("模板配置缺少 post_id_size")
            if 'post_id_color' not in config:
                raise ValueError("模板配置缺少 post_id_color")
            id_family = config['post_id_font']
            id_size = int(config['post_id_size'])
            id_color = config['post_id_color']
            id_font = self._resolve_font(id_family, id_size)

            logger.info(f"[Pillow渲染] 開始渲染貼文ID: {id_text}, 字體大小: {id_size}, 位置: {id_pos}, 顏色: {id_color}")

            tb = draw.textbbox((0, 0), id_text, font=id_font)
            tw, th = tb[2] - tb[0], tb[3] - tb[1]
            mx, my = self._place_anchor(width, height, tw, th, id_pos or 'bottom-right', padding, None, None)
            logger.info(f"[Pillow渲染] 貼文ID繪製座標: x={mx}, y={my}, 文字='{id_text}', 尺寸={tw}x{th}")
            draw.text((mx, my), id_text, fill=id_color, font=id_font)
            logger.info(f"[Pillow渲染] 貼文ID已繪製完成")

        # Logo - 移除硬編碼預設值
        if 'logo_enabled' not in config:
            raise ValueError("模板配置缺少 logo_enabled")

        if bool(config['logo_enabled']):
            if 'logo_url' not in config:
                raise ValueError("模板配置缺少 logo_url")
            if 'logo_size' not in config:
                raise ValueError("模板配置缺少 logo_size")
            if 'logo_opacity' not in config:
                raise ValueError("模板配置缺少 logo_opacity")
            if 'logo_position' not in config:
                raise ValueError("模板配置缺少 logo_position")

            self._draw_logo(
                img,
                config['logo_url'],
                int(config['logo_size']),
                float(config['logo_opacity']),
                str(config['logo_position']),
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
