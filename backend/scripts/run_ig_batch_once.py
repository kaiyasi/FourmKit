#!/usr/bin/env python3
"""
一次性處理 IG 佇列：
- 渲染所有 PENDING
- 針對每個批次帳號達標時自動組批並發布輪播

用法：python backend/scripts/run_ig_batch_once.py
"""
from utils.db import get_session
from models import InstagramAccount, InstagramPost, PublishMode, PostStatus
from services.ig_queue_manager import IGQueueManager
from services.ig_publisher import IGPublisher


def main():
    with get_session() as db:
        qm = IGQueueManager(db)
        pub = IGPublisher(db)

        # 渲染所有 PENDING（最多 50）
        pending = db.query(InstagramPost).filter(InstagramPost.status == PostStatus.PENDING).order_by(InstagramPost.id.asc()).limit(50).all()
        rendered = 0
        for p in pending:
            try:
                if qm.render_post(p.id):
                    rendered += 1
            except Exception:
                pass
        print(f"[IG Manual] 渲染完成: {rendered}/{len(pending)}")

        # 為每個批次帳號嘗試組批與發布（若達標）
        accounts = db.query(InstagramAccount).filter(InstagramAccount.is_active == True, InstagramAccount.publish_mode == PublishMode.BATCH).all()
        for acc in accounts:
            created = 0
            published = 0
            # 迴圈直到不再達標或安全上限
            for _ in range(5):
                ready_cnt = qm.get_account_pending_count(acc.id, PublishMode.BATCH)
                if ready_cnt < (acc.batch_count or 0):
                    break
                gid = qm.create_carousel_batch(acc.id, acc.batch_count)
                if not gid:
                    break
                created += 1
                posts = qm.get_carousel_batch_by_group_id(gid)
                ids = [x.id for x in posts]
                if ids:
                    ok = pub.publish_carousel(acc.id, ids)
                    if ok:
                        published += 1
            print(f"[IG Manual] 帳號 {acc.username}: 組批 {created}，發布 {published}")

        # Report publishing-in-progress older than 30 minutes
        from datetime import datetime, timezone, timedelta
        stuck = db.query(InstagramPost).filter(InstagramPost.status == PostStatus.PUBLISHING).all()
        bad = []
        for p in stuck:
            ts = p.updated_at or p.created_at
            if ts and (datetime.now(timezone.utc) - ts.replace(tzinfo=timezone.utc)).total_seconds() > 1800:
                bad.append(p.public_id)
        if bad:
            print(f"[IG Manual] 警告：發現疑似卡住的 PUBLISHING 任務（>30m）：{', '.join(bad)}")


if __name__ == '__main__':
    main()

