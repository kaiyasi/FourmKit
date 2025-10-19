# backend/services/instagram_api_service.py
"""
Instagram Graph API 服務
處理所有與 Instagram API 相關的操作
"""
from typing import Dict, List, Optional, Tuple
import requests
from datetime import datetime, timezone, timedelta
import json
import time
import logging
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

class InstagramAPIError(Exception):
    """Instagram API 相關錯誤"""
    def __init__(self, message: str, error_code: Optional[str] = None, status_code: Optional[int] = None):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        super().__init__(self.message)

class InstagramAPIService:
    """Instagram Graph API 服務類"""
    
    BASE_URL = "https://graph.facebook.com/v23.0"
    TIMEOUT = 30
    
    def __init__(self):
        pass
    
    def validate_token(self, access_token: str) -> Dict:
        """
        驗證 Access Token 有效性
        
        Args:
            access_token: Facebook User Access Token
            
        Returns:
            Dict: 包含驗證結果和用戶資訊
            
        Raises:
            InstagramAPIError: 當 token 無效或 API 請求失敗時
        """
        try:
            url = f"{self.BASE_URL}/me"
            params = {
                "fields": "id,name,accounts{id,name,instagram_business_account{id,username,media_count,profile_picture_url}}",
                "access_token": access_token
            }
            
            response = requests.get(url, params=params, timeout=self.TIMEOUT)
            response.raise_for_status()
            
            data = response.json()
            
            # 檢查是否有 Instagram Business Account
            ig_accounts = []
            for account in data.get("accounts", {}).get("data", []):
                if "instagram_business_account" in account:
                    ig_accounts.append(account)
            
            
            # 獲取 token 過期時間
            token_info = self._get_token_info(access_token)
            
            return {
                "valid": True,
                "user_info": {
                    "id": data["id"],
                    "name": data["name"]
                },
                "ig_accounts": ig_accounts,
                "token_expires_at": token_info.get("expires_at"),
                "token_type": token_info.get("type", "user_token")
            }
            
        except requests.RequestException as e:
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_data = e.response.json()
                    error_msg = error_data.get('error', {}).get('message', str(e))
                    error_code = error_data.get('error', {}).get('code')
                    raise InstagramAPIError(
                        f"Token 驗證失敗: {error_msg}",
                        error_code=error_code,
                        status_code=e.response.status_code
                    )
                except (ValueError, KeyError):
                    raise InstagramAPIError(f"Token 驗證失敗: {str(e)}")
            else:
                raise InstagramAPIError(f"網路請求失敗: {str(e)}")
        except Exception as e:
            raise InstagramAPIError(f"Token 驗證過程發生錯誤: {str(e)}")
    
    def _get_token_info(self, access_token: str) -> Dict:
        """
        獲取 token 詳細資訊
        
        Args:
            access_token: Access Token
            
        Returns:
            Dict: Token 資訊
        """
        try:
            url = f"{self.BASE_URL}/debug_token"
            params = {
                "input_token": access_token,
                "access_token": access_token  # 使用同樣的 token 來查詢自己
            }
            
            response = requests.get(url, params=params, timeout=self.TIMEOUT)
            response.raise_for_status()
            
            data = response.json()
            token_data = data.get('data', {})
            
            result = {
                "valid": token_data.get('is_valid', False),
                "type": token_data.get('type', 'user'),
                "app_id": token_data.get('app_id'),
                "user_id": token_data.get('user_id'),
                "issued_at": token_data.get('issued_at'),
                "expires_at": None
            }
            
            # 處理過期時間
            if 'expires_at' in token_data:
                expires_timestamp = token_data['expires_at']
                if expires_timestamp > 0:  # 0 表示永不過期
                    result['expires_at'] = datetime.fromtimestamp(expires_timestamp, tz=timezone.utc)
            
            return result
            
        except requests.RequestException as e:
            # 如果無法獲取 token 資訊，返回基本資訊
            return {
                "valid": True,  # 因為 validate_token 已經驗證過了
                "type": "user",
                "expires_at": None
            }
    
    def get_long_lived_token(self, short_token: str) -> Dict:
        """
        將短期 token 轉換為長期 token (60天)
        
        Args:
            short_token: 短期 access token
            
        Returns:
            Dict: 包含長期 token 資訊
        """
        try:
            import os
            
            client_id = os.getenv('INSTAGRAM_CLIENT_ID')
            client_secret = os.getenv('INSTAGRAM_CLIENT_SECRET')
            
            if not client_id or not client_secret:
                raise InstagramAPIError("Instagram 應用設定未配置，請檢查 INSTAGRAM_CLIENT_ID 和 INSTAGRAM_CLIENT_SECRET 環境變數")
            
            url = f"{self.BASE_URL}/oauth/access_token"
            params = {
                "grant_type": "fb_exchange_token",
                "client_id": client_id,
                "client_secret": client_secret,
                "fb_exchange_token": short_token
            }
            
            response = requests.get(url, params=params, timeout=self.TIMEOUT)
            response.raise_for_status()
            
            data = response.json()
            return {
                "access_token": data["access_token"],
                "token_type": data.get("token_type", "bearer"),
                "expires_in": data.get("expires_in")
            }
            
        except Exception as e:
            raise InstagramAPIError(f"獲取長期 Token 失敗: {str(e)}")
    
    def get_page_token(self, user_token: str, page_id: str) -> str:
        """
        獲取 Page Access Token
        
        Args:
            user_token: 用戶 access token
            page_id: Facebook Page ID
            
        Returns:
            str: Page Access Token
        """
        try:
            url = f"{self.BASE_URL}/{page_id}"
            params = {
                "fields": "access_token",
                "access_token": user_token
            }
            
            response = requests.get(url, params=params, timeout=self.TIMEOUT)
            response.raise_for_status()
            
            data = response.json()
            return data["access_token"]
            
        except Exception as e:
            raise InstagramAPIError(f"獲取 Page Token 失敗: {str(e)}")

    def resolve_ig_user_id(self, page_id: str, token: str) -> str:
        """
        以 Page ID 與 Token 解析 Instagram Business Account ID。
        - token 可以是 Page Token（建議）或具管理權限的 User Token。
        """
        try:
            url = f"{self.BASE_URL}/{page_id}"
            params = {
                "fields": "instagram_business_account{id,username}",
                "access_token": token,
            }
            resp = requests.get(url, params=params, timeout=self.TIMEOUT)
            resp.raise_for_status()
            data = resp.json() or {}
            iba = (data.get("instagram_business_account") or {}).get("id")
            if not iba:
                raise InstagramAPIError("無法取得 Instagram Business Account，請確認粉專已綁 IG 專業帳號並授權此應用程式")
            return iba
        except requests.RequestException as e:
            try:
                ed = e.response.json() if getattr(e, 'response', None) else {}
            except Exception:
                ed = {}
            msg = ed.get('error', {}).get('message', str(e))
            raise InstagramAPIError(f"解析 IG_USER_ID 失敗: {msg}")
    
    def get_ig_business_accounts(self, page_token: str) -> List[Dict]:
        """
        獲取 Instagram Business Accounts 詳細資訊
        
        Args:
            page_token: Page Access Token
            
        Returns:
            List[Dict]: Instagram 商業帳號列表
        """
        try:
            url = f"{self.BASE_URL}/me/accounts"
            params = {
                "fields": "id,name,instagram_business_account{id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url}",
                "access_token": page_token
            }
            
            response = requests.get(url, params=params, timeout=self.TIMEOUT)
            response.raise_for_status()
            
            data = response.json()
            ig_accounts = []
            
            for page in data.get("data", []):
                if "instagram_business_account" in page:
                    ig_account = page["instagram_business_account"]
                    ig_accounts.append({
                        "page_id": page["id"],
                        "page_name": page["name"],
                        "ig_user_id": ig_account["id"],
                        "ig_username": ig_account["username"],
                        "ig_name": ig_account.get("name", ""),
                        "biography": ig_account.get("biography", ""),
                        "website": ig_account.get("website", ""),
                        "followers_count": ig_account.get("followers_count", 0),
                        "follows_count": ig_account.get("follows_count", 0),
                        "media_count": ig_account.get("media_count", 0),
                        "profile_picture_url": ig_account.get("profile_picture_url", "")
                    })
            
            return ig_accounts
            
        except Exception as e:
            raise InstagramAPIError(f"獲取 Instagram 帳號資訊失敗: {str(e)}")
    
    def create_media_container(self, ig_user_id: str, page_token: str,
                              image_url: str, caption: str) -> str:
        """
        創建媒體容器

        Args:
            ig_user_id: Instagram User ID
            page_token: Page Access Token
            image_url: 圖片 URL (必須是公開可訪問的)
            caption: 貼文文案

        Returns:
            str: 媒體容器 ID
        """
        try:
            # 驗證圖片 URL 格式
            if not image_url or not image_url.startswith('http'):
                raise InstagramAPIError(f"無效的圖片 URL: {image_url}", error_code="INVALID_IMAGE_URL")

            # 確保是公開可存取的 HTTPS URL
            if not image_url.startswith('https://'):
                if image_url.startswith('http://'):
                    image_url = image_url.replace('http://', 'https://')
                else:
                    raise InstagramAPIError(f"圖片 URL 必須是 HTTPS: {image_url}", error_code="NON_HTTPS_URL")

            logger.info(f"創建媒體容器，圖片URL: {image_url}")

            url = f"{self.BASE_URL}/{ig_user_id}/media"

            # 準備貼文數據
            data = {
                "image_url": image_url,
                "caption": caption,
                "media_type": "IMAGE",  # 關鍵修復：明確指定媒體類型
                "access_token": page_token
            }

            response = requests.post(url, data=data, timeout=self.TIMEOUT)
            response.raise_for_status()

            result = response.json()

            if "id" not in result:
                raise InstagramAPIError(f"API 回應中缺少 creation_id: {result}", error_code="MISSING_CREATION_ID")

            logger.info(f"媒體容器創建成功，creation_id: {result['id']}")
            return result["id"]
            
        except requests.RequestException as e:
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_data = e.response.json()
                    error_msg = error_data.get('error', {}).get('message', str(e))
                    raise InstagramAPIError(f"創建媒體容器失敗: {error_msg}")
                except (ValueError, KeyError):
                    pass
            raise InstagramAPIError(f"創建媒體容器失敗: {str(e)}")
    
    def publish_media(self, ig_user_id: str, page_token: str, creation_id: str) -> Dict:
        """
        發布媒體
        
        Args:
            ig_user_id: Instagram User ID
            page_token: Page Access Token
            creation_id: 媒體容器 ID
            
        Returns:
            Dict: 發布結果
        """
        try:
            url = f"{self.BASE_URL}/{ig_user_id}/media_publish"
            
            data = {
                "creation_id": creation_id,
                "access_token": page_token
            }
            
            response = requests.post(url, data=data, timeout=self.TIMEOUT)
            response.raise_for_status()
            
            result = response.json()
            media_id = result["id"]
            
            # 獲取貼文的永久連結
            post_url = self._get_media_permalink(media_id, page_token)
            
            return {
                "success": True,
                "media_id": media_id,
                "post_url": post_url
            }
            
        except Exception as e:
            raise InstagramAPIError(f"發布媒體失敗: {str(e)}")
    
    def publish_post(self, ig_user_id: str, page_token: str, 
                    image_url: str, caption: str) -> Dict:
        """
        一站式發布貼文 (創建媒體容器 + 發布)
        
        Args:
            ig_user_id: Instagram User ID
            page_token: Page Access Token
            image_url: 圖片 URL
            caption: 貼文文案
            
        Returns:
            Dict: 發布結果
        """
        try:
            # Step 1: 創建媒體容器
            creation_id = self.create_media_container(
                ig_user_id, page_token, image_url, caption
            )
            
            # 等待一下讓媒體容器準備完成
            time.sleep(2)
            
            # Step 2: 發布媒體
            result = self.publish_media(ig_user_id, page_token, creation_id)
            
            return result
            
        except Exception as e:
            raise InstagramAPIError(f"發布貼文失敗: {str(e)}")

    # -------------------- Carousel helpers --------------------
    def create_carousel_item(self, ig_user_id: str, page_token: str, image_url: str) -> str:
        """
        建立輪播子項目（子媒體容器），回傳 creation_id。
        """
        try:
            # 驗證圖片 URL 格式
            if not image_url or not image_url.startswith('http'):
                raise InstagramAPIError(f"無效的圖片 URL: {image_url}", error_code="INVALID_IMAGE_URL")

            # 確保是公開可存取的 HTTPS URL
            if not image_url.startswith('https://'):
                # 如果是 http，嘗試轉換為 https
                if image_url.startswith('http://'):
                    image_url = image_url.replace('http://', 'https://')
                else:
                    raise InstagramAPIError(f"圖片 URL 必須是 HTTPS: {image_url}", error_code="NON_HTTPS_URL")

            logger.info(f"建立輪播子項目，圖片URL: {image_url}")

            url = f"{self.BASE_URL}/{ig_user_id}/media"
            data = {
                "image_url": image_url,
                "is_carousel_item": True,
                "media_type": "IMAGE",  # 明確指定媒體類型
                "access_token": page_token,
            }
            response = requests.post(url, data=data, timeout=self.TIMEOUT)
            response.raise_for_status()
            result = response.json()

            if "id" not in result:
                raise InstagramAPIError(f"API 回應中缺少 creation_id: {result}", error_code="MISSING_CREATION_ID")

            logger.info(f"輪播子項目建立成功，creation_id: {result['id']}")
            return result["id"]
        except requests.RequestException as e:
            try:
                err = e.response.json() if getattr(e, 'response', None) else {}
            except Exception:
                err = {}
            msg = err.get('error', {}).get('message', str(e))
            raise InstagramAPIError(f"建立輪播子項失敗: {msg}")

    def create_carousel_container(self, ig_user_id: str, page_token: str, child_ids: list[str], caption: str) -> str:
        """
        以多個子項 creation_id 建立輪播容器，回傳父 creation_id。
        """
        try:
            if not child_ids:
                raise InstagramAPIError("至少需要一個輪播子項", error_code="NO_CHILDREN")
            url = f"{self.BASE_URL}/{ig_user_id}/media"
            data = {
                "children": ",".join(child_ids),
                "caption": caption or "",
                "media_type": "CAROUSEL",
                "access_token": page_token,
            }
            response = requests.post(url, data=data, timeout=self.TIMEOUT)
            response.raise_for_status()
            result = response.json()
            return result["id"]
        except requests.RequestException as e:
            try:
                err = e.response.json() if getattr(e, 'response', None) else {}
            except Exception:
                err = {}
            msg = err.get('error', {}).get('message', str(e))
            raise InstagramAPIError(f"建立輪播容器失敗: {msg}")

    def publish_carousel(self, ig_user_id: str, page_token: str, image_urls: list[str], caption: str) -> Dict:
        """
        建立多個子項與父容器並發布輪播。
        回傳 {success, media_id, post_url}。
        """
        try:
            child_ids: list[str] = []
            for u in image_urls:
                cid = self.create_carousel_item(ig_user_id, page_token, u)
                child_ids.append(cid)

            parent_creation_id = self.create_carousel_container(ig_user_id, page_token, child_ids, caption)
            return self.publish_media(ig_user_id, page_token, parent_creation_id)
        except InstagramAPIError:
            raise
        except Exception as e:
            raise InstagramAPIError(f"發布輪播失敗: {str(e)}")
    
    def get_media_info(self, media_id: str, page_token: str) -> Dict:
        """
        獲取媒體資訊
        
        Args:
            media_id: 媒體 ID
            page_token: Page Access Token
            
        Returns:
            Dict: 媒體資訊
        """
        try:
            url = f"{self.BASE_URL}/{media_id}"
            params = {
                "fields": "id,permalink,media_type,media_url,timestamp,caption,like_count,comments_count",
                "access_token": page_token
            }
            
            response = requests.get(url, params=params, timeout=self.TIMEOUT)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            raise InstagramAPIError(f"獲取媒體資訊失敗: {str(e)}")
    
    def _get_token_info(self, access_token: str) -> Dict:
        """獲取 token 詳細資訊"""
        try:
            url = f"{self.BASE_URL}/oauth/access_token_info"
            params = {"access_token": access_token}
            
            response = requests.get(url, params=params, timeout=self.TIMEOUT)
            if response.ok:
                return response.json()
            return {}
        except:
            return {}
    
    def _get_media_permalink(self, media_id: str, page_token: str) -> str:
        """獲取媒體永久連結"""
        try:
            url = f"{self.BASE_URL}/{media_id}"
            params = {
                "fields": "permalink", 
                "access_token": page_token
            }
            
            response = requests.get(url, params=params, timeout=self.TIMEOUT)
            if response.ok:
                data = response.json()
                return data.get("permalink", f"https://www.instagram.com/p/{media_id}/")
            
            return f"https://www.instagram.com/p/{media_id}/"
        except:
            return f"https://www.instagram.com/p/{media_id}/"
    
    def refresh_token_if_needed(self, current_token: str, expires_at: Optional[datetime] = None) -> Dict:
        """
        檢查並自動更新即將過期的 token
        
        Args:
            current_token: 當前的 access token
            expires_at: token 過期時間
            
        Returns:
            Dict: 包含是否更新和新 token 資訊
        """
        try:
            # 如果沒有過期時間資訊，先獲取 token 資訊
            if expires_at is None:
                token_info = self._get_token_info(current_token)
                expires_at = token_info.get('expires_at')
            
            # 如果仍然沒有過期時間，嘗試驗證 token
            if expires_at is None:
                try:
                    self.validate_token(current_token)
                    return {
                        "refreshed": False,
                        "token": current_token,
                        "message": "Token 仍然有效，無需更新"
                    }
                except InstagramAPIError:
                    # Token 無效，嘗試更新
                    pass
            
            # 檢查是否需要更新（過期或即將在 7 天內過期）
            now = datetime.now(timezone.utc)
            needs_refresh = False
            
            if expires_at:
                if isinstance(expires_at, str):
                    expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                
                time_until_expiry = expires_at - now
                needs_refresh = time_until_expiry.total_seconds() < 7 * 24 * 3600  # 7天內過期
            else:
                # 沒有過期時間資訊，嘗試驗證 token
                try:
                    self.validate_token(current_token)
                    needs_refresh = False
                except InstagramAPIError:
                    needs_refresh = True
            
            if needs_refresh:
                # 嘗試更新為長期 token
                try:
                    new_token_info = self.get_long_lived_token(current_token)
                    return {
                        "refreshed": True,
                        "token": new_token_info["access_token"],
                        "expires_in": new_token_info.get("expires_in"),
                        "message": "Token 已成功更新為長期 token"
                    }
                except InstagramAPIError as e:
                    return {
                        "refreshed": False,
                        "token": current_token,
                        "error": f"Token 更新失敗: {e.message}",
                        "message": "需要重新授權獲取新 token"
                    }
            
            return {
                "refreshed": False,
                "token": current_token,
                "message": "Token 仍然有效，無需更新"
            }
            
        except Exception as e:
            return {
                "refreshed": False,
                "token": current_token,
                "error": str(e),
                "message": "檢查 Token 狀態時發生錯誤"
            }
    
    def check_account_health(self, ig_user_id: str, page_token: str) -> Dict:
        """
        檢查帳號健康狀態
        
        Args:
            ig_user_id: Instagram User ID
            page_token: Page Access Token
            
        Returns:
            Dict: 帳號狀態資訊
        """
        try:
            # 檢查基本資訊
            url = f"{self.BASE_URL}/{ig_user_id}"
            params = {
                "fields": "id,username,name,biography,followers_count,media_count",
                "access_token": page_token
            }
            
            response = requests.get(url, params=params, timeout=self.TIMEOUT)
            response.raise_for_status()
            
            account_info = response.json()
            
            # 檢查最近的貼文
            recent_media_url = f"{self.BASE_URL}/{ig_user_id}/media"
            recent_params = {
                "fields": "id,timestamp,media_type",
                "limit": 1,
                "access_token": page_token
            }
            
            recent_response = requests.get(recent_media_url, params=recent_params, timeout=self.TIMEOUT)
            recent_media = recent_response.json() if recent_response.ok else {"data": []}
            
            return {
                "status": "healthy",
                "account_info": account_info,
                "last_post_date": recent_media.get("data", [{}])[0].get("timestamp") if recent_media.get("data") else None,
                "token_valid": True
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "token_valid": False
            }
