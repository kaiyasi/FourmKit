#!/usr/bin/env python3
"""
資料庫驗證工具 - 檢查實際貼文記錄數
用法：
  docker exec -it forumkit-backend-1 python debug_db.py
  或在容器內：python debug_db.py
"""

import os
import sys
from datetime import datetime, timezone
from sqlalchemy import create_engine, text

def check_database():
    """檢查資料庫中的實際貼文記錄"""
    
    # 從環境變數獲取資料庫 URL
    db_url = os.getenv("DATABASE_URL", "sqlite:///forumkit.db")
    
    try:
        engine = create_engine(db_url)
        
        with engine.connect() as conn:
            print("📊 資料庫連線成功")
            print(f"🔗 URL: {db_url}")
            print("=" * 50)
            
            # 1. 檢查總貼文數
            result = conn.execute(text("SELECT COUNT(*) as total FROM posts"))
            total_posts = result.fetchone()[0]
            print(f"📝 總貼文數: {total_posts}")
            
            # 2. 檢查最近的貼文
            result = conn.execute(text("""
                SELECT id, content, author_hash, created_at, deleted 
                FROM posts 
                ORDER BY created_at DESC 
                LIMIT 10
            """))
            
            print("\n🕐 最近 10 篇貼文:")
            print("-" * 80)
            print(f"{'ID':<6} {'內容預覽':<30} {'作者':<12} {'時間':<20} {'刪除'}")
            print("-" * 80)
            
            for row in result:
                content_preview = (row[1] or '')[:30].replace('\n', ' ')
                author = (row[2] or '')[:8]
                created_at = row[3].strftime('%m-%d %H:%M:%S') if row[3] else 'unknown'
                deleted = '是' if row[4] else '否'
                
                print(f"{row[0]:<6} {content_preview:<30} {author:<12} {created_at:<20} {deleted}")
            
            # 3. 檢查重複內容
            result = conn.execute(text("""
                SELECT content, COUNT(*) as count
                FROM posts 
                WHERE deleted = 0
                GROUP BY content 
                HAVING COUNT(*) > 1
                ORDER BY count DESC
            """))
            
            duplicates = result.fetchall()
            if duplicates:
                print(f"\n⚠️  發現 {len(duplicates)} 組重複內容:")
                print("-" * 50)
                for content, count in duplicates:
                    content_preview = (content or '')[:40].replace('\n', ' ')
                    print(f"  {count} 筆: {content_preview}")
            else:
                print("\n✅ 沒有發現重複內容")
            
            # 4. 檢查最近 1 小時的發文
            result = conn.execute(text("""
                SELECT COUNT(*) as recent_count
                FROM posts 
                WHERE created_at > datetime('now', '-1 hour')
                AND deleted = 0
            """))
            
            recent_count = result.fetchone()[0]
            print(f"\n📅 最近 1 小時發文數: {recent_count}")
            
            # 5. 檢查相同 author_hash 的連續發文
            result = conn.execute(text("""
                SELECT author_hash, COUNT(*) as count, MIN(created_at) as first, MAX(created_at) as last
                FROM posts 
                WHERE created_at > datetime('now', '-1 hour')
                AND deleted = 0
                GROUP BY author_hash
                HAVING COUNT(*) > 3
                ORDER BY count DESC
            """))
            
            frequent_authors = result.fetchall()
            if frequent_authors:
                print(f"\n🔄 最近 1 小時頻繁發文的作者:")
                print("-" * 60)
                for author, count, first, last in frequent_authors:
                    author_short = (author or '')[:8]
                    print(f"  {author_short}: {count} 篇 ({first} ~ {last})")
            else:
                print("\n✅ 沒有異常頻繁的發文")
            
        print("\n" + "=" * 50)
        print("✅ 資料庫檢查完成")
        
    except Exception as e:
        print(f"❌ 資料庫檢查失敗: {e}")
        sys.exit(1)

if __name__ == "__main__":
    print("🔍 ForumKit 資料庫驗證工具")
    print(f"⏰ 檢查時間: {datetime.now(timezone.utc).isoformat()}")
    print()
    check_database()
