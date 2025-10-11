"""
Instagram 發布調度器
處理單篇和輪播貼文的發布流程
"""

import logging
import requests
from typing import List, Optional, Dict
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from models import InstagramPost, InstagramAccount, IGTemplate, PostStatus, PublishMode
from services.ig_api_client import IGAPIClient, IGAPIError
from services.ig_renderer import IGRenderer
from services.ig_caption_generator import IGCaptionGenerator
from utils.ig_crypto import decrypt_token

logger = logging.getLogger(__name__)


class IGPublisher:
    """Instagram 發布調度器"""

    def __init__(self, db_session: Session):
        self.db = db_session
        self.renderer = IGRenderer()
        self.caption_generator = IGCaptionGenerator()

    def publish_single_post(self, post_id: int) -> bool:
        """
        發布單篇貼文

        Args:
            post_id: InstagramPost ID

        Returns:
            bool: 是否成功發布
        """
        post = self.db.query(InstagramPost).filter_by(id=post_id).first()
        if not post:
            logger.error(f"找不到 InstagramPost: {post_id}")
            return False

        try:
            post.status = PostStatus.PUBLISHING
            self.db.commit()

            account = post.account
            if not account or not account.is_active:
                raise Exception("IG 帳號未啟用或不存在")

            access_token = decrypt_token(account.access_token_encrypted)

            if not post.rendered_image_cdn_path or not post.rendered_caption:
                raise Exception("貼文尚未渲染，無法發布")

            image_url = self._get_public_cdn_url(post.rendered_image_cdn_path)
            self._validate_media_url(image_url)

            with IGAPIClient(access_token, account.ig_user_id) as api_client:
                logger.info(f"為貼文 {post.public_id} 創建 Media Container")
                container_id = api_client.create_single_media_container(
                    image_url=image_url,
                    caption=post.rendered_caption
                )

                post.ig_container_id = container_id
                self.db.commit()

                try:
                    import os
                    wait_timeout = int(os.getenv('IG_MAX_WAIT', '600'))
                    wait_interval = int(os.getenv('IG_RETRY_INTERVAL', '2'))
                except Exception:
                    wait_timeout, wait_interval = 600, 2
                api_client.wait_until_finished(container_id, timeout=wait_timeout, interval=wait_interval)

                logger.info(f"發布貼文 {post.public_id}")
                result = api_client.publish_media(container_id)

                post.ig_media_id = result['id']
                post.ig_permalink = result['permalink']
                post.status = PostStatus.PUBLISHED
                post.published_at = datetime.now(timezone.utc)
                post.error_message = None
                post.error_code = None

                account.last_publish_at = datetime.now(timezone.utc)
                account.last_error = None

                self.db.commit()

                logger.info(f"成功發布貼文 {post.public_id}, IG Media ID: {result['id']}")
                return True

        except IGAPIError as e:
            logger.error(f"發布貼文失敗 (API 錯誤): {e}")
            self._handle_publish_error(post, e)
            return False

        except Exception as e:
            logger.error(f"發布貼文失敗: {e}", exc_info=True)
            self._handle_publish_error(post, Exception(str(e)))
            return False

    def publish_carousel(self, account_id: int, post_ids: List[int]) -> bool:
        """
        發布輪播貼文（最多 10 篇）

        Args:
            account_id: InstagramAccount ID
            post_ids: InstagramPost ID 列表（最多 10 個）

        Returns:
            bool: 是否成功發布
        """
        if not post_ids or len(post_ids) > 10:
            logger.error(f"輪播貼文數量錯誤: {len(post_ids)}")
            return False

        account = self.db.query(InstagramAccount).filter_by(id=account_id).first()
        if not account or not account.is_active:
            logger.error(f"IG 帳號 {account_id} 未啟用或不存在")
            return False

        posts = self.db.query(InstagramPost).filter(
            InstagramPost.id.in_(post_ids),
            InstagramPost.status == PostStatus.READY
        ).order_by(InstagramPost.id).all()

        if len(posts) != len(post_ids):
            logger.error(f"部分貼文不存在或狀態錯誤")
            return False

        try:
            for post in posts:
                post.status = PostStatus.PUBLISHING
            self.db.commit()

            access_token = decrypt_token(account.access_token_encrypted)

            with IGAPIClient(access_token, account.ig_user_id) as api_client:
                children_ids = []
                for i, post in enumerate(posts, 1):
                    logger.info(f"創建輪播項目 {i}/{len(posts)}: {post.public_id}")

                    if not post.rendered_image_cdn_path:
                        raise Exception(f"貼文 {post.public_id} 尚未渲染")

                    image_url = self._get_public_cdn_url(post.rendered_image_cdn_path)
                    self._validate_media_url(image_url) # 新增驗證步驟
                    
                    container_id = api_client.create_carousel_item_container(image_url)

                    children_ids.append(container_id)
                    post.ig_container_id = container_id

                self.db.commit()

                logger.info("生成輪播 Caption")
                forum_posts = [post.forum_post for post in posts]
                template = posts[0].template  # 使用第一篇的模板

                carousel_caption = self.caption_generator.generate_carousel_caption(
                    forum_posts,
                    template,
                    account
                )

                logger.info(f"創建輪播 Container，包含 {len(children_ids)} 個項目")
                carousel_container_id = api_client.create_carousel_container(
                    children_ids,
                    carousel_caption
                )

                try:
                    import os
                    wait_timeout = int(os.getenv('IG_MAX_WAIT', '600'))
                    wait_interval = int(os.getenv('IG_RETRY_INTERVAL', '2'))
                except Exception:
                    wait_timeout, wait_interval = 600, 2
                api_client.wait_until_finished(carousel_container_id, timeout=wait_timeout, interval=wait_interval)

                logger.info("發布輪播貼文")
                result = api_client.publish_media(carousel_container_id)

                for i, post in enumerate(posts, 1):
                    if i == 1:
                        post.ig_media_id = result['id']
                    else:
                        post.ig_media_id = None
                    post.ig_permalink = result['permalink']
                    post.rendered_caption = carousel_caption
                    post.carousel_position = i
                    post.carousel_total = len(posts)
                    post.status = PostStatus.PUBLISHED
                    post.published_at = datetime.now(timezone.utc)
                    post.error_message = None
                    post.error_code = None

                account.last_publish_at = datetime.now(timezone.utc)
                account.last_error = None

                self.db.commit()

                logger.info(f"成功發布輪播貼文，包含 {len(posts)} 篇，IG Media ID: {result['id']}")
                return True

        except IGAPIError as e:
            logger.error(f"發布輪播失敗 (API 錯誤): {e}")
            for post in posts:
                self._handle_publish_error(post, e)
            return False

        except Exception as e:
            logger.error(f"發布輪播失敗: {e}", exc_info=True)
            for post in posts:
                self._handle_publish_error(post, Exception(str(e)))
            return False

    def retry_failed_post(self, post_id: int) -> bool:
        """
        重試失敗的貼文

        Args:
            post_id: InstagramPost ID

        Returns:
            bool: 是否成功
        """
        post = self.db.query(InstagramPost).filter_by(id=post_id).first()
        if not post:
            logger.error(f"找不到 InstagramPost: {post_id}")
            return False

        if post.status != PostStatus.FAILED:
            logger.warning(f"貼文 {post.public_id} 狀態不是 FAILED，無法重試")
            return False

        if post.retry_count >= post.max_retries:
            logger.error(f"貼文 {post.public_id} 已達最大重試次數")
            return False

        post.retry_count += 1
        post.last_retry_at = datetime.now(timezone.utc)
        post.status = PostStatus.READY  # 重置為 READY
        self.db.commit()

        logger.info(f"重試貼文 {post.public_id} (第 {post.retry_count} 次)")

        if post.carousel_group_id:
            carousel_posts = self.db.query(InstagramPost).filter_by(
                carousel_group_id=post.carousel_group_id,
                status=PostStatus.FAILED
            ).all()

            for p in carousel_posts:
                p.status = PostStatus.READY
                p.retry_count += 1

            self.db.commit()

            post_ids = [p.id for p in carousel_posts]
            return self.publish_carousel(post.ig_account_id, post_ids)
        else:
            return self.publish_single_post(post_id)

    def _handle_publish_error(self, post: InstagramPost, error: Exception):
        """
        處理發布錯誤

        Args:
            post: InstagramPost 對象
            error: 錯誤實例
        """
        error_message = str(error)
        error_code = None

        if isinstance(error, IGAPIError):
            error_code = error.error_code

            with IGAPIClient('dummy', 'dummy') as api_client:
                error_type = api_client.classify_error(error)

            logger.error(f"錯誤類型: {error_type}, 錯誤碼: {error_code}, 訊息: {error_message}")

            if error_type == 'token':
                account = post.account
                account.last_error = f"Token 錯誤: {error_message}"
                account.last_error_at = datetime.now(timezone.utc)

        post.status = PostStatus.FAILED
        post.error_message = error_message[:1000]  # 限制長度
        post.error_code = error_code
        post.last_retry_at = datetime.now(timezone.utc)

        self.db.commit()

    def _validate_media_url(self, image_url: str):
        """
        驗證給定的 URL 是否指向一個有效的圖片。

        Args:
            image_url: 要驗證的 URL。

        Raises:
            Exception: 如果 URL 無效或內容類型不是圖片。
        """
        try:
            logger.info(f"正在驗證媒體 URL: {image_url}")
            with requests.head(image_url, stream=True, timeout=10, allow_redirects=True) as response:
                response.raise_for_status()  # 確保狀態碼是 2xx

                content_type = response.headers.get('Content-Type', '')
                logger.info(f"URL: {image_url}, Content-Type: {content_type}")

                if not content_type.lower().startswith('image/'):
                    raise Exception(f"無效的媒體類型 (Content-Type: {content_type})")
        
        except requests.exceptions.RequestException as e:
            logger.error(f"無法訪問媒體 URL: {image_url}, 錯誤: {e}")
            raise Exception(f"無法訪問媒體 URL: {image_url}") from e

    def _get_public_cdn_url(self, cdn_path: str) -> str:
        """
        將 CDN 路徑轉換為完整公開 URL

        Args:
            cdn_path: CDN 相對路徑

        Returns:
            str: 完整 URL
        """
        cdn_path = (cdn_path or '').strip()
        if not cdn_path:
            raise ValueError("cdn_path 不可為空")

        if cdn_path.startswith(('http://', 'https://')):
            return cdn_path

        import os

        cdn_base_url = (
            os.getenv('IG_CDN_BASE_URL')
            or os.getenv('CDN_PUBLIC_BASE_URL')
            or os.getenv('PUBLIC_CDN_URL')
            or 'https://cdn.serelix.xyz/'
        ).strip()

        if not cdn_base_url:
            raise ValueError("未設定 IG_CDN_BASE_URL/CDN_PUBLIC_BASE_URL/PUBLIC_CDN_URL")

        if not cdn_base_url.endswith('/'):
            cdn_base_url += '/'
        if cdn_path.startswith('/'):
            cdn_path = cdn_path[1:]

        return f"{cdn_base_url}{cdn_path}"

    def get_publish_stats(self, account_id: int, days: int = 7) -> Dict:
        """
        獲取發布統計

        Args:
            account_id: InstagramAccount ID
            days: 統計天數

        Returns:
            dict: 統計數據
        """
        from datetime import timedelta

        since = datetime.now(timezone.utc) - timedelta(days=days)

        posts = self.db.query(InstagramPost).filter(
            InstagramPost.ig_account_id == account_id,
            InstagramPost.created_at >= since
        ).all()

        total = len(posts)
        published = len([p for p in posts if p.status == PostStatus.PUBLISHED])
        failed = len([p for p in posts if p.status == PostStatus.FAILED])
        pending = len([p for p in posts if p.status in [PostStatus.PENDING, PostStatus.RENDERING, PostStatus.READY]])

        success_rate = (published / total * 100) if total > 0 else 0

        return {
            'total': total,
            'published': published,
            'failed': failed,
            'pending': pending,
            'success_rate': round(success_rate, 2),
            'period_days': days
        }
