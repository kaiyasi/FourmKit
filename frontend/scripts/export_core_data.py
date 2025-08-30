#!/usr/bin/env python3
"""
核心資料匯出腳本
只匯出貼文、使用者、學校資料
"""

import os
import sys
import json
import csv
from datetime import datetime, timezone
from sqlalchemy import create_engine, text
from pathlib import Path

def export_core_data():
    """匯出核心資料：貼文、使用者、學校"""
    
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
            print("🔧 開始匯出核心資料...")
            
            # 1. 匯出使用者資料
            print("📋 匯出使用者資料...")
            result = conn.execute(text("""
                SELECT 
                    id, username, email, role, school_id, 
                    created_at, avatar_path, is_premium, premium_until,
                    password_hash
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
                    'premium_until': row[8].isoformat() if row[8] else None,
                    'password_hash': row[9]  # 保留密碼雜湊以便重建
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
            
            # 3. 匯出完整貼文資料
            print("📋 匯出完整貼文資料...")
            result = conn.execute(text("""
                SELECT 
                    id, author_id, title, content, status, school_id, 
                    created_at, updated_at, is_pinned, is_announcement, 
                    is_advertisement, delete_request_count, view_count,
                    like_count, dislike_count, comment_count
                FROM posts 
                ORDER BY id
            """))
            
            posts_data = []
            for row in result:
                posts_data.append({
                    'id': row[0],
                    'author_id': row[1],
                    'title': row[2],
                    'content': row[3],
                    'status': row[4],
                    'school_id': row[5],
                    'created_at': row[6].isoformat() if row[6] else None,
                    'updated_at': row[7].isoformat() if row[7] else None,
                    'is_pinned': row[8],
                    'is_announcement': row[9],
                    'is_advertisement': row[10],
                    'delete_request_count': row[11],
                    'view_count': row[12],
                    'like_count': row[13],
                    'dislike_count': row[14],
                    'comment_count': row[15]
                })
            
            posts_file = export_dir / f"posts_{timestamp}.json"
            with open(posts_file, 'w', encoding='utf-8') as f:
                json.dump(posts_data, f, ensure_ascii=False, indent=2)
            print(f"✅ 貼文資料已匯出到: {posts_file}")
            
            # 4. 匯出留言資料
            print("📋 匯出留言資料...")
            result = conn.execute(text("""
                SELECT 
                    id, post_id, author_id, content, created_at, 
                    updated_at, is_deleted, parent_id, like_count, 
                    dislike_count
                FROM comments 
                ORDER BY id
            """))
            
            comments_data = []
            for row in result:
                comments_data.append({
                    'id': row[0],
                    'post_id': row[1],
                    'author_id': row[2],
                    'content': row[3],
                    'created_at': row[4].isoformat() if row[4] else None,
                    'updated_at': row[5].isoformat() if row[5] else None,
                    'is_deleted': row[6],
                    'parent_id': row[7],
                    'like_count': row[8],
                    'dislike_count': row[9]
                })
            
            comments_file = export_dir / f"comments_{timestamp}.json"
            with open(comments_file, 'w', encoding='utf-8') as f:
                json.dump(comments_data, f, ensure_ascii=False, indent=2)
            print(f"✅ 留言資料已匯出到: {comments_file}")
            
            # 5. 生成統計報告
            print("📊 生成統計報告...")
            stats = {}
            
            # 使用者統計
            result = conn.execute(text("SELECT COUNT(*) FROM users"))
            stats['total_users'] = result.fetchone()[0]
            
            result = conn.execute(text("SELECT role, COUNT(*) FROM users GROUP BY role"))
            stats['users_by_role'] = {row[0]: row[1] for row in result}
            
            # 學校統計
            result = conn.execute(text("SELECT COUNT(*) FROM schools"))
            stats['total_schools'] = result.fetchone()[0]
            
            # 貼文統計
            result = conn.execute(text("SELECT COUNT(*) FROM posts"))
            stats['total_posts'] = result.fetchone()[0]
            
            result = conn.execute(text("SELECT status, COUNT(*) FROM posts GROUP BY status"))
            stats['posts_by_status'] = {row[0]: row[1] for row in result}
            
            # 留言統計
            result = conn.execute(text("SELECT COUNT(*) FROM comments"))
            stats['total_comments'] = result.fetchone()[0]
            
            stats_file = export_dir / f"statistics_{timestamp}.json"
            with open(stats_file, 'w', encoding='utf-8') as f:
                json.dump(stats, f, ensure_ascii=False, indent=2)
            print(f"✅ 統計報告已匯出到: {stats_file}")
            
            # 6. 生成匯出摘要
            summary = {
                'export_timestamp': datetime.now(timezone.utc).isoformat(),
                'export_type': 'core_data_only',
                'export_files': [
                    str(users_file),
                    str(schools_file),
                    str(posts_file),
                    str(comments_file),
                    str(stats_file)
                ],
                'statistics': stats,
                'notes': [
                    "此匯出僅包含核心資料：使用者、學校、貼文、留言",
                    "密碼雜湊已包含在匯出中，重建時可保留",
                    "貼文內容完整保留",
                    "留言內容完整保留",
                    "建議在重建前備份整個 exports 目錄"
                ]
            }
            
            summary_file = export_dir / f"export_summary_{timestamp}.json"
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(summary, f, ensure_ascii=False, indent=2)
            print(f"✅ 匯出摘要已保存到: {summary_file}")
            
            print("\n🎉 核心資料匯出完成！")
            print(f"📁 所有檔案已保存到: {export_dir}")
            print(f"📊 統計摘要:")
            print(f"   - 總使用者數: {stats['total_users']}")
            print(f"   - 總學校數: {stats['total_schools']}")
            print(f"   - 總貼文數: {stats['total_posts']}")
            print(f"   - 總留言數: {stats['total_comments']}")
            print("\n💡 重建建議:")
            print("   1. 備份整個 exports 目錄")
            print("   2. 記錄當前的環境變數設定")
            print("   3. 重建時先建立學校，再建立使用者，最後建立貼文")
            print("   4. 確保資料庫外鍵關係正確")
            
    except Exception as e:
        print(f"❌ 匯出失敗: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    export_core_data()
