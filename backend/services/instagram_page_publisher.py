"""
基於 Page ID 的 Instagram 發布器
正確處理 Page ID -> IG Account ID 的轉換流程
"""
from typing import Dict, Any, List
import requests
import time
import logging

logger = logging.getLogger(__name__)

class InstagramPagePublisher:
    """基於 Page ID 的 Instagram 發布器"""
    
    def __init__(self):
        # 與其他模組一致，使用較新的 Graph API 版本
        self.api_base_url = "https://graph.facebook.com/v23.0"
        self.timeout = 30
    
    def publish_single_post(
        self, 
        account, 
        image_url: str, 
        caption: str, 
        hashtags: List[str]
    ) -> Dict[str, Any]:
        """發布單一 Instagram 貼文"""
        try:
            # 基礎檢查：image_url 必須是公開的 http(s) 絕對網址
            self._assert_public_http_url(image_url)
            acc_page_id = getattr(account, 'page_id', None) or getattr(account, 'platform_user_id', None)
            logger.info(f"開始發布到 IG，Page ID: {acc_page_id}")
            
            # Step 1: 從 Page ID 取得 IG Account ID 和 Page Token
            page_info = self._get_page_info(account)
            if not page_info['success']:
                return page_info
            
            page_token = page_info['page_token']
            ig_account_id = page_info['ig_account_id']
            
            logger.info(f"取得 IG Account ID: {ig_account_id}")
            
            # Step 2: 組合完整文案
            full_caption = self._build_caption(caption, hashtags)
            
            # Step 3: 建立 Media Container
            media_id = self._create_media_container(
                ig_account_id, page_token, image_url, full_caption
            )
            
            # Step 4: 等待媒體處理完成
            self._wait_for_media_ready(media_id, page_token)
            
            # Step 5: 發布媒體
            post_id = self._publish_media(ig_account_id, page_token, media_id)

            # Step 6: 取得 permalink（Graph 回傳的 id 非 shortcode，不可直接組 URL）
            permalink = self._get_permalink(post_id, page_token)
            logger.info(f"IG 發布成功，Post ID: {post_id}")
            
            return {
                'success': True,
                'post_id': post_id,
                'post_url': permalink,
                'media_id': media_id,
                'ig_account_id': ig_account_id
            }
            
        except Exception as e:
            logger.error(f"IG 發布失敗: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def publish_carousel(
        self,
        account,
        items: List[Dict],
        caption: str,
        hashtags: List[str]
    ) -> Dict[str, Any]:
        """發布輪播貼文"""
        try:
            acc_page_id = getattr(account, 'page_id', None) or getattr(account, 'platform_user_id', None)
            logger.info(f"開始發布輪播到 IG，Page ID: {acc_page_id}")
            
            # Step 1: 取得 Page 資訊
            page_info = self._get_page_info(account)
            if not page_info['success']:
                return page_info
            
            page_token = page_info['page_token']
            ig_account_id = page_info['ig_account_id']
            
            # Step 2: 建立輪播項目前檢與建立
            carousel_item_ids = []
            for item in items:
                self._assert_public_http_url(item['image_url'])
                item_id = self._create_carousel_item(
                    ig_account_id, page_token, item['image_url']
                )
                carousel_item_ids.append(item_id)
            
            # Step 3: 建立輪播容器
            full_caption = self._build_caption(caption, hashtags)
            carousel_id = self._create_carousel_container(
                ig_account_id, page_token, carousel_item_ids, full_caption
            )
            
            # Step 4: 等待處理完成
            self._wait_for_media_ready(carousel_id, page_token)
            
            # Step 5: 發布輪播
            post_id = self._publish_media(ig_account_id, page_token, carousel_id)

            # Step 6: 取得 permalink
            permalink = self._get_permalink(post_id, page_token)
            logger.info(f"IG 輪播發布成功，Post ID: {post_id}")
            
            return {
                'success': True,
                'post_id': post_id,
                'post_url': permalink,
                'carousel_id': carousel_id,
                'item_count': len(carousel_item_ids)
            }
            
        except Exception as e:
            logger.error(f"IG 輪播發布失敗: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _get_page_info(self, account) -> Dict[str, Any]:
        """從 Page ID 取得必要的發布資訊"""
        try:
            page_id = getattr(account, 'page_id', None) or getattr(account, 'platform_user_id', None)
            # 優先使用長期Token，如果沒有則使用原始Token
            user_token = getattr(account, 'long_lived_access_token', None) or account.access_token
            
            # 取得 Page Token
            page_response = requests.get(
                f"{self.api_base_url}/{page_id}",
                params={
                    'fields': 'access_token,instagram_business_account',
                    'access_token': user_token
                },
                timeout=self.timeout
            )
            
            if page_response.status_code != 200:
                error_data = page_response.json()
                return {
                    'success': False,
                    'error': f"無法訪問 Page {page_id}: {error_data.get('error', {}).get('message', 'Unknown error')}"
                }
            
            page_data = page_response.json()
            page_token = page_data.get('access_token')
            ig_account = page_data.get('instagram_business_account')
            
            if not page_token:
                return {
                    'success': False,
                    'error': f"無法取得 Page {page_id} 的 access token"
                }
            
            if not ig_account:
                return {
                    'success': False,
                    'error': f"Page {page_id} 尚未連結 Instagram Business Account"
                }
            
            ig_account_id = ig_account.get('id')
            if not ig_account_id:
                return {
                    'success': False,
                    'error': "Instagram Business Account ID 為空"
                }
            
            return {
                'success': True,
                'page_token': page_token,
                'ig_account_id': ig_account_id
            }
            
        except requests.RequestException as e:
            return {
                'success': False,
                'error': f"API 請求失敗: {str(e)}"
            }
        except Exception as e:
            return {
                'success': False,
                'error': f"取得 Page 資訊失敗: {str(e)}"
            }
    
    def _create_media_container(self, ig_account_id: str, page_token: str, 
                              image_url: str, caption: str) -> str:
        """建立 Media Container"""
        url = f"{self.api_base_url}/{ig_account_id}/media"
        
        data = {
            'image_url': image_url,
            'caption': caption,
            'access_token': page_token
        }
        
        response = requests.post(url, data=data, timeout=self.timeout)
        
        if response.status_code != 200:
            error_data = response.json()
            raise Exception(f"建立 Media Container 失敗: {error_data.get('error', {}).get('message', 'Unknown error')}")
        
        result = response.json()
        media_id = result.get('id')
        
        if not media_id:
            raise Exception("Media Container ID 為空")
        
        logger.info(f"Media Container 建立成功: {media_id}")
        return media_id
    
    def _create_carousel_item(self, ig_account_id: str, page_token: str, 
                            image_url: str) -> str:
        """建立輪播項目"""
        url = f"{self.api_base_url}/{ig_account_id}/media"
        
        data = {
            'image_url': image_url,
            'is_carousel_item': True,
            'access_token': page_token
        }
        
        response = requests.post(url, data=data, timeout=self.timeout)
        
        if response.status_code != 200:
            error_data = response.json()
            raise Exception(f"建立輪播項目失敗: {error_data.get('error', {}).get('message', 'Unknown error')}")
        
        result = response.json()
        return result['id']
    
    def _create_carousel_container(self, ig_account_id: str, page_token: str,
                                 item_ids: List[str], caption: str) -> str:
        """建立輪播容器"""
        url = f"{self.api_base_url}/{ig_account_id}/media"
        
        data = {
            'media_type': 'CAROUSEL',
            'children': ','.join(item_ids),
            'caption': caption,
            'access_token': page_token
        }
        
        response = requests.post(url, data=data, timeout=self.timeout)
        
        if response.status_code != 200:
            error_data = response.json()
            raise Exception(f"建立輪播容器失敗: {error_data.get('error', {}).get('message', 'Unknown error')}")
        
        result = response.json()
        return result['id']
    
    def _wait_for_media_ready(self, media_id: str, page_token: str, 
                            max_wait_time: int = 120):
        """等待媒體處理完成"""
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            response = requests.get(
                f"{self.api_base_url}/{media_id}",
                params={
                    'fields': 'status_code',
                    'access_token': page_token
                },
                timeout=10
            )
            
            if response.status_code == 200:
                status_data = response.json()
                status = status_data.get('status_code')
                
                if status == 'FINISHED':
                    logger.info(f"媒體 {media_id} 處理完成")
                    return
                elif status == 'ERROR':
                    raise Exception(f"媒體 {media_id} 處理失敗")
                elif status in ['IN_PROGRESS', 'PUBLISHED']:
                    logger.info(f"媒體 {media_id} 處理中: {status}")
                    time.sleep(2)
                    continue
                else:
                    logger.warning(f"未知的媒體狀態: {status}")
                    time.sleep(2)
            else:
                logger.warning(f"檢查媒體狀態失敗: {response.status_code}")
                time.sleep(2)
        
        raise Exception(f"媒體 {media_id} 處理逾時")

    def _assert_public_http_url(self, url: str) -> None:
        """基本檢查：必須為 http(s) 絕對網址；避免相對路徑導致 IG 無法抓圖。
        不做網路連線，只做格式檢查；如需更嚴格可在上層增加 HEAD 驗證。
        """
        try:
            from urllib.parse import urlparse
            p = urlparse(url or "")
            if p.scheme not in ("http", "https") or not p.netloc:
                raise ValueError
        except Exception:
            raise Exception(
                "image_url 需為公開 http(s) 絕對網址；請設定 CDN_PUBLIC_BASE_URL 或 PUBLIC_BASE_URL 以產生外部可抓取的圖片 URL"
            )
    
    def _publish_media(self, ig_account_id: str, page_token: str, 
                      media_id: str) -> str:
        """發布媒體"""
        url = f"{self.api_base_url}/{ig_account_id}/media_publish"
        
        data = {
            'creation_id': media_id,
            'access_token': page_token
        }
        
        response = requests.post(url, data=data, timeout=self.timeout)
        
        if response.status_code != 200:
            error_data = response.json()
            raise Exception(f"發布媒體失敗: {error_data.get('error', {}).get('message', 'Unknown error')}")
        
        result = response.json()
        post_id = result.get('id')
        
        if not post_id:
            raise Exception("發布後的 Post ID 為空")
        
        logger.info(f"媒體發布成功: {post_id}")
        return post_id

    def _get_permalink(self, media_id: str, page_token: str) -> str:
        """查詢已發布媒體的 permalink"""
        try:
            r = requests.get(
                f"{self.api_base_url}/{media_id}",
                params={'fields': 'permalink,shortcode', 'access_token': page_token},
                timeout=self.timeout
            )

            if r.status_code == 200:
                j = r.json()
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
                    # 使用 media_id 的最後部分作為 shortcode（不一定正確，但比沒有 URL 好）
                    return f"https://www.instagram.com/p/{media_id}/"

        except Exception as e:
            logger.error(f"查詢 permalink 時發生錯誤: {e}")

        # 最終回退：返回基本 Instagram URL
        return "https://www.instagram.com/"
    
    def _build_caption(self, caption: str, hashtags: List[str]) -> str:
        """組合文案和標籤"""
        if not caption:
            caption = ""
        
        if hashtags:
            hashtag_str = ' '.join([tag if tag.startswith('#') else f'#{tag}' for tag in hashtags])
            if caption:
                return f"{caption}\n\n{hashtag_str}"
            else:
                return hashtag_str
        
        return caption
    
    def validate_account(self, account) -> Dict[str, Any]:
        """驗證帳號是否可用於發布"""
        try:
            page_info = self._get_page_info(account)
            
            if not page_info['success']:
                return {
                    'valid': False,
                    'error': page_info['error']
                }
            
            # 額外檢查 IG Account 的詳細資訊
            ig_account_id = page_info['ig_account_id']
            page_token = page_info['page_token']
            
            ig_response = requests.get(
                f"{self.api_base_url}/{ig_account_id}",
                params={
                    'fields': 'id,username,account_type',
                    'access_token': page_token
                },
                timeout=10
            )
            
            if ig_response.status_code == 200:
                ig_data = ig_response.json()
                return {
                    'valid': True,
                    'ig_account_id': ig_account_id,
                    'ig_username': ig_data.get('username'),
                    'account_type': ig_data.get('account_type')
                }
            else:
                # 取得更詳細的錯誤資訊
                try:
                    error_data = ig_response.json()
                    error_msg = error_data.get('error', {})
                    if isinstance(error_msg, dict):
                        detailed_error = error_msg.get('message', '未知API錯誤')
                        error_code = error_msg.get('code', 'unknown')
                        return {
                            'valid': False,
                            'error': f"無法訪問 IG Account {ig_account_id}：{detailed_error} (錯誤代碼: {error_code})"
                        }
                    else:
                        return {
                            'valid': False,
                            'error': f"無法訪問 IG Account {ig_account_id}：{error_msg}"
                        }
                except:
                    return {
                        'valid': False,
                        'error': f"無法訪問 IG Account {ig_account_id}：HTTP {ig_response.status_code}"
                    }
                
        except Exception as e:
            return {
                'valid': False,
                'error': str(e)
            }


# 工廠函數
def get_instagram_page_publisher():
    """取得 Instagram Page 發布器實例"""
    return InstagramPagePublisher()

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
