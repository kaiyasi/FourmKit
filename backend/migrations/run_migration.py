#!/usr/bin/env python3
"""
數據庫遷移腳本
執行時間：2025-08-24
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db import get_session
from sqlalchemy import text

def run_migration():
    """執行遷移腳本"""
    print("開始執行數據庫遷移...")
    
    with get_session() as session:
        try:
            # 檢查 status 欄位是否已存在
            result = session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'comments' AND column_name = 'status'
            """))
            
            if result.fetchone():
                print("status 欄位已存在，跳過添加...")
            else:
                # 添加 status 欄位
                print("添加 status 欄位...")
                session.execute(text("""
                    ALTER TABLE comments ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'pending'
                """))
                print("✓ status 欄位添加成功")
            
            # 更新現有數據
            print("更新現有留言狀態...")
            session.execute(text("""
                UPDATE comments SET status = 'rejected' WHERE is_deleted = true
            """))
            session.execute(text("""
                UPDATE comments SET status = 'approved' WHERE is_deleted = false
            """))
            print("✓ 現有留言狀態更新完成")
            
            # 檢查並創建索引
            print("檢查並創建索引...")
            
            # 檢查 status 索引
            result = session.execute(text("""
                SELECT indexname FROM pg_indexes 
                WHERE tablename = 'comments' AND indexname = 'idx_comments_status'
            """))
            
            if not result.fetchone():
                session.execute(text("CREATE INDEX idx_comments_status ON comments(status)"))
                print("✓ status 索引創建成功")
            else:
                print("status 索引已存在")
            
            # 檢查 status_created 索引
            result = session.execute(text("""
                SELECT indexname FROM pg_indexes 
                WHERE tablename = 'comments' AND indexname = 'idx_comments_status_created'
            """))
            
            if not result.fetchone():
                session.execute(text("CREATE INDEX idx_comments_status_created ON comments(status, created_at)"))
                print("✓ status_created 索引創建成功")
            else:
                print("status_created 索引已存在")
            
            # 提交事務
            session.commit()
            print("✓ 遷移完成！")
            
        except Exception as e:
            session.rollback()
            print(f"❌ 遷移失敗: {e}")
            raise

if __name__ == "__main__":
    run_migration()
