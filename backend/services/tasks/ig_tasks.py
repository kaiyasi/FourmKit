"""
Instagram 整合系統 Celery 定時任務
處理批次發布、排程發布、Token 刷新等自動化任務
"""

import logging
from datetime import datetime, timezone, timedelta
from celery import shared_task
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from utils.db import get_db
from models import (
    InstagramAccount, InstagramPost, PostStatus, PublishMode
)
from services.ig_publisher import IGPublisher
from services.ig_queue_manager import IGQueueManager
from services.ig_token_manager import IGTokenManager

logger = logging.getLogger(__name__)


@shared_task(name='ig.render_pending_posts')
def render_pending_posts():
    """
    渲染所有 PENDING 狀態的貼文
    每 5 分鐘執行一次
    """
    db = next(get_db())
    try:
        queue_manager = IGQueueManager(db)

        pending_posts = db.query(InstagramPost).filter_by(
            status=PostStatus.PENDING
        ).limit(50).all()

        if not pending_posts:
            logger.debug("沒有待渲染的貼文")
            return {'rendered': 0}

        rendered_count = 0
        failed_count = 0

        for post in pending_posts:
            try:
                success = queue_manager.render_post(post.id)
                if success:
                    rendered_count += 1
                else:
                    failed_count += 1
            except Exception as e:
                logger.error(f"渲染貼文 {post.public_id} 失敗: {e}")
                failed_count += 1

        logger.info(f"渲染完成: 成功 {rendered_count}, 失敗 {failed_count}")
        return {
            'rendered': rendered_count,
            'failed': failed_count
        }

    except Exception as e:
        logger.error(f"渲染任務失敗: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@shared_task(name='ig.check_batch_publish')
def check_batch_publish():
    """
    檢查批次發布條件
    每 5 分鐘執行一次
    """
    db = next(get_db())
    try:
        queue_manager = IGQueueManager(db)
        publisher = IGPublisher(db)

        batch_accounts = db.query(InstagramAccount).filter_by(
            is_active=True,
            publish_mode=PublishMode.BATCH
        ).all()

        created_batches = 0
        published_batches = 0

        for account in batch_accounts:
            try:
                if queue_manager.check_batch_ready(account.id):
                    carousel_group_id = queue_manager.create_carousel_batch(
                        account.id,
                        account.batch_count
                    )

                    if carousel_group_id:
                        created_batches += 1
                        logger.info(f"為帳號 {account.username} 創建輪播批次: {carousel_group_id}")

                        posts = queue_manager.get_carousel_batch_by_group_id(carousel_group_id)
                        post_ids = [p.id for p in posts]

                        success = publisher.publish_carousel(account.id, post_ids)
                        if success:
                            published_batches += 1
                        else:
                            logger.error(f"發布輪播批次失敗: {carousel_group_id}")

            except Exception as e:
                logger.error(f"處理帳號 {account.username} 批次發布失敗: {e}")
                continue

        logger.info(f"批次檢查完成: 創建 {created_batches} 個批次, 發布 {published_batches} 個批次")
        return {
            'created_batches': created_batches,
            'published_batches': published_batches
        }

    except Exception as e:
        logger.error(f"批次發布檢查任務失敗: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@shared_task(name='ig.check_scheduled_publish')
def check_scheduled_publish():
    """
    檢查排程發布
    每分鐘執行一次
    """
    db = next(get_db())
    try:
        queue_manager = IGQueueManager(db)
        publisher = IGPublisher(db)

        scheduled_posts = queue_manager.get_next_scheduled_posts(limit=50)

        if not scheduled_posts:
            logger.debug("沒有到期的排程貼文")
            return {'published': 0}

        published_count = 0
        failed_count = 0

        for post in scheduled_posts:
            try:
                if post.carousel_group_id:
                    if post.carousel_position == 1:
                        posts = queue_manager.get_carousel_batch_by_group_id(
                            post.carousel_group_id
                        )
                        post_ids = [p.id for p in posts]
                        success = publisher.publish_carousel(post.ig_account_id, post_ids)
                    else:
                        continue
                else:
                    success = publisher.publish_single_post(post.id)

                if success:
                    published_count += 1
                else:
                    failed_count += 1

            except Exception as e:
                logger.error(f"發布排程貼文 {post.public_id} 失敗: {e}")
                failed_count += 1

        logger.info(f"排程發布完成: 成功 {published_count}, 失敗 {failed_count}")
        return {
            'published': published_count,
            'failed': failed_count
        }

    except Exception as e:
        logger.error(f"排程發布檢查任務失敗: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@shared_task(name='ig.process_publish_queue')
def process_publish_queue():
    """
    處理發布佇列（批次模式）
    每 30 分鐘執行一次，從佇列中取出一個輪播發布
    """
    db = next(get_db())
    try:
        queue_manager = IGQueueManager(db)
        publisher = IGPublisher(db)

        batch_accounts = db.query(InstagramAccount).filter_by(
            is_active=True,
            publish_mode=PublishMode.BATCH
        ).all()

        published_count = 0

        for account in batch_accounts:
            try:
                carousel_groups = queue_manager.get_ready_carousel_groups(account.id)

                if carousel_groups:
                    carousel_group_id = carousel_groups[0]
                    posts = queue_manager.get_carousel_batch_by_group_id(carousel_group_id)
                    post_ids = [p.id for p in posts]

                    logger.info(f"處理佇列: 發布輪播 {carousel_group_id}")
                    success = publisher.publish_carousel(account.id, post_ids)

                    if success:
                        published_count += 1

            except Exception as e:
                logger.error(f"處理帳號 {account.username} 佇列失敗: {e}")
                continue

        logger.info(f"佇列處理完成: 發布 {published_count} 個輪播")
        return {'published': published_count}

    except Exception as e:
        logger.error(f"佇列處理任務失敗: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@shared_task(name='ig.auto_refresh_tokens')
def auto_refresh_tokens():
    """
    自動刷新即將過期的 Token
    每天執行一次
    """
    db = next(get_db())
    try:
        token_manager = IGTokenManager(db)

        expiring_soon = datetime.now(timezone.utc) + timedelta(days=7)
        accounts = db.query(InstagramAccount).filter(
            InstagramAccount.is_active == True,
            InstagramAccount.token_expires_at <= expiring_soon
        ).all()

        if not accounts:
            logger.info("沒有需要刷新的 Token")
            return {'refreshed': 0}

        refreshed_count = 0
        failed_count = 0

        for account in accounts:
            try:
                success = token_manager.refresh_token(account.id)
                if success:
                    refreshed_count += 1
                    logger.info(f"成功刷新帳號 {account.username} 的 Token")
                else:
                    failed_count += 1
                    logger.warning(f"刷新帳號 {account.username} 的 Token 失敗")

            except Exception as e:
                logger.error(f"刷新帳號 {account.username} Token 時發生錯誤: {e}")
                failed_count += 1

        logger.info(f"Token 刷新完成: 成功 {refreshed_count}, 失敗 {failed_count}")
        return {
            'refreshed': refreshed_count,
            'failed': failed_count
        }

    except Exception as e:
        logger.error(f"Token 刷新任務失敗: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@shared_task(name='ig.cleanup_preview_images')
def cleanup_preview_images():
    """
    清理超過 1 小時的預覽圖片
    每小時執行一次
    """
    import os
    import glob
    from pathlib import Path

    try:
        preview_dir = "/uploads/ig_preview"
        if not os.path.exists(preview_dir):
            return {'deleted': 0}

        cutoff_time = datetime.now().timestamp() - 3600
        deleted_count = 0

        for filepath in glob.glob(f"{preview_dir}/preview_*.jpg"):
            try:
                if os.path.getmtime(filepath) < cutoff_time:
                    os.remove(filepath)
                    deleted_count += 1
            except Exception as e:
                logger.warning(f"刪除預覽圖片失敗 {filepath}: {e}")

        if deleted_count > 0:
            logger.info(f"清理了 {deleted_count} 個過期的預覽圖片")

        return {'deleted': deleted_count}

    except Exception as e:
        logger.error(f"清理預覽圖片任務失敗: {e}", exc_info=True)
        return {'error': str(e)}


@shared_task(name='ig.cleanup_old_posts')
def cleanup_old_posts():
    """
    清理 30 天前的舊發布記錄
    每週執行一次
    """
    db = next(get_db())
    try:
        queue_manager = IGQueueManager(db)
        queue_manager.cleanup_old_posts(days=30)

        logger.info("舊發布記錄清理完成")
        return {'success': True}

    except Exception as e:
        logger.error(f"清理舊記錄任務失敗: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@shared_task(name='ig.retry_failed_posts')
def retry_failed_posts():
    """
    自動重試失敗的貼文（未超過最大重試次數）
    每 30 分鐘執行一次
    """
    db = next(get_db())
    try:
        publisher = IGPublisher(db)

        failed_posts = db.query(InstagramPost).filter(
            and_(
                InstagramPost.status == PostStatus.FAILED,
                InstagramPost.retry_count < InstagramPost.max_retries,
                or_(
                    InstagramPost.last_retry_at.is_(None),
                    InstagramPost.last_retry_at < datetime.now(timezone.utc) - timedelta(hours=1)
                )
            )
        ).limit(10).all()

        if not failed_posts:
            logger.debug("沒有需要重試的失敗貼文")
            return {'retried': 0}

        retried_count = 0
        success_count = 0

        for post in failed_posts:
            try:
                success = publisher.retry_failed_post(post.id)
                retried_count += 1
                if success:
                    success_count += 1

            except Exception as e:
                logger.error(f"重試貼文 {post.public_id} 失敗: {e}")

        logger.info(f"失敗貼文重試完成: 重試 {retried_count}, 成功 {success_count}")
        return {
            'retried': retried_count,
            'success': success_count
        }

    except Exception as e:
        logger.error(f"重試失敗貼文任務失敗: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@shared_task(name='ig.instant_publish_announcement')
def instant_publish_announcement(forum_post_id: int):
    """
    即時發布公告貼文
    由論壇貼文審核通過時觸發

    Args:
        forum_post_id: 論壇貼文 ID
    """
    db = next(get_db())
    try:
        from models import Post

        forum_post = db.query(Post).filter_by(id=forum_post_id).first()
        if not forum_post:
            logger.error(f"找不到論壇貼文: {forum_post_id}")
            return {'error': 'Post not found'}

        is_announcement = hasattr(forum_post, 'announcement_type') and forum_post.announcement_type

        if not is_announcement:
            logger.info(f"貼文 {forum_post_id} 不是公告，跳過即時發布")
            return {'skipped': True, 'reason': 'Not an announcement'}

        queue_manager = IGQueueManager(db)
        publisher = IGPublisher(db)

        if forum_post.school_id:
            accounts = db.query(InstagramAccount).filter_by(
                school_id=forum_post.school_id,
                is_active=True,
                publish_mode=PublishMode.INSTANT
            ).all()
        else:
            accounts = db.query(InstagramAccount).filter_by(
                is_active=True,
                publish_mode=PublishMode.INSTANT
            ).all()

        if not accounts:
            logger.warning(f"沒有找到相關的即時發布帳號")
            return {'published': 0, 'reason': 'No accounts found'}

        published_count = 0

        for account in accounts:
            try:
                post_id = queue_manager.add_to_queue(
                    forum_post_id,
                    account.id,
                    publish_mode=PublishMode.INSTANT
                )

                if not post_id:
                    continue

                success = queue_manager.render_post(post_id)
                if not success:
                    logger.error(f"渲染失敗: {post_id}")
                    continue

                success = publisher.publish_single_post(post_id)
                if success:
                    published_count += 1

            except Exception as e:
                logger.error(f"發布到帳號 {account.username} 失敗: {e}")
                continue

        logger.info(f"公告即時發布完成: 成功 {published_count}/{len(accounts)}")
        return {
            'published': published_count,
            'total_accounts': len(accounts)
        }

    except Exception as e:
        logger.error(f"即時發布任務失敗: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()



def get_celery_beat_schedule():
    """
    獲取 Celery Beat 排程配置

    在 celery_app.py 中使用：
    app.conf.beat_schedule = get_celery_beat_schedule()
    """
    return {
        'render-pending-posts': {
            'task': 'ig.render_pending_posts',
            'schedule': 300.0,
        },

        'check-batch-publish': {
            'task': 'ig.check_batch_publish',
            'schedule': 300.0,
        },

        'check-scheduled-publish': {
            'task': 'ig.check_scheduled_publish',
            'schedule': 60.0,
        },

        'process-publish-queue': {
            'task': 'ig.process_publish_queue',
            'schedule': 1800.0,
        },

        'auto-refresh-tokens': {
            'task': 'ig.auto_refresh_tokens',
            'schedule': 86400.0,
        },

        'cleanup-preview-images': {
            'task': 'ig.cleanup_preview_images',
            'schedule': 3600.0,
        },

        'cleanup-old-posts': {
            'task': 'ig.cleanup_old_posts',
            'schedule': 604800.0,
        },

        'retry-failed-posts': {
            'task': 'ig.retry_failed_posts',
            'schedule': 1800.0,
        },
    }
