# backend/services/platform_publishers.py
"""
社交媒體平台發布器
支援不同平台的發布API整合
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
import requests
import logging
from datetime import datetime, timezone
import os, json, time

logger = logging.getLogger(__name__)

class PlatformPublisherError(Exception):
    """平台發布錯誤"""
    pass

class BasePlatformPublisher(ABC):
    """平台發布器基礎類別"""
    
    @abstractmethod
    def publish_single_post(
        self, 
        account, 
        image_url: str, 
        caption: str, 
        hashtags: List[str]
    ) -> Dict[str, Any]:
        """發布單一貼文"""
        pass
    
    @abstractmethod
    def publish_carousel(
        self, 
        account, 
        items: List[Dict[str, str]], 
        caption: str, 
        hashtags: List[str]
    ) -> Dict[str, Any]:
        """發布輪播貼文"""
        pass
    
    @abstractmethod
    def validate_account(self, account) -> Dict[str, Any]:
        """驗證帳號狀態"""
        pass

class InstagramPublisher(BasePlatformPublisher):
    """Instagram 發布器"""
    
    def __init__(self):
        # 使用較新的 Graph API 版本，並統一到 v23.0 以與其他模組一致
        self.api_base_url = "https://graph.facebook.com/v23.0"
    
    def publish_single_post(
        self, 
        account, 
        image_url: str, 
        caption: str, 
        hashtags: List[str]
    ) -> Dict[str, Any]:
        """發布單一 Instagram 貼文"""
        try:
            self._trace('single_pre', {
                'account_id': getattr(account, 'id', None),
                'image_url': image_url,
                'caption': caption,
                'hashtags': hashtags,
                'mode': 'single'
            })
            # 組合完整文案
            full_caption = self._build_caption(caption, hashtags)
            
            # Step 1: 上傳媒體到 Instagram
            media_id = self._upload_media(account, image_url, full_caption)

            # Step 1.5: 等待媒體處理完成，避免尚未就緒導致發布或連結無效
            self._wait_media_ready(account, media_id)

            # Step 2: 發布媒體
            publish_result = self._publish_media(account, media_id)

            # Step 3: 取得 permalink（Graph 返回的 id 並非 shortcode，不能直接組 URL）
            permalink = self._get_permalink(account, publish_result['id'])

            result = {
                'success': True,
                'post_id': publish_result['id'],
                'post_url': permalink,
                'media_id': media_id
            }
            self._trace('single_post', {
                'account_id': getattr(account, 'id', None),
                'result': result
            })
            return result
            
        except Exception as e:
            logger.error(f"Instagram 單一貼文發布失敗: {e}")
            self._trace('single_error', {'error': str(e)})
            raise PlatformPublisherError(f"Instagram 發布失敗: {str(e)}")
    
    def publish_carousel(
        self, 
        account, 
        items: List[Dict[str, str]], 
        caption: str, 
        hashtags: List[str]
    ) -> Dict[str, Any]:
        """發布 Instagram 輪播貼文"""
        try:
            if len(items) < 2:
                # 如果只有一個項目，使用單一貼文發布
                return self.publish_single_post(
                    account, 
                    items[0]['image_url'], 
                    caption, 
                    hashtags
                )

            # 組合完整文案
            full_caption = self._build_caption(caption, hashtags)
            self._trace('carousel_pre', {
                'account_id': getattr(account, 'id', None),
                'items': items,
                'caption': full_caption,
                'mode': 'carousel'
            })
            
            # Step 1: 上傳所有媒體項目
            media_ids = []
            for item in items[:10]:  # Instagram 輪播最多 10 個項目
                media_id = self._upload_carousel_item(account, item['image_url'])
                media_ids.append(media_id)
            
            # Step 2: 創建輪播容器
            carousel_id = self._create_carousel_container(account, media_ids, full_caption)
            
            # Step 2.5: 等待輪播容器處理完成
            self._wait_media_ready(account, carousel_id)

            # Step 3: 發布輪播
            publish_result = self._publish_media(account, carousel_id)

            # Step 4: 取得 permalink
            permalink = self._get_permalink(account, publish_result['id'])

            result = {
                'success': True,
                'post_id': publish_result['id'],
                'post_url': permalink,
                'carousel_id': carousel_id,
                'media_count': len(media_ids)
            }
            self._trace('carousel_post', {
                'account_id': getattr(account, 'id', None),
                'result': result
            })
            return result
            
        except Exception as e:
            logger.error(f"Instagram 輪播發布失敗: {e}")
            self._trace('carousel_error', {'error': str(e)})
            raise PlatformPublisherError(f"Instagram 輪播發布失敗: {str(e)}")
    
    def validate_account(self, account) -> Dict[str, Any]:
        """驗證 Instagram 帳號狀態"""
        try:
            url = f"{self.api_base_url}/{account.platform_user_id}"
            params = {
                'fields': 'id,username,account_type,media_count',
                'access_token': account.access_token
            }
            
            response = requests.get(url, params=params)
            response.raise_for_status()
            
            data = response.json()
            
            return {
                'valid': True,
                'account_info': data,
                'token_status': 'active'
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Instagram 帳號驗證失敗: {e}")
            return {
                'valid': False,
                'error': str(e),
                'token_status': 'invalid'
            }
    
    def _build_caption(self, caption: str, hashtags: List[str]) -> str:
        """構建完整的貼文文案"""
        full_caption = caption
        
        if hashtags:
            hashtag_text = " ".join(hashtags)
            # 確保文案不超過 Instagram 限制 (2200 字元)
            max_caption_length = 2200 - len(hashtag_text) - 10  # 預留空間
            
            if len(full_caption) > max_caption_length:
                full_caption = full_caption[:max_caption_length-3] + "..."
            
            full_caption += f"\n\n{hashtag_text}"
        
        return full_caption

    def _trace(self, name: str, data: Dict[str, Any]) -> None:
        """可選的發布追蹤：當 SOCIAL_PUBLISH_TRACE 為真時，輸出追蹤檔案到 uploads/public/traces。
        不影響主流程，所有錯誤都吞掉。
        """
        try:
            flag = os.getenv('SOCIAL_PUBLISH_TRACE', '').strip().lower() in {'1','true','yes','on'}
            if not flag:
                return
            root = os.getenv('UPLOAD_ROOT', 'uploads')
            out_dir = os.path.join(root, 'public', 'traces')
            os.makedirs(out_dir, exist_ok=True)
            ts = int(time.time() * 1000)
            path = os.path.join(out_dir, f'{ts}_{name}.json')
            payload = {
                'ts': ts,
                'name': name,
                'data': data
            }
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
        except Exception:
            # 追蹤失敗不影響主流程
            pass
    
    def _upload_media(self, account, image_url: str, caption: str) -> str:
        """上傳單一媒體到 Instagram"""
        url = f"{self.api_base_url}/{account.platform_user_id}/media"

        data = {
            'image_url': image_url,
            'caption': caption,
            'media_type': 'IMAGE',
            'access_token': account.access_token
        }
        
        response = requests.post(url, data=data)
        response.raise_for_status()
        
        result = response.json()
        return result['id']
    
    def _upload_carousel_item(self, account, image_url: str) -> str:
        """上傳輪播項目媒體"""
        url = f"{self.api_base_url}/{account.platform_user_id}/media"

        data = {
            'image_url': image_url,
            'is_carousel_item': True,
            'media_type': 'IMAGE',
            'access_token': account.access_token
        }
        
        response = requests.post(url, data=data)
        response.raise_for_status()
        
        result = response.json()
        return result['id']
    
    def _create_carousel_container(
        self, 
        account, 
        media_ids: List[str], 
        caption: str
    ) -> str:
        """創建輪播容器"""
        url = f"{self.api_base_url}/{account.platform_user_id}/media"
        
        data = {
            'media_type': 'CAROUSEL',
            'children': ','.join(media_ids),
            'caption': caption,
            'access_token': account.access_token
        }
        
        response = requests.post(url, data=data)
        response.raise_for_status()
        
        result = response.json()
        return result['id']
    
    def _publish_media(self, account, media_id: str) -> Dict[str, str]:
        """發布媒體"""
        url = f"{self.api_base_url}/{account.platform_user_id}/media_publish"
        
        data = {
            'creation_id': media_id,
            'access_token': account.access_token
        }
        
        response = requests.post(url, data=data)
        response.raise_for_status()
        
        return response.json()

    def _wait_media_ready(self, account, media_id: str, *, timeout: int = 180, interval: int = 2) -> None:
        """輪詢等待媒體/容器處理完成（status_code=FINISHED）。"""
        import time
        url = f"{self.api_base_url}/{media_id}"
        start = time.time()
        last = None
        while time.time() - start < timeout:
            r = requests.get(url, params={'fields': 'status_code', 'access_token': account.access_token}, timeout=10)
            if r.status_code == 200:
                status = r.json().get('status_code')
                if status != last:
                    logger.info(f"IG 媒體 {media_id} 狀態: {status}")
                    last = status
                if status == 'FINISHED':
                    return
                if status == 'ERROR':
                    raise PlatformPublisherError(f"媒體處理失敗: {media_id}")
            time.sleep(interval)
        raise PlatformPublisherError(f"媒體處理逾時: {media_id}")

    def _get_permalink(self, account, media_id: str) -> str:
        """查詢已發布媒體的 permalink。"""
        try:
            url = f"{self.api_base_url}/{media_id}"
            r = requests.get(url, params={'fields': 'permalink,shortcode', 'access_token': account.access_token}, timeout=10)

            if r.status_code == 200:
                j = r.json()
                # 優先用 permalink；fallback 用 shortcode 組 URL
                if j.get('permalink'):
                    return j['permalink']
                if j.get('shortcode'):
                    return f"https://www.instagram.com/p/{j['shortcode']}/"
            else:
                # 如果查詢失敗，記錄詳細錯誤但不拋出異常
                error_data = r.json() if r.content else {}
                logger.warning(f"無法查詢媒體 permalink (media_id: {media_id}): {r.status_code} - {error_data}")

                # 嘗試用基本的 Instagram URL 格式
                if media_id:
                    return f"https://www.instagram.com/p/{media_id}/"

        except Exception as e:
            logger.error(f"查詢 permalink 時發生錯誤: {e}")

        # 最後才退回（不建議）
        return f"https://www.instagram.com/"

class TwitterPublisher(BasePlatformPublisher):
    """Twitter 發布器 (預留實作)"""
    
    def publish_single_post(self, account, image_url: str, caption: str, hashtags: List[str]) -> Dict[str, Any]:
        raise NotImplementedError("Twitter 發布器尚未實作")
    
    def publish_carousel(self, account, items: List[Dict[str, str]], caption: str, hashtags: List[str]) -> Dict[str, Any]:
        raise NotImplementedError("Twitter 發布器尚未實作")
    
    def validate_account(self, account) -> Dict[str, Any]:
        raise NotImplementedError("Twitter 發布器尚未實作")

class FacebookPublisher(BasePlatformPublisher):
    """Facebook 發布器 (預留實作)"""
    
    def publish_single_post(self, account, image_url: str, caption: str, hashtags: List[str]) -> Dict[str, Any]:
        raise NotImplementedError("Facebook 發布器尚未實作")
    
    def publish_carousel(self, account, items: List[Dict[str, str]], caption: str, hashtags: List[str]) -> Dict[str, Any]:
        raise NotImplementedError("Facebook 發布器尚未實作")
    
    def validate_account(self, account) -> Dict[str, Any]:
        raise NotImplementedError("Facebook 發布器尚未實作")

# 發布器工廠
# 導入新的 Page-based Instagram 發布器
try:
    from services.instagram_page_publisher import InstagramPagePublisher
    INSTAGRAM_PUBLISHER = InstagramPagePublisher
    print("[INFO] 使用新的 InstagramPagePublisher")
except ImportError:
    INSTAGRAM_PUBLISHER = InstagramPublisher
    print("[WARNING] 回退到舊的 InstagramPublisher")

_PUBLISHERS = {
    'instagram': INSTAGRAM_PUBLISHER,
    'twitter': TwitterPublisher,
    'facebook': FacebookPublisher,
}

def get_platform_publisher(platform: str) -> BasePlatformPublisher:
    """獲取指定平台的發布器"""
    publisher_class = _PUBLISHERS.get(platform.lower())
    if not publisher_class:
        raise PlatformPublisherError(f"不支援的平台: {platform}")
    
    return publisher_class()

def get_supported_platforms() -> List[str]:
    """獲取支援的平台列表"""
    return list(_PUBLISHERS.keys())
