# backend/services/celery_app.py
"""
Celery 應用配置和初始化
處理 Instagram 發文的背景任務
"""
from celery import Celery
from celery.schedules import crontab
import os
import logging

# 設定日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Celery 配置
class CeleryConfig:
    # Broker 設定 (使用現有的 Redis)
    broker_url = os.getenv('REDIS_URL', 'redis://localhost:6379/1')
    result_backend = os.getenv('REDIS_URL', 'redis://localhost:6379/1')
    
    # 任務序列化
    task_serializer = 'json'
    result_serializer = 'json'
    accept_content = ['json']
    
    # 時區設定
    timezone = 'Asia/Taipei'
    enable_utc = True
    
    # 任務路由
    # 使用完整模組名稱以配合 autodiscover 與任務註冊名稱
    task_routes = {
        'services.instagram_tasks.*': {'queue': 'instagram'},
        'services.maintenance_tasks.*': {'queue': 'maintenance'},
    }
    
    # 定時任務
    beat_schedule = {
        # 每分鐘檢查待發布的定時貼文
        'process-scheduled-posts': {
            'task': 'services.instagram_tasks.process_scheduled_posts',
            'schedule': 60.0,  # 60 秒
        },
        
        # 每 5 分鐘檢查批量發布佇列
        'check-batch-queues': {
            'task': 'services.instagram_tasks.check_batch_queues', 
            'schedule': 300.0,  # 5 分鐘
        },
        
        # 每小時檢查 Token 是否過期
        'check-token-expiry': {
            'task': 'services.maintenance_tasks.check_token_expiry',
            'schedule': crontab(minute=0),  # 每小時
        },
        
        # 每天清理失敗超過 7 天的任務記錄
        'cleanup-old-failed-posts': {
            'task': 'services.maintenance_tasks.cleanup_old_failed_posts',
            'schedule': crontab(hour=2, minute=0),  # 每天凌晨 2 點
        },
        
        # 每週統計發布數據
        'weekly-stats-report': {
            'task': 'services.maintenance_tasks.generate_weekly_stats',
            'schedule': crontab(hour=9, minute=0, day_of_week=1),  # 每週一早上 9 點
        }
    }
    
    # Worker 配置
    worker_prefetch_multiplier = 1  # 避免任務積壓
    task_acks_late = True
    worker_max_tasks_per_child = 50  # 避免記憶體洩漏

# 創建 Celery 應用
celery_app = Celery('forumkit_instagram')
celery_app.config_from_object(CeleryConfig)

# 自動發現任務模組 + 顯式 include，雙保險避免註冊不到
celery_app.autodiscover_tasks(['services.instagram_tasks', 'services.maintenance_tasks'])
celery_app.conf.update(include=['services.instagram_tasks', 'services.maintenance_tasks'])

# 顯式導入以觸發裝飾器註冊（若 autodiscover 因封包結構而失效）
try:
    import services.instagram_tasks  # noqa: F401
    import services.maintenance_tasks  # noqa: F401
except Exception as _e:
    logger.warning(f"[Celery] Optional task modules import warning: {_e}")

@celery_app.task(bind=True)
def debug_task(self):
    """調試任務"""
    print(f'Request: {self.request!r}')
