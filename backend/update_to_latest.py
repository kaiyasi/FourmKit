#!/usr/bin/env python3
"""
將資料庫版本更新到最新
"""

import sys
from sqlalchemy import create_engine, text

def update_to_latest_version():
    """更新到最新版本"""
    db_url = "postgresql+psycopg2://forumkit:forumkit@localhost:12007/forumkit"
    
    try:
        engine = create_engine(db_url)
        
        with engine.connect() as conn:
            print("🔧 更新資料庫版本到最新...")
            
            # 檢查當前版本
            result = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
            current_version = result.scalar()
            print(f"📋 當前版本: {current_version}")
            
            # 更新到最新版本（移除 Instagram 系統後的版本）
            latest_version = '2025_09_02_remove_instagram_system'
            
            if current_version != latest_version:
                conn.execute(text("UPDATE alembic_version SET version_num = :version"), {
                    'version': latest_version
                })
                conn.commit()
                print(f"✅ 已更新到最新版本: {latest_version}")
            else:
                print(f"ℹ️ 已經是最新版本: {latest_version}")
            
            # 驗證更新
            result = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
            final_version = result.scalar()
            print(f"📋 最終版本: {final_version}")
            
            return True
            
    except Exception as e:
        print(f"❌ 更新失敗: {e}")
        return False

def main():
    if update_to_latest_version():
        print("\n✅ 版本更新完成！")
        print("📋 現在您可以嘗試運行應用程式")
        return 0
    else:
        print("\n❌ 版本更新失敗！")
        return 1

if __name__ == "__main__":
    sys.exit(main())
