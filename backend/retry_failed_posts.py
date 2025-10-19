#!/usr/bin/env python3
"""
重新處理失敗的社交媒體貼文
使用新的 Pillow-based 系統重試之前失敗的貼文
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import traceback
from utils.db import get_session
from models.social_publishing import SocialPost, PostStatus, SocialAccount
from services.content_generator import ContentGenerator
from services.platform_publishers import get_platform_publisher
from datetime import datetime, timezone

def retry_failed_posts():
    """重新處理所有失敗的貼文"""
    print("=== 重新處理失敗的社交媒體貼文 ===")
    
    with get_session() as db:
        failed_posts = db.query(SocialPost).filter(
            SocialPost.status == PostStatus.FAILED
        ).all()
        
        print(f"找到 {len(failed_posts)} 個失敗貼文需要重新處理")
        
        success_count = 0
        error_count = 0
        
        for i, post in enumerate(failed_posts, 1):
            print(f"\n[{i}/{len(failed_posts)}] 處理貼文 ID {post.id}...")
            print(f"   原始錯誤: {post.error_message[:80]}...")
            
            try:
                post.status = PostStatus.PENDING
                post.error_message = None
                post.retry_count = post.retry_count + 1
                post.updated_at = datetime.now(timezone.utc)
                
                print("   🔄 重新生成內容...")
                content_generator = ContentGenerator()
                
                generated_content = content_generator.generate_content(
                    forum_post=post.forum_post,
                    template=post.template or post.account.default_template
                )
                
                if generated_content:
                    post.generated_image_url = generated_content.get('image_url')
                    post.generated_caption = generated_content.get('caption')
                    post.hashtags = generated_content.get('hashtags', [])
                    
                    print(f"   ✅ 內容生成成功")
                    print(f"      圖片: {post.generated_image_url}")
                    print(f"      文案長度: {len(post.generated_caption) if post.generated_caption else 0}")
                    print(f"      標籤: {len(post.hashtags)}")
                    
                    post.status = PostStatus.QUEUED
                    db.commit()
                    
                    success_count += 1
                    print(f"   🎉 貼文 {post.id} 重新處理成功！")
                    
                else:
                    post.status = PostStatus.FAILED
                    post.error_message = "重新生成內容失敗：無法生成內容"
                    db.commit()
                    error_count += 1
                    print(f"   ❌ 貼文 {post.id} 內容生成失敗")
                    
            except Exception as e:
                error_msg = f"重新處理失敗: {str(e)}"
                post.status = PostStatus.FAILED
                post.error_message = error_msg
                post.updated_at = datetime.now(timezone.utc)
                db.commit()
                error_count += 1
                
                print(f"   ❌ 貼文 {post.id} 重新處理失敗: {e}")
                traceback.print_exc()
        
        print(f"\n=== 重新處理完成 ===")
        print(f"✅ 成功: {success_count}")
        print(f"❌ 失敗: {error_count}")
        print(f"📊 總計: {len(failed_posts)}")
        
        return success_count > 0

def check_post_status():
    """檢查貼文狀態統計"""
    print("\n=== 檢查當前貼文狀態 ===")
    
    with get_session() as db:
        from sqlalchemy import func
        
        status_counts = db.query(
            SocialPost.status,
            func.count(SocialPost.id).label('count')
        ).group_by(SocialPost.status).all()
        
        for status, count in status_counts:
            print(f"   {status.upper()}: {count}")
            
        ready_posts = db.query(SocialPost).filter(
            SocialPost.status == PostStatus.QUEUED,
            SocialPost.generated_image_url.isnot(None),
            SocialPost.generated_caption.isnot(None)
        ).count()
        
        print(f"\n📋 可發布貼文: {ready_posts}")
        
        return ready_posts > 0

if __name__ == "__main__":
    print("社交媒體貼文重新處理工具")
    print("=" * 50)
    
    try:
        retry_success = retry_failed_posts()
        
        has_ready_posts = check_post_status()
        
        print("\n" + "=" * 50)
        print("🎯 處理結果：")
        
        if retry_success:
            print("✅ 部分貼文重新處理成功")
            if has_ready_posts:
                print("📤 有貼文準備就緒，可以發布！")
                print("   建議執行發布任務或檢查監控面板")
            else:
                print("⚠️ 沒有準備就緒的貼文，請檢查生成結果")
        else:
            print("❌ 所有貼文重新處理都失敗")
            print("   請檢查內容生成服務和 Pillow 圖片生成")
            
    except Exception as e:
        print(f"❌ 處理過程發生錯誤: {e}")
        traceback.print_exc()