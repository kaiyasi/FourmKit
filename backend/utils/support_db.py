"""
支援工單專用資料庫連線管理
改進：
1) 支援以環境變數設定獨立的 SUPPORT_DATABASE_URL；
2) 若未設定，且主資料庫（DATABASE_URL）存在，可直接共用主庫；
3) 最後才回退到 SQLite 檔案（/app/data/forumkit_support.db）。
這樣在你「換資料庫」時，不會因為支援系統還卡在 SQLite 而炸 SUPPORT_E_DB。
"""
from __future__ import annotations
import os
from typing import Generator
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from models.base import Base

def _normalize_url(url: str) -> str:
    if not url:
        return url
    return url.replace("postgresql://", "postgresql+psycopg://") if url.startswith("postgresql://") else url


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
            
        sup_url = os.getenv("SUPPORT_DATABASE_URL", "").strip()
        main_url = os.getenv("DATABASE_URL", "").strip()
        db_url = ""
        if sup_url:
            db_url = _normalize_url(sup_url)
        elif main_url:
            db_url = _normalize_url(main_url)
        else:
            db_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'forumkit_support.db')
            db_url = f"sqlite:///{os.path.abspath(db_path)}"
        
        try:
            kw = {"pool_pre_ping": True}
            if db_url.startswith("sqlite://"):
                kw["connect_args"] = {"check_same_thread": False}
            self.engine = create_engine(db_url, **kw)
            
            with self.engine.connect() as conn:
                conn.exec_driver_sql("SELECT 1")
            
            self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
            
            from models.support import SupportTicket, SupportMessage, SupportEvent
            Base.metadata.create_all(self.engine, tables=[
                SupportTicket.__table__,
                SupportMessage.__table__, 
                SupportEvent.__table__
            ])
            
            self._initialized = True
            def _mask(u: str) -> str:
                try:
                    if '://' not in u or '@' not in u:
                        return u
                    left, rest = u.split('://', 1)
                    cred, host = rest.split('@', 1)
                    user = cred.split(':', 1)[0]
                    return f"{left}://{user}:***@{host}"
                except Exception:
                    return u
            print(f"[SupportDB] 支援工單資料庫已連接: {_mask(db_url)}")
            
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

support_db_manager = SupportDatabaseManager()

def get_support_session():
    """便利函數：獲取支援工單資料庫 session"""
    return support_db_manager.get_session()

def init_support_database():
    """初始化支援工單資料庫"""
    support_db_manager.init_support_db()
