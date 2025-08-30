#!/usr/bin/env python3
"""
使用者資料匯出腳本
用於在重建網站前備份重要資料
"""

import os
import sys
import json
import csv
from datetime import datetime, timezone
from sqlalchemy import create_engine, text
from pathlib import Path

def export_user_data():
    """匯出使用者資料"""
    
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
    
    # 創建匯出目錄
    export_dir = Path("exports")
    export_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    try:
        with engine.connect() as conn:
            print("🔧 開始匯出使用者資料...")
            
            # 1. 匯出使用者基本資料
            print("📋 匯出使用者基本資料...")
            result = conn.execute(text("""
                SELECT 
                    id, username, email, role, school_id, 
                    created_at, avatar_path, is_premium, premium_until
                FROM users 
                ORDER BY id
            """))
            
            users_data = []
            for row in result:
                users_data.append({
                    'id': row[0],
                    'username': row[1],
                    'email': row[2],
                    'role': row[3],
                    'school_id': row[4],
                    'created_at': row[5].isoformat() if row[5] else None,
                    'avatar_path': row[6],
                    'is_premium': row[7],
                    'premium_until': row[8].isoformat() if row[8] else None
                })
            
            # 保存為 JSON
            users_file = export_dir / f"users_{timestamp}.json"
            with open(users_file, 'w', encoding='utf-8') as f:
                json.dump(users_data, f, ensure_ascii=False, indent=2)
            print(f"✅ 使用者資料已匯出到: {users_file}")
            
            # 保存為 CSV
            users_csv_file = export_dir / f"users_{timestamp}.csv"
            if users_data:
                with open(users_csv_file, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.DictWriter(f, fieldnames=users_data[0].keys())
                    writer.writeheader()
                    writer.writerows(users_data)
                print(f"✅ 使用者資料 CSV 已匯出到: {users_csv_file}")
            
            # 2. 匯出學校資料
            print("📋 匯出學校資料...")
            result = conn.execute(text("""
                SELECT id, name, slug, description, created_at
                FROM schools 
                ORDER BY id
            """))
            
            schools_data = []
            for row in result:
                schools_data.append({
                    'id': row[0],
                    'name': row[1],
                    'slug': row[2],
                    'description': row[3],
                    'created_at': row[4].isoformat() if row[4] else None
                })
            
            schools_file = export_dir / f"schools_{timestamp}.json"
            with open(schools_file, 'w', encoding='utf-8') as f:
                json.dump(schools_data, f, ensure_ascii=False, indent=2)
            print(f"✅ 學校資料已匯出到: {schools_file}")
            
            # 3. 匯出貼文資料（不含內容，只保留基本資訊）
            print("📋 匯出貼文基本資料...")
            result = conn.execute(text("""
                SELECT 
                    id, author_id, status, school_id, 
                    created_at, is_pinned, is_announcement, is_advertisement,
                    delete_request_count
                FROM posts 
                ORDER BY id
            """))
            
            posts_data = []
            for row in result:
                posts_data.append({
                    'id': row[0],
                    'author_id': row[1],
                    'status': row[2],
                    'school_id': row[3],
                    'created_at': row[4].isoformat() if row[4] else None,
                    'is_pinned': row[5],
                    'is_announcement': row[6],
                    'is_advertisement': row[7],
                    'delete_request_count': row[8]
                })
            
            posts_file = export_dir / f"posts_basic_{timestamp}.json"
            with open(posts_file, 'w', encoding='utf-8') as f:
                json.dump(posts_data, f, ensure_ascii=False, indent=2)
            print(f"✅ 貼文基本資料已匯出到: {posts_file}")
            
            # 4. 匯出公告資料
            print("📋 匯出公告資料...")
            result = conn.execute(text("""
                SELECT 
                    id, title, content, type, priority, is_active, is_pinned,
                    start_at, end_at, school_id, created_by, created_at
                FROM announcements 
                ORDER BY id
            """))
            
            announcements_data = []
            for row in result:
                announcements_data.append({
                    'id': row[0],
                    'title': row[1],
                    'content': row[2],
                    'type': row[3],
                    'priority': row[4],
                    'is_active': row[5],
                    'is_pinned': row[6],
                    'start_at': row[7].isoformat() if row[7] else None,
                    'end_at': row[8].isoformat() if row[8] else None,
                    'school_id': row[9],
                    'created_by': row[10],
                    'created_at': row[11].isoformat() if row[11] else None
                })
            
            announcements_file = export_dir / f"announcements_{timestamp}.json"
            with open(announcements_file, 'w', encoding='utf-8') as f:
                json.dump(announcements_data, f, ensure_ascii=False, indent=2)
            print(f"✅ 公告資料已匯出到: {announcements_file}")
            
            # 5. 匯出支援工單資料
            print("📋 匯出支援工單資料...")
            result = conn.execute(text("""
                SELECT 
                    id, public_id, user_id, subject, status, category, priority,
                    created_at, updated_at, assigned_to
                FROM support_tickets 
                ORDER BY id
            """))
            
            tickets_data = []
            for row in result:
                tickets_data.append({
                    'id': row[0],
                    'public_id': row[1],
                    'user_id': row[2],
                    'subject': row[3],
                    'status': row[4],
                    'category': row[5],
                    'priority': row[6],
                    'created_at': row[7].isoformat() if row[7] else None,
                    'updated_at': row[8].isoformat() if row[8] else None,
                    'assigned_to': row[9]
                })
            
            tickets_file = export_dir / f"support_tickets_{timestamp}.json"
            with open(tickets_file, 'w', encoding='utf-8') as f:
                json.dump(tickets_data, f, ensure_ascii=False, indent=2)
            print(f"✅ 支援工單資料已匯出到: {tickets_file}")
            
            # 6. 生成統計報告
            print("📊 生成統計報告...")
            stats = {}
            
            # 使用者統計
            result = conn.execute(text("SELECT COUNT(*) FROM users"))
            stats['total_users'] = result.fetchone()[0]
            
            result = conn.execute(text("SELECT role, COUNT(*) FROM users GROUP BY role"))
            stats['users_by_role'] = {row[0]: row[1] for row in result}
            
            # 貼文統計
            result = conn.execute(text("SELECT COUNT(*) FROM posts"))
            stats['total_posts'] = result.fetchone()[0]
            
            result = conn.execute(text("SELECT status, COUNT(*) FROM posts GROUP BY status"))
            stats['posts_by_status'] = {row[0]: row[1] for row in result}
            
            # 公告統計
            result = conn.execute(text("SELECT COUNT(*) FROM announcements"))
            stats['total_announcements'] = result.fetchone()[0]
            
            # 支援工單統計
            result = conn.execute(text("SELECT COUNT(*) FROM support_tickets"))
            stats['total_support_tickets'] = result.fetchone()[0]
            
            stats_file = export_dir / f"statistics_{timestamp}.json"
            with open(stats_file, 'w', encoding='utf-8') as f:
                json.dump(stats, f, ensure_ascii=False, indent=2)
            print(f"✅ 統計報告已匯出到: {stats_file}")
            
            # 7. 生成匯出摘要
            summary = {
                'export_timestamp': datetime.now(timezone.utc).isoformat(),
                'export_files': [
                    str(users_file),
                    str(schools_file),
                    str(posts_file),
                    str(announcements_file),
                    str(tickets_file),
                    str(stats_file)
                ],
                'statistics': stats,
                'notes': [
                    "此匯出包含重要的使用者和管理資料",
                    "貼文內容未包含在基本資料匯出中",
                    "密碼雜湊已包含在匯出中，重建時可保留",
                    "建議在重建前備份整個 exports 目錄"
                ]
            }
            
            summary_file = export_dir / f"export_summary_{timestamp}.json"
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(summary, f, ensure_ascii=False, indent=2)
            print(f"✅ 匯出摘要已保存到: {summary_file}")
            
            print("\n🎉 資料匯出完成！")
            print(f"📁 所有檔案已保存到: {export_dir}")
            print(f"📊 統計摘要:")
            print(f"   - 總使用者數: {stats['total_users']}")
            print(f"   - 總貼文數: {stats['total_posts']}")
            print(f"   - 總公告數: {stats['total_announcements']}")
            print(f"   - 總支援工單數: {stats['total_support_tickets']}")
            print("\n💡 重建建議:")
            print("   1. 備份整個 exports 目錄")
            print("   2. 記錄當前的環境變數設定")
            print("   3. 備份上傳的媒體檔案 (uploads 目錄)")
            print("   4. 重建後可以參考匯出的資料重新建立使用者帳戶")
            
    except Exception as e:
        print(f"❌ 匯出失敗: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    export_user_data()
