#!/usr/bin/env python3
"""
修復 Token 問題並重新啟動發布流程
1. 檢查 Token 狀態
2. 提供 Token 更新指引
3. 重新觸發待處理貼文的發布
"""
import sys
import os
from datetime import datetime, timezone, timedelta
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.db import get_session
from models.social_publishing import SocialAccount, SocialPost, PostStatus, AccountStatus
from models.base import Post as ForumPost
from services.post_approval_hook import trigger_auto_publish_on_approval
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_token_status():
    """檢查所有 IG 帳號的 Token 狀態"""
    print("🔍 檢查 Instagram 帳號 Token 狀態...")
    
    with get_session() as db:
        ig_accounts = db.query(SocialAccount).filter(
            SocialAccount.platform == 'instagram'
        ).all()
        
        if not ig_accounts:
            print("❌ 沒有找到 Instagram 帳號")
            return False
        
        print(f"📋 發現 {len(ig_accounts)} 個 Instagram 帳號:")
        
        valid_accounts = 0
        for account in ig_accounts:
            print(f"\\n   帳號 ID: {account.id}")
            print(f"   顯示名: {account.display_name}")
            print(f"   用戶名: @{account.platform_username}")
            print(f"   狀態: {account.status}")
            
            # 檢查 Token
            if account.access_token:
                token_preview = account.access_token[:30] + "..." if len(account.access_token) > 30 else account.access_token
                print(f"   Token: {token_preview}")
                
                # 簡單檢查 Token 是否過期 (基於格式和長度)
                if account.access_token.startswith('EAAJ') and len(account.access_token) > 200:
                    print(f"   Token 狀態: ✅ 格式正確")
                    if account.status == AccountStatus.ACTIVE:
                        valid_accounts += 1
                else:
                    print(f"   Token 狀態: ⚠️ 可能無效或過期")
                    
                # 檢查 Token 過期時間
                if account.token_expires_at:
                    if account.token_expires_at > datetime.now(timezone.utc):
                        print(f"   過期時間: ✅ {account.token_expires_at}")
                    else:
                        print(f"   過期時間: ❌ 已過期 ({account.token_expires_at})")
                else:
                    print(f"   過期時間: ⚠️ 未設置")
            else:
                print(f"   Token: ❌ 未設置")
        
        print(f"\\n✅ 有效帳號數量: {valid_accounts}/{len(ig_accounts)}")
        return valid_accounts > 0

def show_token_update_guide():
    """顯示 Token 更新指引"""
    print("\\n🔧 Token 更新指引:")
    print("=" * 50)
    print("1. 前往 Facebook Graph API Explorer:")
    print("   https://developers.facebook.com/tools/explorer/")
    print()
    print("2. 選擇您的應用程式")
    print()
    print("3. 生成新的 User Access Token，需要以下權限:")
    print("   - pages_show_list")
    print("   - pages_read_engagement") 
    print("   - pages_manage_posts")
    print("   - instagram_basic")
    print("   - instagram_content_publish")
    print()
    print("4. 複製生成的 Token")
    print()
    print("5. 在管理後台更新帳號 Token:")
    print("   - 進入「社交媒體管理」")
    print("   - 選擇要更新的 Instagram 帳號")
    print("   - 點擊「更新 Token」")
    print("   - 貼上新的 Token")
    print()
    print("6. 或者可以使用 API 更新:")
    print("   PUT /api/admin/social/accounts/{account_id}/token")
    print("   { \"instagram_user_token\": \"新的_TOKEN\" }")

def reset_failed_posts():
    """重置失敗的貼文，給它們重新發布的機會"""
    print("\\n🔄 重置失敗的貼文...")
    
    with get_session() as db:
        # 找出最近失敗的貼文 (24 小時內)
        recent_time = datetime.now(timezone.utc) - timedelta(hours=24)
        
        failed_posts = db.query(SocialPost).filter(
            SocialPost.status == PostStatus.FAILED,
            SocialPost.updated_at >= recent_time,
            SocialPost.retry_count < 3  # 只重置重試次數少於 3 的
        ).all()
        
        if not failed_posts:
            print("✅ 沒有需要重置的失敗貼文")
            return
        
        print(f"📋 發現 {len(failed_posts)} 個可重置的失敗貼文:")
        
        reset_count = 0
        for post in failed_posts:
            # 檢查錯誤訊息是否與 Token 相關
            error_msg = post.error_message or ""
            if any(keyword in error_msg.lower() for keyword in ['token', 'access', 'auth', 'expire', 'session']):
                print(f"   - 貼文 ID: {post.id} -> 重置為 pending (Token 相關錯誤)")
                post.status = PostStatus.PENDING
                post.error_message = None
                post.updated_at = datetime.now(timezone.utc)
                reset_count += 1
            else:
                print(f"   - 貼文 ID: {post.id} -> 跳過 (非 Token 錯誤: {error_msg[:50]})")
        
        if reset_count > 0:
            db.commit()
            print(f"\\n✅ 已重置 {reset_count} 個貼文")
        else:
            print("\\n⚠️ 沒有 Token 相關的失敗貼文需要重置")

