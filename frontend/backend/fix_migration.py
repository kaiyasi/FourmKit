#!/usr/bin/env python3
"""
手動修復遷移狀態的腳本
用於解決 chat_room_members 表已存在但遷移未標記的問題
"""

import sys
from sqlalchemy import create_engine, text
from utils.db import get_db_url

def fix_migration_state():
    """修復遷移狀態"""
    try:
        # 連接資料庫
        engine = create_engine(get_db_url())
        
        with engine.connect() as conn:
            # 檢查 alembic_version 表是否存在
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'alembic_version'
                );
            """))
            
            if not result.scalar():
                print("❌ alembic_version 表不存在，請先初始化 Alembic")
                return False
            
            # 檢查當前版本
            result = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1;"))
            current_version = result.scalar()
            print(f"ℹ️ 當前版本: {current_version}")
            
            # 檢查 chat_room_members 表是否存在
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'chat_room_members'
                );
            """))
            
            table_exists = result.scalar()
            print(f"ℹ️ chat_room_members 表存在: {table_exists}")
            
            if table_exists:
                # 如果表存在，將遷移標記為已完成
                target_version = '2025_08_29_add_chat_room_member'
                
                if current_version != target_version:
                    conn.execute(text("UPDATE alembic_version SET version_num = :version"), {
                        'version': target_version
                    })
                    conn.commit()
                    print(f"✅ 已將遷移版本更新為: {target_version}")
                else:
                    print(f"ℹ️ 版本已經是最新: {target_version}")
                
                return True
            else:
                print("❌ chat_room_members 表不存在，需要正常執行遷移")
                return False
                
    except Exception as e:
        print(f"❌ 修復失敗: {e}")
        return False

def main():
    print("🔧 開始修復遷移狀態...")
    
    if fix_migration_state():
        print("✅ 遷移狀態修復完成！")
        return 0
    else:
        print("❌ 遷移狀態修復失敗！")
        return 1

if __name__ == "__main__":
    sys.exit(main())