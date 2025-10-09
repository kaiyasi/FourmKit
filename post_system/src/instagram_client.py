#!/usr/bin/env python3
"""
簡化版 Instagram API 客戶端
基於參考腳本重新設計，更穩定、更易用
"""
import requests
import time
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum
import os

logger = logging.getLogger(__name__)

class MediaStatus(Enum):
    """媒體處理狀態"""
    FINISHED = "FINISHED"
    ERROR = "ERROR" 
    IN_PROGRESS = "IN_PROGRESS"
    PUBLISHED = "PUBLISHED"

@dataclass
class PostResult:
    """發布結果"""
    success: bool
    post_id: Optional[str] = None
    post_url: Optional[str] = None
    error: Optional[str] = None
    media_id: Optional[str] = None

@dataclass
class InstagramConfig:
    """Instagram 配置"""
    api_version: str = "v23.0"
    timeout: int = 60
    max_wait_time: int = 600  # 延長預設等待時間，避免輪播/大圖處理逾時
    retry_interval: int = 2
    # 重試機制設定
    max_retries: int = 3  # 最大重試次數
    backoff_factor: float = 0.5  # 退避因子 (秒)

    @staticmethod
    def from_env() -> "InstagramConfig":
        import os
        api_version = os.getenv("IG_API_VERSION", "v23.0")
        timeout = int(os.getenv("IG_TIMEOUT", "60"))
        max_wait_time = int(os.getenv("IG_MAX_WAIT", "600"))
        retry_interval = int(os.getenv("IG_RETRY", "2"))
        max_retries = int(os.getenv("IG_MAX_RETRIES", "3"))
        backoff_factor = float(os.getenv("IG_BACKOFF_FACTOR", "0.5"))
        return InstagramConfig(
            api_version=api_version,
            timeout=timeout,
            max_wait_time=max_wait_time,
            retry_interval=retry_interval,
            max_retries=max_retries,
            backoff_factor=backoff_factor,
        )