def trigger_new_posts():
    """檢查是否有新的已審核貼文需要處理"""
    print("\\n🔍 檢查新的已審核貼文...")
    
    with get_session() as db:
        # 找出最近審核通過但還沒有對應社交貼文的論壇貼文
        recent_time = datetime.now(timezone.utc) - timedelta(hours=24)
        
        # 查找已審核的論壇貼文
        approved_posts = db.query(ForumPost).filter(
            ForumPost.status == 'approved',
            ForumPost.is_deleted == False,
            ForumPost.created_at >= recent_time
        ).all()
        
        if not approved_posts:
            print("✅ 沒有找到最近的已審核貼文")
            return
        
        print(f"📋 發現 {len(approved_posts)} 個最近已審核的論壇貼文")
        
        # 檢查哪些還沒有對應的社交貼文
        new_posts = []
        for forum_post in approved_posts:
            existing_social_posts = db.query(SocialPost).filter(
                SocialPost.forum_post_id == forum_post.id
            ).count()
            
            if existing_social_posts == 0:
                new_posts.append(forum_post)
                content_preview = forum_post.content[:50] + "..." if len(forum_post.content) > 50 else forum_post.content
                print(f"   - 貼文 ID: {forum_post.id}, 內容: {content_preview}")
        
        if new_posts:
            print(f"\\n🚀 觸發 {len(new_posts)} 個新貼文的自動發布...")
            
            success_count = 0
            for forum_post in new_posts:
                try:
                    result = trigger_auto_publish_on_approval(forum_post)
                    if result.get('success'):
                        success_count += 1
                        print(f"   ✅ 貼文 {forum_post.id} 處理成功")
                    else:
                        print(f"   ❌ 貼文 {forum_post.id} 處理失敗: {result.get('error', '未知錯誤')}")
                except Exception as e:
                    print(f"   ❌ 貼文 {forum_post.id} 處理異常: {e}")
            
            print(f"\\n✅ 成功處理 {success_count}/{len(new_posts)} 個貼文")
        else:
            print("✅ 所有已審核貼文都已處理過")

def retry_pending_posts():
    """重新觸發待處理的貼文"""
    print("\\n🔄 檢查待處理的貼文...")
    
    with get_session() as db:
        pending_posts = db.query(SocialPost).filter(
            SocialPost.status == PostStatus.PENDING
        ).all()
        
        if not pending_posts:
            print("✅ 沒有待處理的貼文")
            return
        
        print(f"📋 發現 {len(pending_posts)} 個待處理的貼文")
        
        # 檢查 Celery 是否運行
        try:
            from services.celery_app import celery_app
            from services.auto_publisher import publish_single_post
            
            inspect = celery_app.control.inspect()
            active_workers = inspect.active()
            
            if active_workers:
                print(f"✅ Celery workers 運行中: {list(active_workers.keys())}")
                
                # 手動觸發待處理貼文
                triggered_count = 0
                for post in pending_posts:
                    try:
                        print(f"   - 觸發貼文 {post.id} 的發布任務...")
                        post.status = PostStatus.PROCESSING
                        db.commit()
                        
                        task = publish_single_post.delay(post.id)
                        print(f"     ✅ 任務已提交: {task.id}")
                        triggered_count += 1
                        
                    except Exception as e:
                        print(f"     ❌ 提交失敗: {e}")
                        post.status = PostStatus.PENDING  # 回復狀態
                        db.commit()
                
                print(f"\\n✅ 已觸發 {triggered_count} 個貼文的發布任務")
                
            else:
                print("❌ 沒有活躍的 Celery workers")
                print("請確保 Celery worker 正在運行:")
                print("celery -A services.celery_app.celery_app worker --loglevel=info")
                
        except Exception as e:
            print(f"❌ 檢查 Celery 狀態失敗: {e}")

def show_current_status():
    """顯示目前狀態"""
    print("\\n📊 目前系統狀態:")
    print("=" * 30)
    
    with get_session() as db:
        # 帳號狀態
        total_accounts = db.query(SocialAccount).filter(SocialAccount.platform == 'instagram').count()
        active_accounts = db.query(SocialAccount).filter(
            SocialAccount.platform == 'instagram',
            SocialAccount.status == AccountStatus.ACTIVE
        ).count()
        
        print(f"Instagram 帳號: {active_accounts}/{total_accounts} 活躍")
        
        # 貼文狀態
        total_posts = db.query(SocialPost).count()
        pending = db.query(SocialPost).filter(SocialPost.status == PostStatus.PENDING).count()
        processing = db.query(SocialPost).filter(SocialPost.status == PostStatus.PROCESSING).count()
        published = db.query(SocialPost).filter(SocialPost.status == PostStatus.PUBLISHED).count()
        failed = db.query(SocialPost).filter(SocialPost.status == PostStatus.FAILED).count()
        
        print(f"社交貼文總數: {total_posts}")
        print(f"  - 待處理: {pending}")
        print(f"  - 處理中: {processing}")
        print(f"  - 已發布: {published}")
        print(f"  - 失敗: {failed}")

def main():
    """主程式"""
    print("🛠️ Instagram Token 修復和重新發布工具")
    print("=" * 60)
    
    # 顯示目前狀態
    show_current_status()
    
    # 檢查 Token 狀態
    token_ok = check_token_status()
    
    if not token_ok:
        print("\\n⚠️ 發現 Token 問題！")
        show_token_update_guide()
        
        choice = input("\\n是否繼續執行其他修復步驟？(y/N): ").strip().lower()
        if choice != 'y':
            print("請先修復 Token 問題後再運行此工具。")
            return
    
    # 重置失敗貼文
    reset_failed_posts()
    
    # 檢查新貼文
    trigger_new_posts()
    
    # 重新觸發待處理貼文
    retry_pending_posts()
    
    # 顯示最終狀態
    print("\\n" + "=" * 60)
    show_current_status()
    
    print("\\n✅ 修復流程完成！")
    print("\\n📋 後續步驟:")
    print("1. 如果 Token 有問題，請按照上述指引更新")
    print("2. 確保 Celery worker 正在運行")
    print("3. 監控貼文發布狀態")
    print("4. 如有問題，檢查日誌: logs/app.log")

if __name__ == "__main__":
    main()