#!/usr/bin/env python3
"""
修復輪播群組狀態
將有準備發布內容的 failed 輪播群組改為 ready 狀態
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import traceback
from utils.db import get_session
from models.social_publishing import CarouselGroup, SocialPost, PostStatus
from datetime import datetime, timezone

def fix_carousel_group_status():
    """修復輪播群組狀態"""
    print("=== 修復輪播群組狀態 ===")
    
    with get_session() as db:
        # 查找 failed 狀態的輪播群組
        failed_carousels = db.query(CarouselGroup).filter(
            CarouselGroup.status == 'failed'
        ).all()
        
        print(f"找到 {len(failed_carousels)} 個失敗狀態的輪播群組")
        
        fixed_count = 0
        ready_count = 0
        
        for carousel in failed_carousels:
            print(f"\n檢查輪播 {carousel.group_id} (ID: {carousel.id})")
            
            # 查找關聯的貼文
            posts = db.query(SocialPost).filter(
                SocialPost.carousel_group_id == carousel.id
            ).all()
            
            # 統計各狀態貼文
            queued_posts = [p for p in posts if p.status == PostStatus.QUEUED and p.generated_image_url and p.generated_caption]
            processing_posts = [p for p in posts if p.status == PostStatus.PROCESSING]
            published_posts = [p for p in posts if p.status == PostStatus.PUBLISHED]
            failed_posts = [p for p in posts if p.status == PostStatus.FAILED]
            
            print(f"   貼文狀態: 準備發布 {len(queued_posts)}, 處理中 {len(processing_posts)}, 已發布 {len(published_posts)}, 失敗 {len(failed_posts)}")
            
            try:
                # 如果所有貼文都已發布，標記為完成
                if len(published_posts) == len(posts) and len(posts) > 0:
                    carousel.status = 'completed'
                    carousel.published_at = datetime.now(timezone.utc)
                    print("   ✅ 改為 COMPLETED (所有貼文已發布)")
                    fixed_count += 1
                
                # 如果有準備發布的貼文，標記為準備就緒
                elif len(queued_posts) > 0:
                    carousel.status = 'ready'
                    print(f"   🚀 改為 READY ({len(queued_posts)} 個貼文準備發布)")
                    fixed_count += 1
                    ready_count += 1
                
                # 如果所有貼文都在處理中，標記為處理中
                elif len(processing_posts) == len(posts) and len(posts) > 0:
                    carousel.status = 'processing'
                    print("   🔄 改為 PROCESSING (所有貼文處理中)")
                    fixed_count += 1
                
                # 如果有混合狀態，根據主要狀態決定
                elif len(queued_posts) + len(processing_posts) > 0:
                    if len(queued_posts) >= len(processing_posts):
                        carousel.status = 'ready'
                        print(f"   🚀 改為 READY (主要是準備發布貼文)")
                        fixed_count += 1
                        ready_count += 1
                    else:
                        carousel.status = 'processing'
                        print("   🔄 改為 PROCESSING (主要是處理中貼文)")
                        fixed_count += 1
                
                else:
                    print("   ⚠️ 保持 FAILED 狀態 (沒有可用內容)")
                
                db.commit()
                
            except Exception as e:
                print(f"   ❌ 修復失敗: {e}")
                db.rollback()
        
        print(f"\n📊 修復結果:")
        print(f"   修復成功: {fixed_count}")
        print(f"   準備發布: {ready_count}")
        print(f"   總處理數: {len(failed_carousels)}")
        
        return fixed_count > 0

def update_carousel_progress():
    """更新輪播群組的進度信息"""
    print("\n=== 更新輪播群組進度 ===")
    
    with get_session() as db:
        carousels = db.query(CarouselGroup).all()
        
        for carousel in carousels:
            posts = db.query(SocialPost).filter(
                SocialPost.carousel_group_id == carousel.id
            ).all()
            
            # 更新收集計數
            actual_collected = len(posts)
            if carousel.collected_count != actual_collected:
                carousel.collected_count = actual_collected
                print(f"輪播 {carousel.group_id}: 更新收集數 {carousel.collected_count} -> {actual_collected}")
        
        db.commit()

def show_carousel_status():
    """顯示當前輪播狀態"""
    print("\n=== 當前輪播狀態 ===")
    
    with get_session() as db:
        from sqlalchemy import func
        
        # 按狀態統計輪播群組
        status_counts = db.query(
            CarouselGroup.status,
            func.count(CarouselGroup.id).label('count')
        ).group_by(CarouselGroup.status).all()
        
        print("輪播群組狀態統計:")
        for status, count in status_counts:
            print(f"   {status.upper()}: {count}")
        
        # 顯示準備發布的輪播詳情
        ready_carousels = db.query(CarouselGroup).filter(
            CarouselGroup.status == 'ready'
        ).all()
        
        if ready_carousels:
            print(f"\n🚀 準備發布的輪播群組 ({len(ready_carousels)} 個):")
            for carousel in ready_carousels:
                posts = db.query(SocialPost).filter(
                    SocialPost.carousel_group_id == carousel.id
                ).all()
                
                queued_count = sum(1 for p in posts if p.status == PostStatus.QUEUED)
                print(f"   - {carousel.group_id}: {queued_count}/{len(posts)} 準備發布")

if __name__ == "__main__":
    print("修復輪播群組狀態")
    print("=" * 40)
    
    try:
        # 1. 修復輪播群組狀態
        status_fixed = fix_carousel_group_status()
        
        # 2. 更新進度信息
        update_carousel_progress()
        
        # 3. 顯示當前狀態
        show_carousel_status()
        
        print("\n" + "=" * 40)
        print("🎯 修復完成!")
        
        if status_fixed:
            print("✅ 輪播群組狀態已修復")
            print("💡 前端應該能看到正確的輪播進度")
        else:
            print("⚠️ 沒有需要修復的輪播群組")
            
    except Exception as e:
        print(f"❌ 修復過程發生錯誤: {e}")
        traceback.print_exc()