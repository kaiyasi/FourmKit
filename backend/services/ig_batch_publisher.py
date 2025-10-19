"""
IG 批量發布系統 - 修復批量發布邏輯
真正的批量發布：一次處理設定數量的貼文，而不是等到累積夠數量才發布
"""
import asyncio
import logging
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

from utils.db import get_session
from models.instagram import IGAccount, IGPost, PostStatus, PublishMode
from services.ig_unified_system import IGUnifiedSystem, IGSystemError

logger = logging.getLogger(__name__)


class BatchPublishResult:
    """批量發布結果"""
    def __init__(self, account_id: int, batch_size: int):
        self.account_id = account_id
        self.batch_size = batch_size
        self.success_count = 0
        self.error_count = 0
        self.results: List[Dict[str, Any]] = []
        self.start_time = time.time()
        self.end_time = None
    
    def add_result(self, post_id: int, success: bool, message: str = "", 
                   post_url: str = None, error_code: str = None):
        """添加發布結果"""
        result = {
            "post_id": post_id,
            "success": success,
            "message": message,
            "post_url": post_url,
            "error_code": error_code,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        self.results.append(result)
        
        if success:
            self.success_count += 1
        else:
            self.error_count += 1
    
    def finish(self):
        """標記完成"""
        self.end_time = time.time()
    
    def to_dict(self) -> Dict[str, Any]:
        """轉換為字典"""
        duration = (self.end_time or time.time()) - self.start_time
        return {
            "account_id": self.account_id,
            "batch_size": self.batch_size,
            "success_count": self.success_count,
            "error_count": self.error_count,
            "total_processed": len(self.results),
            "success_rate": (self.success_count / max(len(self.results), 1)) * 100,
            "duration_seconds": round(duration, 2),
            "results": self.results,
            "summary": f"成功 {self.success_count}/{len(self.results)} 個貼文"
        }


class IGBatchPublisher:
    """IG 批量發布器"""
    
    def __init__(self, max_workers: int = 3, publish_delay: float = 2.0):
        """
        初始化批量發布器
        
        Args:
            max_workers: 最大並行工作數（避免 API 限制）
            publish_delay: 發布間隔秒數（避免觸發限制）
        """
        self.max_workers = max_workers
        self.publish_delay = publish_delay
        self.ig_system = IGUnifiedSystem()
    
    def get_pending_posts(self, account_id: int, batch_size: int) -> List[IGPost]:
        """獲取待發布的貼文"""
        try:
            with get_session() as db:
                posts = db.query(IGPost).filter(
                    IGPost.account_id == account_id,
                    IGPost.status.in_([PostStatus.pending, PostStatus.queued])
                ).order_by(
                    # 優先發布有預約時間且時間已到的
                    IGPost.scheduled_at.asc().nulls_last(),
                    IGPost.created_at.asc()
                ).limit(batch_size).all()
                
                # 過濾掉預約時間未到的貼文
                now = datetime.now(timezone.utc)
                ready_posts = []
                for post in posts:
                    if post.scheduled_at is None or post.scheduled_at <= now:
                        ready_posts.append(post)
                    if len(ready_posts) >= batch_size:
                        break
                
                return ready_posts
                
        except Exception as e:
            logger.error(f"獲取待發布貼文失敗 [account_id={account_id}]: {e}")
            return []
    
    def publish_single_post(self, post_id: int) -> Tuple[bool, str, str]:
        """
        發布單一貼文
        
        Returns:
            (success, message, post_url)
        """
        try:
            result = self.ig_system.publish_post(post_id)
            
            if result.get('success'):
                return (
                    True,
                    f"發布成功",
                    result.get('post_url', '')
                )
            else:
                return (
                    False,
                    result.get('error_message', '發布失敗'),
                    ''
                )
                
        except IGSystemError as e:
            logger.error(f"發布貼文失敗 [post_id={post_id}]: {e.message}")
            return (False, f"{e.code}: {e.message}", '')
        except Exception as e:
            logger.error(f"發布貼文時發生異常 [post_id={post_id}]: {e}")
            return (False, f"系統錯誤: {str(e)}", '')
    
    def batch_publish_account(self, account_id: int, batch_size: int = None) -> BatchPublishResult:
        """
        批量發布指定帳號的貼文
        
        Args:
            account_id: Instagram 帳號 ID
            batch_size: 批量大小，None 則使用帳號設定
            
        Returns:
            批量發布結果
        """
        logger.info(f"開始批量發布帳號 {account_id} 的貼文...")
        
        # 獲取帳號設定
        with get_session() as db:
            account = db.query(IGAccount).filter(IGAccount.id == account_id).first()
            if not account:
                result = BatchPublishResult(account_id, 0)
                result.add_result(0, False, "帳號不存在")
                result.finish()
                return result
            
            if account.status != 'active':
                result = BatchPublishResult(account_id, 0)
                result.add_result(0, False, f"帳號狀態異常: {account.status}")
                result.finish()
                return result
            
            # 使用指定批量大小或帳號設定
            final_batch_size = batch_size or account.batch_threshold
        
        # 獲取待發布貼文
        pending_posts = self.get_pending_posts(account_id, final_batch_size)
        
        result = BatchPublishResult(account_id, final_batch_size)
        
        if not pending_posts:
            result.add_result(0, True, "沒有待發布的貼文")
            result.finish()
            return result
        
        logger.info(f"找到 {len(pending_posts)} 個待發布貼文，開始批量處理...")
        
        # 批量發布（並行處理）
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # 提交所有發布任務
            future_to_post = {}
            for i, post in enumerate(pending_posts):
                # 添加發布間隔（避免 API 限制）
                if i > 0:
                    time.sleep(self.publish_delay)
                
                future = executor.submit(self.publish_single_post, post.id)
                future_to_post[future] = post
            
            # 處理結果
            for future in as_completed(future_to_post):
                post = future_to_post[future]
                try:
                    success, message, post_url = future.result()
                    result.add_result(
                        post.id,
                        success,
                        message,
                        post_url,
                        None if success else "PUBLISH_ERROR"
                    )
                    
                    if success:
                        logger.info(f"貼文 {post.id} 發布成功: {post_url}")
                    else:
                        logger.error(f"貼文 {post.id} 發布失敗: {message}")
                        
                except Exception as e:
                    logger.error(f"處理貼文 {post.id} 發布結果時發生錯誤: {e}")
                    result.add_result(
                        post.id,
                        False,
                        f"處理結果失敗: {str(e)}",
                        error_code="RESULT_ERROR"
                    )
        
        result.finish()
        
        # 更新帳號統計
        try:
            with get_session() as db:
                account = db.query(IGAccount).filter(IGAccount.id == account_id).first()
                if account and result.success_count > 0:
                    account.total_posts += result.success_count
                    account.last_post_at = datetime.now(timezone.utc)
                    db.commit()
        except Exception as e:
            logger.warning(f"更新帳號統計失敗: {e}")
        
        logger.info(f"批量發布完成: {result.summary}")
        return result
    
    def batch_publish_all_ready_accounts(self) -> Dict[str, Any]:
        """
        批量發布所有就緒的帳號
        檢查所有設定為批量模式的帳號，並發布其待發貼文
        """
        logger.info("開始檢查所有批量模式帳號...")
        
        results = []
        total_success = 0
        total_error = 0
        
        try:
            with get_session() as db:
                # 獲取所有批量模式的活躍帳號
                batch_accounts = db.query(IGAccount).filter(
                    IGAccount.status == 'active',
                    IGAccount.publish_mode == PublishMode.batch
                ).all()
                
                logger.info(f"找到 {len(batch_accounts)} 個批量模式帳號")
                
                for account in batch_accounts:
                    try:
                        # 檢查是否有待發布的貼文
                        pending_count = db.query(IGPost).filter(
                            IGPost.account_id == account.id,
                            IGPost.status.in_([PostStatus.pending, PostStatus.queued])
                        ).count()
                        
                        if pending_count == 0:
                            logger.debug(f"帳號 {account.id} 沒有待發布貼文，跳過")
                            continue
                        
                        # 執行批量發布
                        batch_result = self.batch_publish_account(account.id)
                        results.append(batch_result.to_dict())
                        
                        total_success += batch_result.success_count
                        total_error += batch_result.error_count
                        
                        logger.info(f"帳號 {account.id} 批量發布結果: {batch_result.summary}")
                        
                    except Exception as e:
                        logger.error(f"處理帳號 {account.id} 時發生錯誤: {e}")
                        error_result = {
                            "account_id": account.id,
                            "success_count": 0,
                            "error_count": 1,
                            "error_message": str(e)
                        }
                        results.append(error_result)
                        total_error += 1
        
        except Exception as e:
            logger.error(f"批量發布檢查過程中發生錯誤: {e}")
            return {
                "success": False,
                "error": str(e),
                "processed_accounts": 0,
                "total_success": 0,
                "total_error": 1
            }
        
        summary = {
            "success": True,
            "processed_accounts": len(results),
            "total_success": total_success,
            "total_error": total_error,
            "results": results,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        logger.info(f"批量發布檢查完成: 處理了 {len(results)} 個帳號，成功 {total_success} 個，失敗 {total_error} 個")
        return summary
    
    def schedule_batch_publish(self, account_id: int, delay_minutes: int = 5) -> Dict[str, Any]:
        """
        排程批量發布（可以整合到 Celery 任務中）
        
        Args:
            account_id: 帳號 ID
            delay_minutes: 延遲分鐘數
        """
        # 這裡可以整合 Celery 的 apply_async
        # 目前先返回排程信息
        scheduled_at = datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)
        
        return {
            "account_id": account_id,
            "scheduled_at": scheduled_at.isoformat(),
            "delay_minutes": delay_minutes,
            "message": f"已排程在 {delay_minutes} 分鐘後執行批量發布"
        }


# 全域實例
_batch_publisher = None


def get_batch_publisher() -> IGBatchPublisher:
    """獲取批量發布器實例（單例模式）"""
    global _batch_publisher
    if _batch_publisher is None:
        _batch_publisher = IGBatchPublisher()
    return _batch_publisher