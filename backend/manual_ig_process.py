#!/usr/bin/env python3
"""
手動處理 Instagram 佇列
臨時腳本用於處理 PENDING 和 READY 狀態的貼文
"""

from utils.db import get_db
from services.ig_queue_manager import IGQueueManager
from services.ig_publisher import IGPublisher
from models import InstagramPost, PostStatus, PublishMode

def main():
    db = next(get_db())
    try:
        manager = IGQueueManager(db)
        publisher = IGPublisher(db)

        print("=" * 60)
        print("Instagram 佇列處理腳本")
        print("=" * 60)

        # Step 1: 渲染所有 PENDING 貼文
        print("\n[步驟 1] 渲染 PENDING 貼文...")
        pending_posts = db.query(InstagramPost).filter_by(
            status=PostStatus.PENDING
        ).all()

        print(f"找到 {len(pending_posts)} 篇待渲染貼文")

        rendered_count = 0
        for post in pending_posts:
            try:
                print(f"  渲染 {post.public_id}...", end=" ")
                success = manager.render_post(post.id)
                if success:
                    print("✓")
                    rendered_count += 1
                else:
                    print("✗")
            except Exception as e:
                print(f"錯誤: {e}")

        print(f"渲染完成: {rendered_count}/{len(pending_posts)}")

        # Step 2: 發布即時模式的 READY 貼文
        print("\n[步驟 2] 發布即時模式貼文...")
        instant_ready = db.query(InstagramPost).filter_by(
            status=PostStatus.READY,
            publish_mode=PublishMode.INSTANT
        ).all()

        print(f"找到 {len(instant_ready)} 篇即時模式貼文")

        published_count = 0
        for post in instant_ready:
            try:
                print(f"  發布 {post.public_id}...", end=" ")
                success = publisher.publish_single_post(post.id)
                if success:
                    print("✓")
                    published_count += 1
                else:
                    print("✗")
            except Exception as e:
                print(f"錯誤: {e}")

        print(f"即時發布完成: {published_count}/{len(instant_ready)}")

        # Step 3: 處理批次模式貼文
        print("\n[步驟 3] 處理批次模式貼文...")
        batch_ready = db.query(InstagramPost).filter_by(
            status=PostStatus.READY,
            publish_mode=PublishMode.BATCH
        ).all()

        print(f"找到 {len(batch_ready)} 篇批次模式貼文（等待組成輪播）")

        # 按帳號分組
        from collections import defaultdict
        by_account = defaultdict(list)
        for post in batch_ready:
            by_account[post.ig_account_id].append(post)

        for account_id, posts in by_account.items():
            print(f"  帳號 {account_id}: {len(posts)} 篇貼文")

        print("\n提示：批次模式貼文需要等待達到設定數量後自動組成輪播")

        # 總結
        print("\n" + "=" * 60)
        print("處理完成")
        print("=" * 60)
        print(f"渲染: {rendered_count} 篇")
        print(f"即時發布: {published_count} 篇")
        print(f"批次等待: {len(batch_ready)} 篇")

    finally:
        db.close()

if __name__ == '__main__':
    main()
