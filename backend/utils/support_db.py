"""
支援工單專用資料庫連線管理
解決支援工單路由無法連接到正確資料庫的問題
"""
from __future__ import annotations
import os
from typing import Generator
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from models.base import Base

class SupportDatabaseManager:
    """支援工單資料庫管理器"""
    
    def __init__(self):
        self.engine = None
        self.SessionLocal = None
        self._initialized = False
    
    def init_support_db(self):
        """初始化支援工單資料庫"""
        if self._initialized:
            return
            
        # 支援工單資料庫路徑
        db_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'forumkit_support.db')
        db_url = f"sqlite:///{os.path.abspath(db_path)}"
        
        try:
            self.engine = create_engine(
                db_url,
                pool_pre_ping=True,
                connect_args={"check_same_thread": False}
            )
            
            # 測試連線
            with self.engine.connect() as conn:
                conn.exec_driver_sql("SELECT 1")
            
            self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
            
            # 確保支援工單表格存在
            from models.support import SupportTicket, SupportMessage, SupportEvent
            Base.metadata.create_all(self.engine, tables=[
                SupportTicket.__table__,
                SupportMessage.__table__, 
                SupportEvent.__table__
            ])
            
            self._initialized = True
            print(f"[SupportDB] 支援工單資料庫已連接: {db_url}")
            
        except Exception as e:
            print(f"[SupportDB] 支援工單資料庫連接失敗: {e}")
            raise
    
    @contextmanager
    def get_session(self) -> Generator[Session, None, None]:
        """獲取支援工單資料庫 session"""
        if not self._initialized:
            self.init_support_db()
            
        if not self.SessionLocal:
            raise RuntimeError("支援工單資料庫未初始化")
            
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

# 全域支援資料庫管理器實例
support_db_manager = SupportDatabaseManager()

def get_support_session():
    """便利函數：獲取支援工單資料庫 session"""
    return support_db_manager.get_session()

def init_support_database():
    """初始化支援工單資料庫"""
    support_db_manager.init_support_db()
