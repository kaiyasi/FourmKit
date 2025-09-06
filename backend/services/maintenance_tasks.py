# backend/services/maintenance_tasks.py
"""
Instagram 系統維護相關的 Celery 任務
包含 Token 檢查、資料清理、統計報表等
"""
from celery.utils.log import get_task_logger
from datetime import datetime, timezone, timedelta
from typing import Dict, List
import traceback

from services.celery_app import celery_app
from services.instagram_api_service import InstagramAPIService, InstagramAPIError
from utils.db import get_session
from models.instagram import IGAccount, IGPost, PostStatus

logger = get_task_logger(__name__)

@celery_app.task
def check_token_expiry() -> Dict:
    """檢查所有 Instagram 帳號的 Token 過期狀態並自動更新"""
    logger.info("開始檢查 Instagram Token 過期狀態...")
    
    with get_session() as db:
        try:
            # 查詢所有活躍的帳號
            accounts = db.query(IGAccount).filter(
                IGAccount.status == 'active'
            ).all()
            
            checked_count = 0
            expired_count = 0
            refreshed_count = 0
            error_count = 0
            
            ig_api = InstagramAPIService()
            
            for account in accounts:
                try:
                    checked_count += 1
                    logger.info(f"檢查帳號 {account.id} ({account.ig_username}) 的 Token 狀態...")
                    
                    # 嘗試刷新 token
                    refresh_result = ig_api.refresh_token_if_needed(
                        account.page_token,
                        account.token_expires_at
                    )
                    
                    if refresh_result.get('refreshed'):
                        # Token 已更新
                        account.page_token = refresh_result['token']
                        if refresh_result.get('expires_in'):
                            expires_in_seconds = refresh_result['expires_in']
                            account.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)
                        account.updated_at = datetime.now(timezone.utc)
                        refreshed_count += 1
                        logger.info(f"帳號 {account.id} ({account.ig_username}) Token 已自動更新")
                    
                    elif 'error' in refresh_result:
                        # Token 更新失敗，標記為錯誤狀態
                        account.status = 'error'
                        expired_count += 1
                        logger.warning(f"帳號 {account.id} ({account.ig_username}) Token 失效: {refresh_result['error']}")
                        
                        # 停用所有待發布的貼文
                        pending_posts = db.query(IGPost).filter(
                            IGPost.account_id == account.id,
                            IGPost.status.in_([PostStatus.pending, PostStatus.queued])
                        ).all()
                        
                        for post in pending_posts:
                            post.status = PostStatus.failed
                            post.error_message = "帳號 Token 已過期"
                            post.updated_at = datetime.now(timezone.utc)
                    
                    else:
                        # Token 仍然有效
                        if account.status == 'error':
                            account.status = 'active'
                            logger.info(f"帳號 {account.id} ({account.ig_username}) Token 已恢復")
                    
                except Exception as e:
                    logger.error(f"檢查帳號 {account.id} 失敗: {str(e)}")
                    error_count += 1
            
            db.commit()
            
            logger.info(f"Token 檢查完成: 檢查 {checked_count} 個帳號, {refreshed_count} 個已更新, {expired_count} 個過期, {error_count} 個錯誤")
            
            return {
                "success": True,
                "checked_count": checked_count,
                "refreshed_count": refreshed_count,
                "expired_count": expired_count,
                "error_count": error_count
            }
            
        except Exception as e:
            logger.error(f"Token 檢查任務失敗: {str(e)}")
            logger.error(traceback.format_exc())
            
            return {
                "success": False,
                "error": str(e)
            }

@celery_app.task
def cleanup_old_failed_posts() -> Dict:
    """清理超過 7 天的失敗貼文記錄"""
    logger.info("開始清理舊的失敗貼文記錄...")
    
    with get_session() as db:
        try:
            # 計算 7 天前的時間
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=7)
            
            # 查詢要清理的記錄
            old_failed_posts = db.query(IGPost).filter(
                IGPost.status == PostStatus.failed,
                IGPost.updated_at < cutoff_date,
                IGPost.retry_count >= 3  # 只清理已經重試過的
            ).all()
            
            deleted_count = 0
            for post in old_failed_posts:
                logger.debug(f"清理失敗貼文記錄: {post.id}")
                db.delete(post)
                deleted_count += 1
            
            db.commit()
            
            logger.info(f"已清理 {deleted_count} 個舊的失敗貼文記錄")
            
            return {
                "success": True,
                "deleted_count": deleted_count,
                "cutoff_date": cutoff_date.isoformat()
            }
            
        except Exception as e:
            logger.error(f"清理失敗貼文記錄任務失敗: {str(e)}")
            logger.error(traceback.format_exc())
            
            return {
                "success": False,
                "error": str(e)
            }

