#!/usr/bin/env python3
"""
Module: backend/check_tables.py
Unified comment style: module docstring + minimal inline notes.
"""
import sqlite3
import os

db_files = [
    r"g:\ForumKit\backend\data\forumkit_core.db",
    r"g:\ForumKit\backend\data\forumkit_chat.db",
    r"g:\ForumKit\backend\data\forumkit_moderation.db", 
    r"g:\ForumKit\backend\data\forumkit_organization.db",
    r"g:\ForumKit\backend\data\forumkit_support.db"
]

for db_path in db_files:
    if not os.path.exists(db_path):
        print(f"檔案不存在: {db_path}")
        continue
        
    print(f"\n檢查數據庫: {os.path.basename(db_path)}")
    print("=" * 50)
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        print(f"表數量: {len(tables)}")
        
        ig_tables = [t[0] for t in tables if 'ig' in t[0].lower() or 'instagram' in t[0].lower()]
        if ig_tables:
            print(f"Instagram 相關表: {', '.join(ig_tables)}")
            
            for table in ig_tables:
                cursor.execute(f"PRAGMA table_info({table})")
                columns = cursor.fetchall()
                print(f"\n表 {table} 的欄位:")
                for col in columns:
                    print(f"  {col[1]} ({col[2]})")
                
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                print(f"  記錄數: {count}")
        else:
            print("沒有找到 Instagram 相關的表")
            
        conn.close()
        
    except Exception as e:
        print(f'錯誤: {e}')
