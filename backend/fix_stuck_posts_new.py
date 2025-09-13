#!/usr/bin/env python3
"""
修復卡住的 Instagram 貼文
將長時間處於 processing 狀態的貼文重置為 pending 或標記為失敗
"""
import sys
import os
from datetime import datetime, timezone, timedelta
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.db import get_session
from models.social_publishing import SocialPost, PostStatus
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix_stuck_posts():
    """修復卡住的貼文"""
    print("🔧 開始修復卡住的 Instagram 貼文...")
    
    with get_session() as db:
        # 找出長時間卡在 processing 的貼文 (超過 1 小時)
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        
        stuck_posts = db.query(SocialPost).filter(
            SocialPost.status.in_([PostStatus.PROCESSING, PostStatus.QUEUED]),
            SocialPost.updated_at < one_hour_ago
        ).all()
        
        if not stuck_posts:
            print("✅ 沒有發現卡住的貼文")
            return
        
        print(f"🔄 發現 {len(stuck_posts)} 個卡住的貼文:")
        
        fixed_count = 0
        for post in stuck_posts:
            print(f"   - 貼文 ID: {post.id}")
            print(f"     狀態: {post.status}")
            print(f"     最後更新: {post.updated_at}")
            print(f"     錯誤訊息: {post.error_message or '無'}")
            
            # 檢查是否有錯誤訊息，有的話標記為失敗
            if post.error_message:
                post.status = PostStatus.FAILED
                print(f"     -> 標記為失敗")
            else:
                # 沒有錯誤訊息的話重置為 pending，給它重新嘗試的機會
                post.status = PostStatus.PENDING
                post.retry_count = (post.retry_count or 0)  # 保持重試次數
                post.error_message = None
                print(f"     -> 重置為 pending，重試次數: {post.retry_count}")
            
            post.updated_at = datetime.now(timezone.utc)
            fixed_count += 1
        
        # 提交變更
        db.commit()
        print(f"✅ 已修復 {fixed_count} 個卡住的貼文")

def reset_all_processing_posts():
    """將所有 processing 狀態的貼文重置為 pending"""
    print("🔄 重置所有 processing 狀態的貼文...")
    
    with get_session() as db:
        processing_posts = db.query(SocialPost).filter(
            SocialPost.status == PostStatus.PROCESSING
        ).all()
        
        if not processing_posts:
            print("✅ 沒有 processing 狀態的貼文")
            return
        
        print(f"🔄 發現 {len(processing_posts)} 個 processing 貼文，重置為 pending:")
        
        for post in processing_posts:
            print(f"   - 貼文 ID: {post.id} -> 重置為 pending")
            post.status = PostStatus.PENDING
            post.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        print(f"✅ 已重置 {len(processing_posts)} 個貼文")

def show_current_status():
    """顯示目前狀態"""
    print("📊 目前貼文狀態統計:")
    
    with get_session() as db:
        total = db.query(SocialPost).count()
        pending = db.query(SocialPost).filter(SocialPost.status == PostStatus.PENDING).count()
        processing = db.query(SocialPost).filter(SocialPost.status == PostStatus.PROCESSING).count()
        published = db.query(SocialPost).filter(SocialPost.status == PostStatus.PUBLISHED).count()
        failed = db.query(SocialPost).filter(SocialPost.status == PostStatus.FAILED).count()
        
        print(f"   總數: {total}")
        print(f"   待處理: {pending}")
        print(f"   處理中: {processing}")
        print(f"   已發布: {published}")
        print(f"   失敗: {failed}")

if __name__ == "__main__":
    print("🛠️ Instagram 貼文修復工具")
    print("=" * 40)
    
    show_current_status()
    print()
    
    print("🔧 執行自動修復...")
    reset_all_processing_posts()
    print()
    show_current_status()
    print("\n✅ 修復完成！")