@celery_app.task
def generate_weekly_stats() -> Dict:
    """生成每週統計報表"""
    logger.info("開始生成每週統計報表...")
    
    with get_session() as db:
        try:
            # 計算上週的時間範圍
            today = datetime.now(timezone.utc).date()
            last_monday = today - timedelta(days=today.weekday() + 7)
            last_sunday = last_monday + timedelta(days=6)
            
            last_week_start = datetime.combine(last_monday, datetime.min.time()).replace(tzinfo=timezone.utc)
            last_week_end = datetime.combine(last_sunday, datetime.max.time()).replace(tzinfo=timezone.utc)
            
            # 統計數據
            stats = {}
            
            # 總體統計
            total_posts = db.query(IGPost).filter(
                IGPost.created_at >= last_week_start,
                IGPost.created_at <= last_week_end
            ).count()
            
            published_posts = db.query(IGPost).filter(
                IGPost.published_at >= last_week_start,
                IGPost.published_at <= last_week_end,
                IGPost.status == PostStatus.published
            ).count()
            
            failed_posts = db.query(IGPost).filter(
                IGPost.updated_at >= last_week_start,
                IGPost.updated_at <= last_week_end,
                IGPost.status == PostStatus.failed
            ).count()
            
            stats['total'] = {
                "week_range": f"{last_monday.isoformat()} - {last_sunday.isoformat()}",
                "total_posts": total_posts,
                "published_posts": published_posts,
                "failed_posts": failed_posts,
                "success_rate": round((published_posts / total_posts * 100) if total_posts > 0 else 0, 2)
            }
            
            # 每個帳號的統計
            accounts = db.query(IGAccount).filter(IGAccount.status == 'active').all()
            account_stats = []
            
            for account in accounts:
                account_total = db.query(IGPost).filter(
                    IGPost.account_id == account.id,
                    IGPost.created_at >= last_week_start,
                    IGPost.created_at <= last_week_end
                ).count()
                
                account_published = db.query(IGPost).filter(
                    IGPost.account_id == account.id,
                    IGPost.published_at >= last_week_start,
                    IGPost.published_at <= last_week_end,
                    IGPost.status == PostStatus.published
                ).count()
                
                account_stats.append({
                    "account_id": account.id,
                    "ig_username": account.ig_username,
                    "total_posts": account_total,
                    "published_posts": account_published,
                    "success_rate": round((account_published / account_total * 100) if account_total > 0 else 0, 2)
                })
            
            stats['accounts'] = account_stats
            
            # 每日統計
            daily_stats = []
            current_date = last_week_start.date()
            
            while current_date <= last_week_end.date():
                day_start = datetime.combine(current_date, datetime.min.time()).replace(tzinfo=timezone.utc)
                day_end = datetime.combine(current_date, datetime.max.time()).replace(tzinfo=timezone.utc)
                
                day_published = db.query(IGPost).filter(
                    IGPost.published_at >= day_start,
                    IGPost.published_at <= day_end,
                    IGPost.status == PostStatus.published
                ).count()
                
                daily_stats.append({
                    "date": current_date.isoformat(),
                    "published_posts": day_published
                })
                
                current_date += timedelta(days=1)
            
            stats['daily'] = daily_stats
            
            # TODO: 可以將統計結果儲存到資料庫或發送通知
            logger.info(f"週報統計完成: {stats['total']}")
            
            return {
                "success": True,
                "stats": stats
            }
            
        except Exception as e:
            logger.error(f"生成週報統計任務失敗: {str(e)}")
            logger.error(traceback.format_exc())
            
            return {
                "success": False,
                "error": str(e)
            }

@celery_app.task
def retry_failed_posts(account_id: int = None, max_retries: int = 3) -> Dict:
    """重試失敗的貼文"""
    logger.info(f"開始重試失敗的貼文, 帳號 ID: {account_id}")
    
    with get_session() as db:
        try:
            # 建立查詢條件
            query = db.query(IGPost).filter(
                IGPost.status == PostStatus.failed,
                IGPost.retry_count < max_retries
            )
            
            if account_id:
                query = query.filter(IGPost.account_id == account_id)
            
            failed_posts = query.all()
            
            retried_count = 0
            for post in failed_posts:
                try:
                    # 重置狀態
                    post.status = PostStatus.pending
                    post.error_message = None
                    post.updated_at = datetime.now(timezone.utc)
                    
                    # 觸發重新處理
                    from services.instagram_tasks import process_post_for_instagram
                    process_post_for_instagram.delay(post.id)
                    
                    retried_count += 1
                    logger.info(f"已重新觸發貼文 {post.id} 處理")
                    
                except Exception as e:
                    logger.error(f"重試貼文 {post.id} 失敗: {str(e)}")
            
            db.commit()
            
            logger.info(f"重試任務完成: 重試了 {retried_count} 個失敗貼文")
            
            return {
                "success": True,
                "retried_count": retried_count,
                "total_found": len(failed_posts)
            }
            
        except Exception as e:
            logger.error(f"重試失敗貼文任務失敗: {str(e)}")
            logger.error(traceback.format_exc())
            
            return {
                "success": False,
                "error": str(e)
            }

@celery_app.task
def health_check() -> Dict:
    """Celery 系統健康檢查"""
    logger.info("執行 Celery 系統健康檢查...")
    
    try:
        with get_session() as db:
            # 檢查資料庫連線
            account_count = db.query(IGAccount).count()
            
            # 檢查待處理任務數量
            pending_count = db.query(IGPost).filter(
                IGPost.status == PostStatus.pending
            ).count()
            
            processing_count = db.query(IGPost).filter(
                IGPost.status == PostStatus.processing
            ).count()
            
            queued_count = db.query(IGPost).filter(
                IGPost.status == PostStatus.queued
            ).count()
            
            return {
                "success": True,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "database": {
                    "connected": True,
                    "total_accounts": account_count
                },
                "queue": {
                    "pending_posts": pending_count,
                    "processing_posts": processing_count,
                    "queued_posts": queued_count
                }
            }
            
    except Exception as e:
        logger.error(f"健康檢查失敗: {str(e)}")
        logger.error(traceback.format_exc())
        
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }