#!/usr/bin/env python3
"""
Instagram Token 和發布修復工具
專門修復 Token 系統更新後的問題
"""
import sys
import os
from datetime import datetime, timezone, timedelta
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.db import get_session
from models.social_publishing import SocialAccount, SocialPost, PostStatus, AccountStatus, PlatformType
import logging

def show_instagram_status():
    """顯示 Instagram 帳號和貼文狀態"""
    print("📊 Instagram 系統狀態:")
    print("=" * 50)

    with get_session() as db:
        # 帳號狀態
        ig_accounts = db.query(SocialAccount).filter(SocialAccount.platform == PlatformType.INSTAGRAM).all()

        print(f"📱 Instagram 帳號總數: {len(ig_accounts)}")

        for account in ig_accounts:
            page_id = account.page_id or account.platform_user_id
            has_token = bool(account.access_token)
            has_page_id = bool(page_id)

            print(f"\\n  🔧 帳號: {account.display_name} (ID: {account.id})")
            print(f"     狀態: {account.status}")
            print(f"     Token: {'✅ 有' if has_token else '❌ 無'}")
            print(f"     Page ID: {'✅ ' + str(page_id) if has_page_id else '❌ 未綁定'}")

            # 根據問題類型給出建議
            if account.status == AccountStatus.PENDING:
                if not has_token:
                    print(f"     🚨 問題: 缺少 Token，需要更新")
                elif not has_page_id:
                    print(f"     🚨 問題: 缺少 Page ID，需要綁定")
                else:
                    print(f"     ⚠️  狀態: 等待驗證")
            elif account.status == AccountStatus.ERROR:
                print(f"     🚨 問題: 帳號錯誤狀態，需要檢查")

        # 貼文狀態
        print(f"\\n📝 社交貼文狀態:")
        total_posts = db.query(SocialPost).join(SocialAccount).filter(
            SocialAccount.platform == PlatformType.INSTAGRAM
        ).count()

        pending = db.query(SocialPost).join(SocialAccount).filter(
            SocialAccount.platform == PlatformType.INSTAGRAM,
            SocialPost.status == PostStatus.PENDING
        ).count()

        processing = db.query(SocialPost).join(SocialAccount).filter(
            SocialAccount.platform == PlatformType.INSTAGRAM,
            SocialPost.status == PostStatus.PROCESSING
        ).count()

        published = db.query(SocialPost).join(SocialAccount).filter(
            SocialAccount.platform == PlatformType.INSTAGRAM,
            SocialPost.status == PostStatus.PUBLISHED
        ).count()

        failed = db.query(SocialPost).join(SocialAccount).filter(
            SocialAccount.platform == PlatformType.INSTAGRAM,
            SocialPost.status == PostStatus.FAILED
        ).count()

        print(f"  總數: {total_posts}")
        print(f"  待處理: {pending}")
        print(f"  處理中: {processing}")
        print(f"  已發布: {published}")
        print(f"  失敗: {failed}")

def reset_failed_posts():
    """重置失敗的貼文（特別是 Token 相關的錯誤）"""
    print("\\n🔄 重置失敗的貼文...")

    with get_session() as db:
        # 找出 Token 相關的失敗貼文
        recent_time = datetime.now(timezone.utc) - timedelta(hours=24)

        failed_posts = db.query(SocialPost).join(SocialAccount).filter(
            SocialAccount.platform == PlatformType.INSTAGRAM,
            SocialPost.status == PostStatus.FAILED,
            SocialPost.updated_at >= recent_time
        ).all()

        token_related_count = 0
        processing_count = 0

        for post in failed_posts:
            error_msg = (post.error_message or '').lower()
            is_token_related = any(keyword in error_msg for keyword in [
                'token', 'access', 'auth', 'expire', 'invalid', 'permission',
                'oauth', 'credential', 'unauthorized'
            ])

            if is_token_related:
                print(f"  🔄 重置 Token 相關失敗貼文 ID: {post.id}")
                post.status = PostStatus.PENDING
                post.error_message = None
                post.retry_count = 0
                post.updated_at = datetime.now(timezone.utc)
                token_related_count += 1

        # 重置卡住的處理中貼文
        processing_posts = db.query(SocialPost).join(SocialAccount).filter(
            SocialAccount.platform == PlatformType.INSTAGRAM,
            SocialPost.status == PostStatus.PROCESSING,
            SocialPost.updated_at < datetime.now(timezone.utc) - timedelta(minutes=30)
        ).all()

        for post in processing_posts:
            print(f"  🔄 重置卡住的處理中貼文 ID: {post.id}")
            post.status = PostStatus.PENDING
            post.updated_at = datetime.now(timezone.utc)
            processing_count += 1

        if token_related_count > 0 or processing_count > 0:
            db.commit()
            print(f"✅ 已重置 {token_related_count} 個 Token 相關失敗貼文")
            print(f"✅ 已重置 {processing_count} 個卡住的處理中貼文")
        else:
            print("✅ 沒有需要重置的貼文")

