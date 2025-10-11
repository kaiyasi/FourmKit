#!/usr/bin/env python3
"""
修復 Page ID 問題
檢查可用的 Pages 並更新正確的 Page ID
"""
import sys
import os
import requests
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.db import get_session
from models.social_publishing import SocialAccount

def check_available_pages():
    """檢查可用的 Facebook Pages"""
    print("🔍 檢查可用的 Facebook Pages...")
    
    with get_session() as db:
        account = db.query(SocialAccount).filter(SocialAccount.platform == 'instagram').first()
        if not account:
            print("❌ 找不到 Instagram 帳號")
            return None
        
        token = account.access_token
        print(f"🔑 使用 User Token: {token[:30]}...")
        
        try:
            response = requests.get(
                "https://graph.facebook.com/v23.0/me/accounts",
                params={
                    'access_token': token,
                    'fields': 'id,name,category,access_token,instagram_business_account'
                }
            )
            
            if response.status_code != 200:
                print(f"❌ API 錯誤: {response.status_code}")
                print(f"   回應: {response.text}")
                return None
            
            data = response.json()
            pages = data.get('data', [])
            
            if not pages:
                print("❌ 沒有找到任何可管理的 Facebook Pages")
                print()
                print("🔧 可能的解決方案:")
                print("1. 確保您是某個 Facebook Page 的管理員")
                print("2. 重新進行 OAuth 授權，並確保:")
                print("   - 勾選所有必要權限")
                print("   - 在授權過程中選擇要連結的 Facebook Pages")
                print("3. 檢查 Facebook App 的權限設定")
                return None
            
            print(f"✅ 找到 {len(pages)} 個可管理的 Facebook Pages:")
            print()
            
            valid_pages = []
            for i, page in enumerate(pages, 1):
                has_ig = page.get('instagram_business_account') is not None
                has_token = page.get('access_token') is not None
                
                print(f"{i}. 📄 {page['name']}")
                print(f"   Page ID: {page['id']}")
                print(f"   類別: {page.get('category', 'Unknown')}")
                print(f"   Page Token: {'✅' if has_token else '❌'}")
                print(f"   Instagram 連結: {'✅' if has_ig else '❌'}")
                
                if has_ig:
                    ig_account = page['instagram_business_account']
                    print(f"   Instagram Account ID: {ig_account['id']}")
                    
                    if has_token:
                        try:
                            ig_response = requests.get(
                                f"https://graph.facebook.com/v23.0/{ig_account['id']}",
                                params={
                                    'fields': 'id,username,name,account_type',
                                    'access_token': page['access_token']
                                }
                            )
                            if ig_response.status_code == 200:
                                ig_data = ig_response.json()
                                print(f"   Instagram 用戶名: @{ig_data.get('username', 'Unknown')}")
                                print(f"   Instagram 名稱: {ig_data.get('name', 'Unknown')}")
                                print(f"   帳號類型: {ig_data.get('account_type', 'Unknown')}")
                        except:
                            pass
                    
                    valid_pages.append(page)
                
                print()
            
            return valid_pages
            
        except Exception as e:
            print(f"❌ 檢查 Pages 失敗: {e}")
            return None

def update_page_id(page_id):
    """更新資料庫中的 Page ID"""
    print(f"🔧 更新 Page ID 為: {page_id}")
    
    with get_session() as db:
        account = db.query(SocialAccount).filter(SocialAccount.platform == 'instagram').first()
        if not account:
            print("❌ 找不到 Instagram 帳號")
            return False
        
        old_id = account.platform_user_id
        account.platform_user_id = page_id
        
        try:
            db.commit()
            print(f"✅ Page ID 更新成功!")
            print(f"   舊 ID: {old_id}")
            print(f"   新 ID: {page_id}")
            return True
        except Exception as e:
            print(f"❌ 更新失敗: {e}")
            db.rollback()
            return False

def test_updated_config():
    """測試更新後的配置"""
    print("🧪 測試更新後的配置...")
    
    with get_session() as db:
        account = db.query(SocialAccount).filter(SocialAccount.platform == 'instagram').first()
        if not account:
            print("❌ 找不到 Instagram 帳號")
            return
        
        user_token = account.access_token
        page_id = account.platform_user_id
        
        print(f"User Token: {user_token[:30]}...")
        print(f"Page ID: {page_id}")
        
        try:
            page_response = requests.get(
                f"https://graph.facebook.com/v23.0/{page_id}",
                params={
                    'fields': 'access_token,instagram_business_account',
                    'access_token': user_token
                }
            )
            
            if page_response.status_code != 200:
                print(f"❌ 無法取得 Page Token: {page_response.text}")
                return
            
            page_data = page_response.json()
            page_token = page_data.get('access_token')
            ig_account = page_data.get('instagram_business_account')
            
            if not page_token:
                print("❌ 沒有 Page Token")
                return
            
            if not ig_account:
                print("❌ Page 沒有連結 Instagram")
                return
            
            print(f"✅ Page Token 取得成功: {page_token[:30]}...")
            print(f"✅ Instagram Account ID: {ig_account['id']}")
            
            ig_response = requests.get(
                f"https://graph.facebook.com/v23.0/{ig_account['id']}",
                params={
                    'fields': 'id,username,name,account_type,media_count',
                    'access_token': page_token
                }
            )
            
            if ig_response.status_code == 200:
                ig_data = ig_response.json()
                print("✅ Instagram API 測試成功:")
                print(f"   用戶名: @{ig_data.get('username', 'Unknown')}")
                print(f"   名稱: {ig_data.get('name', 'Unknown')}")
                print(f"   帳號類型: {ig_data.get('account_type', 'Unknown')}")
                print(f"   媒體數量: {ig_data.get('media_count', 0)}")
                print()
                print("🎉 配置正確！系統現在應該可以正常發布到 Instagram 了！")
            else:
                print(f"❌ Instagram API 測試失敗: {ig_response.text}")
                
        except Exception as e:
            print(f"❌ 測試失敗: {e}")

def main():
    """主程式"""
    print("🛠️ Facebook Page ID 修復工具")
    print("=" * 50)
    
    pages = check_available_pages()
    
    if not pages:
        return
    
    if len(pages) == 1:
        page = pages[0]
        print(f"🎯 自動選擇唯一的有效 Page: {page['name']} (ID: {page['id']})")
        
        if update_page_id(page['id']):
            print()
            test_updated_config()
    else:
        print("請選擇要使用的 Facebook Page:")
        for i, page in enumerate(pages, 1):
            print(f"{i}. {page['name']} (ID: {page['id']})")
        
        try:
            choice = int(input("\\n請輸入選擇 (1-{}): ".format(len(pages)))) - 1
            if 0 <= choice < len(pages):
                selected_page = pages[choice]
                print(f"\\n選擇了: {selected_page['name']}")
                
                if update_page_id(selected_page['id']):
                    print()
                    test_updated_config()
            else:
                print("❌ 無效選擇")
        except ValueError:
            print("❌ 請輸入有效數字")

if __name__ == "__main__":
    main()