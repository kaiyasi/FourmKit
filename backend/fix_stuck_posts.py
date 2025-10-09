#!/usr/bin/env python3
"""
修復卡住的貼文和處理未轉換的已審核論壇貼文
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import traceback
from utils.db import get_session
from models.social_publishing import SocialPost, PostStatus, SocialAccount, PlatformType
from models.base import Post
from services.post_approval_hook import trigger_auto_publish_on_approval
from services.content_generator import ContentGenerator
from datetime import datetime, timezone

def fix_unprocessed_approved_posts():
    """處理未轉換的已審核論壇貼文"""
    print("=== 處理未轉換的已審核論壇貼文 ===")
    
    with get_session() as db:
        # 查找已審核但未轉換的論壇貼文
        approved_posts = db.query(Post).filter(
            Post.status == 'approved'
        ).order_by(Post.created_at.desc()).limit(15).all()
        
        unprocessed_posts = []
        for forum_post in approved_posts:
            existing_social = db.query(SocialPost).filter(
                SocialPost.forum_post_id == forum_post.id
            ).first()
            
            if not existing_social:
                unprocessed_posts.append(forum_post)
        
        print(f"找到 {len(unprocessed_posts)} 個未轉換的已審核貼文")
        
        success_count = 0
        for i, forum_post in enumerate(unprocessed_posts, 1):
            print(f"\n[{i}/{len(unprocessed_posts)}] 處理論壇貼文 ID {forum_post.id}")
            print(f"   內容: {forum_post.content[:50]}...")
            print(f"   審核時間: {forum_post.created_at}")
            
            try:
                # 觸發自動發布處理
                result = trigger_auto_publish_on_approval(forum_post)
                
                if result.get('success'):
                    if result.get('auto_publish'):
                        print(f"   ✅ 自動發布觸發成功")
                        success_count += 1
                    else:
                        print(f"   ⚠️ 不符合發布條件: {result.get('reason')}")
                else:
                    print(f"   ❌ 自動發布失敗: {result.get('error')}")
                    
            except Exception as e:
                print(f"   ❌ 處理失敗: {e}")
                traceback.print_exc()
        
        print(f"\n📊 未轉換貼文處理結果:")
        print(f"   成功觸發: {success_count}")
        print(f"   總處理數: {len(unprocessed_posts)}")
        
        return success_count > 0

def fix_stuck_processing_posts():
    """修復卡住的 PROCESSING 貼文"""
    print("\n=== 修復卡住的 PROCESSING 貼文 ===")
    
    with get_session() as db:
        # 查找卡住的 PROCESSING 貼文
        processing_posts = db.query(SocialPost).filter(
            SocialPost.status == PostStatus.PROCESSING
        ).all()
        
        print(f"找到 {len(processing_posts)} 個 PROCESSING 貼文")
        
        fixed_count = 0
        for post in processing_posts:
            # 計算卡住時間
            if post.created_at:
                stuck_hours = (datetime.now(timezone.utc) - post.created_at).total_seconds() / 3600
                
                print(f"\n處理貼文 ID {post.id} (卡住 {stuck_hours:.1f} 小時)")
                print(f"   論壇貼文: {post.forum_post_id}")
                print(f"   圖片: {'有' if post.generated_image_url else '無'}")
                print(f"   文案: {'有' if post.generated_caption else '無'}")
                
                try:
                    # 如果已有內容但狀態錯誤，改為 QUEUED
                    if post.generated_image_url and post.generated_caption:
                        print("   🔄 已有內容，改為 QUEUED 狀態")
                        post.status = PostStatus.QUEUED
                        post.updated_at = datetime.now(timezone.utc)
                        db.commit()
                        fixed_count += 1
                        print("   ✅ 狀態已修正為 QUEUED")
                        
                    # 如果沒有內容，嘗試重新生成
                    elif stuck_hours > 0.5:  # 超過30分鐘
                        print("   🔄 重新生成內容...")
                        
                        # 重設狀態並重新生成
                        post.status = PostStatus.PENDING
                        post.error_message = None
                        post.retry_count = post.retry_count + 1
                        post.updated_at = datetime.now(timezone.utc)
                        
                        # 生成內容
                        content_generator = ContentGenerator()
                        generated_content = content_generator.generate_content(
                            forum_post=post.forum_post,
                            template=post.template or post.account.default_template
                        )
                        
                        if generated_content:
                            post.generated_image_url = generated_content.get('image_url')
                            post.generated_caption = generated_content.get('caption')
                            post.hashtags = generated_content.get('hashtags', [])
                            post.status = PostStatus.QUEUED
                            
                            print("   ✅ 內容重新生成成功")
                            fixed_count += 1
                        else:
                            post.status = PostStatus.FAILED
                            post.error_message = "內容重新生成失敗"
                            print("   ❌ 內容重新生成失敗")
                        
                        db.commit()
                        
                except Exception as e:
                    print(f"   ❌ 修復失敗: {e}")
                    traceback.print_exc()
        
        print(f"\n📊 PROCESSING 貼文修復結果:")
        print(f"   修復成功: {fixed_count}")
        print(f"   總處理數: {len(processing_posts)}")
        
        return fixed_count > 0

def check_publishing_system():
    """檢查發布系統狀態"""
    print("\n=== 檢查發布系統狀態 ===")
    
    with get_session() as db:
        # 檢查 QUEUED 貼文數量
        queued_count = db.query(SocialPost).filter(
            SocialPost.status == PostStatus.QUEUED,
            SocialPost.generated_image_url.isnot(None),
            SocialPost.generated_caption.isnot(None)
        ).count()
        
        # 檢查活躍帳號
        active_accounts = db.query(SocialAccount).filter(
            SocialAccount.platform == PlatformType.INSTAGRAM,
            SocialAccount.status == 'active'
        ).count()
        
        print(f"   準備發布的貼文: {queued_count}")
        print(f"   活躍 Instagram 帳號: {active_accounts}")
        
        if queued_count > 0 and active_accounts > 0:
            print("   ✅ 系統準備就緒，貼文可以發布")
            
            # 檢查批次觸發條件
            account = db.query(SocialAccount).filter(
                SocialAccount.platform == PlatformType.INSTAGRAM,
                SocialAccount.status == 'active'
            ).first()
            
            if account:
                print(f"   觸發方式: {account.publish_trigger}")
                print(f"   批次大小: {account.batch_size}")
                
                if account.publish_trigger == 'batch_count':
                    if queued_count >= account.batch_size:
                        print("   🚀 達到批次發布條件！")
                    else:
                        print(f"   ⏳ 需要 {account.batch_size - queued_count} 個更多貼文才能觸發批次發布")
        
        else:
            print("   ❌ 系統未準備就緒")
            if queued_count == 0:
                print("       沒有準備發布的貼文")
            if active_accounts == 0:
                print("       沒有活躍的 Instagram 帳號")

if __name__ == "__main__":
    print("修復卡住貼文和未轉換論壇貼文")
    print("=" * 50)
    
    try:
        # 1. 處理未轉換的已審核論壇貼文
        unprocessed_fixed = fix_unprocessed_approved_posts()
        
        # 2. 修復卡住的 PROCESSING 貼文
        stuck_fixed = fix_stuck_processing_posts()
        
        # 3. 檢查發布系統狀態
        check_publishing_system()
        
        print("\n" + "=" * 50)
        print("🎯 總結:")
        
        if unprocessed_fixed:
            print("✅ 部分未轉換論壇貼文已處理")
        
        if stuck_fixed:
            print("✅ 部分卡住貼文已修復")
        
        if not unprocessed_fixed and not stuck_fixed:
            print("⚠️ 沒有貼文需要修復，或修復失敗")
        
        print("\n💡 建議:")
        print("   1. 檢查監控面板的更新狀態")
        print("   2. 確認自動發布觸發器是否正常工作")
        print("   3. 查看 Celery 任務隊列是否有積壓")
        
    except Exception as e:
        print(f"❌ 修復過程發生錯誤: {e}")
        traceback.print_exc()