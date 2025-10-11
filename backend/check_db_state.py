#!/usr/bin/env python3
"""
檢查資料庫實際狀態
"""

import sys
from sqlalchemy import create_engine, text

def check_database_state():
    """檢查資料庫實際狀態"""
    import os
    db_url = os.getenv("DATABASE_URL", "postgresql+psycopg2://forumkit:forumkit@localhost:12007/forumkit")
    
    try:
        engine = create_engine(db_url)
        
        with engine.connect() as conn:
            print("🔍 檢查資料庫狀態...")
            
            result = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
            version = result.scalar()
            print(f"📋 當前 Alembic 版本: {version}")
            
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            """))
            
            tables = [row[0] for row in result.fetchall()]
            print(f"📋 資料庫表總數: {len(tables)}")
            for table in tables:
                print(f"  - {table}")
                
            result = conn.execute(text("""
                SELECT version_num 
                FROM alembic_version 
                ORDER BY version_num DESC 
                LIMIT 10
            """))
            versions = [row[0] for row in result.fetchall()]
            print(f"\n📋 最近的遷移記錄: {versions}")
            
            return True
            
    except Exception as e:
        print(f"❌ 錯誤: {e}")
        return False

def main():
    if check_database_state():
        print("\n✅ 檢查完成")
        return 0
    else:
        print("\n❌ 檢查失敗")
        return 1

if __name__ == "__main__":
    sys.exit(main())
