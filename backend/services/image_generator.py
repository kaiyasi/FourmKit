# backend/services/image_generator.py
"""
Instagram 貼文圖片生成引擎
支援模板化設計、多種字體、動態內容插入
"""
from typing import Dict, List, Tuple, Optional, Union
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import requests
from io import BytesIO
import json
import re
import textwrap
from datetime import datetime
import os
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

class ImageGenerationError(Exception):
    """圖片生成相關錯誤"""
    pass

class ImageGenerator:
    """Instagram 貼文圖片生成引擎"""
    
    # Instagram 建議尺寸（預設正方形，可由模板覆寫）
    CANVAS_SIZE = (1080, 1080)  # 正方形貼文（1080x1080）
    MAX_CAPTION_LENGTH = 2200   # Instagram 文案限制
    
    def __init__(self, assets_path: str = "assets/"):
        """
        初始化圖片生成器
        
        Args:
            assets_path: 素材資源路徑
        """
        self.assets_path = assets_path
        self.font_cache = {}
        self.image_cache = {}
        
        # 預設字體配置
        self.default_fonts = {
            "chinese": "assets/fonts/NotoSansTC-Regular.otf",
            "english": "assets/fonts/Roboto-Regular.ttf", 
            "fallback": None  # 系統預設字體
        }
        
        # 直接使用 Google Fonts，不預先下載字體
        
        # 確保資料夾存在
        os.makedirs(assets_path, exist_ok=True)
        os.makedirs(os.path.join(assets_path, "fonts"), exist_ok=True)
        os.makedirs(os.path.join(assets_path, "templates"), exist_ok=True)

        # 嘗試確保中文字體可用（最佳努力，不影響啟動）
        try:
            from backend.download_fonts import ensure_fonts_available  # type: ignore
        except Exception:
            try:
                from download_fonts import ensure_fonts_available  # type: ignore
            except Exception:
                ensure_fonts_available = None  # type: ignore
        try:
            font_path = os.path.join(self.assets_path, "fonts", "NotoSansTC-Regular.otf")
            if not os.path.exists(font_path) and ensure_fonts_available:
                ensure_fonts_available()
        except Exception:
            pass
    
    def generate_post_image(
        self,
        template_config: Dict,
        post_content: Dict,
        school_logo_path: Optional[str] = None
    ) -> BytesIO:
        """
        生成 Instagram 貼文圖片
        
        Args:
            template_config: 模板配置
            post_content: 貼文內容
            school_logo_path: 學校 Logo 路徑
            
        Returns:
            BytesIO: 生成的圖片資料流
        """
        try:
            # 允許模板覆寫畫布尺寸（portrait/square/landscape 或自訂寬高）
            original_size = self.CANVAS_SIZE
            try:
                canvas_conf = template_config.get('canvas') or {}
                preset = (canvas_conf.get('preset') or '').strip().lower()
                if preset == 'portrait':
                    self.CANVAS_SIZE = (1080, 1350)
                elif preset == 'landscape':
                    self.CANVAS_SIZE = (1080, 608)  # 約 1.78:1，介於 1.91:1 內
                elif isinstance(canvas_conf.get('width'), int) and isinstance(canvas_conf.get('height'), int):
                    w = max(320, int(canvas_conf.get('width')))
                    h = max(320, int(canvas_conf.get('height')))
                    self.CANVAS_SIZE = (w, h)
            except Exception:
                pass

            # 創建畫布
            canvas = Image.new('RGB', self.CANVAS_SIZE, color='white')
            draw = ImageDraw.Draw(canvas)
            
            # 1. 處理背景
            if template_config.get('background'):
                canvas = self._apply_background(canvas, template_config['background'])
            
            # 2. 添加主要內容
            if template_config.get('content_block'):
                canvas = self._add_content_text(
                    canvas, 
                    template_config['content_block'], 
                    post_content.get('content', '')
                )
            
            # 3. 添加標題 (如果需要的話)
            if template_config.get('title_block') and post_content.get('title'):
                # 暫時跳過標題處理
                pass
            
            # 4. 添加時間戳
            if template_config.get('timestamp', {}).get('enabled', False):
                canvas = self._add_timestamp(
                    canvas,
                    template_config['timestamp'],
                    post_content.get('created_at', datetime.now())
                )
            
            # 5. 添加文章編號 (如果需要的話)
            if template_config.get('post_id', {}).get('enabled', False):
                # 暫時跳過文章編號處理
                pass
            
            # 6. 添加學校 Logo
            if school_logo_path and template_config.get('logo', {}).get('enabled', False):
                canvas = self._add_logo(
                    canvas,
                    template_config['logo'],
                    school_logo_path
                )
            
            # 7. 添加學校標識 (如果需要的話)
            if template_config.get('school_badge', {}).get('enabled', False):
                # 暫時跳過學校標識處理
                pass
            
            # 8. 添加裝飾元素 (如果需要的話)
            if template_config.get('decorations'):
                # 暫時跳過裝飾元素處理
                pass
            
            # 轉換為 BytesIO
            output = BytesIO()
            canvas.save(output, format='JPEG', quality=95, optimize=True)
            output.seek(0)
            
            return output

        except Exception as e:
            logger.error(f"圖片生成失敗: {str(e)}")
            raise ImageGenerationError(f"圖片生成失敗: {str(e)}")
        finally:
            # 還原畫布尺寸避免影響後續呼叫
            self.CANVAS_SIZE = original_size
    
    def _apply_background(self, canvas: Image.Image, bg_config: Dict) -> Image.Image:
        """應用背景設定"""
        bg_type = bg_config.get('type', 'color')
        
        if bg_type == 'color':
            # 純色背景
            color = bg_config.get('color', '#FFFFFF')
            canvas = Image.new('RGB', self.CANVAS_SIZE, color=color)
            
        elif bg_type == 'gradient':
            # 漸層背景
            canvas = self._create_gradient_background(bg_config)
            
        elif bg_type == 'image':
            # 圖片背景
            bg_image_url = bg_config.get('image_url')
            if bg_image_url:
                bg_image = self._load_image(bg_image_url)
                if bg_image:
                    canvas = self._resize_and_crop(bg_image, self.CANVAS_SIZE)
        
        # 應用遮罩
        if bg_config.get('overlay', {}).get('enabled', False):
            overlay = self._create_overlay(bg_config['overlay'])
            canvas = Image.alpha_composite(
                canvas.convert('RGBA'), 
                overlay
            ).convert('RGB')
        
        return canvas
    
    def _add_content_text(
        self, 
        canvas: Image.Image, 
        text_config: Dict, 
        content: str
    ) -> Image.Image:
        """添加主要內容文字"""
        if not content or not text_config.get('enabled', True):
            return canvas
        
        draw = ImageDraw.Draw(canvas)
        
        # 處理內容 (移除 HTML 標籤, 截斷長度)
        clean_content = self._clean_text(content)
        
        # 載入字體
        font = self._get_font(
            text_config.get('font_family', 'chinese'),
            text_config.get('font_size', 32),
            font_url=text_config.get('font_url'),
            font_weight=str(text_config.get('font_weight') or '').strip()
        )
        
        # 計算文字區域
        text_area = self._calculate_text_area(text_config)
        max_width = text_area['width']
        max_height = text_area['height']
        
        # 文字換行處理
        lines = self._wrap_text(clean_content, font, max_width)
        line_height = int(text_config.get('font_size', 32) * 1.2)
        
        # 限制行數（優先使用模板配置的 max_lines）
        configured_max = int(text_config.get('max_lines', 0) or 0)
        max_lines = max_height // line_height
        if configured_max > 0:
            max_lines = min(max_lines, configured_max)
        if len(lines) > max_lines:
            lines = lines[:max_lines]
            if lines:
                lines[-1] = lines[-1][:50] + "..."
        
        # 繪製文字
        y_offset = text_area['y']
        text_color = text_config.get('color', '#000000')
        
        for line in lines:
            # 處理文字對齊
            if text_config.get('align', 'left') == 'center':
                bbox = draw.textbbox((0, 0), line, font=font)
                text_width = bbox[2] - bbox[0]
                x_offset = text_area['x'] + (max_width - text_width) // 2
            elif text_config.get('align', 'left') == 'right':
                bbox = draw.textbbox((0, 0), line, font=font)
                text_width = bbox[2] - bbox[0]
                x_offset = text_area['x'] + max_width - text_width
            else:
                x_offset = text_area['x']
            
            # 添加文字陰影 (可選)
            if text_config.get('shadow', {}).get('enabled', False):
                shadow_config = text_config['shadow']
                shadow_color = shadow_config.get('color', '#808080')
                shadow_offset = shadow_config.get('offset', 2)
                
                draw.text(
                    (x_offset + shadow_offset, y_offset + shadow_offset),
                    line,
                    font=font,
                    fill=shadow_color
                )
            
            # 繪製主文字
            draw.text((x_offset, y_offset), line, font=font, fill=text_color)
            y_offset += line_height
        
        return canvas
    
    def _add_timestamp(
        self,
        canvas: Image.Image,
        timestamp_config: Dict,
        created_at: Union[datetime, str]
    ) -> Image.Image:
        """添加時間戳"""
        if not timestamp_config.get('enabled', False):
            return canvas
        
        # 處理時間格式
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except:
                created_at = datetime.now()
        
        # 格式化時間文字
        time_format = timestamp_config.get('format', '%Y-%m-%d %H:%M')
        time_text = created_at.strftime(time_format)
        
        draw = ImageDraw.Draw(canvas)
        font = self._get_font(
            timestamp_config.get('font_family', 'english'),
            timestamp_config.get('font_size', 16),
            font_url=timestamp_config.get('font_url'),
            font_weight=str(timestamp_config.get('font_weight') or '').strip()
        )
        
        # 計算位置
        position = self._calculate_position(timestamp_config.get('position', {}))
        
        # 繪製時間戳
        draw.text(
            position,
            time_text,
            font=font,
            fill=timestamp_config.get('color', '#666666')
        )
        
        return canvas
    
    def _add_logo(
        self,
        canvas: Image.Image,
        logo_config: Dict,
        logo_path: str
    ) -> Image.Image:
        """添加 Logo"""
        if not logo_config.get('enabled', False) or not logo_path:
            return canvas
        
        try:
            logo_image = self._load_image(logo_path)
            if not logo_image:
                return canvas
            
            # 調整 Logo 尺寸
            logo_size = logo_config.get('size', 80)
            logo_image = logo_image.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
            
            # 應用形狀裁切
            shape = logo_config.get('shape', 'square')
            if shape == 'circle':
                logo_image = self._crop_to_circle(logo_image)
            elif shape == 'rounded':
                radius = logo_config.get('border_radius', 10)
                logo_image = self._crop_to_rounded_rect(logo_image, radius)
            
            # 計算位置
            position = self._calculate_position(logo_config.get('position', {}))
            
            # 處理透明度
            opacity = logo_config.get('opacity', 1.0)
            if opacity < 1.0:
                logo_image = self._apply_opacity(logo_image, opacity)
            
            # 貼上 Logo
            if logo_image.mode == 'RGBA':
                canvas.paste(logo_image, position, logo_image)
            else:
                canvas.paste(logo_image, position)
            
            return canvas
            
        except Exception as e:
            logger.warning(f"Logo 添加失敗: {str(e)}")
            return canvas
    
    def _get_font(self, font_family: str, size: int, *, font_url: Optional[str] = None, font_weight: Optional[str] = None) -> ImageFont.FreeTypeFont:
        """
        獲取字體 - 支援多種字體來源及 fallback 機制

        Args:
            font_family: 字體族群名稱
            size: 字體大小
            font_url: 字體 URL（不再支援）
            font_weight: 字體粗細（不再支援）

        Returns:
            ImageFont.FreeTypeFont: 字體對象

        Raises:
            ImageGenerationError: 當所有字體載入失敗時拋出錯誤
        """
        cache_key = f"{font_family}:{size}"

        if cache_key in self.font_cache:
            return self.font_cache[cache_key]

        # 嘗試多種字體來源
        font_errors = []

        # 1. 首先嘗試平台字體管理系統
        try:
            from utils.db import get_session
            from models.fonts import FontFile

            with get_session() as session:
                # 查找符合 font_family 的字體檔案
                font_file = session.query(FontFile).filter(
                    FontFile.font_family == font_family,
                    FontFile.is_active == True
                ).first()

                if font_file and os.path.exists(font_file.file_path):
                    try:
                        font = ImageFont.truetype(font_file.file_path, size)
                        self.font_cache[cache_key] = font
                        logger.info(f"成功載入平台字體: {font_file.display_name} ({font_file.file_path})")
                        return font
                    except Exception as e:
                        font_errors.append(f"平台字體載入失敗: {font_file.display_name} - {str(e)}")

        except Exception as e:
            font_errors.append(f"平台字體系統查詢失敗: {str(e)}")

        # 2. 嘗試本地字體檔案
        local_fonts = {
            'Noto Sans TC': [
                'assets/fonts/NotoSansTC-Regular.otf',
                'data/fonts/NotoSansTC-Regular.otf',
                'backend/assets/fonts/NotoSansTC-Regular.otf'
            ],
            'chinese': [
                'assets/fonts/NotoSansTC-Regular.otf',
                'data/fonts/NotoSansTC-Regular.otf'
            ]
        }

        if font_family in local_fonts:
            for font_path in local_fonts[font_family]:
                if os.path.exists(font_path):
                    try:
                        font = ImageFont.truetype(font_path, size)
                        self.font_cache[cache_key] = font
                        logger.info(f"成功載入本地字體: {font_path}")
                        return font
                    except Exception as e:
                        font_errors.append(f"本地字體載入失敗: {font_path} - {str(e)}")

        # 3. 嘗試系統字體
        system_fonts = [
            '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
            '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/System/Library/Fonts/Arial.ttf'  # macOS
        ]

        for font_path in system_fonts:
            if os.path.exists(font_path):
                try:
                    font = ImageFont.truetype(font_path, size)
                    self.font_cache[cache_key] = font
                    logger.warning(f"使用系統字體作為 fallback: {font_path}")
                    return font
                except Exception as e:
                    font_errors.append(f"系統字體載入失敗: {font_path} - {str(e)}")

        # 4. 最終 fallback 到預設字體
        try:
            font = ImageFont.load_default()
            self.font_cache[cache_key] = font
            logger.warning(f"使用預設字體作為最終 fallback")
            return font
        except Exception as e:
            font_errors.append(f"預設字體載入失敗: {str(e)}")

        # 所有方法都失敗
        error_msg = f"無法載入字體 {font_family}，所有嘗試都失敗:\n" + "\n".join(font_errors)
        raise ImageGenerationError(error_msg)

    # Google Fonts 相關方法已移除，請使用平台字體管理系統

    
    def _load_image(self, image_path: str) -> Optional[Image.Image]:
        """載入圖片 (支援 URL 和本地路徑)"""
        try:
            if image_path.startswith(('http://', 'https://')):
                # 從 URL 載入
                response = requests.get(image_path, timeout=30)
                response.raise_for_status()
                return Image.open(BytesIO(response.content))
            else:
                # 從本地載入
                # 修正以網站路徑形式提供的 '/uploads/...' → 轉為本地 UPLOAD_ROOT
                if image_path.startswith('/uploads/'):
                    root_dir = os.getenv('UPLOAD_ROOT', 'uploads')
                    local_path = os.path.join(root_dir, image_path[len('/uploads/'):])
                    if os.path.exists(local_path):
                        return Image.open(local_path)
                if os.path.exists(image_path):
                    return Image.open(image_path)
                return None
                
        except Exception as e:
            logger.error(f"圖片載入失敗 {image_path}: {e}")
            return None
    
    def _clean_text(self, text: str) -> str:
        """清理文字內容"""
        # 移除 HTML 標籤
        text = re.sub(r'<[^>]+>', '', text)
        
        # 移除多餘空白
        text = re.sub(r'\s+', ' ', text).strip()
        
        # 限制長度
        if len(text) > 500:
            text = text[:497] + "..."
        
        return text
    
    def _wrap_text(self, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> List[str]:
        """文字自動換行：同時支援含有 CJK 的內容（逐字量測）。"""
        def contains_cjk(s: str) -> bool:
            for ch in s:
                code = ord(ch)
                if 0x4E00 <= code <= 0x9FFF or 0x3400 <= code <= 0x4DBF or 0x20000 <= code <= 0x2A6DF:
                    return True
            return False

        lines: List[str] = []
        if not text:
            return lines

        if contains_cjk(text):
            # 逐字疊加，超寬就換行
            buf = ''
            for ch in text:
                test = buf + ch
                bbox = font.getbbox(test)
                text_width = bbox[2] - bbox[0]
                if text_width <= max_width:
                    buf = test
                else:
                    if buf:
                        lines.append(buf)
                    buf = ch
            if buf:
                lines.append(buf)
            return lines
        else:
            # 以空白切詞的語言
            words = text.split()
            current_line = ""
            for word in words:
                test_line = f"{current_line} {word}".strip()
                bbox = font.getbbox(test_line)
                text_width = bbox[2] - bbox[0]
                if text_width <= max_width:
                    current_line = test_line
                else:
                    if current_line:
                        lines.append(current_line)
                        current_line = word
                    else:
                        # 單字太長，強制截斷
                        lines.append(word[:30] + "...")
                        current_line = ""
            if current_line:
                lines.append(current_line)
            return lines
    
    def _calculate_position(self, position_config: Dict) -> Tuple[int, int]:
        """計算元素位置"""
        x_ratio = position_config.get('x', 0.5)
        y_ratio = position_config.get('y', 0.5)
        
        x = int(self.CANVAS_SIZE[0] * x_ratio)
        y = int(self.CANVAS_SIZE[1] * y_ratio)
        
        return (x, y)
    
    def _calculate_text_area(self, text_config: Dict) -> Dict:
        """計算文字區域；支援 position.{x,y} 以 0-1 比例指定左上角起點"""
        margin = int(text_config.get('margin', 40) or 40)
        pos = text_config.get('position') or {}
        try:
            x_ratio = float(pos.get('x', 0.0)) if isinstance(pos, dict) else 0.0
            y_ratio = float(pos.get('y', 0.0)) if isinstance(pos, dict) else 0.0
        except Exception:
            x_ratio, y_ratio = 0.0, 0.0
        # 轉換為像素
        base_x = int(self.CANVAS_SIZE[0] * x_ratio) if (pos and 'x' in pos) else margin
        base_y = int(self.CANVAS_SIZE[1] * y_ratio) if (pos and 'y' in pos) else margin
        width = max(1, self.CANVAS_SIZE[0] - base_x - margin)
        height = max(1, self.CANVAS_SIZE[1] - base_y - margin)
        return {
            'x': base_x,
            'y': base_y,
            'width': width,
            'height': height,
        }
    
    def _resize_and_crop(self, image: Image.Image, target_size: Tuple[int, int]) -> Image.Image:
        """調整圖片大小並裁切"""
        img_ratio = image.width / image.height
        target_ratio = target_size[0] / target_size[1]
        
        if img_ratio > target_ratio:
            # 圖片較寬，以高度為準
            new_height = target_size[1]
            new_width = int(new_height * img_ratio)
        else:
            # 圖片較高，以寬度為準
            new_width = target_size[0]
            new_height = int(new_width / img_ratio)
        
        # 調整大小
        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # 裁切到目標尺寸
        left = (new_width - target_size[0]) // 2
        top = (new_height - target_size[1]) // 2
        right = left + target_size[0]
        bottom = top + target_size[1]
        
        return image.crop((left, top, right, bottom))
    
    def _crop_to_circle(self, image: Image.Image) -> Image.Image:
        """裁切成圓形"""
        size = min(image.size)
        image = image.resize((size, size), Image.Resampling.LANCZOS)
        
        # 創建遮罩
        mask = Image.new('L', (size, size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size, size), fill=255)
        
        # 應用遮罩
        result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        result.paste(image, (0, 0))
        result.putalpha(mask)
        
        return result
    
    def _apply_opacity(self, image: Image.Image, opacity: float) -> Image.Image:
        """應用透明度"""
        if image.mode != 'RGBA':
            image = image.convert('RGBA')
        
        # 調整 alpha 通道
        alpha = image.split()[-1]
        alpha = alpha.point(lambda p: int(p * opacity))
        image.putalpha(alpha)
        
        return image
