# backend/utils/db.py
from __future__ import annotations
from typing import Generator
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, scoped_session

DB_URL = os.getenv("DATABASE_URL", "")

class Base(DeclarativeBase):
    pass

_engine = None
SessionLocal = None
db_session = None
EFFECTIVE_DB_URL = ""

def _normalize_url(url: str) -> str:
    if not url:
        return url
    # 自動將舊驅動前綴改為 psycopg（v3）
    return url.replace("postgresql://", "postgresql+psycopg://") if url.startswith("postgresql://") else url


def init_engine_session():
    """
    初始化資料庫：
    1) 若設了 DATABASE_URL -> 直接使用
    2) 未設時，優先嘗試連本機 12007 的 Postgres（docker-compose 映射）
    3) 若連不上則回退到 SQLite /data/forumkit.db
    """
    global _engine, SessionLocal, db_session

    candidates: list[str] = []
    if DB_URL:
        candidates.append(DB_URL)
    else:
        # 預設優先 Postgres（與 docker-compose.yml 對齊）
        candidates.append("postgresql+psycopg://forumkit:forumkit@127.0.0.1:12007/forumkit")
        # 回退 SQLite
        candidates.append("sqlite:////data/forumkit.db")

    last_err: Exception | None = None
    for raw in candidates:
        url = _normalize_url(raw)
        try:
            eng = create_engine(url, pool_pre_ping=True)
            # 立刻測試一次連線，避免把壞 URL 留到後面出錯
            with eng.connect() as conn:
                # SQLAlchemy 2.0 需要使用 exec_driver_sql 或 text()
                conn.exec_driver_sql("SELECT 1")
            _engine = eng
            SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
            db_session = scoped_session(SessionLocal)
            from models import Base as ModelsBase
            ModelsBase.metadata.create_all(_engine)
            global EFFECTIVE_DB_URL
            EFFECTIVE_DB_URL = url
            print(f"[ForumKit] DB connected: {url}")
            return
        except Exception as e:
            last_err = e
            print(f"[ForumKit] DB connect failed for {url}: {e}")
            continue

    # 若皆失敗，往外拋出最後一個錯誤
    if last_err:
        raise last_err


def _mask_url(url: str) -> str:
    try:
        if '://' not in url or '@' not in url:
            return url
        scheme_split = url.split('://', 1)
        left = scheme_split[0]
        rest = scheme_split[1]
        cred_part, host_part = rest.split('@', 1)
        if ':' in cred_part:
            user = cred_part.split(':', 1)[0]
            masked = f"{user}:***"
        else:
            masked = cred_part
        return f"{left}://{masked}@{host_part}"
    except Exception:
        return url


def get_db_health() -> dict:
    """回傳 DB 健康狀態，供 /api/healthz 使用。"""
    ok = False
    driver = None
    err = None
    url = EFFECTIVE_DB_URL or DB_URL or ""
    try:
        if _engine is None:
            init_engine_session()
        # 再次 ping 確認連線健康
        with _engine.connect() as conn:  # type: ignore[arg-type]
            conn.exec_driver_sql("SELECT 1")
        ok = True
        try:
            driver = _engine.url.drivername  # type: ignore[attr-defined]
        except Exception:
            driver = None
    except Exception as e:
        err = str(e)
    return {
        "ok": ok,
        "url": _mask_url(url),
        "driver": driver,
        **({"error": err} if err else {}),
    }

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

from contextlib import contextmanager
@contextmanager
def get_session():
    db = SessionLocal()
    try:
        yield db
        db.close()
    except:
        db.rollback()
        db.close()
        raise
