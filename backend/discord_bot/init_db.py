"""
Discord Bot 資料庫初始化腳本
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models.discord_config import Base
from config import DATABASE_URL

def init_discord_database():
    """初始化 Discord 相關資料表"""
    try:
        # 建立資料庫引擎
        engine = create_engine(DATABASE_URL)
        
        # 創建所有 Discord 相關的資料表
        print("正在創建 Discord 資料表...")
        Base.metadata.create_all(engine, checkfirst=True)
        
        print("✅ Discord 資料表初始化完成！")
        
        # 創建 Session 來測試連接
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        session = SessionLocal()
        session.close()
        
        print("✅ 資料庫連接測試成功！")
        
    except Exception as e:
        print(f"❌ 資料庫初始化失敗: {e}")
        sys.exit(1)

if __name__ == "__main__":
    init_discord_database()