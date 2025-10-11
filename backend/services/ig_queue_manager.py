"""
Instagram 發布佇列管理器
管理批次發布和排程發布的佇列
"""

import logging
import uuid
import os
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from models import (
    InstagramPost, InstagramAccount, IGTemplate,
    PostStatus, PublishMode, Post
)
from services.ig_renderer import IGRenderer
from services.ig_caption_generator import IGCaptionGenerator

logger = logging.getLogger(__name__)


class IGQueueManager:
    """Instagram 發布佇列管理器"""

    def __init__(self, db_session: Session):
        self.db = db_session
        self.renderer = IGRenderer()
        self.caption_generator = IGCaptionGenerator()

    def add_to_queue(self, forum_post_id: int, account_id: int,
                    publish_mode: PublishMode = PublishMode.BATCH,
                    scheduled_at: datetime = None) -> Optional[int]:
        """
        將論壇貼文加入發布佇列

        Args:
            forum_post_id: 論壇貼文 ID
            account_id: Instagram 帳號 ID
            publish_mode: 發布模式
            scheduled_at: 排程時間（SCHEDULED 模式必填）

        Returns:
            int: InstagramPost ID，失敗返回 None
        """
        try:
            existing = self.db.query(InstagramPost).filter_by(
                forum_post_id=forum_post_id,
                ig_account_id=account_id
            ).first()

            if existing:
                logger.warning(f"論壇貼文 {forum_post_id} 已在佇列中")
                return existing.id

            account = self.db.query(InstagramAccount).filter_by(id=account_id).first()
            forum_post = self.db.query(Post).filter_by(id=forum_post_id).first()

            if not account or not forum_post:
                logger.error(f"找不到帳號或貼文")
                return None

            template_id = self._select_template(forum_post, account)
            if not template_id:
                logger.error(f"無可用模板")
                return None

            public_id = self._generate_public_id()

            ig_post = InstagramPost(
                public_id=public_id,
                forum_post_id=forum_post_id,
                ig_account_id=account_id,
                template_id=template_id,
                status=PostStatus.PENDING,
                publish_mode=publish_mode,
                scheduled_at=scheduled_at
            )

            self.db.add(ig_post)
            self.db.commit()

            logger.info(f"成功將貼文加入佇列: {public_id} (模式: {publish_mode})")
            return ig_post.id

        except Exception as e:
            logger.error(f"加入佇列失敗: {e}", exc_info=True)
            self.db.rollback()
            return None

    def render_post(self, post_id: int) -> bool:
        """
        渲染貼文（圖片 + Caption）

        Args:
            post_id: InstagramPost ID

        Returns:
            bool: 是否成功
        """
        post = self.db.query(InstagramPost).filter_by(id=post_id).first()
        if not post:
            logger.error(f"找不到 InstagramPost: {post_id}")
            return False

        try:
            post.status = PostStatus.RENDERING
            self.db.commit()

            forum_post = post.forum_post
            template = post.template
            account = post.account

            media_list = self._get_forum_post_media(forum_post)

            logger.info(f"渲染貼文圖片: {post.public_id}")
            cdn_path = self.renderer.render_post(forum_post, template, media_list, account=account)

            logger.info(f"生成貼文 Caption: {post.public_id}")
            caption = self.caption_generator.generate_single_caption(
                forum_post,
                template,
                account
            )

            post.rendered_image_cdn_path = cdn_path
            post.rendered_caption = caption
            post.status = PostStatus.READY
            self.db.commit()

            logger.info(f"成功渲染貼文: {post.public_id}")
            return True

        except Exception as e:
            logger.error(f"渲染貼文失敗: {e}", exc_info=True)
            post.status = PostStatus.FAILED
            post.error_message = f"渲染失敗: {str(e)}"
            self.db.commit()
            return False

    def create_carousel_batch(self, account_id: int, batch_count: int = 10) -> Optional[str]:
        """
        創建輪播批次（從 READY 狀態的貼文中選取）

        Args:
            account_id: Instagram 帳號 ID
            batch_count: 批次數量（最多 10）

        Returns:
            str: carousel_group_id，失敗返回 None
        """
        try:
            ready_posts = self.db.query(InstagramPost).filter(
                InstagramPost.ig_account_id == account_id,
                InstagramPost.status == PostStatus.READY,
                InstagramPost.publish_mode == PublishMode.BATCH,
                InstagramPost.carousel_group_id.is_(None)
            ).order_by(InstagramPost.created_at).limit(batch_count).all()

            if len(ready_posts) < batch_count:
                logger.info(f"貼文數量不足 ({len(ready_posts)}/{batch_count})，無法創建輪播")
                return None

            carousel_group_id = f"CG_{uuid.uuid4().hex[:12]}"

            for i, post in enumerate(ready_posts, 1):
                post.carousel_group_id = carousel_group_id
                post.carousel_position = i
                post.carousel_total = batch_count

            self.db.commit()

            logger.info(f"成功創建輪播批次: {carousel_group_id}, 包含 {batch_count} 篇貼文")
            return carousel_group_id

        except Exception as e:
            logger.error(f"創建輪播批次失敗: {e}", exc_info=True)
            self.db.rollback()
            return None

    def get_next_scheduled_posts(self, limit: int = 10) -> List[InstagramPost]:
        """
        獲取下一批排程貼文

        Args:
            limit: 最多返回數量

        Returns:
            list: InstagramPost 列表
        """
        now = datetime.now(timezone.utc)

        posts = self.db.query(InstagramPost).filter(
            InstagramPost.status == PostStatus.READY,
            InstagramPost.publish_mode == PublishMode.SCHEDULED,
            InstagramPost.scheduled_at <= now
        ).order_by(InstagramPost.scheduled_at).limit(limit).all()

        return posts

    def get_carousel_batch_by_group_id(self, carousel_group_id: str) -> List[InstagramPost]:
        """
        根據 carousel_group_id 獲取輪播批次

        Args:
            carousel_group_id: 輪播組 ID

        Returns:
            list: InstagramPost 列表（按位置排序）
        """
        posts = self.db.query(InstagramPost).filter_by(
            carousel_group_id=carousel_group_id
        ).order_by(InstagramPost.carousel_position).all()

        return posts

    def get_account_pending_count(self, account_id: int, publish_mode: PublishMode = None) -> int:
        """
        獲取帳號待發布貼文數量

        Args:
            account_id: Instagram 帳號 ID
            publish_mode: 發布模式過濾（可選）

        Returns:
            int: 待發布數量
        """
        query = self.db.query(InstagramPost).filter(
            InstagramPost.ig_account_id == account_id,
            InstagramPost.status.in_([PostStatus.READY, PostStatus.PENDING, PostStatus.RENDERING])
        )

        if publish_mode:
            query = query.filter(InstagramPost.publish_mode == publish_mode)

        return query.count()

    def get_ready_carousel_groups(self, account_id: int) -> List[str]:
        """
        獲取已準備好的輪播組 ID 列表

        Args:
            account_id: Instagram 帳號 ID

        Returns:
            list: carousel_group_id 列表
        """
        groups = self.db.query(InstagramPost.carousel_group_id).filter(
            InstagramPost.ig_account_id == account_id,
            InstagramPost.status == PostStatus.READY,
            InstagramPost.carousel_group_id.isnot(None)
        ).distinct().all()

        return [g[0] for g in groups]

    def check_batch_ready(self, account_id: int) -> bool:
        """
        檢查批次發布條件是否滿足

        Args:
            account_id: Instagram 帳號 ID

        Returns:
            bool: 是否可以創建批次
        """
        account = self.db.query(InstagramAccount).filter_by(id=account_id).first()
        if not account or account.publish_mode != PublishMode.BATCH:
            return False

        ready_count = self.get_account_pending_count(account_id, PublishMode.BATCH)
        return ready_count >= account.batch_count

    def cleanup_old_posts(self, days: int = 30):
        """
        清理舊的發布記錄

        Args:
            days: 保留天數
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        deleted = self.db.query(InstagramPost).filter(
            InstagramPost.status.in_([PostStatus.PUBLISHED, PostStatus.FAILED]),
            InstagramPost.created_at < cutoff
        ).delete()

        self.db.commit()

        logger.info(f"清理了 {deleted} 筆舊發布記錄（{days} 天前）")

    def _select_template(self, forum_post: Post, account: InstagramAccount) -> Optional[int]:
        """
        選擇合適的模板

        Args:
            forum_post: 論壇貼文
            account: Instagram 帳號

        Returns:
            int: 模板 ID
        """
        is_announcement = hasattr(forum_post, 'announcement_type') and forum_post.announcement_type

        if is_announcement:
            return account.announcement_template_id
        else:
            return account.general_template_id

    def _get_forum_post_media(self, forum_post: Post) -> List[str]:
        """
        獲取論壇貼文的媒體列表

        Args:
            forum_post: 論壇貼文

        Returns:
            list: 媒體檔案路徑列表
        """
        if not hasattr(forum_post, 'media') or not forum_post.media:
            return []

        media_paths = []
        image_exts = {"jpg","jpeg","png","webp","gif"}
        for media in forum_post.media:
            if hasattr(media, 'path'):
                cdn_base_url = os.getenv("CDN_PUBLIC_BASE_URL", "https://cdn.serelix.xyz").rstrip("/")
                path = str(media.path)
                ext = (path.rsplit('.', 1)[-1].split('?')[0] if '.' in path else '').lower()
                if ext in image_exts:
                    media_url = f"{cdn_base_url}/{path}"
                    media_paths.append(media_url)
                else:
                    logger.info(f"跳過非圖片媒體: {path}")

        return media_paths

    def _generate_public_id(self) -> str:
        """生成唯一的 public_id"""
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
        random_part = uuid.uuid4().hex[:6].upper()
        return f"IG-{timestamp}-{random_part}"

    def get_queue_stats(self) -> Dict:
        """
        獲取佇列統計

        Returns:
            dict: 統計數據
        """
        total_pending = self.db.query(InstagramPost).filter(
            InstagramPost.status.in_([PostStatus.PENDING, PostStatus.RENDERING])
        ).count()

        total_ready = self.db.query(InstagramPost).filter(
            InstagramPost.status == PostStatus.READY
        ).count()

        total_publishing = self.db.query(InstagramPost).filter(
            InstagramPost.status == PostStatus.PUBLISHING
        ).count()

        accounts = self.db.query(InstagramAccount).filter_by(is_active=True).all()

        account_stats = []
        for account in accounts:
            ready_count = self.get_account_pending_count(account.id)
            batch_ready = self.check_batch_ready(account.id) if account.publish_mode == PublishMode.BATCH else False

            account_stats.append({
                'account_id': account.id,
                'username': account.username,
                'publish_mode': account.publish_mode.value,
                'ready_count': ready_count,
                'batch_ready': batch_ready
            })

        return {
            'total_pending': total_pending,
            'total_ready': total_ready,
            'total_publishing': total_publishing,
            'accounts': account_stats
        }
