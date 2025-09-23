"""
統一的貼文渲染器 - 純 Pillow 實現，確保預覽和生成完全一致
核心原則：ONE SOURCE OF TRUTH - 同一套配置，同一套邏輯，同一個尺寸
"""
from typing import Dict, Optional, Union, Tuple, List, Any
from datetime import datetime
from io import BytesIO
import json
import os
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)


class PostRenderer:
    """統一的貼文渲染器 - 純 Pillow 實現"""

    # 標準尺寸配置 - 這是唯一的真相來源
    SIZES = {
        "instagram_square": {"width": 1080, "height": 1080},
        "instagram_portrait": {"width": 1080, "height": 1350},
        "instagram_story": {"width": 1080, "height": 1920},
        "facebook_post": {"width": 1200, "height": 630},
        "twitter_card": {"width": 1200, "height": 675},
    }

    def __init__(self):
        """初始化渲染器"""
        self.default_size = "instagram_square"
        # 移除硬編碼預設配置，強制使用資料庫模板配置
        self.default_config = None
    
    def _merge_config(self, custom_config: Optional[Dict] = None, size: str = "instagram_square") -> Dict:
        """合併配置 - 統一配置處理邏輯"""
        # 檢查是否提供了配置
        if custom_config is None:
            raise ValueError("必須提供模板配置，不可使用硬編碼預設值")

        # 基礎配置：只有尺寸
        dimensions = self.SIZES.get(size, self.SIZES[self.default_size])
        base_config = {
            "width": dimensions["width"],
            "height": dimensions["height"]
        }

        # 合併自訂配置
        if custom_config:
            # 處理嵌套配置結構（如 image.text.font）
            merged = base_config.copy()

            # 如果是舊的嵌套結構，需要展平
            if "image" in custom_config:
                image_config = custom_config["image"]

                # 基本設定
                if "width" in image_config:
                    merged["width"] = image_config["width"]
                if "height" in image_config:
                    merged["height"] = image_config["height"]
                if "background" in image_config and "value" in image_config["background"]:
                    merged["background_color"] = image_config["background"]["value"]
                if "padding" in image_config:
                    merged["padding"] = image_config["padding"]

                # 文字設定
                if "cards" in image_config and "text" in image_config["cards"]:
                    text_config = image_config["cards"]["text"]
                    # 強制移除字體設定，使用系統預設字體
                    merged["font_family"] = ""
                    if "size" in text_config:
                        merged["font_size_content"] = text_config["size"]
                    if "color" in text_config:
                        merged["primary_color"] = text_config["color"]
                    if "align" in text_config:
                        merged["text_align"] = text_config["align"]
                    if "lineSpacing" in text_config:
                        merged["line_spacing"] = text_config["lineSpacing"]
                    if "maxLines" in text_config:
                        merged["max_lines"] = text_config["maxLines"]

                # Logo 設定
                if "cards" in image_config and "logo" in image_config["cards"]:
                    logo_config = image_config["cards"]["logo"]
                    merged["logo_enabled"] = logo_config.get("enabled", False)
                    merged["logo_size"] = logo_config.get("size", 80)
                    merged["logo_position"] = logo_config.get("position", "top-right")
                    merged["logo_opacity"] = logo_config.get("opacity", 0.8)
                    if "url" in logo_config:
                        merged["logo_url"] = logo_config["url"]

                # 時間戳設定
                if "cards" in image_config and "timestamp" in image_config["cards"]:
                    ts_config = image_config["cards"]["timestamp"]
                    merged["timestamp_enabled"] = ts_config.get("enabled", False)
                    merged["timestamp_position"] = ts_config.get("position", "bottom-right")
                    merged["timestamp_size"] = ts_config.get("size", 18)
                    merged["timestamp_color"] = ts_config.get("color", "#666666")
                    merged["timestamp_format"] = ts_config.get("format", "%m月%d日 %H:%M") # 讀取時間格式

                # 貼文ID設定
                if "cards" in image_config and "postId" in image_config["cards"]:
                    pid_config = image_config["cards"]["postId"]
                    merged["post_id_enabled"] = pid_config.get("enabled", False)
                    merged["post_id_position"] = pid_config.get("position", "top-left")
                    merged["post_id_size"] = pid_config.get("size", 20)
                    merged["post_id_color"] = pid_config.get("color", "#0066cc")
                    merged["post_id_text"] = pid_config.get("text", "")
            else:
                # 直接合併平面配置
                merged.update(custom_config)

            return merged

        return base_config
    
    def render_to_image(self,
                       content: Dict,
                       size: str = "instagram_square",
                       template: str = "modern",
                       config: Optional[Dict] = None,
                       logo_url: Optional[str] = None,
                       quality: int = 95,
                       purpose: str = "preview") -> BytesIO:
        """
        純 Pillow 圖片渲染 - 統一的圖片生成接口

        Args:
            content: 內容字典 {"title": "", "text": "", "author": "", "school_name": "", "id": ""}
            size: 尺寸類型
            template: 模板名稱 (目前僅作參考)
            config: 自訂配置
            logo_url: Logo URL
            quality: 圖片品質 (90-100)
            purpose: 用途 ("preview" 或 "publish")

        Returns:
            BytesIO: 圖片數據流
        """
        try:
            # 統一配置處理
            merged_config = self._merge_config(config, size)

            # 處理 Logo URL
            if logo_url and "logo_url" not in merged_config:
                merged_config["logo_url"] = logo_url
                merged_config["logo_enabled"] = merged_config.get("logo_enabled", True)

            # 處理內容數據
            processed_content = self._process_content(content)

            # 使用 Pillow 渲染器
            from services.pillow_renderer import get_pillow_renderer
            renderer = get_pillow_renderer()

            # 驗證必要配置項 - 不提供預設值，強制前端提供完整配置
            required_keys = ['background_color', 'primary_color', 'font_size_content', 'padding', 'line_spacing']
            missing_keys = [key for key in required_keys if key not in merged_config]
            if missing_keys:
                logger.error(f"❌ 前端模板配置不完整，缺少必要項目: {missing_keys}")
                logger.error("🔧 請更新前端模板配置，提供所有必要參數")
                raise ValueError(f"模板配置缺少必要項目: {missing_keys}。請提供完整的資料庫模板配置。")

            # 調用 Pillow 渲染器的文字卡片渲染
            image_buffer = renderer.render_text_card(
                content=processed_content.get("text", ""),
                width=merged_config["width"],
                height=merged_config["height"],
                background_color=merged_config["background_color"],
                text_color=merged_config["primary_color"],
                font_name=merged_config.get("font_family", ""),  # 空字體名稱，使用系統預設
                font_size=merged_config["font_size_content"],
                padding=merged_config["padding"],
                line_spacing=merged_config["line_spacing"],
                text_align=merged_config.get("text_align", "center"),
                vertical_align=merged_config.get("vertical_align", "middle"),
                max_lines=merged_config.get("max_lines", 20),  # 保留合理上限
                max_chars_per_line=merged_config.get("max_chars_per_line"),
                # 水印參數 - 提供預設值以符合新的嚴格驗證
                apply_watermark_on_truncation=False,
                watermark_text="",
                watermark_font_size=18,
                watermark_color="#666666",
                image_format="JPEG",
                quality=quality
            )

            # 疊加圖層處理 (Logo, 時間戳, 貼文ID)
            return self._add_overlays(image_buffer, processed_content, merged_config, quality)

        except Exception as e:
            logger.error(f"Pillow 渲染失敗: {e}", exc_info=True)
            raise Exception(f"圖片渲染失敗: {str(e)}")

    def _add_overlays(self, image_buffer: BytesIO, content: Dict, config: Dict, quality: int) -> BytesIO:
        """添加疊加圖層 (Logo, 時間戳, 貼文ID)"""
        try:
            from PIL import Image, ImageDraw, ImageFont
            import requests

            # 打開基礎圖片
            image_buffer.seek(0)
            base_image = Image.open(image_buffer).convert("RGBA")
            width, height = base_image.size

            # 驗證 padding 配置
            if "padding" not in config:
                raise ValueError("模板配置缺少 padding 項目")
            padding = config["padding"]

            # Logo 疊加
            if config.get("logo_enabled", False) and config.get("logo_url"):
                try:
                    logo_resp = requests.get(config["logo_url"], timeout=10)
                    logo_resp.raise_for_status()
                    logo_img = Image.open(BytesIO(logo_resp.content)).convert("RGBA")

                    # 驗證 logo 配置
                    if "logo_size" not in config:
                        raise ValueError("啟用 logo 時模板配置缺少 logo_size 項目")
                    if "logo_opacity" not in config:
                        raise ValueError("啟用 logo 時模板配置缺少 logo_opacity 項目")

                    logo_size = config["logo_size"]
                    logo_img = logo_img.resize((logo_size, logo_size), Image.LANCZOS)

                    # 設置透明度
                    opacity = config["logo_opacity"]
                    if opacity < 1.0:
                        alpha = logo_img.split()[3]
                        alpha = alpha.point(lambda p: int(p * opacity))
                        logo_img.putalpha(alpha)

                    # 計算位置
                    position = config.get("logo_position", "top-right")
                    x, y = self._calculate_position(position, width, height, logo_size, logo_size, padding)

                    base_image.alpha_composite(logo_img, dest=(x, y))
                except Exception as e:
                    logger.warning(f"Logo 疊加失敗: {e}")

            # 時間戳疊加
            if config.get("timestamp_enabled", False):
                try:
                    from services.pillow_renderer import get_pillow_renderer
                    renderer = get_pillow_renderer()

                    # 驗證 timestamp 配置
                    if "timestamp_size" not in config:
                        raise ValueError("啟用 timestamp 時模板配置缺少 timestamp_size 項目")
                    if "timestamp_color" not in config:
                        raise ValueError("啟用 timestamp 時模板配置缺少 timestamp_color 項目")

                    draw = ImageDraw.Draw(base_image)
                    timestamp_size = config["timestamp_size"]
                    timestamp_color = config["timestamp_color"]

                    # --- 動態格式化時間戳 (含格式翻譯) ---
                    timestamp_text = ""
                    created_at_val = content.get("created_at")

                    if created_at_val:
                        if isinstance(created_at_val, str):
                            try:
                                created_at = datetime.fromisoformat(created_at_val.replace('Z', '+00:00'))
                                # 轉換為 UTC+8 時區
                                import pytz
                                utc_tz = pytz.UTC
                                local_tz = pytz.timezone('Asia/Taipei')
                                if created_at.tzinfo is None:
                                    created_at = utc_tz.localize(created_at)
                                created_at = created_at.astimezone(local_tz)
                            except ValueError:
                                # 使用 UTC+8 時區的現在時間
                                import pytz
                                local_tz = pytz.timezone('Asia/Taipei')
                                created_at = datetime.now(local_tz)
                        elif isinstance(created_at_val, datetime):
                            created_at = created_at_val
                            # 如果是 UTC 時間，轉換為本地時區
                            import pytz
                            if created_at.tzinfo is None:
                                utc_tz = pytz.UTC
                                local_tz = pytz.timezone('Asia/Taipei')
                                created_at = utc_tz.localize(created_at).astimezone(local_tz)
                            else:
                                local_tz = pytz.timezone('Asia/Taipei')
                                created_at = created_at.astimezone(local_tz)
                        else:
                            # 使用 UTC+8 時區的現在時間
                            import pytz
                            local_tz = pytz.timezone('Asia/Taipei')
                            created_at = datetime.now(local_tz)
                    else:
                        # 使用 UTC+8 時區的現在時間
                        import pytz
                        local_tz = pytz.timezone('Asia/Taipei')
                        created_at = datetime.now(local_tz)

                    # 從配置讀取使用者設定的格式
                    user_format = config.get("timestamp_format", "%m月%d日 %H:%M")

                    if user_format == "relative":
                        now = datetime.now(created_at.tzinfo)
                        delta = now - created_at
                        seconds = delta.total_seconds()
                        if seconds < 2:
                            timestamp_text = "剛剛"
                        elif seconds < 60:
                            timestamp_text = f"{int(seconds):02d} 秒前"
                        elif seconds < 3600:
                            timestamp_text = f"{int(delta.seconds / 60)} 分鐘前"
                        elif seconds < 86400:
                            timestamp_text = f"{int(delta.seconds / 3600)} 小時前"
                        else:
                            timestamp_text = f"{delta.days} 天前"
                    else:
                        # 格式翻譯層: 將使用者易讀的格式轉換為 strftime 代碼
                        format_mapping = {
                            "YYYY-MM-DD HH:mm:ss": "%Y-%m-%d %H:%M:%S",
                            "YYYY-MM-DD HH:mm": "%Y-%m-%d %H:%M",
                            "YYYY-MM-DD hh:mm am/pm": "%Y-%m-%d %I:%M %p",
                            "MM/DD/YYYY HH:mm:ss": "%m/%d/%Y %H:%M:%S",
                            "DD-MM-YYYY hh:mm am/pm": "%d-%m-%Y %I:%M %p",
                        }
                        # 如果使用者設定在翻譯表中，則使用翻譯後的值；否則直接使用設定值 (適用於本身已是 %Y-%m-%d 的情況)
                        strftime_format = format_mapping.get(user_format, user_format)
                        try:
                            timestamp_text = created_at.strftime(strftime_format)
                            # 如果使用 %p (am/pm)，則轉換為小寫
                            if "%p" in strftime_format:
                                timestamp_text = timestamp_text.lower()
                        except ValueError:
                            # 如果格式字串仍然無效，提供一個安全的後備格式
                            timestamp_text = created_at.strftime("%Y-%m-%d %H:%M")
                    # --- 邏輯結束 ---

                    if timestamp_text:
                        font = renderer.get_font(None, timestamp_size)

                        # 計算文字尺寸
                        text_bbox = draw.textbbox((0, 0), timestamp_text, font=font)
                        text_width = text_bbox[2] - text_bbox[0]
                        text_height = text_bbox[3] - text_bbox[1]

                        # 計算位置
                        position = config.get("timestamp_position", "bottom-right")
                        logger.info(f"[時間戳定位] position={position}, canvas={width}x{height}, text={text_width}x{text_height}, padding={padding}")
                        x, y = self._calculate_position(position, width, height, text_width, text_height, padding)
                        logger.info(f"[時間戳定位] 計算結果: x={x}, y={y}")

                        draw.text((x, y), timestamp_text, fill=timestamp_color, font=font)
                except Exception as e:
                    logger.warning(f"時間戳疊加失敗: {e}")

            # 貼文ID疊加
            if config.get("post_id_enabled", False):
                try:
                    from services.pillow_renderer import get_pillow_renderer
                    renderer = get_pillow_renderer()

                    # 生成貼文ID文字
                    post_id_text = config.get("post_id_text", "")
                    if not post_id_text and content.get("id"):
                        post_id_format = config.get("post_id_format", "#{id}")
                        # 支援多種格式變數
                        post_id_text = (post_id_format
                                      .replace("#{ID}", f"#{content['id']}")
                                      .replace("#{id}", f"#{content['id']}")
                                      .replace("{ID}", str(content["id"]))
                                      .replace("{id}", str(content["id"])))

                    logger.info(f"[統一渲染器] 貼文ID疊加: enabled={config.get('post_id_enabled')}, format={config.get('post_id_format')}, text='{post_id_text}', content_id={content.get('id')}")

                    # 驗證 post_id 配置
                    if "post_id_size" not in config:
                        raise ValueError("啟用 post_id 時模板配置缺少 post_id_size 項目")
                    if "post_id_color" not in config:
                        raise ValueError("啟用 post_id 時模板配置缺少 post_id_color 項目")

                    draw = ImageDraw.Draw(base_image)
                    post_id_size = config["post_id_size"]
                    post_id_color = config["post_id_color"]

                    if post_id_text:
                        font = renderer.get_font(None, post_id_size)

                        # 計算文字尺寸
                        text_bbox = draw.textbbox((0, 0), post_id_text, font=font)
                        text_width = text_bbox[2] - text_bbox[0]
                        text_height = text_bbox[3] - text_bbox[1]

                        # 計算位置
                        position = config.get("post_id_position", "top-left")
                        x, y = self._calculate_position(position, width, height, text_width, text_height, padding)

                        logger.info(f"[統一渲染器] 繪製貼文ID: 座標=({x},{y}), 尺寸={text_width}x{text_height}, 顏色={post_id_color}, 大小={post_id_size}, 圖片尺寸={width}x{height}")
                        draw.text((x, y), post_id_text, fill=post_id_color, font=font)
                        logger.info(f"[統一渲染器] 貼文ID繪製完成: '{post_id_text}'")
                except Exception as e:
                    logger.warning(f"貼文ID疊加失敗: {e}")

            # 輸出最終圖片
            output_buffer = BytesIO()
            final_image = base_image.convert("RGB")
            final_image.save(output_buffer, format="JPEG", quality=quality, optimize=True)
            output_buffer.seek(0)

            return output_buffer

        except Exception as e:
            logger.error(f"疊加圖層失敗: {e}")
            # 返回原始圖片
            image_buffer.seek(0)
            return image_buffer

    def _calculate_position(self, position: str, canvas_width: int, canvas_height: int,
                          element_width: int, element_height: int, padding: int) -> Tuple[int, int]:
        """計算元素位置"""
        position = position.lower()

        if position == "top-left":
            return padding, padding
        elif position == "top-center":
            return (canvas_width - element_width) // 2, padding
        elif position == "top-right":
            return canvas_width - padding - element_width, padding
        elif position in ("middle-left", "left-center"):
            return padding, (canvas_height - element_height) // 2
        elif position in ("center", "middle-center"):
            return (canvas_width - element_width) // 2, (canvas_height - element_height) // 2
        elif position in ("middle-right", "right-center"):
            return canvas_width - padding - element_width, (canvas_height - element_height) // 2
        elif position == "bottom-left":
            return padding, canvas_height - padding - element_height
        elif position == "bottom-center":
            return (canvas_width - element_width) // 2, canvas_height - padding - element_height
        elif position == "bottom-right":
            return canvas_width - padding - element_width, canvas_height - padding - element_height
        else:
            # 預設置中
            return (canvas_width - element_width) // 2, (canvas_height - element_height) // 2

    def get_preview_data(self,
                        content: Dict,
                        size: str = "instagram_square",
                        template: str = "modern",
                        config: Optional[Dict] = None,
                        logo_url: Optional[str] = None) -> Dict:
        """
        獲取預覽數據 - 包含尺寸和配置信息（已移除 HTML）
        """
        dimensions = self.SIZES[size]
        merged_config = self._merge_config(config, size)

        return {
            "width": dimensions["width"],
            "height": dimensions["height"],
            "aspect_ratio": dimensions["width"] / dimensions["height"],
            "size_name": size,
            "template": template,
            "processed_content": self._process_content(content),
            "config": merged_config
        }
    
    def _process_content(self, content: Dict) -> Dict:
        """處理和清理內容"""
        processed = {}
        
        # 標題
        processed["title"] = self._clean_text(content.get("title", ""))
        
        # 內容文字
        processed["text"] = self._clean_text(content.get("text", ""))
        
        # 作者
        processed["author"] = self._clean_text(content.get("author", ""))
        
        # 時間
        created_at = content.get("created_at")
        if created_at is None:
            created_at = datetime.now()
        elif isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except:
                created_at = datetime.now()
        elif not isinstance(created_at, datetime):
            created_at = datetime.now()

        processed["created_at"] = content.get("created_at") # 將原始 created_at 傳遞下去
        processed["time"] = created_at.strftime("%m月%d日 %H:%M")
        processed["date"] = created_at.strftime("%Y年%m月%d日")
        
        # 其他元數據
        processed["id"] = content.get("id", "")
        processed["school"] = self._clean_text(content.get("school_name", ""))
        
        return processed
    
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

        # 限制長度
        if len(text) > 600:
            text = text[:597] + "..."

        return text
    
    def list_available_sizes(self) -> Dict[str, Dict]:
        """列出所有可用的尺寸"""
        return self.SIZES.copy()

    def list_available_templates(self) -> List[str]:
        """列出所有可用的模板"""
        return ["modern", "card", "minimal"]

    def save_image(self,
                   content: Dict,
                   size: str = "instagram_square",
                   template: str = "modern",
                   config: Optional[Dict] = None,
                   logo_url: Optional[str] = None,
                   quality: int = 95,
                   purpose: str = "preview",
                   custom_filename: Optional[str] = None) -> Dict:
        """
        渲染並保存圖片到指定路徑

        Args:
            content: 內容字典
            size: 尺寸類型
            template: 模板名稱
            config: 自訂配置
            logo_url: Logo URL
            quality: 圖片品質
            purpose: 用途 ("preview" 或 "publish")
            custom_filename: 自訂檔名（不含副檔名）

        Returns:
            Dict: 包含檔案路徑和 URL 的結果
        """
        import os
        import time

        # 生成圖片
        image_data = self.render_to_image(
            content=content,
            size=size,
            template=template,
            config=config,
            logo_url=logo_url,
            quality=quality,
            purpose=purpose
        )

        # 決定檔案名稱和路徑
        timestamp = int(time.time() * 1000)
        if custom_filename:
            filename = f"{custom_filename}.jpg"
        elif purpose == "preview":
            filename = f"preview_{timestamp}.jpg"
        else:  # publish
            filename = f"instagram_{timestamp}.jpg"

        # 先保存到本地臨時文件，然後使用現有的 CDN 上傳工具
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            temp_file.write(image_data.getvalue())
            temp_path = temp_file.name

        try:
            # 使用CDN API上傳（修復權限問題）
            import requests

            with open(temp_path, 'rb') as f:
                image_data_for_upload = f.read()

            # CDN上傳API端點 - 動態檢測容器環境
            import socket
            try:
                # 嘗試解析容器內部地址
                socket.gethostbyname('forumkit-cdn')
                upload_url = "http://forumkit-cdn:8080/upload"
                logger.info("使用容器內部CDN地址")
            except socket.gaierror:
                # 回退到localhost（主機環境）
                upload_url = "http://localhost:12001/upload"
                logger.info("使用主機CDN地址")

            # 上傳到CDN
            files = {'file': (filename, image_data_for_upload, 'image/jpeg')}
            data = {'subdir': 'social_media'}

            response = requests.post(upload_url, files=files, data=data, timeout=10)

            cdn_url = None
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    cdn_url = result.get('url')

            if cdn_url:
                # CDN 上傳成功
                full_url = cdn_url
                url_path = cdn_url
                file_path = temp_path
            else:
                # CDN 上傳失敗，但對於發布用途強制使用CDN URL
                cdn_base = (os.getenv("CDN_PUBLIC_BASE_URL") or os.getenv("PUBLIC_CDN_URL") or "").strip().rstrip("/")

                if cdn_base and purpose == "publish":
                    # 強制使用CDN URL
                    full_url = f"{cdn_base}/social_media/{filename}"
                    url_path = full_url
                    file_path = temp_path
                    print(f"[WARNING] CDN上傳失敗，但強制使用CDN URL: {full_url}")
                else:
                    # 對於非發布用途或無CDN配置，報告錯誤
                    error_msg = "CDN上傳失敗且無有效CDN配置"
                    return {
                        "success": False,
                        "error": error_msg,
                        "filename": filename,
                        "purpose": purpose,
                        "cdn_configured": bool(cdn_base)
                    }

        finally:
            # 清理臨時文件（如果還存在）
            try:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
            except:
                pass

        return {
            "success": True,
            "filename": filename,
            "file_path": file_path,
            "url_path": url_path,
            "full_url": full_url,
            "purpose": purpose,
            "size": size,
            "template": template,
            "dimensions": self.SIZES.get(size, {}),
            "file_size": len(image_data.getvalue())
        }



# 全局實例
_renderer_instance = None

def get_renderer() -> PostRenderer:
    """獲取全局渲染器實例"""
    global _renderer_instance
    if _renderer_instance is None:
        _renderer_instance = PostRenderer()
    return _renderer_instance
