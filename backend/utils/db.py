# backend/utils/db.py
from __future__ import annotations
from typing import Generator
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, scoped_session

DB_URL = os.getenv("DATABASE_URL", "sqlite:////data/forumkit.db")

class Base(DeclarativeBase):
    pass

_engine = None
SessionLocal = None
db_session = None

def init_engine_session():
    global _engine, SessionLocal, db_session
    url = DB_URL.replace("postgresql://", "postgresql+psycopg://") if DB_URL.startswith("postgresql://") else DB_URL
    _engine = create_engine(url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    db_session = scoped_session(SessionLocal)
    from models import Base as ModelsBase
    ModelsBase.metadata.create_all(_engine)

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
