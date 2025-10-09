"""
Celery 應用初始化
提供 IG 任務的 worker 與 beat 排程支援。
"""

import os
from celery import Celery


def make_celery() -> Celery:
    broker_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    backend_url = os.getenv('REDIS_URL', broker_url)

    app = Celery('forumkit', broker=broker_url, backend=backend_url, include=[
        'services.tasks.ig_tasks',
    ])

    # 基本設定
    app.conf.update(
        timezone=os.getenv('TZ', 'Asia/Taipei'),
        enable_utc=True,
        worker_max_tasks_per_child=100,
        task_acks_late=True,
        task_serializer='json',
        accept_content=['json'],
        result_serializer='json',
        broker_connection_retry_on_startup=True,
    )

    # 啟用 beat 排程（若可用）
    try:
        from services.tasks.ig_tasks import get_celery_beat_schedule
        app.conf.beat_schedule = get_celery_beat_schedule()
    except Exception:
        # 若任務模組不可用，忽略排程設定
        pass

    return app


celery_app = make_celery()

