"""
Instagram Graph API v23.0 客戶端
處理 Instagram API 的所有請求，支援單圖、輪播發布
"""

import requests
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import time
import os

logger = logging.getLogger(__name__)


class IGAPIError(Exception):
    """Instagram API 錯誤"""
    def __init__(self, message: str, error_code: str = None, status_code: int = None):
        super().__init__(message)
        self.error_code = error_code
        self.status_code = status_code


class IGAPIClient:
    """Instagram Graph API 客戶端"""

    # API 版本
    API_VERSION = "v21.0"
    BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

    # 錯誤類型分類
    TOKEN_ERRORS = [190, 102, 463, 467]  # Token 相關錯誤碼
    RATE_LIMIT_ERRORS = [4, 17, 32, 613]  # 限流錯誤碼
    CONTENT_ERRORS = [100, 368]  # 內容違規錯誤碼

    def __init__(self, access_token: str, ig_user_id: str):
        """
        初始化 API 客戶端

        Args:
            access_token: Instagram Access Token
            ig_user_id: Instagram User ID
        """
        self.access_token = access_token
        self.ig_user_id = ig_user_id
        self.session = requests.Session()
        self.session.headers.update({
            'Accept': 'application/json',
            'User-Agent': 'ForumKit-IGPublisher/2.2.0'
        })

    def create_single_media_container(self, image_url: str, caption: str) -> str:
        """
        創建單圖 Media Container

        Args:
            image_url: 公開可訪問的圖片 URL
            caption: 貼文說明文字

        Returns:
            str: Container ID

        Raises:
            IGAPIError: API 請求失敗
        """
        endpoint = f"{self.BASE_URL}/{self.ig_user_id}/media"
        params = {
            'image_url': image_url,
            'caption': caption,
            'access_token': self.access_token
        }

        try:
            logger.info(f"創建單圖 Container: {image_url[:50]}...")
            response = self._make_request('POST', endpoint, params=params)

            container_id = response.get('id')
            if not container_id:
                raise IGAPIError("API 返回無效的 Container ID")

            logger.info(f"成功創建 Container: {container_id}")
            return container_id

        except IGAPIError:
            raise
        except Exception as e:
            logger.error(f"創建單圖 Container 失敗: {e}")
            raise IGAPIError(f"創建 Container 失敗: {str(e)}")

    def create_carousel_item_container(self, image_url: str) -> str:
        """
        創建輪播項目 Container

        Args:
            image_url: 公開可訪問的圖片 URL

        Returns:
            str: Container ID

        Raises:
            IGAPIError: API 請求失敗
        """
        endpoint = f"{self.BASE_URL}/{self.ig_user_id}/media"
        params = {
            'image_url': image_url,
            'is_carousel_item': True,
            'access_token': self.access_token
        }

        try:
            logger.info(f"創建輪播項目 Container: {image_url[:50]}...")
            response = self._make_request('POST', endpoint, params=params)

            container_id = response.get('id')
            if not container_id:
                raise IGAPIError("API 返回無效的輪播項目 Container ID")

            logger.info(f"成功創建輪播項目 Container: {container_id}")
            return container_id

        except IGAPIError:
            raise
        except Exception as e:
            logger.error(f"創建輪播項目 Container 失敗: {e}")
            raise IGAPIError(f"創建輪播項目失敗: {str(e)}")

    def create_carousel_container(self, children_ids: List[str], caption: str) -> str:
        """
        創建輪播 Container

        Args:
            children_ids: 輪播項目 Container ID 列表（最多 10 個）
            caption: 貼文說明文字

        Returns:
            str: Carousel Container ID

        Raises:
            IGAPIError: API 請求失敗
        """
        if not children_ids or len(children_ids) > 10:
            raise IGAPIError(f"輪播項目數量必須在 1-10 之間，當前: {len(children_ids)}")

        endpoint = f"{self.BASE_URL}/{self.ig_user_id}/media"
        params = {
            'media_type': 'CAROUSEL',
            'children': ','.join(children_ids),
            'caption': caption,
            'access_token': self.access_token
        }

        try:
            logger.info(f"創建輪播 Container，包含 {len(children_ids)} 個項目")
            response = self._make_request('POST', endpoint, params=params)

            container_id = response.get('id')
            if not container_id:
                raise IGAPIError("API 返回無效的輪播 Container ID")

            logger.info(f"成功創建輪播 Container: {container_id}")
            return container_id

        except IGAPIError:
            raise
        except Exception as e:
            logger.error(f"創建輪播 Container 失敗: {e}")
            raise IGAPIError(f"創建輪播 Container 失敗: {str(e)}")

    def publish_media(self, creation_id: str) -> Dict[str, str]:
        """
        發布 Media Container

        Args:
            creation_id: Container ID

        Returns:
            dict: {'id': media_id, 'permalink': permalink}

        Raises:
            IGAPIError: API 請求失敗
        """
        endpoint = f"{self.BASE_URL}/{self.ig_user_id}/media_publish"
        params = {
            'creation_id': creation_id,
            'access_token': self.access_token
        }

        try:
            logger.info(f"發布 Media Container: {creation_id}")

            # 遇到 9007（Media ID is not available）進行短暫退避重試
            max_attempts = int(os.getenv('IG_PUBLISH_MAX_ATTEMPTS', '3'))
            for attempt in range(1, max_attempts + 1):
                try:
                    response = self._make_request('POST', endpoint, params=params)
                    media_id = response.get('id')
                    if not media_id:
                        raise IGAPIError("API 返回無效的 Media ID")

                    # 獲取 permalink
                    permalink = self._get_media_permalink(media_id)

                    logger.info(f"成功發布 Media: {media_id}, Permalink: {permalink}")
                    return {
                        'id': media_id,
                        'permalink': permalink
                    }

                except IGAPIError as e:
                    # 只有在 9007 或訊息包含關鍵字時才進行重試
                    message = str(e) if str(e) else ''
                    if (e.error_code and str(e.error_code) == '9007') or ('Media ID is not available' in message):
                        if attempt < max_attempts:
                            wait_time = 2 ** (attempt - 1)
                            logger.warning(f"遇到 9007，{wait_time}s 後重試 (第 {attempt}/{max_attempts} 次)...")
                            time.sleep(wait_time)
                            continue
                    # 其他錯誤或已達到最大次數
                    raise

        except IGAPIError:
            raise
        except Exception as e:
            logger.error(f"發布 Media 失敗: {e}")
            raise IGAPIError(f"發布失敗: {str(e)}")

    def _get_media_permalink(self, media_id: str) -> str:
        """
        獲取 Media 的 Permalink

        Args:
            media_id: Instagram Media ID

        Returns:
            str: Permalink URL
        """
        endpoint = f"{self.BASE_URL}/{media_id}"
        params = {
            'fields': 'permalink',
            'access_token': self.access_token
        }

        try:
            response = self._make_request('GET', endpoint, params=params)
            return response.get('permalink', '')
        except Exception as e:
            logger.warning(f"無法獲取 Permalink: {e}")
            return ''

    def check_container_status(self, container_id: str) -> Tuple[str, Optional[str]]:
        """
        檢查 Container 狀態

        Args:
            container_id: Container ID

        Returns:
            tuple: (status, error_message)
                status: 'FINISHED' | 'IN_PROGRESS' | 'ERROR'
                error_message: 錯誤訊息（如果有）
        """
        endpoint = f"{self.BASE_URL}/{container_id}"
        params = {
            'fields': 'status_code,status',
            'access_token': self.access_token
        }

        try:
            response = self._make_request('GET', endpoint, params=params)
            status = response.get('status_code', 'UNKNOWN')
            error_msg = response.get('status', '')

            return status, error_msg if status == 'ERROR' else None

        except Exception as e:
            logger.warning(f"無法檢查 Container 狀態: {e}")
            return 'UNKNOWN', str(e)

    def wait_until_finished(self, container_id: str, *, timeout: Optional[int] = None, interval: Optional[int] = None) -> None:
        """
        等待指定的 Container 進入 FINISHED 狀態。

        Args:
            container_id: Container ID
            timeout: 最長等待秒數（預設讀取環境變數 IG_MAX_WAIT，否則 600）
            interval: 輪詢間隔秒數（預設讀取環境變數 IG_RETRY_INTERVAL，否則 2）

        Raises:
            IGAPIError: 若狀態為 ERROR 或超過逾時
        """
        timeout = int(timeout if timeout is not None else os.getenv('IG_MAX_WAIT', '600'))
        interval = int(interval if interval is not None else os.getenv('IG_RETRY_INTERVAL', '2'))

        start = time.time()
        last_status = None
        while True:
            status, err = self.check_container_status(container_id)
            if status != last_status:
                logger.info(f"Container {container_id} 狀態: {status}")
                last_status = status

            if status == 'FINISHED':
                logger.info(f"Container {container_id} 已完成處理")
                return
            if status == 'ERROR':
                raise IGAPIError(f"Container {container_id} 狀態為 ERROR: {err}")

            if time.time() - start > timeout:
                raise IGAPIError(f"等待 Container {container_id} 超時 ({timeout}s)")

            time.sleep(interval)

    def validate_token(self) -> bool:
        """
        驗證 Access Token 是否有效

        Returns:
            bool: Token 是否有效
        """
        endpoint = f"{self.BASE_URL}/{self.ig_user_id}"
        params = {
            'fields': 'username',
            'access_token': self.access_token
        }

        try:
            response = self._make_request('GET', endpoint, params=params)
            return 'username' in response
        except IGAPIError as e:
            if e.error_code and int(e.error_code) in self.TOKEN_ERRORS:
                return False
            raise
        except Exception:
            return False

    def get_media_insights(self, media_id: str) -> Dict:
        """
        獲取貼文洞察數據（需要 Instagram Business 帳號）

        Args:
            media_id: Instagram Media ID

        Returns:
            dict: 洞察數據
        """
        endpoint = f"{self.BASE_URL}/{media_id}/insights"
        params = {
            'metric': 'engagement,impressions,reach,saved',
            'access_token': self.access_token
        }

        try:
            response = self._make_request('GET', endpoint, params=params)
            return response.get('data', [])
        except Exception as e:
            logger.warning(f"無法獲取 Media 洞察: {e}")
            return {}

    def _make_request(self, method: str, url: str, params: Dict = None,
                     data: Dict = None, retry_count: int = 3) -> Dict:
        """
        發送 HTTP 請求（帶重試機制）

        Args:
            method: HTTP 方法
            url: 請求 URL
            params: URL 參數
            data: 請求 Body
            retry_count: 重試次數

        Returns:
            dict: API 響應

        Raises:
            IGAPIError: API 錯誤
        """
        for attempt in range(retry_count):
            try:
                response = self.session.request(
                    method=method,
                    url=url,
                    params=params,
                    json=data,
                    timeout=30
                )

                # 解析響應
                try:
                    result = response.json()
                except ValueError:
                    raise IGAPIError(
                        f"API 返回無效的 JSON: {response.text[:200]}",
                        status_code=response.status_code
                    )

                # 檢查錯誤
                if response.status_code != 200:
                    error = result.get('error', {})
                    error_message = error.get('message', '未知錯誤')
                    error_code = error.get('code')
                    error_subcode = error.get('error_subcode')

                    logger.error(f"API 錯誤 [{response.status_code}]: {error_message} "
                               f"(code: {error_code}, subcode: {error_subcode})")

                    # 判斷錯誤類型
                    if error_code in self.RATE_LIMIT_ERRORS:
                        # 限流錯誤：等待後重試
                        if attempt < retry_count - 1:
                            wait_time = 2 ** attempt * 5  # 指數退避
                            logger.warning(f"遇到限流，等待 {wait_time} 秒後重試...")
                            time.sleep(wait_time)
                            continue

                    raise IGAPIError(
                        error_message,
                        error_code=str(error_code),
                        status_code=response.status_code
                    )

                # 成功
                return result

            except requests.RequestException as e:
                logger.warning(f"請求失敗 (嘗試 {attempt + 1}/{retry_count}): {e}")
                if attempt < retry_count - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise IGAPIError(f"網路請求失敗: {str(e)}")

        raise IGAPIError("達到最大重試次數")

    def classify_error(self, error: IGAPIError) -> str:
        """
        分類錯誤類型

        Args:
            error: IGAPIError 實例

        Returns:
            str: 錯誤類型 ('token' | 'rate_limit' | 'content' | 'network' | 'unknown')
        """
        if not error.error_code:
            if error.status_code and error.status_code >= 500:
                return 'network'
            return 'unknown'

        try:
            code = int(error.error_code)
        except ValueError:
            return 'unknown'

        if code in self.TOKEN_ERRORS:
            return 'token'
        elif code in self.RATE_LIMIT_ERRORS:
            return 'rate_limit'
        elif code in self.CONTENT_ERRORS:
            return 'content'
        else:
            return 'unknown'

    def close(self):
        """關閉 Session"""
        self.session.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
