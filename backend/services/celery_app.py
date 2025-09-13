# backend/services/celery_app.py
"""
Celery 應用配置和初始化
處理背景任務
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
    task_routes = {
        'services.maintenance_tasks.*': {'queue': 'maintenance'},
        'services.auto_publisher.*': {'queue': 'instagram'},
    }
    
    # 定時任務
    beat_schedule = {
        # 每天清理過期的系統事件
        'cleanup-old-events': {
            'task': 'services.maintenance_tasks.cleanup_old_events',
            'schedule': crontab(hour=3, minute=0),  # 每天凌晨 3 點
        },
        # 每日刷新 IG Token（避免短時間過期）
        'refresh-instagram-tokens-daily': {
            'task': 'services.maintenance_tasks.refresh_instagram_tokens',
            'schedule': crontab(hour=4, minute=10),  # 每天 04:10
        },
        
        # 每分鐘檢查定時發布
        'check-scheduled-publishes': {
            'task': 'services.auto_publisher.check_scheduled_publishes',
            'schedule': 60.0,  # 60 秒
        },
    }
    
    # Worker 配置
    worker_prefetch_multiplier = 1  # 避免任務積壓
    task_acks_late = True
    worker_max_tasks_per_child = 50  # 避免記憶體洩漏

# 創建 Celery 應用
celery_app = Celery('forumkit')
celery_app.config_from_object(CeleryConfig)

# 自動發現任務模組
celery_app.autodiscover_tasks(['services.maintenance_tasks', 'services.auto_publisher'])
celery_app.conf.update(include=['services.maintenance_tasks', 'services.auto_publisher'])

# 顯式導入以觸發裝飾器註冊
try:
    import services.maintenance_tasks  # noqa: F401
    import services.auto_publisher  # noqa: F401
except Exception as _e:
    logger.warning(f"[Celery] Optional task modules import warning: {_e}")

@celery_app.task(bind=True)
def debug_task(self):
    """調試任務"""
    print(f'Request: {self.request!r}')
