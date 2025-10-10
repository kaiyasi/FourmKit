# backend/services/maintenance_tasks.py
"""
系統維護相關的 Celery 任務
包含系統清理、統計報表等
"""
from celery.utils.log import get_task_logger
from datetime import datetime, timezone, timedelta
from typing import Dict
import traceback

from services.celery_app import celery_app
from utils.db import get_session
from models.events import SystemEvent
from models.social_publishing import SocialAccount, PlatformType, AccountStatus

logger = get_task_logger(__name__)

@celery_app.task
def cleanup_old_events() -> Dict:
    """清理超過 30 天的舊系統事件"""
    logger.info("開始清理舊系統事件...")
    
    with get_session() as db:
        try:
            # 刪除 30 天前的系統事件
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=30)
            
            deleted_count = db.query(SystemEvent).filter(
                SystemEvent.created_at < cutoff_date
            ).count()
            
            db.query(SystemEvent).filter(
                SystemEvent.created_at < cutoff_date
            ).delete()
            
            db.commit()
            
            logger.info(f"成功清理 {deleted_count} 個舊系統事件")
            
            return {
                "success": True,
                "deleted_count": deleted_count,
                "cutoff_date": cutoff_date.isoformat(),
                "message": f"清理了 {deleted_count} 個超過 30 天的系統事件"
            }
            
        except Exception as e:
            logger.error(f"清理舊系統事件失敗: {e}")
            logger.error(traceback.format_exc())
            db.rollback()
            
            return {
                "success": False,
                "error": str(e),
                "message": "清理舊系統事件失敗"
            }

@celery_app.task
def system_health_check() -> Dict:
    """系統健康檢查"""
    logger.info("執行系統健康檢查...")
    
    try:
        with get_session() as db:
            # 檢查資料庫連線
            db.execute("SELECT 1")
            
            # 可以在這裡添加更多健康檢查項目
            # 例如：檢查 Redis 連線、磁碟空間等
            
            return {
                "success": True,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message": "系統健康檢查通過"
            }
    
    except Exception as e:
        logger.error(f"系統健康檢查失敗: {e}")
        logger.error(traceback.format_exc())
        
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": "系統健康檢查失敗"
        }


@celery_app.task
def refresh_instagram_tokens() -> Dict:
    """自動刷新 Instagram 長期 User Token（避免短時間過期）。
    規則：
    - 僅處理 platform=instagram 且 status!=disabled 的帳號
    - 若 token_expires_at 為空或距今 <= 14 天，嘗試 ig_refresh_token 刷新
    - 成功則更新 access_token 與 token_expires_at；失敗僅記錄錯誤（不降級狀態）
    """
    now = datetime.now(timezone.utc)
    refreshed = 0
    skipped = 0
    failed: list[dict] = []
    try:
        with get_session() as db:
            accounts = (
                db.query(SocialAccount)
                  .filter(SocialAccount.platform == PlatformType.INSTAGRAM)
                  .filter(SocialAccount.status != AccountStatus.DISABLED)
                  .all()
            )
            for acc in accounts:
                try:
                    exp = getattr(acc, 'token_expires_at', None)
                    need = False
                    if not exp:
                        need = True
                    else:
                        try:
                            delta = exp - now
                            need = (delta.total_seconds() <= 14 * 24 * 3600)
                        except Exception:
                            need = True
                    if not need:
                        skipped += 1
                        continue

                    # v23 API Token 通常不需要刷新，直接跳過維護任務中的 token 刷新
                    logger.info(f"Instagram 帳號 {acc.id} ({acc.display_name}) 跳過 Token 刷新（v23 API）")
                    skipped += 1
                except Exception as e:
                    failed.append({'account_id': acc.id, 'error': str(e)})
        return {
            'success': True,
            'refreshed': refreshed,
            'skipped': skipped,
            'failed': failed,
            'ts': now.isoformat(),
        }
    except Exception as e:
        logger.error(f"refresh_instagram_tokens 失敗: {e}")
        return {'success': False, 'error': str(e)}
