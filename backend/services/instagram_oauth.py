# backend/services/instagram_oauth.py
"""
Instagram OAuth 認證服務
處理 Instagram Business API 的 OAuth 流程
"""
import os
import requests
import secrets
import logging
from typing import Dict, Any, Optional
from urllib.parse import urlencode, parse_qs, urlparse
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

class InstagramOAuthError(Exception):
    """Instagram OAuth 相關錯誤"""
    pass

class InstagramOAuthService:
    """Instagram OAuth 認證服務"""
    
    def __init__(self):
        self.app_id = os.getenv('FACEBOOK_APP_ID')
        self.app_secret = os.getenv('FACEBOOK_APP_SECRET')
        self.redirect_uri = os.getenv('INSTAGRAM_REDIRECT_URI', 'http://localhost:12005/api/auth/instagram/callback')
        self.base_url = "https://api.instagram.com"
        self.graph_url = "https://graph.facebook.com/v23.0"
        
        if not self.app_id or not self.app_secret:
            logger.warning("Instagram OAuth 配置不完整，請檢查環境變數 FACEBOOK_APP_ID 和 FACEBOOK_APP_SECRET")
    
    def get_authorization_url(self, state: str = None) -> Dict[str, str]:
        """
        獲取 Instagram 授權 URL
        
        Args:
            state: 狀態參數，用於防止 CSRF 攻擊
            
        Returns:
            包含授權 URL 和 state 的字典
        """
        if not state:
            state = secrets.token_urlsafe(32)
        
        params = {
            'client_id': self.app_id,
            'redirect_uri': self.redirect_uri,
            'scope': 'instagram_basic,instagram_content_publish,pages_read_engagement',
            'response_type': 'code',
            'state': state
        }
        
        auth_url = f"{self.base_url}/oauth/authorize?" + urlencode(params)
        
        return {
            'authorization_url': auth_url,
            'state': state,
            'redirect_uri': self.redirect_uri
        }
    
    def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """
        使用授權碼換取 Access Token
        
        Args:
            code: OAuth 授權碼
            
        Returns:
            包含 access_token 等信息的字典
        """
        try:
            # Step 1: 使用授權碼換取短期 access token
            token_url = f"{self.base_url}/oauth/access_token"
            
            data = {
                'client_id': self.app_id,
                'client_secret': self.app_secret,
                'grant_type': 'authorization_code',
                'redirect_uri': self.redirect_uri,
                'code': code
            }
            
            response = requests.post(token_url, data=data)
            response.raise_for_status()
            
            token_data = response.json()
            
            if 'access_token' not in token_data:
                raise InstagramOAuthError("未能獲取 access_token")
            
            short_token = token_data['access_token']
            user_id = token_data.get('user_id')
            
            # Step 2: 將短期 token 換成長期 token
            long_token_data = self._exchange_for_long_lived_token(short_token)
            
            # Step 3: 獲取用戶信息
            user_info = self._get_user_info(long_token_data['access_token'], user_id)
            
            return {
                'success': True,
                'access_token': long_token_data['access_token'],
                'token_type': long_token_data.get('token_type', 'bearer'),
                'expires_in': long_token_data.get('expires_in', 3600),
                'expires_at': self._calculate_expires_at(long_token_data.get('expires_in', 3600)),
                'user_id': user_id,
                'user_info': user_info
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Instagram OAuth token 交換失敗: {e}")
            raise InstagramOAuthError(f"Token 交換失敗: {str(e)}")
        except Exception as e:
            logger.error(f"Instagram OAuth 處理失敗: {e}")
            raise InstagramOAuthError(f"OAuth 處理失敗: {str(e)}")
    
    def _exchange_for_long_lived_token(self, short_token: str) -> Dict[str, Any]:
        """將短期 token 換成長期 token（60天有效期）"""
        try:
            url = f"{self.graph_url}/oauth/access_token"
            
            params = {
                'grant_type': 'ig_exchange_token',
                'client_secret': self.app_secret,
                'access_token': short_token
            }
            
            response = requests.get(url, params=params)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error(f"長期 token 交換失敗: {e}")
            raise InstagramOAuthError(f"長期 token 交換失敗: {str(e)}")
    
    def _get_user_info(self, access_token: str, user_id: str = None) -> Dict[str, Any]:
        """獲取用戶基本信息"""
        try:
            # 如果沒有提供 user_id，先獲取用戶 ID
            if not user_id:
                me_url = f"{self.graph_url}/me"
                me_params = {
                    'fields': 'id',
                    'access_token': access_token
                }
                
                me_response = requests.get(me_url, params=me_params)
                me_response.raise_for_status()
                user_id = me_response.json()['id']
            
            # 獲取詳細的用戶信息
            url = f"{self.graph_url}/{user_id}"
            params = {
                'fields': 'id,username,account_type,media_count,name',
                'access_token': access_token
            }
            
            response = requests.get(url, params=params)
            response.raise_for_status()
            
            user_data = response.json()
            
            # 如果是 Business 或 Creator 帳號，獲取額外信息
            if user_data.get('account_type') in ['BUSINESS', 'CREATOR']:
                profile_params = {
                    'fields': 'biography,followers_count,follows_count,profile_picture_url,website',
                    'access_token': access_token
                }
                
                try:
                    profile_response = requests.get(url, params=profile_params)
                    if profile_response.status_code == 200:
                        profile_data = profile_response.json()
                        user_data.update(profile_data)
                except:
                    # 如果獲取詳細信息失敗，繼續使用基本信息
                    pass
            
            return user_data
            
        except Exception as e:
            logger.error(f"獲取用戶信息失敗: {e}")
            # 返回基本信息結構，避免完全失敗
            return {
                'id': user_id or 'unknown',
                'username': 'unknown',
                'account_type': 'PERSONAL'
            }
    
    def refresh_access_token(self, current_token: str) -> Dict[str, Any]:
        """
        刷新 Access Token
        
        Args:
            current_token: 當前的 access token
            
        Returns:
            包含新 token 信息的字典
        """
        try:
            url = f"{self.graph_url}/oauth/access_token"
            
            params = {
                'grant_type': 'ig_refresh_token',
                'access_token': current_token
            }
            
            response = requests.get(url, params=params)
            response.raise_for_status()
            
            token_data = response.json()
            
            return {
                'success': True,
                'access_token': token_data['access_token'],
                'token_type': token_data.get('token_type', 'bearer'),
                'expires_in': token_data.get('expires_in', 3600),
                'expires_at': self._calculate_expires_at(token_data.get('expires_in', 3600))
            }
            
        except Exception as e:
            logger.error(f"Instagram token 刷新失敗: {e}")
            raise InstagramOAuthError(f"Token 刷新失敗: {str(e)}")
    
    def validate_token(self, access_token: str, user_id: str = None) -> Dict[str, Any]:
        """
        驗證 Access Token 的有效性
        
        Args:
            access_token: 要驗證的 token
            user_id: 用戶 ID
            
        Returns:
            驗證結果
        """
        try:
            if user_id:
                url = f"{self.graph_url}/{user_id}"
            else:
                url = f"{self.graph_url}/me"
            
            params = {
                'fields': 'id,username,account_type',
                'access_token': access_token
            }
            
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                user_data = response.json()
                return {
                    'valid': True,
                    'user_info': user_data,
                    'token_status': 'active'
                }
            else:
                return {
                    'valid': False,
                    'error': response.text,
                    'token_status': 'invalid'
                }
                
        except Exception as e:
            logger.error(f"Token 驗證失敗: {e}")
            return {
                'valid': False,
                'error': str(e),
                'token_status': 'error'
            }
    
    def revoke_token(self, access_token: str) -> Dict[str, Any]:
        """撤銷 Access Token"""
        try:
            url = f"{self.graph_url}/oauth/revoke"
            
            data = {
                'access_token': access_token
            }
            
            response = requests.post(url, data=data)
            response.raise_for_status()
            
            return {
                'success': True,
                'message': 'Token 已成功撤銷'
            }
            
        except Exception as e:
            logger.error(f"Token 撤銷失敗: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _calculate_expires_at(self, expires_in: int) -> datetime:
        """計算 token 過期時間"""
        return datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    
    def get_pages_info(self, access_token: str) -> Dict[str, Any]:
        """
        獲取用戶的 Facebook 頁面信息（用於 Instagram Business 帳號）
        """
        try:
            url = f"{self.graph_url}/me/accounts"
            params = {
                'fields': 'id,name,instagram_business_account',
                'access_token': access_token
            }
            
            response = requests.get(url, params=params)
            response.raise_for_status()
            
            pages_data = response.json()
            
            # 過濾出有 Instagram Business 帳號的頁面
            instagram_pages = []
            for page in pages_data.get('data', []):
                if page.get('instagram_business_account'):
                    instagram_pages.append({
                        'page_id': page['id'],
                        'page_name': page['name'],
                        'instagram_account_id': page['instagram_business_account']['id']
                    })
            
            return {
                'success': True,
                'pages': instagram_pages,
                'total_pages': len(instagram_pages)
            }
            
        except Exception as e:
            logger.error(f"獲取頁面信息失敗: {e}")
            return {
                'success': False,
                'error': str(e),
                'pages': []
            }

# 全域服務實例
instagram_oauth_service = InstagramOAuthService()