"""
基於 Pillow 的貼文圖片生成器
替代原本的 Playwright 方案，提供更輕量的圖片生成功能
"""
from typing import Dict, List, Optional, Union, Tuple
from datetime import datetime
from io import BytesIO
from pathlib import Path
import json
import os
import logging
import textwrap
from PIL import Image, ImageDraw, ImageFont
from services.pillow_renderer import PillowRenderer

logger = logging.getLogger(__name__)


class PillowPostGeneratorError(Exception):
    """Pillow 貼文生成器錯誤"""
    pass


class PillowPostGenerator:
    """基於 Pillow 的貼文圖片生成器"""
    
    def __init__(self, 
                 fonts_dir: Optional[str] = None,
                 output_dir: Optional[str] = None):
        """
        初始化 Pillow 圖片生成器
        
        Args:
            fonts_dir: 字體目錄路徑  
            output_dir: 輸出目錄路徑
        """
        self.fonts_dir = Path(fonts_dir or "/data/fonts")
        self.output_dir = Path(output_dir or os.getenv('UPLOAD_ROOT', 'uploads'))
        
        # 確保目錄存在
        self.fonts_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # 初始化 Pillow 渲染器 (不再提供硬編碼預設值)
        self.renderer = PillowRenderer()

        # 移除硬編碼預設配置 - 所有配置必須來自資料庫模板
        self.default_config = None  # 強制使用資料庫模板配置
        
        # 支援的尺寸
        self.sizes = {
            "instagram_square": {"width": 1080, "height": 1080},
            "instagram_portrait": {"width": 1080, "height": 1350},
            "instagram_story": {"width": 1080, "height": 1920},
            "facebook_post": {"width": 1200, "height": 630},
            "twitter_card": {"width": 1200, "height": 675},
        }
    
    def generate_post_image(self,
                          content: Dict,
                          template: str = "default",
                          size: str = "instagram_square",
                          config: Optional[Dict] = None) -> BytesIO:
        """
        生成貼文圖片
        
        Args:
            content: 內容數據 (title, text, author, school_name, etc.)
            template: 模板名稱
            size: 尺寸類型
            config: 自定義配置
        
        Returns:
            BytesIO: 生成的圖片
        """
        try:
            # 檢查是否提供了必要的配置
            if config is None:
                raise PillowPostGeneratorError("必須提供完整的模板配置，不可使用硬編碼預設值")

            # 合併配置 (移除硬編碼預設值依賴)
            final_config = {}

            # 添加尺寸配置（如果指定了尺寸類型）
            if size in self.sizes:
                final_config.update(self.sizes[size])

            # 應用模板配置（這是主要的配置來源）
            if config:
                final_config.update(config)

            # 驗證必要配置項
            required_keys = ['width', 'height', 'background_color', 'text_color', 'font_size', 'padding']
            missing_keys = [key for key in required_keys if key not in final_config]
            if missing_keys:
                raise PillowPostGeneratorError(f"模板配置缺少必要項目: {missing_keys}")
            
            # 根據模板生成內容
            if template == "minimal":
                return self._generate_minimal_template(content, final_config)
            elif template == "card":
                return self._generate_card_template(content, final_config)
            elif template == "story":
                return self._generate_story_template(content, final_config)
            else:
                raise PillowPostGeneratorError(f"不支援的模板類型: {template}，不可使用硬編碼預設模板")
        
        except Exception as e:
            logger.error(f"生成貼文圖片失敗: {e}")
            raise PillowPostGeneratorError(f"圖片生成失敗: {str(e)}")
    
    def _generate_minimal_template(self, content: Dict, config: Dict) -> BytesIO:
        """生成極簡模板"""
        # 只顯示主要內容
        main_content = content.get('title') or content.get('content', '')
        
        return self.renderer.render_text_card(
            content=main_content,
            width=config['width'],
            height=config['height'],
            background_color=config['background_color'],
            text_color=config['text_color'],
            font_name=config.get('font_name'),
            font_size=config['font_size'] + 6,  # 稍微大一點
            padding=config['padding'] + 20
        )
    
    def _generate_card_template(self, content: Dict, config: Dict) -> BytesIO:
        """生成卡片模板"""
        # 創建多層次的卡片設計
        img_width = config['width']
        img_height = config['height']
        
        # 創建圖片
        img = Image.new("RGB", (img_width, img_height), "#f5f5f5")  # 淺灰背景
        draw = ImageDraw.Draw(img)
        
        # 畫卡片背景
        card_margin = 40
        card_x1 = card_margin
        card_y1 = card_margin
        card_x2 = img_width - card_margin
        card_y2 = img_height - card_margin
        
        # 卡片陰影效果（簡化版）
        shadow_offset = 6
        draw.rectangle([card_x1 + shadow_offset, card_y1 + shadow_offset, 
                       card_x2 + shadow_offset, card_y2 + shadow_offset], 
                      fill="#e0e0e0")
        
        # 卡片主體
        draw.rectangle([card_x1, card_y1, card_x2, card_y2], 
                      fill=config['background_color'], outline="#ddd", width=1)
        
        # 在卡片內渲染文字
        card_content = []
        if content.get('title'):
            card_content.append(content['title'])
        if content.get('content'):
            card_content.append(content['content'])
        
        # 作者資訊
        if content.get('author'):
            card_content.append(f"\n— {content['author']}")
        
        text_content = '\n\n'.join(card_content)
        
        # 創建一個臨時的渲染區域
        temp_renderer = PillowRenderer()
        text_img = temp_renderer.render_text_card(
            content=text_content,
            width=card_x2 - card_x1 - 40,  # 卡片內邊距
            height=card_y2 - card_y1 - 40,
            background_color="transparent",
            text_color=config['text_color'],
            font_name=config.get('font_name'),
            font_size=config['font_size'],
            padding=0
        )
        
        # 將文字圖片貼到主圖片上
        text_pil = Image.open(text_img)
        img.paste(text_pil, (card_x1 + 20, card_y1 + 20), text_pil if text_pil.mode == 'RGBA' else None)
        
        # 轉換為 BytesIO
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=92)
        buf.seek(0)
        return buf
    
    def _generate_story_template(self, content: Dict, config: Dict) -> BytesIO:
        """生成限時動態模板（垂直設計）"""
        # 針對垂直格式優化的設計
        text_content = content.get('title') or content.get('content', '')
        
        return self.renderer.render_text_card(
            content=text_content,
            width=config['width'],
            height=config['height'],
            background_color=config.get('background_color', '#000000'),  # 黑色背景
            text_color=config.get('text_color', '#ffffff'),  # 白色文字
            font_name=config.get('font_name'),
            font_size=config['font_size'] + 8,  # 更大字體
            padding=config['padding']
        )
    
    def preview_template(self,
                        content: Dict,
                        template: str = "default",
                        size: str = "instagram_square",
                        config: Optional[Dict] = None) -> Dict:
        """
        預覽模板效果
        
        Returns:
            包含預覽資訊的字典
        """
        try:
            # 生成預覽圖片
            image_buffer = self.generate_post_image(content, template, size, config)
            
            # 轉換為 base64
            import base64
            image_data = image_buffer.getvalue()
            base64_image = base64.b64encode(image_data).decode('utf-8')
            
            # 獲取尺寸資訊
            dimensions = self.sizes.get(size, self.default_config)
            
            return {
                'success': True,
                'preview_image': f'data:image/jpeg;base64,{base64_image}',
                'template': template,
                'size': size,
                'dimensions': dimensions,
                'config': {**self.default_config, **(config or {})}
            }
        
        except Exception as e:
            logger.error(f"預覽模板失敗: {e}")
            return {
                'success': False,
                'error': f'預覽失敗: {str(e)}'
            }
    
    def get_available_templates(self) -> List[Dict]:
        """獲取可用的模板列表"""
        return [
            {
                'id': 'default',
                'name': '預設模板',
                'description': '包含完整資訊的標準設計',
                'suitable_for': ['instagram_square', 'facebook_post']
            },
            {
                'id': 'minimal',
                'name': '極簡模板', 
                'description': '簡潔的文字設計',
                'suitable_for': ['instagram_square', 'instagram_portrait']
            },
            {
                'id': 'card',
                'name': '卡片模板',
                'description': '具有陰影效果的卡片設計',
                'suitable_for': ['instagram_square', 'facebook_post']
            },
            {
                'id': 'story',
                'name': '限時動態模板',
                'description': '針對垂直格式優化',
                'suitable_for': ['instagram_story']
            }
        ]
    
    def get_available_sizes(self) -> Dict[str, Dict]:
        """獲取可用的尺寸"""
        return self.sizes.copy()
    
    def save_generated_image(self, image_buffer: BytesIO, filename: str) -> str:
        """保存生成的圖片到檔案"""
        file_path = self.output_dir / filename
        
        try:
            with open(file_path, 'wb') as f:
                f.write(image_buffer.getvalue())
            
            return str(file_path)
        
        except Exception as e:
            logger.error(f"保存圖片失敗: {e}")
            raise PillowPostGeneratorError(f"保存圖片失敗: {str(e)}")


# 全域實例
_generator_instance = None

def get_pillow_generator() -> PillowPostGenerator:
    """獲取全域 Pillow 生成器實例"""
    global _generator_instance
    if _generator_instance is None:
        _generator_instance = PillowPostGenerator()
    return _generator_instance