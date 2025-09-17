#!/usr/bin/env python3
"""
Instagram Token 延長工具
將短期 User Access Token 轉換為長期 Token（60天有效期）
"""
import sys
import os
import requests
from datetime import datetime, timezone, timedelta

# Facebook App 資訊 - 需要你的實際 App ID 和 App Secret
APP_ID = "636701975752513"  # 從 debug 結果看到的 App ID
APP_SECRET = "你的_APP_SECRET"  # 需要從 Facebook 開發者後台獲取

def extend_token(short_lived_token, app_id, app_secret):
    """將短期 Token 轉換為長期 Token"""

    print(f"🔄 嘗試延長 Token...")
    print(f"App ID: {app_id}")
    print(f"短期 Token: {short_lived_token[:50]}...")

    # Facebook Token 交換 API
    exchange_url = "https://graph.facebook.com/v19.0/oauth/access_token"

    params = {
        'grant_type': 'fb_exchange_token',
        'client_id': app_id,
        'client_secret': app_secret,
        'fb_exchange_token': short_lived_token
    }

    try:
        response = requests.get(exchange_url, params=params, timeout=10)

        if response.status_code == 200:
            data = response.json()

            if 'access_token' in data:
                long_lived_token = data['access_token']
                expires_in = data.get('expires_in', 5184000)  # 預設 60 天

                print("✅ Token 延長成功！")
                print(f"長期 Token: {long_lived_token[:50]}...")
                print(f"有效期: {expires_in} 秒 ({expires_in/86400:.1f} 天)")

                # 計算過期時間
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                expires_taipei = expires_at + timedelta(hours=8)

                print(f"過期時間 (UTC): {expires_at.strftime('%Y-%m-%d %H:%M:%S')}")
                print(f"過期時間 (UTC+8): {expires_taipei.strftime('%Y-%m-%d %H:%M:%S')}")

                return {
                    'success': True,
                    'access_token': long_lived_token,
                    'expires_in': expires_in,
                    'expires_at': expires_at
                }
            else:
                print("❌ 響應中沒有 access_token")
                return {'success': False, 'error': 'No access_token in response'}

        else:
            error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
            print(f"❌ Token 延長失敗: {response.status_code}")
            print(f"錯誤: {error_data}")
            return {'success': False, 'error': error_data}

    except Exception as e:
        print(f"❌ 請求失敗: {e}")
        return {'success': False, 'error': str(e)}

def update_token_in_db(new_token, expires_at):
    """更新資料庫中的 Token"""
    try:
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        from utils.db import get_session
        from models.social_publishing import SocialAccount, PlatformType

        with get_session() as db:
            account = db.query(SocialAccount).filter(
                SocialAccount.platform == PlatformType.INSTAGRAM
            ).first()

            if account:
                account.access_token = new_token
                account.token_expires_at = expires_at
                account.updated_at = datetime.now(timezone.utc)

                db.commit()

                print("✅ 資料庫更新成功！")
                return True
            else:
                print("❌ 找不到 Instagram 帳號")
                return False

    except Exception as e:
        print(f"❌ 更新資料庫失敗: {e}")
        return False

def main():
    print("🔧 Instagram Token 延長工具")
    print("=" * 50)

    # 目前的短期 Token
    current_token = "EAAJDE7sXr0EBPS4pGo8EAvxsOtn8Qn7oDZAVrnmpnoRZAciD3mhg5Ttl8GkuDEVJj47Qm9swOItZAX6vfJTtrZANwZBq69YLqnwqkfSl30s38Ueerazrjy2AZB8QQn8EO7Pazm54gUjDnYKycoZCzotMFcVH75LgKa91eDZCMbYqzBJIfEz1E8RUxSnENS2LVpgDoxbXnQSghBL9qGOFpW811L47kmq5vweokigNFiIxwg0ILgZDZD"

    if APP_SECRET == "你的_APP_SECRET":
        print("⚠️  需要設定 Facebook App Secret")
        print()
        print("請至 Facebook 開發者後台獲取 App Secret:")
        print("1. 前往 https://developers.facebook.com/apps/")
        print(f"2. 選擇你的應用程式 (App ID: {APP_ID})")
        print("3. 到「設定」>「基本」")
        print("4. 複製「應用程式密鑰」")
        print("5. 更新本檔案中的 APP_SECRET 變數")
        print()
        print("或者直接在 Facebook Graph API Explorer 中:")
        print("1. 點選「取得存取權杖」")
        print("2. 選擇「取得長期權杖」")
        print("3. 複製新的長期 Token")
        return

    # 嘗試延長 Token
    result = extend_token(current_token, APP_ID, APP_SECRET)

    if result['success']:
        # 更新資料庫
        update_success = update_token_in_db(
            result['access_token'],
            result['expires_at']
        )

        if update_success:
            print("\n🎉 Token 延長並更新完成！")
        else:
            print(f"\n⚠️  Token 延長成功，但資料庫更新失敗")
            print(f"請手動更新以下長期 Token:")
            print(f"{result['access_token']}")
    else:
        print("\n❌ Token 延長失敗")
        print("建議從 Facebook Graph API Explorer 重新獲取長期 Token")

if __name__ == "__main__":
    main()