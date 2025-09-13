#!/usr/bin/env python3
import sqlite3
import json
import os

# 直接使用正確的數據庫路徑
db_path = r"g:\ForumKit\backend\data\forumkit_core.db"

if not os.path.exists(db_path):
    print(f"數據庫檔案不存在: {db_path}")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 檢查 ig_templates 表是否存在
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ig_templates';")
    if not cursor.fetchone():
        print("ig_templates 表不存在")
        exit(1)
    
    # 查詢所有模板
    cursor.execute("SELECT * FROM ig_templates")
    templates = cursor.fetchall()
    
    # 獲取欄位名稱
    cursor.execute("PRAGMA table_info(ig_templates)")
    columns = [column[1] for column in cursor.fetchall()]
    
    print(f'找到 {len(templates)} 個模板')
    print(f'欄位: {", ".join(columns)}')
    print()
    
    for template in templates:
        template_dict = dict(zip(columns, template))
        print(f'模板 ID: {template_dict.get("id")}')
        print(f'名稱: {template_dict.get("name")}')
        print(f'類型: {template_dict.get("template_type", "未設定")}')
        print(f'描述: {template_dict.get("description") or "無描述"}')
        print(f'帳號 ID: {template_dict.get("account_id")}')
        print(f'是否預設: {template_dict.get("is_default")}')
        print(f'是否啟用: {template_dict.get("is_active")}')
        
        # 處理 JSON 資料
        template_data = template_dict.get("template_data")
        if template_data:
            try:
                parsed_data = json.loads(template_data)
                print('模板資料:')
                print(json.dumps(parsed_data, ensure_ascii=False, indent=2))
            except:
                print(f'模板資料 (原始): {template_data}')
        else:
            print('模板資料: 無')
        
        print('-' * 50)
    
    conn.close()
    
except Exception as e:
    print(f'錯誤: {e}')
    import traceback
    print(f'詳細錯誤: {traceback.format_exc()}')