def refresh_account_status():
    """重新整理帳號狀態"""
    print("\\n🔍 重新整理帳號狀態...")

    with get_session() as db:
        ig_accounts = db.query(SocialAccount).filter(SocialAccount.platform == PlatformType.INSTAGRAM).all()

        updated_count = 0

        for account in ig_accounts:
            old_status = account.status
            has_token = bool(account.access_token)
            has_page_id = bool(account.page_id or account.platform_user_id)

            # 根據現有資源決定合適的狀態
            if has_token and has_page_id:
                if account.status in [AccountStatus.ERROR, AccountStatus.PENDING]:
                    account.status = AccountStatus.PENDING  # 等待驗證，不直接設為 ACTIVE
                    account.updated_at = datetime.now(timezone.utc)
                    if old_status != account.status:
                        updated_count += 1
                        print(f"  📝 帳號 {account.display_name}: {old_status} → {account.status}")
            elif has_token and not has_page_id:
                if account.status != AccountStatus.PENDING:
                    account.status = AccountStatus.PENDING
                    account.updated_at = datetime.now(timezone.utc)
                    updated_count += 1
                    print(f"  📝 帳號 {account.display_name}: {old_status} → {account.status} (需要 Page ID)")
            elif not has_token:
                if account.status not in [AccountStatus.DISABLED, AccountStatus.PENDING]:
                    account.status = AccountStatus.PENDING
                    account.updated_at = datetime.now(timezone.utc)
                    updated_count += 1
                    print(f"  📝 帳號 {account.display_name}: {old_status} → {account.status} (需要 Token)")

        if updated_count > 0:
            db.commit()
            print(f"✅ 已更新 {updated_count} 個帳號狀態")
        else:
            print("✅ 所有帳號狀態都正確")

def show_fix_guide():
    """顯示修復指引"""
    print("\\n📋 修復指引:")
    print("=" * 50)
    print()
    print("🔧 如果帳號狀態是 'pending' 且缺少 Token：")
    print("  1. 前往管理後台的 Instagram 管理頁面")
    print("  2. 點擊「更新 Token」按鈕")
    print("  3. 貼上新的 Facebook User Access Token")
    print()
    print("🔧 如果帳號狀態是 'pending' 且缺少 Page ID：")
    print("  1. 在更新 Token 時同時填入正確的 Page ID")
    print("  2. 或者單獨更新 Page ID（不更新 Token）")
    print()
    print("🔧 如果帳號有 Token 和 Page ID 但狀態是 'pending'：")
    print("  1. 點擊「驗證帳號」按鈕進行驗證")
    print("  2. 系統會自動檢查並更新狀態")
    print()
    print("🔧 取得新的 Facebook User Access Token：")
    print("  1. 前往 Facebook Graph API Explorer:")
    print("     https://developers.facebook.com/tools/explorer/")
    print("  2. 選擇您的應用程式")
    print("  3. 確保包含以下權限：")
    print("     ✅ pages_show_list")
    print("     ✅ pages_read_engagement")
    print("     ✅ pages_manage_posts")
    print("     ✅ instagram_basic")
    print("     ✅ instagram_content_publish")
    print("  4. 生成 Token 並複製")

def main():
    """主程式"""
    print("🛠️ Instagram Token 和發布修復工具")
    print("=" * 60)

    # 顯示目前狀態
    show_instagram_status()

    # 重置失敗的貼文
    reset_failed_posts()

    # 重新整理帳號狀態
    refresh_account_status()

    # 顯示修復指引
    show_fix_guide()

    print("\\n" + "=" * 60)
    show_instagram_status()

    print("\\n✅ 修復完成！")
    print("\\n💡 接下來請:")
    print("1. 按照上述指引更新有問題的帳號")
    print("2. 在管理後台驗證帳號狀態")
    print("3. 檢查發布功能是否正常")

if __name__ == "__main__":
    main()