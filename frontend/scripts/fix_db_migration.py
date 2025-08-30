#!/usr/bin/env python3
"""
修復數據庫遷移問題
"""

import os
import sys
from sqlalchemy import create_engine, text

def fix_db_migration():
    """修復數據庫遷移問題"""
    
    # 嘗試不同的數據庫 URL
    db_urls = [
        os.getenv('DATABASE_URL'),
        "postgresql+psycopg2://forumkit:forumkit@127.0.0.1:12007/forumkit",
        "postgresql+psycopg2://forumkit:forumkit@localhost:12007/forumkit",
        "postgresql+psycopg2://forumkit:forumkit@postgres:80/forumkit"
    ]
    
    engine = None
    for url in db_urls:
        if not url:
            continue
        try:
            print(f"🔧 嘗試連接數據庫: {url}")
            engine = create_engine(url)
            # 測試連接
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print(f"✅ 成功連接到數據庫: {url}")
            break
        except Exception as e:
            print(f"❌ 連接失敗: {e}")
            continue
    
    if not engine:
        print("❌ 無法連接到任何數據庫")
        print("💡 請確保 Docker 容器正在運行：docker-compose up -d")
        return
    
    try:
        with engine.connect() as conn:
            print("🔧 開始修復數據庫問題...")
            
            # 1. 檢查 users 表的欄位
            result = conn.execute(text("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND table_schema = 'public'
                ORDER BY ordinal_position
            """))
            
            columns = {row[0]: row[1] for row in result}
            print(f"📋 users 表現有欄位: {list(columns.keys())}")
            
            # 2. 添加缺失的 premium 欄位
            if 'is_premium' not in columns:
                print("✅ 添加 is_premium 欄位...")
                conn.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT false
                """))
                print("✅ is_premium 欄位已添加")
            else:
                print("ℹ️ is_premium 欄位已存在")
            
            if 'premium_until' not in columns:
                print("✅ 添加 premium_until 欄位...")
                conn.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN premium_until TIMESTAMP WITH TIME ZONE
                """))
                print("✅ premium_until 欄位已添加")
            else:
                print("ℹ️ premium_until 欄位已存在")
            
            # 3. 檢查並添加遷移版本記錄
            result = conn.execute(text("SELECT version_num FROM alembic_version"))
            versions = [row[0] for row in result]
            print(f"📋 已應用的遷移版本: {versions}")
            
            if '20250101_add_premium_fields' not in versions:
                print("✅ 添加遷移版本記錄...")
                conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('20250101_add_premium_fields')"))
                print("✅ 遷移版本記錄已添加")
            else:
                print("ℹ️ 遷移版本記錄已存在")
            
            # 4. 檢查 announcements 相關表
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('announcements', 'announcement_reads')
            """))
            
            existing_tables = [row[0] for row in result]
            print(f"📋 現有的表: {existing_tables}")
            
            if 'announcements' in existing_tables and '20250828_add_announcement_tables' not in versions:
                print("✅ 添加公告表遷移版本記錄...")
                conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('20250828_add_announcement_tables')"))
                print("✅ 公告表遷移版本記錄已添加")
            
            conn.commit()
            print("🎉 數據庫修復完成！")
            print("💡 現在可以重新啟動應用程式了")
            
    except Exception as e:
        print(f"❌ 修復失敗: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    fix_db_migration()
