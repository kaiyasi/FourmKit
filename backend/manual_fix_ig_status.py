#!/usr/bin/env python3
"""
手動修復 Instagram 發布狀態
用於處理實際已發布但資料庫狀態不正確的情況
"""

import sys
sys.path.insert(0, '/mnt/data_pool_b/kaiyasi/ForumKit/backend')

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import InstagramPost, PostStatus
from datetime import datetime, timezone

# 連接資料庫
engine = create_engine('postgresql://forumkit:forumkit_password@127.0.0.1:12007/forumkit')
Session = sessionmaker(bind=engine)
db = Session()

def mark_as_published(post_id_or_public_id: str, ig_media_id: str, ig_permalink: str):
    """
    將記錄標記為已發布

    Args:
        post_id_or_public_id: 記錄的 ID 或 public_id
        ig_media_id: Instagram Media ID
        ig_permalink: Instagram 連結
    """
    # 嘗試以 ID 查詢
    try:
        post_id = int(post_id_or_public_id)
        post = db.query(InstagramPost).filter_by(id=post_id).first()
    except ValueError:
        # 如果不是數字，當作 public_id 查詢
        post = db.query(InstagramPost).filter_by(public_id=post_id_or_public_id).first()

    if not post:
        print(f"❌ 找不到記錄: {post_id_or_public_id}")
        return False

    # 更新狀態
    post.status = PostStatus.PUBLISHED
    post.ig_media_id = ig_media_id
    post.ig_permalink = ig_permalink
    post.published_at = datetime.now(timezone.utc)
    post.error_message = None
    post.error_code = None

    db.commit()
    print(f"✓ 已將記錄 {post.public_id} (ID: {post.id}) 標記為已發布")
    return True


def mark_as_failed(post_id_or_public_id: str, error_message: str = None):
    """
    將記錄標記為失敗

    Args:
        post_id_or_public_id: 記錄的 ID 或 public_id
        error_message: 錯誤訊息
    """
    # 嘗試以 ID 查詢
    try:
        post_id = int(post_id_or_public_id)
        post = db.query(InstagramPost).filter_by(id=post_id).first()
    except ValueError:
        # 如果不是數字，當作 public_id 查詢
        post = db.query(InstagramPost).filter_by(public_id=post_id_or_public_id).first()

    if not post:
        print(f"❌ 找不到記錄: {post_id_or_public_id}")
        return False

    # 更新狀態
    post.status = PostStatus.FAILED
    if error_message:
        post.error_message = error_message

    db.commit()
    print(f"✓ 已將記錄 {post.public_id} (ID: {post.id}) 標記為失敗")
    return True


def interactive_mode():
    """互動模式"""
    print("=== Instagram 狀態手動修復工具 ===\n")
    print("1. 標記為已發布")
    print("2. 標記為失敗")
    print("3. 批次處理（從檔案讀取）")
    print("0. 退出\n")

    choice = input("請選擇操作: ").strip()

    if choice == '1':
        post_id = input("請輸入記錄 ID 或 public_id: ").strip()
        ig_media_id = input("請輸入 Instagram Media ID: ").strip()
        ig_permalink = input("請輸入 Instagram 連結: ").strip()
        mark_as_published(post_id, ig_media_id, ig_permalink)

    elif choice == '2':
        post_id = input("請輸入記錄 ID 或 public_id: ").strip()
        error_message = input("請輸入錯誤訊息（可選）: ").strip()
        mark_as_failed(post_id, error_message if error_message else None)

    elif choice == '3':
        print("\n批次處理格式（每行一筆）：")
        print("標記為已發布: PUBLISHED,<post_id>,<ig_media_id>,<ig_permalink>")
        print("標記為失敗: FAILED,<post_id>,<error_message>")
        print("範例:")
        print("PUBLISHED,IGP_xxx,123456789,https://www.instagram.com/p/xxx")
        print("FAILED,IGP_yyy,無法訪問媒體 URL")
        print("\n請輸入檔案路徑，或直接輸入命令（輸入空行結束）:\n")

        commands = []
        while True:
            line = input().strip()
            if not line:
                break
            commands.append(line)

        for cmd in commands:
            parts = cmd.split(',')
            if len(parts) < 2:
                print(f"⚠️ 格式錯誤: {cmd}")
                continue

            action = parts[0].upper()
            if action == 'PUBLISHED' and len(parts) >= 4:
                mark_as_published(parts[1], parts[2], parts[3])
            elif action == 'FAILED':
                error_msg = parts[2] if len(parts) >= 3 else None
                mark_as_failed(parts[1], error_msg)
            else:
                print(f"⚠️ 格式錯誤: {cmd}")

    elif choice == '0':
        print("已退出")
        return

    db.close()


if __name__ == '__main__':
    if len(sys.argv) > 1:
        # 命令列模式
        action = sys.argv[1]
        if action == 'published' and len(sys.argv) >= 5:
            mark_as_published(sys.argv[2], sys.argv[3], sys.argv[4])
        elif action == 'failed' and len(sys.argv) >= 3:
            error_msg = sys.argv[3] if len(sys.argv) >= 4 else None
            mark_as_failed(sys.argv[2], error_msg)
        else:
            print("用法:")
            print("  標記為已發布: python3 manual_fix_ig_status.py published <post_id> <ig_media_id> <ig_permalink>")
            print("  標記為失敗: python3 manual_fix_ig_status.py failed <post_id> [error_message]")
    else:
        # 互動模式
        interactive_mode()
