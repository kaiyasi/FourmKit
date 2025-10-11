# backend/services/ig_task_processor.py
"""
Instagram 統一任務處理系統
處理排隊的發文任務、定時發布、批量處理等
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from celery import Celery
from celery.schedules import crontab
import os
import traceback
from dataclasses import asdict

from utils.db import get_session
from models.instagram import IGPost, IGAccount, IGTemplate, PostStatus, IGAccountStatus
from services.ig_unified_system import IGUnifiedSystem, IGSystemError


# 初始化 Celery（如果還沒有的話）
try:
    from main import celery_app
except ImportError:
    # 如果沒有現有的 Celery 實例，創建一個新的
    celery_app = Celery('ig_tasks')
    celery_app.config_from_object({
        'broker_url': os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
        'result_backend': os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0'),
        'task_serializer': 'json',
        'result_serializer': 'json',
        'accept_content': ['json'],
        'result_expires': 3600,
        'timezone': 'UTC',
        'enable_utc': True,
    })


class IGTaskProcessor:
    """Instagram 任務處理器"""
    
    def __init__(self):
        self.ig_system = IGUnifiedSystem()
    
    def process_pending_posts(self) -> Dict[str, Any]:
        """處理待發布的貼文"""
        results = {
            'processed': 0,
            'successful': 0,
            'failed': 0,
            'skipped': 0,
            'errors': []
        }
        
        try:
            with get_session() as db:
                # 獲取待處理的貼文
                pending_posts = db.query(IGPost).filter(
                    IGPost.status == PostStatus.pending
                ).join(IGAccount).filter(
                    IGAccount.status == IGAccountStatus.active
                ).limit(50).all()  # 限制批量處理數量
                
                for post in pending_posts:
                    results['processed'] += 1
                    
                    try:
                        # 更新狀態為處理中
                        post.status = PostStatus.processing
                        db.commit()
                        
                        # 發布貼文
                        publish_result = self.ig_system.publish_post(post.id)
                        
                        if publish_result.get('success'):
                            results['successful'] += 1
                        else:
                            results['failed'] += 1
                            results['errors'].append({
                                'post_id': post.id,
                                'error': publish_result.get('error_message', '未知錯誤')
                            })
                            
                    except Exception as e:
                        results['failed'] += 1
                        results['errors'].append({
                            'post_id': post.id,
                            'error': str(e)
                        })
                        
                        # 更新失敗狀態
                        try:
                            post.status = PostStatus.failed
                            post.error_message = str(e)
                            post.retry_count += 1
                            db.commit()
                        except:
                            pass
                
        except Exception as e:
            results['errors'].append({
                'system_error': str(e)
            })
        
        return results
    
    def process_scheduled_posts(self) -> Dict[str, Any]:
        """處理定時發布的貼文"""
        results = {
            'processed': 0,
            'successful': 0,
            'failed': 0,
            'errors': []
        }
        
        try:
            with get_session() as db:
                now = datetime.now(timezone.utc)
                
                # 獲取到期的定時發布貼文
                scheduled_posts = db.query(IGPost).filter(
                    IGPost.status == PostStatus.queued,
                    IGPost.scheduled_at <= now,
                    IGPost.scheduled_at.isnot(None)
                ).join(IGAccount).filter(
                    IGAccount.status == IGAccountStatus.active
                ).limit(20).all()
                
                for post in scheduled_posts:
                    results['processed'] += 1
                    
                    try:
                        # 更新狀態為處理中
                        post.status = PostStatus.processing
                        db.commit()
                        
                        # 發布貼文
                        publish_result = self.ig_system.publish_post(post.id)
                        
                        if publish_result.get('success'):
                            results['successful'] += 1
                        else:
                            results['failed'] += 1
                            results['errors'].append({
                                'post_id': post.id,
                                'error': publish_result.get('error_message', '未知錯誤')
                            })
                            
                    except Exception as e:
                        results['failed'] += 1
                        results['errors'].append({
                            'post_id': post.id,
                            'error': str(e)
                        })
                        
                        # 更新失敗狀態
                        try:
                            post.status = PostStatus.failed
                            post.error_message = str(e)
                            post.retry_count += 1
                            db.commit()
                        except:
                            pass
        
        except Exception as e:
            results['errors'].append({
                'system_error': str(e)
            })
        
        return results
    
    def retry_failed_posts(self, max_retries: int = 3) -> Dict[str, Any]:
        """重試失敗的貼文"""
        results = {
            'processed': 0,
            'successful': 0,
            'failed': 0,
            'errors': []
        }
        
        try:
            with get_session() as db:
                # 獲取需要重試的失敗貼文
                failed_posts = db.query(IGPost).filter(
                    IGPost.status == PostStatus.failed,
                    IGPost.retry_count < max_retries
                ).join(IGAccount).filter(
                    IGAccount.status == IGAccountStatus.active
                ).limit(10).all()
                
                for post in failed_posts:
                    results['processed'] += 1
                    
                    try:
                        # 重置狀態
                        post.status = PostStatus.processing
                        post.error_message = None
                        db.commit()
                        
                        # 重試發布
                        publish_result = self.ig_system.publish_post(post.id)
                        
                        if publish_result.get('success'):
                            results['successful'] += 1
                        else:
                            results['failed'] += 1
                            results['errors'].append({
                                'post_id': post.id,
                                'error': publish_result.get('error_message', '重試失敗')
                            })
                            
                    except Exception as e:
                        results['failed'] += 1
                        results['errors'].append({
                            'post_id': post.id,
                            'error': str(e)
                        })
                        
                        # 更新重試失敗狀態
                        try:
                            post.status = PostStatus.failed
                            post.error_message = f"重試失敗: {str(e)}"
                            post.retry_count += 1
                            db.commit()
                        except:
                            pass
        
        except Exception as e:
            results['errors'].append({
                'system_error': str(e)
            })
        
        return results
    
    def cleanup_old_images(self, days_old: int = 7) -> Dict[str, Any]:
        """清理舊的預覽圖片"""
        results = {
            'cleaned': 0,
            'errors': []
        }
        
        try:
            import os
            from pathlib import Path
            
            upload_root = os.getenv('UPLOAD_ROOT', 'uploads')
            ig_dir = Path(upload_root) / 'public' / 'instagram'
            
            if not ig_dir.exists():
                return results
            
            cutoff_time = datetime.now() - timedelta(days=days_old)
            
            for image_file in ig_dir.glob('*.jpg'):
                try:
                    # 檢查文件修改時間
                    file_mtime = datetime.fromtimestamp(image_file.stat().st_mtime)
                    
                    if file_mtime < cutoff_time:
                        # 檢查是否還在使用中
                        with get_session() as db:
                            in_use = db.query(IGPost).filter(
                                IGPost.generated_image.contains(image_file.name)
                            ).first()
                            
                            if not in_use:
                                image_file.unlink()
                                results['cleaned'] += 1
                                
                except Exception as e:
                    results['errors'].append({
                        'file': str(image_file),
                        'error': str(e)
                    })
        
        except Exception as e:
            results['errors'].append({
                'system_error': str(e)
            })
        
        return results


# Celery 任務定義
processor = IGTaskProcessor()

@celery_app.task(name='ig_unified.process_pending_posts')
def process_pending_posts_task():
    """處理待發布的貼文任務"""
    try:
        result = processor.process_pending_posts()
        return {
            'success': True,
            'data': result,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

@celery_app.task(name='ig_unified.process_scheduled_posts')
def process_scheduled_posts_task():
    """處理定時發布的貼文任務"""
    try:
        result = processor.process_scheduled_posts()
        return {
            'success': True,
            'data': result,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

@celery_app.task(name='ig_unified.retry_failed_posts')
def retry_failed_posts_task(max_retries: int = 3):
    """重試失敗的貼文任務"""
    try:
        result = processor.retry_failed_posts(max_retries)
        return {
            'success': True,
            'data': result,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

@celery_app.task(name='ig_unified.cleanup_old_images')
def cleanup_old_images_task(days_old: int = 7):
    """清理舊圖片任務"""
    try:
        result = processor.cleanup_old_images(days_old)
        return {
            'success': True,
            'data': result,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

@celery_app.task(name='ig_unified.publish_single_post')
def publish_single_post_task(post_id: int):
    """發布單個貼文任務"""
    try:
        ig_system = IGUnifiedSystem()
        result = ig_system.publish_post(post_id)
        return {
            'success': result.get('success', False),
            'data': result,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e),
            'post_id': post_id,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

# 定期任務配置
celery_app.conf.beat_schedule = {
    # 每 5 分鐘處理一次待發布的貼文
    'process-pending-posts': {
        'task': 'ig_unified.process_pending_posts',
        'schedule': 300.0,  # 5 分鐘
    },
    # 每 2 分鐘檢查定時發布
    'process-scheduled-posts': {
        'task': 'ig_unified.process_scheduled_posts',
        'schedule': 120.0,  # 2 分鐘
    },
    # 每小時重試失敗的貼文
    'retry-failed-posts': {
        'task': 'ig_unified.retry_failed_posts',
        'schedule': crontab(minute=0),  # 每小時整點
        'kwargs': {'max_retries': 3}
    },
    # 每天凌晨清理舊圖片
    'cleanup-old-images': {
        'task': 'ig_unified.cleanup_old_images',
        'schedule': crontab(hour=2, minute=0),  # 每天凌晨 2 點
        'kwargs': {'days_old': 7}
    },
}


# 工具函數
def trigger_immediate_processing():
    """立即觸發處理任務"""
    process_pending_posts_task.delay()
    process_scheduled_posts_task.delay()

def schedule_post_for_processing(post_id: int, delay_seconds: int = 0):
    """安排單個貼文進行處理"""
    if delay_seconds > 0:
        publish_single_post_task.apply_async(args=[post_id], countdown=delay_seconds)
    else:
        publish_single_post_task.delay(post_id)


# 導出
__all__ = [
    'IGTaskProcessor',
    'process_pending_posts_task',
    'process_scheduled_posts_task',
    'retry_failed_posts_task',
    'cleanup_old_images_task',
    'publish_single_post_task',
    'trigger_immediate_processing',
    'schedule_post_for_processing'
]