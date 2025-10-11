"""
平台事件服務
負責記錄平台啟動、關閉和重啟事件
"""

import os
import signal
import atexit
from datetime import datetime, timezone
from typing import Optional
import pytz
from utils.db import get_session
from services.event_service import EventService


class PlatformEventService:
    """平台事件服務類"""
    
    _instance = None
    _startup_recorded = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PlatformEventService, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._initialized = True
            self._setup_shutdown_handlers()
    
    def _setup_shutdown_handlers(self):
        """設置關閉事件處理器"""
        atexit.register(self._on_shutdown)
        
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)
        
        if os.name == 'nt':
            signal.signal(signal.SIGBREAK, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """信號處理器"""
        signal_name = {
            signal.SIGTERM: 'SIGTERM',
            signal.SIGINT: 'SIGINT',
            signal.SIGBREAK: 'SIGBREAK'
        }.get(signum, f'Signal {signum}')
        
        self.record_platform_stopped(f"收到信號: {signal_name}")
        exit(0)
    
    def _on_shutdown(self):
        """應用程序關閉時的處理"""
        if not self._startup_recorded:
            return
        
        try:
            self.record_platform_stopped("應用程序正常關閉")
        except Exception as e:
            print(f"記錄平台關閉事件時出錯: {e}")
    
    def record_platform_started(self, reason: str = "應用程序啟動") -> None:
        """記錄平台啟動事件"""
        if self._startup_recorded:
            return
        
        try:
            with get_session() as session:
                EventService.log_event(
                    session=session,
                    event_type="system.platform_started",
                    title="平台啟動",
                    description=f"平台已啟動 - {reason}",
                    severity="low",
                    actor_name="System",
                    actor_role="system",
                    target_type="platform",
                    target_name="ForumKit Platform",
                    metadata={
                        "startup_reason": reason,
                        "startup_time": datetime.now(pytz.timezone('Asia/Taipei')).isoformat(),
                        "process_id": os.getpid(),
                        "python_version": f"{os.sys.version_info.major}.{os.sys.version_info.minor}.{os.sys.version_info.micro}"
                    },
                    is_important=True,
                    send_webhook=True
                )
                session.commit()
            
            self._startup_recorded = True
            print(f"✅ 平台啟動事件已記錄: {reason}")
            
        except Exception as e:
            print(f"❌ 記錄平台啟動事件失敗: {e}")
    
    def record_platform_stopped(self, reason: str = "應用程序關閉") -> None:
        """記錄平台關閉事件"""
        try:
            with get_session() as session:
                EventService.log_event(
                    session=session,
                    event_type="system.platform_stopped",
                    title="平台關閉",
                    description=f"平台已關閉 - {reason}",
                    severity="low",
                    actor_name="System",
                    actor_role="system",
                    target_type="platform",
                    target_name="ForumKit Platform",
                    metadata={
                        "shutdown_reason": reason,
                        "shutdown_time": datetime.now(pytz.timezone('Asia/Taipei')).isoformat(),
                        "process_id": os.getpid(),
                        "uptime_seconds": self._get_uptime_seconds()
                    },
                    is_important=True,
                    send_webhook=True
                )
                session.commit()
            
            print(f"✅ 平台關閉事件已記錄: {reason}")
            
        except Exception as e:
            print(f"❌ 記錄平台關閉事件失敗: {e}")
    
    def record_platform_restarted(self, reason: str = "平台重啟") -> None:
        """記錄平台重啟事件"""
        try:
            with get_session() as session:
                EventService.log_event(
                    session=session,
                    event_type="system.platform_restarted",
                    title="平台重啟",
                    description=f"平台已重啟 - {reason}",
                    severity="medium",
                    actor_name="System",
                    actor_role="system",
                    target_type="platform",
                    target_name="ForumKit Platform",
                    metadata={
                        "restart_reason": reason,
                        "restart_time": datetime.now(pytz.timezone('Asia/Taipei')).isoformat(),
                        "process_id": os.getpid(),
                        "uptime_seconds": self._get_uptime_seconds()
                    },
                    is_important=True,
                    send_webhook=True
                )
                session.commit()
            
            print(f"✅ 平台重啟事件已記錄: {reason}")
            
        except Exception as e:
            print(f"❌ 記錄平台重啟事件失敗: {e}")
    
    def _get_uptime_seconds(self) -> Optional[int]:
        """獲取運行時間（秒）"""
        if hasattr(self, '_start_time'):
            current_time = datetime.now(pytz.timezone('Asia/Taipei'))
            start_time = self._start_time
            if start_time.tzinfo is None:
                start_time = pytz.timezone('Asia/Taipei').localize(start_time)
            return int((current_time - start_time).total_seconds())
        return None
    
    def set_start_time(self, start_time: datetime) -> None:
        """設置啟動時間"""
        self._start_time = start_time


platform_event_service = PlatformEventService()
