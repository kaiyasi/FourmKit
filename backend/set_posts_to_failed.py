#!/usr/bin/env python3
"""
將所有準備發布的貼文改為失敗狀態
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.db import get_session
from models.social_publishing import SocialPost, PostStatus, CarouselGroup
from datetime import datetime, timezone

def set_ready_posts_to_failed():
    """將準備發布的貼文改為失敗狀態"""
    print("=== 將準備發布貼文改為失敗狀態 ===")
    
    with get_session() as db:
        # 查找所有 QUEUED 狀態的貼文
        ready_posts = db.query(SocialPost).filter(
            SocialPost.status == PostStatus.QUEUED
        ).all()
        
        print(f"找到 {len(ready_posts)} 個準備發布的貼文")
        
        updated_count = 0
        
        for post in ready_posts:
            try:
                print(f"將貼文 ID {post.id} 改為失敗狀態")
                
                # 更新狀態
                post.status = PostStatus.FAILED
                post.error_message = "手動設置為失敗狀態"
                post.updated_at = datetime.now(timezone.utc)
                
                updated_count += 1
                
            except Exception as e:
                print(f"更新貼文 {post.id} 失敗: {e}")
        
        # 提交更改
        db.commit()
        
        print(f"\n✅ 成功更新 {updated_count} 個貼文為失敗狀態")
        
        return updated_count

def update_carousel_groups():
    """更新輪播群組狀態"""
    print("\n=== 更新輪播群組狀態 ===")
    
    with get_session() as db:
        # 查找所有準備發布的輪播群組
        ready_carousels = db.query(CarouselGroup).filter(
            CarouselGroup.status == 'ready'
        ).all()
        
        print(f"找到 {len(ready_carousels)} 個準備發布的輪播群組")
        
        updated_count = 0
        
        for carousel in ready_carousels:
            try:
                # 檢查關聯貼文的狀態
                posts = db.query(SocialPost).filter(
                    SocialPost.carousel_group_id == carousel.id
                ).all()
                
                failed_count = sum(1 for p in posts if p.status == PostStatus.FAILED)
                
                if failed_count > 0:
                    print(f"將輪播群組 {carousel.group_id} 改為失敗狀態")
                    carousel.status = 'failed'
                    updated_count += 1
                    
            except Exception as e:
                print(f"更新輪播群組 {carousel.id} 失敗: {e}")
        
        db.commit()
        print(f"✅ 成功更新 {updated_count} 個輪播群組為失敗狀態")
        
        return updated_count

def show_final_status():
    """顯示最終狀態"""
    print("\n=== 最終狀態 ===")
    
    with get_session() as db:
        from sqlalchemy import func
        
        # 統計貼文狀態
        status_counts = db.query(
            SocialPost.status,
            func.count(SocialPost.id).label('count')
        ).group_by(SocialPost.status).all()
        
        print("貼文狀態統計:")
        for status, count in status_counts:
            print(f"   {status.upper()}: {count}")
        
        # 統計輪播狀態
        carousel_counts = db.query(
            CarouselGroup.status,
            func.count(CarouselGroup.id).label('count')
        ).group_by(CarouselGroup.status).all()
        
        print("\n輪播群組狀態統計:")
        for status, count in carousel_counts:
            print(f"   {status.upper()}: {count}")

if __name__ == "__main__":
    print("設置所有準備發布貼文為失敗狀態")
    print("=" * 50)
    
    try:
        # 1. 將準備發布貼文改為失敗
        posts_updated = set_ready_posts_to_failed()
        
        # 2. 更新輪播群組狀態
        carousels_updated = update_carousel_groups()
        
        # 3. 顯示最終狀態
        show_final_status()
        
        print("\n" + "=" * 50)
        print("🎯 操作完成!")
        print(f"✅ 更新了 {posts_updated} 個貼文")
        print(f"✅ 更新了 {carousels_updated} 個輪播群組")
        print("\n💡 前端監控面板現在會顯示:")
        print("   - 更多失敗貼文")
        print("   - 更少準備發布貼文")
        print("   - 失敗狀態的輪播群組")
        
    except Exception as e:
        print(f"❌ 操作過程發生錯誤: {e}")
        import traceback
        traceback.print_exc()