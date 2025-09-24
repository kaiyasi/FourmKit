# backend/services/content_generator.py
"""
內容生成服務 - 重新設計
將論壇貼文轉換為社交媒體內容（圖片 + 文案）
"""
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timezone
import os
import json
import hashlib
import shutil
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
import requests
import textwrap
import logging

from utils.db import get_session
from models.social_publishing import ContentTemplate, SocialAccount, TemplateType
from models.base import Post as ForumPost
from services.pillow_renderer import get_pillow_renderer, PillowRenderError

logger = logging.getLogger(__name__)

class ContentGenerationError(Exception):
    """內容生成錯誤"""
    pass

class ContentGenerator:
    """內容生成器 - 將論壇貼文轉換為社交媒體內容"""
    
    def __init__(self):
        self.pillow_renderer = get_pillow_renderer()
        # 將預覽圖存放在 uploads/public/social_media，確保由主站 Nginx 穩定對外提供
        self.output_root = os.getenv('UPLOAD_ROOT', 'uploads')
        self.output_dir = os.path.join(self.output_root, 'public', 'social_media')
        os.makedirs(self.output_dir, exist_ok=True)

    def _format_id(self, post_id: Any, id_format_config: Dict) -> str:
        """根據 idFormat 配置格式化 ID"""
        if not post_id:
            return ''

        formatted = str(post_id)

        # 補零處理
        digits = id_format_config.get('digits', 0)
        if digits > 0:
            formatted = formatted.zfill(digits)

        # 加前後綴
        prefix = id_format_config.get('prefix', '')
        suffix = id_format_config.get('suffix', '')

        return f"{prefix}{formatted}{suffix}"
    
    def generate_multipost_content(
        self, 
        forum_posts: List[ForumPost], 
        template: ContentTemplate,
        custom_options: Optional[Dict] = None
    ) -> List[Dict[str, Any]]:
        """
        生成多篇貼文的社交媒體內容（用於重複發布）
        
        Args:
            forum_posts: 論壇貼文列表
            template: 內容模板
            custom_options: 自訂選項
            
        Returns:
            List[Dict]: 每篇貼文的生成內容
        """
        try:
            # 檢查模板是否包含 {id} 變數 - 優先使用 multipost 配置
            multipost_config = template.config.get('multipost', {})
            caption_config = template.config.get('caption', {})

            # 獲取模板，不允許空白預設值
            caption_template = multipost_config.get('template') or caption_config.get('template')
            if not caption_template:
                raise ContentGenerationError("模板缺少必要的文案模板配置（multipost.template 或 caption.template）")

            if '{id}' not in caption_template:
                # 如果沒有 {id} 變數，使用正常的單篇發布流程
                return [self.generate_content(forum_posts[0], template, custom_options)]
            
            # 為每篇貼文生成內容
            results = []
            for forum_post in forum_posts:
                content = self.generate_content(forum_post, template, custom_options)
                results.append(content)
            
            return results
            
        except Exception as e:
            logger.error(f"多篇貼文內容生成失敗: {e}")
            return []
    
    def generate_content(
        self, 
        forum_post: ForumPost, 
        template: ContentTemplate,
        custom_options: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        生成社交媒體內容
        
        Args:
            forum_post: 論壇貼文
            template: 內容模板
            custom_options: 自訂選項
            
        Returns:
            {
                'image_url': str,       # 生成的圖片 URL
                'caption': str,         # 生成的文案
                'hashtags': List[str],  # 標籤列表
                'metadata': Dict        # 其他元資訊
            }
        """
        try:
            result = {}
            
            # 準備內容數據
            content_data = self._prepare_content_data(forum_post)
            
            # 根據模板類型生成內容
            if template.template_type in [TemplateType.IMAGE, TemplateType.COMBINED]:
                images = self._generate_images(content_data, template, custom_options)
                result['image_url'] = images[0] if images else None  # 主圖片（向後兼容）
                result['image_urls'] = images  # 所有圖片
            elif template.template_type == TemplateType.TEXT:
                # IG 發布需要圖片：即便是文字模板，也用預設圖片渲染一張文字卡
                images = self._generate_images(content_data, template, custom_options)
                result['image_url'] = images[0] if images else None  # 主圖片（向後兼容）
                result['image_urls'] = images  # 所有圖片

            if template.template_type in [TemplateType.TEXT, TemplateType.COMBINED]:
                caption_data = self._generate_caption(content_data, template, custom_options)
                result.update(caption_data)
            
            # 生成標籤
            result['hashtags'] = self._generate_hashtags(content_data, template)
            
            # 添加元資訊
            result['metadata'] = {
                'template_id': template.id,
                'template_name': template.name,
                'forum_post_id': forum_post.id,
                'generated_at': datetime.now(timezone.utc).isoformat(),
                'content_hash': self._generate_content_hash(content_data)
            }
            
            return result
            
        except Exception as e:
            try:
                tpl_info = f"tpl_id={getattr(template, 'id', None)} type={getattr(template, 'template_type', None)} name={getattr(template, 'name', None)}"
            except Exception:
                tpl_info = "tpl_info_unavailable"
            logger.error(f"內容生成失敗: {e} ({tpl_info})", exc_info=True)
            raise ContentGenerationError(f"內容生成失敗: {str(e)} ({tpl_info})")
    
    def _prepare_content_data(self, forum_post: ForumPost) -> Dict[str, Any]:
        """準備內容數據"""
        raw_content = forum_post.content or ''
        raw_title = (getattr(forum_post, 'title', '') or '').strip()
        # 後端模型多數沒有 title，這裡以「首行內容（最多50字）」作為安全後備標題
        if not raw_title:
            first_line = raw_content.strip().splitlines()[0] if raw_content.strip() else ''
            if len(first_line) > 50:
                first_line = first_line[:50] + '...'
            raw_title = first_line

        # 處理媒體附件
        media_urls = []
        if hasattr(forum_post, 'media') and forum_post.media:
            import os
            cdn_base_url = os.getenv('PUBLIC_BASE_URL', '').rstrip('/') + '/uploads'
            for media in forum_post.media:
                # 放寬條件：只要非刪除且為圖片類型即納入
                if not media.is_deleted:
                    if media.mime_type and media.mime_type.startswith('image/'):
                        media_path = media.path.lstrip('/')
                        media_url = f"{cdn_base_url}/{media_path}"
                        media_urls.append(media_url)

        return {
            'id': forum_post.id,
            'title': raw_title,
            'content': raw_content,
            'author': forum_post.author.username if forum_post.author else '匿名',
            'school_name': forum_post.school.name if forum_post.school else '未知學校',
            'created_at': forum_post.created_at,
            'category': getattr(forum_post, 'category', '一般'),
            'tags': getattr(forum_post, 'tags', []),
            'media_urls': media_urls,  # 新增：用戶上傳的圖片URL列表
            'has_user_images': len(media_urls) > 0,  # 新增：是否有用戶上傳的圖片
            # **新增**: 公告相關信息
            'is_announcement': getattr(forum_post, 'is_announcement', False),
            'announcement_type': getattr(forum_post, 'announcement_type', None),
        }
    
    def _generate_images(
        self,
        content_data: Dict[str, Any],
        template: ContentTemplate,
        custom_options: Optional[Dict] = None
    ) -> List[str]:
        """生成圖片列表（支援用戶附件 + 文字圖片）"""
        try:
            images: List[str] = []

            has_user_images = bool(content_data.get('has_user_images') and content_data.get('media_urls'))

            selected_url = None
            if has_user_images:
                try:
                    # 有相片 → 產生「合成相片卡」作為唯一輸出
                    selected_url = self._generate_image_with_photos(content_data, template, custom_options, content_data.get('media_urls', [])[:4])
                except Exception as ce:
                    logger.warning(f"合成相片卡生成失敗，退回純文字卡: {ce}")
            if not selected_url:
                # 無相片或合成失敗 → 使用純文字卡
                selected_url = self._generate_image(content_data, template, custom_options)

            if selected_url:
                images = [selected_url]
            return images

        except Exception as e:
            logger.error(f"生成圖片列表失敗: {e}")
            # 回退到只生成文字圖片
            try:
                text_image = self._generate_image(content_data, template, custom_options)
                return [text_image] if text_image else []
            except Exception:
                return []

    def _generate_image(
        self, 
        content_data: Dict[str, Any], 
        template: ContentTemplate,
        custom_options: Optional[Dict] = None
    ) -> str:
        """生成圖片"""
        try:
            config = template.config.get('image', {})
            if custom_options and 'image' in custom_options:
                config.update(custom_options['image'])

            # 從 post.metadata 讀取時間戳和貼文ID配置
            post_config = template.config.get('post', {})
            if not post_config:
                raise ContentGenerationError("模板配置缺少 post 項目")

            metadata = post_config.get('metadata', {})
            if not metadata:
                raise ContentGenerationError("模板配置缺少 post.metadata 項目")

            # 構建時間戳配置
            ts_cfg = {
                'enabled': metadata.get('showTimestamp', False),
                'position': metadata.get('timestampPosition'),
                'format': metadata.get('timestampFormat'),
                'size': metadata.get('timestampStyle', {}).get('size'),
                'color': metadata.get('timestampStyle', {}).get('color'),
                'font': metadata.get('timestampStyle', {}).get('font')
            }

            # 構建貼文ID配置
            pid_cfg = {
                'enabled': metadata.get('showPostId', False),
                'position': metadata.get('postIdPosition'),
                'format': metadata.get('postIdFormat'),
                'size': metadata.get('postIdStyle', {}).get('size'),
                'color': metadata.get('postIdStyle', {}).get('color'),
                'font': metadata.get('postIdStyle', {}).get('font')
            }

            # 其他配置
            cards = config.get('cards', {}) if isinstance(config.get('cards', {}), dict) else {}
            text_cfg = cards.get('text', config.get('text', {})) or {}
            logo_cfg = cards.get('logo', config.get('logo', {})) or {}

            # DEBUG: 記錄完整配置
            logger.info(f"[IG發布] post.metadata 原始配置: {metadata}")
            logger.info(f"[IG發布] 時間戳配置: {ts_cfg}")
            logger.info(f"[IG發布] 貼文ID配置: {pid_cfg}")
            logger.info(f"[IG發布] Logo配置: {logo_cfg}")
            logger.info(f"[IG發布] 文字配置: {text_cfg}")

            # 檢查是否有前端 textLayout 配置
            text_layout_config = template.config.get('post', {}).get('textLayout', {})
            has_user_images = bool(content_data.get('has_user_images') and content_data.get('media_urls'))

            # 根據是否有用戶圖片選擇對應的文字排版設定
            if text_layout_config:
                if has_user_images and 'withPhoto' in text_layout_config:
                    # 有圖片時使用 withPhoto 配置
                    layout_cfg = text_layout_config['withPhoto']
                    logger.info(f"[IG發布] 使用 textLayout.withPhoto 配置: {layout_cfg}")
                elif 'textOnly' in text_layout_config:
                    # 純文字時使用 textOnly 配置
                    layout_cfg = text_layout_config['textOnly']
                    logger.info(f"[IG發布] 使用 textLayout.textOnly 配置: {layout_cfg}")
                else:
                    # 沒有對應配置，回退到舊配置
                    layout_cfg = {}
                    logger.info(f"[IG發布] textLayout 配置不完整，使用舊配置")
            else:
                layout_cfg = {}
                logger.info(f"[IG發布] 無 textLayout 配置，使用舊配置")

            # 準備 Pillow 渲染配置
            pillow_config = {
                'width': config.get('width', 1080),
                'height': config.get('height', 1080),
                'background_color': config.get('background', {}).get('value', '#ffffff'),
                'font_family': text_cfg.get('font', config.get('text', {}).get('font', 'default')),
                'font_size': text_cfg.get('size', config.get('text', {}).get('size', 32)),
                'text_color': text_cfg.get('color', config.get('text', {}).get('color', '#333333')),
                'padding': config.get('padding', 60),
                'line_spacing': text_cfg.get('lineSpacing', config.get('text', {}).get('lineSpacing', 10)),  # 改為像素值
                'logo': logo_cfg or {},
                'timestamp': ts_cfg or {},
                'max_content_lines': layout_cfg.get('maxLines') if layout_cfg else text_cfg.get('maxLines', config.get('text', {}).get('maxLines', 8))
            }

            # 處理格式化ID配置 - 優先使用 custom_options 中的 postId 配置
            post_id_config = pid_cfg
            logger.info(f"[DEBUG] custom_options: {custom_options}")
            if custom_options and 'postId' in custom_options:
                logger.info(f"[DEBUG] custom_options['postId']: {custom_options['postId']}")
                post_id_config.update(custom_options['postId'])

            multipost_config = template.config.get('multipost', {})
            id_format = multipost_config.get('idFormat', {})

            # 調試信息
            logger.info(f"[DEBUG] post_id_config: {post_id_config}")
            logger.info(f"[DEBUG] multipost_config: {multipost_config}")
            logger.info(f"[DEBUG] id_format: {id_format}")
            logger.info(f"[DEBUG] content_data.id: {content_data.get('id')}")

            # 如果有ID格式配置或postId配置是啟用的，就處理格式化ID
            if post_id_config.get('enabled', False):
                actual_id = content_data.get('id', '')

                # 新格式：使用 postId 自己的 prefix/digits/suffix 配置
                if post_id_config.get('prefix') is not None or post_id_config.get('digits') or post_id_config.get('suffix'):
                    # 使用圖片設定中的 postId 格式配置
                    post_id_format = {
                        'prefix': post_id_config.get('prefix', ''),
                        'digits': post_id_config.get('digits', 0),
                        'suffix': post_id_config.get('suffix', '')
                    }
                    formatted_id = self._format_id(actual_id, post_id_format)
                    logger.info(f"[DEBUG] 使用 postId 自己的格式配置: {post_id_format} -> '{formatted_id}'")

                # 兼容舊格式：使用 text 欄位的自定義文字
                elif post_id_config.get('text'):
                    custom_text = post_id_config.get('text')
                    # 檢查是否包含 {id} 佔位符，如果有則替換
                    if '{id}' in custom_text:
                        # {id} 只替換為純數字，不包含前綴後綴
                        formatted_id = custom_text.replace('{id}', str(actual_id))
                        logger.info(f"[DEBUG] 替換自定義文字中的{{id}}: '{custom_text}' -> '{formatted_id}' (實際ID: {actual_id})")
                    else:
                        formatted_id = custom_text
                        logger.info(f"[DEBUG] 使用 text 欄位的格式化ID: {formatted_id}")

                # 回退：使用 multipost 的 idFormat 配置
                else:
                    formatted_id = self._format_id(actual_id, id_format)
                    logger.info(f"[DEBUG] 使用 multipost idFormat: {formatted_id}")

                logger.info(f"[DEBUG] 最終 formatted_id: {formatted_id}")

                # 添加到pillow配置中
                pillow_config['postId'] = {
                    'enabled': True,
                    'text': formatted_id,
                    'position': post_id_config.get('position', 'top-left'),
                    'size': post_id_config.get('size', 20),
                    'font': post_id_config.get('font', 'default'),
                    'color': post_id_config.get('color', '#0066cc'),
                    'opacity': post_id_config.get('opacity', 0.9)
                }
                logger.info(f"[DEBUG] 已設定 pillow_config['postId']: {pillow_config['postId']}")
            else:
                logger.info(f"[DEBUG] 格式化ID未啟用，跳過")

            
            # 準備文字內容用於 Pillow 渲染 - 只顯示內文，不顯示標題
            text_content = content_data.get('content', '')

            # **修復**: 圖片中也要包含公告標記
            is_announcement = content_data.get('is_announcement', False)
            announcement_type = content_data.get('announcement_type', None)

            if is_announcement:
                if announcement_type == 'cross':
                    # 跨校公告
                    announcement_prefix = "▶ 跨校公告 ◁\n\n"
                else:
                    # 校內公告（包括 'school', 'platform' 等）
                    announcement_prefix = "▶ 校內公告 ◁\n\n"

                # 在圖片文字內容前添加公告標記
                text_content = announcement_prefix + text_content
                logger.info(f"[IG發布] 貼文 {content_data.get('id')} 圖片添加{announcement_type or '一般'}公告標記")
            
            # 使用統一渲染器生成圖片（與前端預覽一致）
            # 讀取輸出格式與文字排版設定
            img_format = (config.get('imageFormat') or 'JPEG').upper()
            if img_format not in ('JPEG', 'PNG'):
                img_format = 'JPEG'
            img_quality = int(config.get('quality', 90 if img_format == 'JPEG' else 92))

            text_align = (text_cfg.get('align') or 'center')
            v_align = (text_cfg.get('vAlign') or text_cfg.get('verticalAlign') or 'middle')

            # 優先使用 textLayout 配置，回退到舊配置
            max_lines = layout_cfg.get('maxLines') if layout_cfg else (pillow_config.get('max_content_lines') or text_cfg.get('maxLines'))
            max_chars_per_line = layout_cfg.get('maxCharsPerLine') if layout_cfg else (text_cfg.get('maxCharsPerLine') or text_cfg.get('maxPerLine'))

            logger.info(f"[IG發布] 最終文字截斷配置: max_lines={max_lines}, max_chars_per_line={max_chars_per_line}")
            wm_cfg = text_cfg.get('watermark', {}) if isinstance(text_cfg.get('watermark', {}), dict) else {}

            # 使用 unified_post_renderer 替代直接調用 pillow_renderer
            logger.info(f"[IG發布] 使用 unified_post_renderer 生成圖片 - Post ID: {content_data.get('id')}")
            from services.unified_post_renderer import get_renderer as _get_unified_renderer

            # 將 pillow_config 轉換為 unified_post_renderer 格式
            unified_config = {
                'width': pillow_config.get('width', 1080),
                'height': pillow_config.get('height', 1080),
                'background_color': pillow_config.get('background_color', '#ffffff'),
                'primary_color': pillow_config.get('text_color', '#333333'),
                'font_family': pillow_config.get('font_family', ''),
                'font_size_content': pillow_config.get('font_size', 32),
                'padding': pillow_config.get('padding', 60),
                'line_spacing': pillow_config.get('line_spacing', 10),
                'text_align': text_align,
                'vertical_align': v_align,
                'max_lines': max_lines,
                'max_chars_per_line': max_chars_per_line,
                # Logo 配置
                'logo_enabled': pillow_config.get('logo', {}).get('enabled', False),
                'logo_url': pillow_config.get('logo', {}).get('url', ''),
                'logo_size': pillow_config.get('logo', {}).get('size', 80),
                'logo_position': pillow_config.get('logo', {}).get('position', 'bottom-right'),
                'logo_opacity': pillow_config.get('logo', {}).get('opacity', 0.8),
                # 時間戳配置
                'timestamp_enabled': ts_cfg.get('enabled', False),
                'timestamp_format': ts_cfg.get('format', 'relative'),
                'timestamp_position': ts_cfg.get('position', 'bottom-right'),
                'timestamp_size': ts_cfg.get('size', 18),
                'timestamp_color': ts_cfg.get('color', '#666666'),
                # 貼文ID配置
                'post_id_enabled': pid_cfg.get('enabled', False),
                'post_id_format': pid_cfg.get('format', '#{id}'),  # 使用 format 而非 text
                'post_id_position': pid_cfg.get('position', 'top-center'),
                'post_id_size': pid_cfg.get('size', 24),
                'post_id_color': pid_cfg.get('color', '#666666'),
            }

            logger.info(f"[IG發布] 傳遞給 unified_post_renderer 的完整配置: {unified_config}")

            _renderer = _get_unified_renderer()
            image_buffer = _renderer.render_to_image(
                content={
                    'title': content_data.get('title', ''),
                    'text': text_content,
                    'author': content_data.get('author', ''),
                    'school_name': content_data.get('school_name', ''),
                    'created_at': content_data.get('created_at'),
                    'id': content_data.get('id')
                },
                size='instagram_square',
                template='modern',
                config=unified_config,
                logo_url=unified_config.get('logo_url'),
                quality=img_quality
            )

            # unified_post_renderer 已處理所有疊加圖層，直接使用返回的圖片
            # 無需額外處理，image_buffer 已經是完整的圖片
            
            # 儲存圖片（本機副本）
            post_id = content_data.get('id', 'preview')
            timestamp = int(datetime.now().timestamp())
            ext = 'png' if img_format == 'PNG' else 'jpg'
            filename = f"post_{post_id}_{timestamp}.{ext}"
            file_path = os.path.join(self.output_dir, filename)
            
            with open(file_path, 'wb') as f:
                f.write(image_buffer.getvalue())
            # 基本檔案驗證：存在且非零
            try:
                st = os.stat(file_path)
                if st.st_size <= 0:
                    raise ContentGenerationError("生成圖片為空檔案")
            except FileNotFoundError:
                raise ContentGenerationError(f"找不到生成圖片檔案: {file_path}")
            
            # 嘗試上傳到 CDN，如果失敗則使用本地路徑
            try:
                from utils.cdn_uploader import publish_to_cdn
                cdn_url = publish_to_cdn(file_path, subdir="social_media")

                if cdn_url:
                    logger.info(f"圖片已上傳到CDN: {cdn_url}")
                    return cdn_url
                else:
                    logger.warning("CDN未配置，使用本地路徑")

            except Exception as e:
                logger.warning(f"CDN上傳失敗，使用本地路徑: {e}")

            # CDN 上傳失敗或未配置時，返回本地路徑
            public_base_url = os.getenv('PUBLIC_BASE_URL', 'http://localhost:7150').rstrip('/')
            relative_path = file_path.replace(self.output_root, '').lstrip('/')
            local_url = f"{public_base_url}/{relative_path}"

            logger.info(f"本地圖片路徑: {local_url}")
            logger.info(f"本地圖片檔案: {file_path}")

            return local_url
                
        except Exception as e:
            logger.error(f"圖片生成失敗: {e}")
            raise ContentGenerationError(f"圖片生成失敗: {str(e)} at output_dir={self.output_dir}")

    def _generate_image_with_photos(
        self,
        content_data: Dict[str, Any],
        template: ContentTemplate,
        custom_options: Optional[Dict],
        image_urls: List[str]
    ) -> str:
        """生成合成相片卡（將用戶相片按方塊規則與文字上下排列合併到一張圖片）。"""
        try:
            config = template.config.get('image', {})
            if custom_options and 'image' in custom_options:
                config.update(custom_options['image'])

            # 讀取 textLayout 配置
            text_layout_config = template.config.get('post', {}).get('textLayout', {})
            logger.info(f"[IG發布-合成] 讀取到 textLayout 配置: {text_layout_config}")

            cards = config.get('cards', {}) if isinstance(config.get('cards', {}), dict) else {}
            text_cfg = cards.get('text', config.get('text', {})) or {}
            ts_cfg = cards.get('timestamp', config.get('timestamp', {})) or {}
            logo_cfg = cards.get('logo', config.get('logo', {})) or {}
            pid_cfg = cards.get('postId', config.get('postId', {})) or {}

            pillow_config = {
                'width': config.get('width', 1080),
                'height': config.get('height', 1080),
                'background_color': config.get('background', {}).get('value', '#ffffff'),
                'font_family': text_cfg.get('font', config.get('text', {}).get('font', 'default')),
                'font_size': text_cfg.get('size', config.get('text', {}).get('size', 32)),
                'text_color': text_cfg.get('color', config.get('text', {}).get('color', '#333333')),
                'padding': config.get('padding', 60),
                'line_spacing': text_cfg.get('lineSpacing', config.get('text', {}).get('lineSpacing', 10)),

                # 文字排版（有相片）- 優先使用 textLayout 配置
                'text_max_chars_per_line_with_photo': text_layout_config.get('withPhoto', {}).get('maxCharsPerLine') if text_layout_config else text_cfg.get('maxCharsPerLine', 24),
                'text_max_lines_with_photo': text_layout_config.get('withPhoto', {}).get('maxLines') if text_layout_config else text_cfg.get('maxLines', 6),
                'with_photo_stacked': True,
                'text_pos_x': text_cfg.get('posX', 10),
                'text_pos_y': text_cfg.get('posY', 15),
                'image_pos_x': config.get('imagePosX', 10),
                'image_pos_y': config.get('imagePosY', 55),

                # 相片方塊
                'photo_square_size': config.get('photoSquareSize', max(120, int(min(config.get('width',1080), config.get('height',1080)) * 0.35))),
                'photo_border_radius': config.get('photoBorderRadius', 12),

                # 相片 URL 列表
                'image_urls': image_urls
            }

            # 時間戳/貼文ID/Meta 樣式（與 Pillow 期望鍵對齊）
            if ts_cfg:
                pillow_config['show_timestamp'] = bool(ts_cfg.get('enabled', True))
                fmt = ts_cfg.get('format') or ts_cfg.get('timestampFormat') or 'relative'
                pillow_config['timestamp_format'] = fmt
                if ts_cfg.get('position'):
                    pillow_config['timestamp_position'] = ts_cfg.get('position')
                if isinstance(ts_cfg.get('style'), dict):
                    st = ts_cfg.get('style')
                    pillow_config['metadata_size'] = st.get('size', pillow_config.get('font_size'))
                    pillow_config['metadata_color'] = st.get('color', '#666666')
                    if st.get('font'):
                        pillow_config['metadata_font'] = st.get('font')
            if pid_cfg:
                pillow_config['show_post_id'] = bool(pid_cfg.get('enabled', False))
                if pid_cfg.get('format'):
                    pillow_config['post_id_format'] = pid_cfg.get('format')
                if pid_cfg.get('position'):
                    pillow_config['post_id_position'] = pid_cfg.get('position')

            # 加上 LOGO 等
            if logo_cfg:
                pillow_config['logo_enabled'] = bool(logo_cfg.get('enabled', False))
                if logo_cfg.get('url'):
                    pillow_config['logo_url'] = logo_cfg.get('url')
                pillow_config['logo_size'] = logo_cfg.get('size', 80)
                pillow_config['logo_opacity'] = logo_cfg.get('opacity', 0.85)
                pillow_config['logo_position'] = logo_cfg.get('position', 'bottom-right')

            # **修復**: 處理有圖片公告貼文的文字內容
            photo_text_content = content_data.get('content', '')
            is_announcement = content_data.get('is_announcement', False)
            announcement_type = content_data.get('announcement_type', None)

            if is_announcement:
                if announcement_type == 'cross':
                    # 跨校公告
                    announcement_prefix = "▶ 跨校公告 ◁\n\n"
                else:
                    # 校內公告（包括 'school', 'platform' 等）
                    announcement_prefix = "▶ 校內公告 ◁\n\n"

                # 在圖片文字內容前添加公告標記
                photo_text_content = announcement_prefix + photo_text_content
                logger.info(f"[IG發布-合成] 貼文 {content_data.get('id')} 圖片添加{announcement_type or '一般'}公告標記")

            # 產生圖片（用 render_instagram_post）
            # 透過 unified_post_renderer，確保與 IG 手機預覽一致
            logger.info(f"[IG發布] 使用 unified_post_renderer 生成圖片 - Post ID: {content_data.get('id')}")
            from services.unified_post_renderer import get_renderer as _get_unified_renderer
            _renderer = _get_unified_renderer()
            image_buffer = _renderer.render_to_image(
                content={
                    'title': content_data.get('title', ''),
                    'text': photo_text_content,
                    'author': content_data.get('author', ''),
                    'school_name': content_data.get('school_name', ''),
                    'created_at': content_data.get('created_at'),
                    'id': content_data.get('id')
                },
                size='instagram_square',
                template='modern',
                config=pillow_config,
                logo_url=pillow_config.get('logo_url'),
                quality=int(config.get('quality', 90))
            )

            # 儲存與上傳（沿用 _generate_image 的流程）
            os.makedirs(self.output_dir, exist_ok=True)
            filename = f"composed_{content_data.get('id')}_{int(datetime.now(timezone.utc).timestamp()*1000)}.jpg"
            file_path = os.path.join(self.output_dir, filename)
            with open(file_path, 'wb') as f:
                f.write(image_buffer.getvalue())
            # 基本檔案驗證
            try:
                st = os.stat(file_path)
                if st.st_size <= 0:
                    raise ContentGenerationError("合成圖片為空檔案")
            except FileNotFoundError:
                raise ContentGenerationError(f"找不到合成圖片檔案: {file_path}")

            # 嘗試上傳到 CDN，如果失敗則使用本地路徑
            try:
                from utils.cdn_uploader import publish_to_cdn
                cdn_url = publish_to_cdn(file_path, subdir="social_media")

                if cdn_url:
                    logger.info(f"合成圖片已上傳到CDN: {cdn_url}")
                    return cdn_url
                else:
                    logger.warning("CDN未配置，使用本地路徑")

            except Exception as e:
                logger.warning(f"合成圖片CDN上傳失敗，使用本地路徑: {e}")

            # CDN 上傳失敗或未配置時，返回本地路徑
            public_base_url = os.getenv('PUBLIC_BASE_URL', 'http://localhost:7150').rstrip('/')
            relative_path = file_path.replace(self.output_root, '').lstrip('/')
            local_url = f"{public_base_url}/{relative_path}"

            logger.info(f"合成圖片本地路徑: {local_url}")
            return local_url

        except Exception as e:
            logger.error(f"合成相片卡生成失敗: {e}")
            raise
    
    def _build_preview_html(self, content_data: Dict[str, Any], config: Dict[str, Any]) -> str:
        """構建 HTML 內容用於圖片生成"""
        # 簡化的 HTML 模板
        html_template = '''
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{
                    margin: 0;
                    padding: 40px;
                    font-family: 'Noto Sans TC', sans-serif;
                    background: {background};
                    width: {width}px;
                    height: {height}px;
                    box-sizing: border-box;
                    position: relative;
                }}
                .content {{
                    color: {text_color};
                    font-size: {font_size}px;
                    line-height: 1.6;
                }}
                .title {{
                    font-size: {title_size}px;
                    font-weight: bold;
                    margin-bottom: 20px;
                    color: {title_color};
                }}
                .meta {{
                    position: absolute;
                    bottom: 40px;
                    right: 40px;
                    font-size: 14px;
                    color: #666;
                }}
                .logo {{
                    position: absolute;
                    top: 40px;
                    right: 40px;
                    width: {logo_size}px;
                    height: {logo_size}px;
                    background: #0066cc;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                }}
            </style>
        </head>
        <body>
            {logo_html}
            <div class="title">{title}</div>
            <div class="content">{content}</div>
            <div class="meta">{school_name} • {created_at}</div>
        </body>
        </html>
        '''
        
        # 應用配置
        background = config.get('background', {}).get('value', '#ffffff')
        text_color = config.get('text', {}).get('color', '#333333')
        font_size = config.get('text', {}).get('size', 28)
        title_color = config.get('title', {}).get('color', '#000000')
        title_size = config.get('title', {}).get('size', font_size + 8)
        logo_size = config.get('logo', {}).get('size', 60)
        width = config.get('width', 1080)
        height = config.get('height', 1080)
        
        # 處理 logo
        logo_html = ''
        if config.get('logo', {}).get('enabled', True):
            school_initial = content_data.get('school_name', '學校')[0]
            logo_html = f'<div class="logo">{school_initial}</div>'
        
        # 處理內容長度
        # 平台貼文無標題/內文分離，預設不顯示標題
        title = ''
        content = content_data.get('content', '')[:200]
        if len(content_data.get('content', '')) > 200:
            content += '...'
        
        # 格式化時間
        created_at = content_data.get('created_at', datetime.now())
        if isinstance(created_at, datetime):
            formatted_time = created_at.strftime('%Y-%m-%d')
        else:
            formatted_time = str(created_at)[:10]
        
        return html_template.format(
            background=background,
            text_color=text_color,
            font_size=font_size,
            title_color=title_color,
            title_size=title_size,
            logo_size=logo_size,
            width=width,
            height=height,
            logo_html=logo_html,
            title=title,
            content=content,
            school_name=content_data.get('school_name', ''),
            created_at=formatted_time
        )
    
    def _generate_caption(
        self,
        content_data: Dict[str, Any],
        template: ContentTemplate,
        custom_options: Optional[Dict] = None
    ) -> Dict[str, str]:
        """生成文案 - 重寫版本，只使用 caption 配置"""
        try:
            logger.info(f"開始生成文案 - Post ID: {content_data.get('id')}")

            # 只使用 caption 配置，完全忽略 multipost
            caption_config = template.config.get('caption', {})

            if custom_options and 'caption' in custom_options:
                caption_config = {**caption_config, **custom_options['caption']}

            # 檢查是否啟用 - 不使用預設值，強制要求明確配置
            if 'enabled' not in caption_config:
                raise ContentGenerationError("模板缺少 caption.enabled 配置，不可使用硬編碼預設值")
            if not caption_config['enabled']:
                raise ContentGenerationError("模板未啟用 caption 功能，無法生成文案")

            # 取得模板
            caption_template = caption_config.get('template')
            if not caption_template:
                raise ContentGenerationError("模板缺少 caption.template 配置")
            if 'maxLength' not in caption_config:
                raise ContentGenerationError("模板缺少 caption.maxLength 配置，不可使用硬編碼預設值")
            max_length = caption_config['maxLength']

            logger.info(f"使用 caption 模板: '{caption_template}'")

            # 生成標籤
            hashtags = self._generate_hashtags(content_data, template)
            hashtags_str = ' '.join(hashtags) if hashtags else ''

            # **修復**: 處理公告標記
            content_text = content_data.get('content', '')
            is_announcement = content_data.get('is_announcement', False)
            announcement_type = content_data.get('announcement_type', None)

            if is_announcement:
                if announcement_type == 'cross':
                    # 跨校公告
                    announcement_prefix = "▶ 跨校公告 ◁\n\n"
                else:
                    # 校內公告（包括 'school', 'platform' 等）
                    announcement_prefix = "▶ 校內公告 ◁\n\n"

                # 在內容前添加公告標記
                content_text = announcement_prefix + content_text
                logger.info(f"貼文 {content_data.get('id')} 為{announcement_type or '一般'}公告，添加標記")

            # 格式化文案
            caption = caption_template.format(
                content=content_text,
                author=content_data.get('author', ''),
                id=content_data.get('id', ''),
                title=content_data.get('title', ''),
                hashtags=hashtags_str,
                school_name=content_data.get('school_name', ''),
                category=content_data.get('category', '')
            )

            # 清理多餘空行
            try:
                lines = [ln.rstrip() for ln in caption.splitlines()]
                cleaned: list[str] = []
                empty = 0
                for ln in lines:
                    if ln.strip() == '':
                        empty += 1
                        if empty <= 1:
                            cleaned.append('')
                    else:
                        empty = 0
                        cleaned.append(ln)
                while cleaned and cleaned[0] == '':
                    cleaned.pop(0)
                while cleaned and cleaned[-1] == '':
                    cleaned.pop()
                caption = '\n'.join(cleaned)
            except Exception:
                pass

            # 限制長度
            if len(caption) > max_length:
                caption = caption[:max_length-3] + '...'

            logger.info(f"文案生成完成: '{caption[:50]}...'")
            return {'caption': caption}

        except ContentGenerationError:
            # 重新拋出 ContentGenerationError
            raise
        except Exception as e:
            logger.error(f"文案生成失敗: {e}")
            raise ContentGenerationError(f"文案生成過程中發生錯誤: {str(e)}")

    def _generate_caption_newstyle(self, content_data: Dict[str, Any], cap_cfg: Dict[str, Any]) -> str:
        """依照新版前端 caption 結構生成 IG 文案（與手機預覽一致）。
        結構：single.header/footer、repeating.idFormat/content/separator、hashtags
        這裡為單帖文組裝（輪播合併由 auto_publisher 負責）。
        """
        def replace_placeholders(text: str) -> str:
            if not text:
                return ''
            # 注意: 已移除 {link} 參數支援，因為 Instagram 不支援在說明文字放連結

            # **修復**: 處理公告標記
            content_text = str(content_data.get('content') or '')
            is_announcement = content_data.get('is_announcement', False)
            announcement_type = content_data.get('announcement_type', None)

            if is_announcement:
                if announcement_type == 'cross':
                    # 跨校公告
                    announcement_prefix = "▶ 跨校公告 ◁\n\n"
                else:
                    # 校內公告（包括 'school', 'platform' 等）
                    announcement_prefix = "▶ 校內公告 ◁\n\n"

                # 在內容前添加公告標記
                content_text = announcement_prefix + content_text

            sample = {
                'id': str(content_data.get('id') or ''),
                'content': content_text,
                'author': str(content_data.get('author') or ''),
                'school_name': str(content_data.get('school_name') or '')
            }
            out = str(text)
            for k, v in sample.items():
                out = out.replace('{' + k + '}', v)
            return out

        parts: list[str] = []

        # 1) Header（只顯示一次）
        single = cap_cfg.get('single', {}) or {}
        header = single.get('header', {}) or {}
        if header.get('enabled') and header.get('content'):
            parts.append(replace_placeholders(header.get('content', '')))

        # 2) Repeating 區段（單帖文只組一次）
        repeating = cap_cfg.get('repeating', {}) or {}
        rep_parts: list[str] = []
        # idFormat
        id_fmt = repeating.get('idFormat', {}) or {}
        if id_fmt.get('enabled') and id_fmt.get('format'):
            rep_parts.append(replace_placeholders(id_fmt.get('format', '')))
        # content
        rep_content = repeating.get('content', {}) or {}
        if rep_content.get('enabled') and rep_content.get('template'):
            rep_parts.append(replace_placeholders(rep_content.get('template', '')))
        # separator
        sep = repeating.get('separator', {}) or {}
        if sep.get('enabled') and sep.get('style'):
            rep_parts.append(sep.get('style'))
        if rep_parts:
            parts.append('\n'.join([p for p in rep_parts if str(p).strip() != '']))

        # 3) Footer（只顯示一次）
        footer = single.get('footer', {}) or {}
        if footer.get('enabled') and footer.get('content'):
            parts.append(replace_placeholders(footer.get('content', '')))

        # 4) Hashtags（新版模板中的固定標籤，避免與後續自動附加重複）
        hashtags_cfg = cap_cfg.get('hashtags', {}) or {}
        if hashtags_cfg.get('enabled') and hashtags_cfg.get('tags'):
            max_tags = int(hashtags_cfg.get('maxTags', len(hashtags_cfg.get('tags'))))
            tags = [t for t in hashtags_cfg.get('tags') if str(t).strip()][:max_tags]
            if tags:
                parts.append(' '.join(tags))

        # 清理連續空行
        try:
            lines = [ln.rstrip() for ln in '\n\n'.join([p for p in parts if str(p).strip()]).splitlines()]
            cleaned: list[str] = []
            empty = 0
            for ln in lines:
                if ln.strip() == '':
                    empty += 1
                    if empty <= 1:
                        cleaned.append('')
                else:
                    empty = 0
                    cleaned.append(ln)
            while cleaned and cleaned[0] == '':
                cleaned.pop(0)
            while cleaned and cleaned[-1] == '':
                cleaned.pop()
            return '\n'.join(cleaned)
        except Exception:
            return '\n\n'.join([p for p in parts if str(p).strip()])
    
    def _generate_hashtags(
        self, 
        content_data: Dict[str, Any], 
        template: ContentTemplate
    ) -> List[str]:
        """生成標籤"""
        hashtags: List[str] = []
        
        # 新版 caption 若已定義 hashtags（在正文內組裝），這裡避免重複加入相同列表
        caption_cfg = template.config.get('caption', {}) or {}
        newstyle_hashtags = []
        try:
            if caption_cfg.get('hashtags', {}).get('enabled'):
                newstyle_hashtags = caption_cfg.get('hashtags', {}).get('tags', []) or []
        except Exception:
            newstyle_hashtags = []
        
        # 舊版：模板固定 hashtags（若未使用新版 caption）
        if not newstyle_hashtags:
            template_hashtags = template.config.get('hashtags', [])
            hashtags.extend(template_hashtags)
        
        # 從帳號獲取自動標籤
        with get_session() as db:
            account = db.query(SocialAccount).filter(
                SocialAccount.id == template.account_id
            ).first()
            if account:
                hashtags.extend(account.auto_hashtags)
        
        # 從貼文標籤生成
        post_tags = content_data.get('tags', [])
        for tag in post_tags:
            if not tag.startswith('#'):
                tag = f'#{tag}'
            hashtags.append(tag)
        
        
        
        # 強化去重（忽略大小寫與首尾空白）
        seen = set()
        unique: List[str] = []
        for h in hashtags:
            hh = h.strip()
            if not hh:
                continue
            key = hh.lower()
            if key not in seen:
                seen.add(key)
                unique.append(hh)
        return unique
    
    def _generate_content_hash(self, content_data: Dict[str, Any]) -> str:
        """生成內容雜湊值用於快取"""
        content_str = json.dumps(content_data, sort_keys=True, default=str)
        return hashlib.md5(content_str.encode()).hexdigest()
    
    def preview_content(
        self,
        content_data: Dict[str, Any],
        template: ContentTemplate,
        custom_options: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """預覽內容生成結果（生成真實圖片用於預覽）"""
        try:
            logger.info(f"開始預覽內容生成 - 模板ID: {template.id}, 類型: {template.template_type}")
            result = {}

            # 如果有custom_options，需要創建一個更新後的模板配置
            if custom_options:
                # 創建模板的副本以避免修改原始模板
                updated_config = template.config.copy()

                # 合併multipost和caption配置
                if 'multipost' in custom_options:
                    updated_config['multipost'] = {**(updated_config.get('multipost', {})), **custom_options['multipost']}
                if 'caption' in custom_options:
                    updated_config['caption'] = {**(updated_config.get('caption', {})), **custom_options['caption']}

                # 創建臨時模板對象
                temp_template = ContentTemplate(
                    id=template.id,
                    name=template.name,
                    template_type=template.template_type,
                    config=updated_config,
                    is_active=template.is_active,
                    account_id=template.account_id
                )
                template_to_use = temp_template
            else:
                template_to_use = template

            # 生成文案預覽
            if template.template_type in [TemplateType.TEXT, TemplateType.COMBINED]:
                logger.info("生成文案預覽中...")
                caption_data = self._generate_caption(content_data, template_to_use, custom_options)
                result.update(caption_data)
                logger.info("文案預覽生成完成")

            # 生成真實圖片預覽
            if template.template_type in [TemplateType.IMAGE, TemplateType.COMBINED]:
                logger.info("開始圖片預覽生成...")
                config = template_to_use.config.get('image', {})
                if custom_options and 'image' in custom_options:
                    config.update(custom_options['image'])
                    logger.info(f"使用自訂配置: {custom_options['image']}")

                # 生成 HTML 預覽（保持向後兼容）
                result['preview_html'] = self._build_preview_html(content_data, config)
                logger.info("HTML 預覽生成完成")
                
                # 生成真實圖片預覽
                try:
                    logger.info("調用 _generate_image...")
                    image_url = self._generate_image(content_data, template_to_use, custom_options)
                    logger.info(f"圖片生成成功，URL: {image_url}")
                    result['image_url'] = image_url
                except Exception as img_error:
                    logger.error(f"圖片預覽生成失敗: {img_error}", exc_info=True)
                    # 如果圖片生成失敗，至少保留 HTML 預覽
            
            # 生成標籤
            result['hashtags'] = self._generate_hashtags(content_data, template)
            
            logger.info(f"預覽內容生成完成，結果鍵值: {list(result.keys())}")
            return result
            
        except Exception as e:
            logger.error(f"內容預覽失敗: {e}", exc_info=True)
            raise ContentGenerationError(f"內容預覽失敗: {str(e)}")

# 便捷函數
def generate_social_content(
    forum_post_id: int, 
    template_id: int,
    custom_options: Optional[Dict] = None
) -> Dict[str, Any]:
    """生成社交媒體內容的便捷函數"""
    with get_session() as db:
        forum_post = db.query(ForumPost).filter(ForumPost.id == forum_post_id).first()
        if not forum_post:
            raise ContentGenerationError(f"找不到論壇貼文 ID: {forum_post_id}")
        
        template = db.query(ContentTemplate).filter(ContentTemplate.id == template_id).first()
        if not template:
            raise ContentGenerationError(f"找不到內容模板 ID: {template_id}")
        
        generator = ContentGenerator()
        return generator.generate_content(forum_post, template, custom_options)

def preview_social_content(
    content_data: Dict[str, Any], 
    template_id: int,
    custom_options: Optional[Dict] = None
) -> Dict[str, Any]:
    """預覽社交媒體內容的便捷函數"""
    print(f"[DEBUG] preview_social_content called with template_id: {template_id}")
    logger.info(f"[DEBUG] preview_social_content called with template_id: {template_id}")
    with get_session() as db:
        template = db.query(ContentTemplate).filter(ContentTemplate.id == template_id).first()
        if not template:
            raise ContentGenerationError(f"找不到內容模板 ID: {template_id}")
        
        print(f"[DEBUG] Found template: {template.name}, type: {template.template_type}")
        logger.info(f"[DEBUG] Found template: {template.name}, type: {template.template_type}")
        generator = ContentGenerator()
        result = generator.preview_content(content_data, template, custom_options)
        print(f"[DEBUG] preview_content returned: {list(result.keys())}")
        logger.info(f"[DEBUG] preview_content returned: {list(result.keys())}")
        return result
