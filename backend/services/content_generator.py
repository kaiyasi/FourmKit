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
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
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
        self.output_dir = os.path.join(os.getenv('UPLOAD_ROOT', 'uploads'), 'social_media')
        os.makedirs(self.output_dir, exist_ok=True)
    
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
            # 檢查模板是否包含 {id} 變數
            caption_template = template.config.get('caption', {}).get('template', '')
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
                result['image_url'] = self._generate_image(content_data, template, custom_options)
            elif template.template_type == TemplateType.TEXT:
                # IG 發布需要圖片：即便是文字模板，也用預設圖片渲染一張文字卡
                result['image_url'] = self._generate_image(content_data, template, custom_options)

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
        return {
            'id': forum_post.id,
            'title': getattr(forum_post, 'title', ''),
            'content': forum_post.content or '',
            'author': forum_post.author.username if forum_post.author else '匿名',
            'school_name': forum_post.school.name if forum_post.school else '未知學校',
            'created_at': forum_post.created_at,
            'category': getattr(forum_post, 'category', '一般'),
            'tags': getattr(forum_post, 'tags', []),
        }
    
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
            
            # 準備 Pillow 渲染配置
            pillow_config = {
                'width': config.get('width', 1080),
                'height': config.get('height', 1080),
                'background_color': config.get('background', {}).get('value', '#ffffff'),
                'font_family': config.get('text', {}).get('font', 'default'),
                'font_size': config.get('text', {}).get('size', 32),
                'text_color': config.get('text', {}).get('color', '#333333'),
                'padding': config.get('padding', 60),
                'line_spacing': config.get('text', {}).get('lineSpacing', 10),  # 改為像素值
                'logo': config.get('logo', {}),
                'max_content_lines': config.get('text', {}).get('maxLines', 8)
            }
            
            # 準備文字內容用於 Pillow 渲染 - 只顯示內文，不顯示標題
            text_content = content_data.get('content', '')
            
            # 使用 Pillow 渲染器生成圖片
            image_buffer = self.pillow_renderer.render_text_card(
                content=text_content,
                width=pillow_config.get('width', 1080),
                height=pillow_config.get('height', 1080),
                background_color=pillow_config.get('background_color', '#ffffff'),
                text_color=pillow_config.get('text_color', '#333333'),
                font_name=pillow_config.get('font_family'),
                font_size=pillow_config.get('font_size', 32),
                padding=pillow_config.get('padding', 60),
                line_spacing=pillow_config.get('line_spacing', 10)
            )
            
            # 儲存圖片（本機副本）
            post_id = content_data.get('id', 'preview')
            timestamp = int(datetime.now().timestamp())
            filename = f"post_{post_id}_{timestamp}.jpg"
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
            
            # 優先：將檔案發佈到 CDN（若已設定 CDN_PUBLIC_BASE_URL/PUBLIC_CDN_URL）
            try:
                from utils.cdn_uploader import publish_to_cdn
                cdn_url = publish_to_cdn(file_path, subdir="social_media")
            except Exception:
                cdn_url = None

            if cdn_url:
                return cdn_url

            # 次優先：以站台 BASE URL 對外提供
            public_base = (os.getenv('PUBLIC_BASE_URL') or '').rstrip('/')
            if public_base:
                return f"{public_base}/uploads/social_media/{filename}"

            # 最後：相對路徑（不建議，IG 無法抓取；保留相容性）
            return f"/uploads/social_media/{filename}"
                
        except Exception as e:
            logger.error(f"圖片生成失敗: {e}")
            raise ContentGenerationError(f"圖片生成失敗: {str(e)} at output_dir={self.output_dir}")
    
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
        title = content_data.get('title', '')[:50]
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
        """生成文案"""
        try:
            config = template.config.get('caption', {})
            if custom_options and 'caption' in custom_options:
                config.update(custom_options['caption'])
            
            # 獲取文案模板
            caption_template = config.get('template', '{title}\n\n{content}')
            max_length = config.get('max_length', 2200)
            
            # 生成標籤
            hashtags = self._generate_hashtags(content_data, template)
            hashtags_str = ' '.join(hashtags) if hashtags else ''
            
            # 格式化文案
            caption = caption_template.format(
                title=content_data.get('title', ''),
                content=content_data.get('content', ''),
                author=content_data.get('author', ''),
                id=content_data.get('id', ''),
                hashtags=hashtags_str,
                school_name=content_data.get('school_name', ''),
                category=content_data.get('category', '')
            )
            
            # 限制長度
            if len(caption) > max_length:
                caption = caption[:max_length-3] + '...'
            
            return {'caption': caption}
            
        except Exception as e:
            logger.error(f"文案生成失敗: {e}")
            return {'caption': content_data.get('title', '') or content_data.get('content', '')[:100]}
    
    def _generate_hashtags(
        self, 
        content_data: Dict[str, Any], 
        template: ContentTemplate
    ) -> List[str]:
        """生成標籤"""
        hashtags = []
        
        # 從模板獲取預設標籤
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
        
        # 基於學校添加標籤
        school_name = content_data.get('school_name', '')
        if school_name and school_name != '未知學校':
            hashtags.append(f'#{school_name}')
        
        # 去重並返回
        return list(dict.fromkeys(hashtags))  # 保持順序的去重
    
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
            
            # 生成文案預覽
            if template.template_type in [TemplateType.TEXT, TemplateType.COMBINED]:
                logger.info("生成文案預覽中...")
                caption_data = self._generate_caption(content_data, template, custom_options)
                result.update(caption_data)
                logger.info("文案預覽生成完成")
            
            # 生成真實圖片預覽
            if template.template_type in [TemplateType.IMAGE, TemplateType.COMBINED]:
                logger.info("開始圖片預覽生成...")
                config = template.config.get('image', {})
                if custom_options and 'image' in custom_options:
                    config.update(custom_options['image'])
                    logger.info(f"使用自訂配置: {custom_options['image']}")
                
                # 生成 HTML 預覽（保持向後兼容）
                result['preview_html'] = self._build_preview_html(content_data, config)
                logger.info("HTML 預覽生成完成")
                
                # 生成真實圖片預覽
                try:
                    logger.info("調用 _generate_image...")
                    image_url = self._generate_image(content_data, template, custom_options)
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