class InstagramClient:
    """
    簡化版 Instagram API 客戶端
    直接基於 Facebook Graph API，參考提供的腳本流程
    """
    
    def __init__(self, config: Optional[InstagramConfig] = None):
        self.config = config or InstagramConfig.from_env()
        self.api_base = f"https://graph.facebook.com/{self.config.api_version}"
        self.session = requests.Session()

    def _request_with_retry(self, method: str, url: str, **kwargs) -> requests.Response:
        """
        帶有指數退避重試機制的請求方法
        """
        last_exception = None
        for attempt in range(self.config.max_retries + 1):
            try:
                response = self.session.request(method, url, timeout=self.config.timeout, **kwargs)
                
                # 針對特定的可重試 HTTP 狀態碼
                if response.status_code in [429, 500, 502, 503, 504]:
                    response.raise_for_status() # 拋出 HTTPError 以觸發重試
                
                return response # 成功或不可重試的錯誤，直接返回
                
            except requests.exceptions.RequestException as e:
                logger.warning(f"請求失敗 (嘗試 {attempt + 1}/{self.config.max_retries + 1}): {e}")
                last_exception = e
                if attempt < self.config.max_retries:
                    sleep_time = self.config.backoff_factor * (2 ** attempt)
                    logger.info(f"將在 {sleep_time:.2f} 秒後重試...")
                    time.sleep(sleep_time)
        
        raise last_exception # 所有重試失敗後，拋出最後一個例外

    def post_single_image(
        self,
        user_token: str,
        page_id: str,
        image_url: str,
        caption: str = ""
        ) -> PostResult:
        """
        發布單一圖片到 Instagram
        """
        try:
            logger.info(f"開始發布圖片到 Instagram，Page ID: {page_id}")
            
            page_info = self._get_page_info(user_token, page_id)
            if not page_info['success']:
                return PostResult(success=False, error=page_info['error'])
                
            page_token = page_info['page_token']
            ig_account_id = page_info['ig_account_id']
            
            logger.info(f"取得 IG Account ID: {ig_account_id}")
            
            media_id = self._create_media_container(
                ig_account_id, page_token, image_url, caption
            )
            
            self._wait_media_ready(media_id, page_token)
            
            post_id = self._publish_media(ig_account_id, page_token, media_id)

            logger.info(f"Instagram 發布成功，Post ID: {post_id}")

            post_url = self._get_permalink_safe(media_id, page_token)
            if not post_url:
                post_url = f"https://www.instagram.com/p/{post_id}/"

            return PostResult(
                success=True,
                post_id=post_id,
                post_url=post_url,
                media_id=media_id
            )
            
        except Exception as e:
            logger.error(f"Instagram 發布失敗: {e}", exc_info=True)
            return PostResult(success=False, error=str(e))

    def post_carousel(
        self,
        user_token: str,
        page_id: str,
        image_urls: List[str],
        caption: str = ""
    ) -> PostResult:
        """
        發布輪播（多圖）到 Instagram。
        """
        try:
            if not image_urls or not isinstance(image_urls, list) or len(image_urls) < 2:
                return PostResult(success=False, error="輪播至少需要 2 張圖片")

            logger.info(f"開始發布輪播到 Instagram，Page ID: {page_id}，圖片數: {len(image_urls)}")

            page_info = self._get_page_info(user_token, page_id)
            if not page_info['success']:
                return PostResult(success=False, error=page_info['error'])

            page_token = page_info['page_token']
            ig_account_id = page_info['ig_account_id']

            child_media_ids: List[str] = []
            for idx, url in enumerate(image_urls):
                child_id = self._create_carousel_child(ig_account_id, page_token, url)
                child_media_ids.append(child_id)
                logger.info(f"子媒體建立成功 ({idx+1}/{len(image_urls)}): {child_id}")

            carousel_container_id = self._create_carousel_container(
                ig_account_id, page_token, child_media_ids, caption
            )

            self._wait_media_ready(carousel_container_id, page_token)

            post_id = self._publish_media(ig_account_id, page_token, carousel_container_id)

            logger.info(f"Instagram 輪播發布成功，Post ID: {post_id}")
            post_url = self._get_permalink_safe(carousel_container_id, page_token)
            if not post_url:
                post_url = f"https://www.instagram.com/p/{post_id}/"
            return PostResult(
                success=True,
                post_id=post_id,
                post_url=post_url,
                media_id=carousel_container_id,
            )

        except Exception as e:
            logger.error(f"Instagram 輪播發布失敗: {e}", exc_info=True)
            return PostResult(success=False, error=str(e))
    
    def _get_page_info(self, user_token: str, page_id: str) -> Dict[str, Any]:
        """取得 Page Token 和 Instagram Account ID"""
        try:
            url = f"{self.api_base}/{page_id}"
            params = {
                'fields': 'access_token,instagram_business_account',
                'access_token': user_token
            }
            
            response = self._request_with_retry('GET', url, params=params)
            response.raise_for_status() # 確保處理非 2xx 的最終回應
            
            data = response.json()
            page_token = data.get('access_token')
            ig_account = data.get('instagram_business_account')
            
            if not page_token:
                return {'success': False, 'error': "無法取得 Page Token"}
            
            if not ig_account or not ig_account.get('id'):
                return {'success': False, 'error': "Page 未連結或無效的 Instagram Business Account ID"}
            
            return {
                'success': True,
                'page_token': page_token,
                'ig_account_id': ig_account['id']
            }
            
        except requests.exceptions.RequestException as e:
            error_msg = f"網路請求失敗: {e}"
            if e.response is not None:
                error_msg = f"無法取得 Page 資訊: {e.response.text}"
            return {'success': False, 'error': error_msg}
        except Exception as e:
            return {'success': False, 'error': f"取得 Page 資訊時發生未知錯誤: {e}"}
    
    def _create_media_container(
        self, 
        ig_account_id: str, 
        page_token: str, 
        image_url: str, 
        caption: str
    ) -> str:
        """建立 Media Container"""
        url = f"{self.api_base}/{ig_account_id}/media"
        data = {
            'image_url': image_url,
            'caption': caption,
            'access_token': page_token
        }
        
        response = self._request_with_retry('POST', url, data=data)
        response.raise_for_status()
        
        result = response.json()
        media_id = result.get('id')
        
        if not media_id:
            raise Exception("Media Container ID 為空")
        
        logger.info(f"Media Container 建立成功: {media_id}")
        return media_id

    def _create_carousel_child(
        self,
        ig_account_id: str,
        page_token: str,
        image_url: str,
    ) -> str:
        """建立輪播子媒體"""
        url = f"{self.api_base}/{ig_account_id}/media"
        data = {
            'image_url': image_url,
            'is_carousel_item': True,
            'access_token': page_token,
        }

        response = self._request_with_retry('POST', url, data=data)
        response.raise_for_status()

        result = response.json()
        media_id = result.get('id')
        if not media_id:
            raise Exception("輪播子媒體 ID 為空")
        return media_id

    def _create_carousel_container(
        self,
        ig_account_id: str,
        page_token: str,
        children_ids: List[str],
        caption: str,
    ) -> str:
        """建立輪播容器"""
        url = f"{self.api_base}/{ig_account_id}/media"
        data = {
            'children': ','.join(children_ids),
            'caption': caption,
            'media_type': 'CAROUSEL',
            'access_token': page_token,
        }
        response = self._request_with_retry('POST', url, data=data)
        response.raise_for_status()

        result = response.json()
        container_id = result.get('id')
        if not container_id:
            raise Exception("輪播容器 ID 為空")
        logger.info(f"輪播容器建立成功: {container_id}")
        return container_id
    
    def _wait_media_ready(self, media_id: str, page_token: str):
        """等待媒體處理完成"""
        start_time = time.time()
        last_status = None
        
        while time.time() - start_time < self.config.max_wait_time:
            try:
                response = self._request_with_retry(
                    'GET',
                    f"{self.api_base}/{media_id}",
                    params={'fields': 'status_code', 'access_token': page_token}
                )
                response.raise_for_status()
                
                status_data = response.json()
                status = status_data.get('status_code')
                
                if status != last_status:
                    logger.info(f"媒體 {media_id} 處理狀態: {status}")
                    last_status = status
                
                if status == MediaStatus.FINISHED.value:
                    logger.info(f"媒體 {media_id} 處理完成")
                    return
                elif status == MediaStatus.ERROR.value:
                    raise Exception(f"媒體 {media_id} 處理失敗，狀態: ERROR")
                
                time.sleep(self.config.retry_interval)
                    
            except requests.exceptions.RequestException as e:
                logger.warning(f"檢查媒體狀態失敗: {e}，將在 {self.config.retry_interval} 秒後重試...")
                time.sleep(self.config.retry_interval)
        
        raise Exception(f"媒體 {media_id} 處理逾時")
    
    def _publish_media(self, ig_account_id: str, page_token: str, media_id: str) -> str:
        """發布媒體"""
        url = f"{self.api_base}/{ig_account_id}/media_publish"
        data = {
            'creation_id': media_id,
            'access_token': page_token
        }
        
        response = self._request_with_retry('POST', url, data=data)
        response.raise_for_status()
        
        result = response.json()
        post_id = result.get('id')
        
        if not post_id:
            raise Exception("發布後的 Post ID 為空")
        
        logger.info(f"媒體發布成功: {post_id}")
        return post_id

    def _get_permalink_safe(self, media_id: str, page_token: str) -> Optional[str]:
        """嘗試取得 permalink，失敗則回傳 None"""
        try:
            response = self._request_with_retry(
                'GET',
                f"{self.api_base}/{media_id}",
                params={'fields': 'permalink', 'access_token': page_token}
            )
            if response.status_code == 200:
                return response.json().get('permalink')
            return None
        except Exception as e:
            logger.warning(f"取得 permalink 發生例外: {e}")
            return None
    
    def validate_credentials(self, user_token: str, page_id: str) -> Dict[str, Any]:
        """驗證憑證是否有效"""
        try:
            me_response = self._request_with_retry(
                'GET',
                f"{self.api_base}/me",
                params={'fields': 'id,name', 'access_token': user_token}
            )
            me_response.raise_for_status()
            user_info = me_response.json()
            
            page_info = self._get_page_info(user_token, page_id)
            if not page_info['success']:
                return {'valid': False, 'error': page_info['error']}
            
            return {
                'valid': True,
                'user_info': user_info,
                'page_token': page_info['page_token'][:20] + '...',
                'ig_account_id': page_info['ig_account_id']
            }
            
        except Exception as e:
            return {'valid': False, 'error': f"驗證失敗: {e}"}
    
    def get_account_info(self, page_token: str, ig_account_id: str) -> Dict[str, Any]:
        """取得 Instagram 帳號資訊"""
        try:
            response = self._request_with_retry(
                'GET',
                f"{self.api_base}/{ig_account_id}",
                params={'fields': 'id,username,name,account_type,media_count', 'access_token': page_token}
            )
            response.raise_for_status()
            return {'success': True, 'account_info': response.json()}
                
        except Exception as e:
            return {'success': False, 'error': f"取得帳號資訊失敗: {e}"}


# 工廠函數
def create_instagram_client(config: Optional[InstagramConfig] = None) -> InstagramClient:
    """建立 Instagram 客戶端實例（支援 Dry-Run）"""
    if os.getenv("IG_DRY_RUN") == "1":
        class _Fake:
            def post_single_image(self, user_token: str, page_id: str, image_url: str, caption: str = "") -> PostResult:
                return PostResult(success=True, post_id="DRYRUN_POST_SINGLE", post_url="https://example.com/dryrun/DRYRUN_POST_SINGLE", media_id="DRYRUN_MEDIA_SINGLE")
            def post_carousel(self, user_token: str, page_id: str, image_urls: List[str], caption: str = "") -> PostResult:
                if not image_urls or len(image_urls) < 2:
                    return PostResult(success=False, error="輪播至少需要 2 張圖片")
                return PostResult(success=True, post_id="DRYRUN_POST_CAROUSEL", post_url="https://example.com/dryrun/DRYRUN_POST_CAROUSEL", media_id="DRYRUN_MEDIA_CAROUSEL")
        return _Fake()
    if config is None:
        config = InstagramConfig.from_env()
    return InstagramClient(config)
