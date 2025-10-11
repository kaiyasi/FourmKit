"""
Instagram Token 管理服務
負責 Token 驗證、刷新、過期檢查
"""

import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, Tuple
from sqlalchemy.orm import Session
from models import InstagramAccount
from utils.ig_crypto import encrypt_token, decrypt_token
from utils.db import get_session


class IGTokenManager:
    """Instagram Token 管理器"""

    GRAPH_API_BASE = "https://graph.facebook.com/v23.0"

    REFRESH_BUFFER_DAYS = 7

    def __init__(self, db: Optional[Session] = None):
        """
        初始化 Token 管理器

        Args:
            db: 資料庫 Session（可選，若不提供則會在使用時創建）
        """
        self.db = db
        self._session_cm = None
        self._should_close_db = db is None

    def __enter__(self):
        if self._should_close_db:
            self._session_cm = get_session()
            self.db = self._session_cm.__enter__()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._should_close_db and self._session_cm:
            self._session_cm.__exit__(exc_type, exc_val, exc_tb)

    def validate_token(self, account_id: int) -> Tuple[bool, Optional[str]]:
        """
        驗證 Token 是否有效

        Args:
            account_id: Instagram 帳號 ID

        Returns:
            (is_valid, error_message)
            - is_valid: Token 是否有效
            - error_message: 錯誤訊息（若有效則為 None）
        """
        account = self.db.query(InstagramAccount).filter_by(id=account_id).first()
        if not account:
            return False, f"Account with ID {account_id} not found"

        try:
            access_token = decrypt_token(account.access_token_encrypted)

            response = requests.get(
                f"{self.GRAPH_API_BASE}/{account.ig_user_id}",
                params={
                    'fields': 'id,username',
                    'access_token': access_token
                },
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                if data.get('id') == account.ig_user_id:
                    return True, None
                else:
                    return False, "User ID mismatch"
            else:
                error_data = response.json()
                error_message = error_data.get('error', {}).get('message', 'Unknown error')
                return False, f"API Error: {error_message}"

        except Exception as e:
            return False, f"Validation failed: {str(e)}"

    def refresh_token(self, account: 'InstagramAccount', db: Session) -> Dict:
        """
        刷新長期 Access Token（用於 routes，返回 Dict）

        Args:
            account: Instagram 帳號對象
            db: 資料庫 Session

        Returns:
            {
                'success': bool,
                'error': str (可選),
                'new_expires_at': datetime (可選)
            }
        """
        try:
            current_token = decrypt_token(account.access_token_encrypted)

            response = requests.get(
                f"{self.GRAPH_API_BASE}/oauth/access_token",
                params={
                    'grant_type': 'ig_refresh_token',
                    'access_token': current_token
                },
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                new_token = data.get('access_token')
                expires_in = data.get('expires_in', 5184000)  # 預設 60 天

                if not new_token:
                    return {'success': False, 'error': 'No new token returned from API'}

                encrypted_token = encrypt_token(new_token)
                new_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

                account.access_token_encrypted = encrypted_token
                account.token_expires_at = new_expires_at
                account.last_token_refresh = datetime.utcnow()
                account.last_error = None
                account.last_error_at = None

                db.commit()

                return {'success': True, 'new_expires_at': new_expires_at}

            else:
                error_data = response.json()
                error_message = error_data.get('error', {}).get('message', 'Unknown error')

                account.last_error = f"Token refresh failed: {error_message}"
                account.last_error_at = datetime.utcnow()
                db.commit()

                return {'success': False, 'error': f"API Error: {error_message}"}

        except Exception as e:
            account.last_error = f"Token refresh exception: {str(e)}"
            account.last_error_at = datetime.utcnow()
            db.commit()

            return {'success': False, 'error': f"Refresh failed: {str(e)}"}

    def exchange_short_lived_token(self, short_lived_token: str, app_id: str, app_secret: str) -> Tuple[bool, Optional[str], Optional[dict]]:
        """
        將 Short-lived Token 轉換為 Long-lived Token

        Args:
            short_lived_token: Graph API Explorer 提供的短期 Token (1小時)
            app_id: Facebook App ID
            app_secret: Facebook App Secret

        Returns:
            (success, error_message, token_data)
            - success: 是否成功轉換
            - error_message: 錯誤訊息（成功時為 None）
            - token_data: {'access_token': str, 'expires_in': int} 或 None
        """
        try:
            response = requests.get(
                f"{self.GRAPH_API_BASE}/oauth/access_token",
                params={
                    'grant_type': 'fb_exchange_token',
                    'client_id': app_id,
                    'client_secret': app_secret,
                    'fb_exchange_token': short_lived_token
                },
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                long_lived_token = data.get('access_token')
                expires_in = data.get('expires_in', 5184000)  # 預設 60 天

                if not long_lived_token:
                    return False, "No long-lived token returned from API", None

                return True, None, {
                    'access_token': long_lived_token,
                    'expires_in': expires_in
                }
            else:
                error_data = response.json()
                error_message = error_data.get('error', {}).get('message', 'Unknown error')
                return False, f"Token exchange failed: {error_message}", None

        except Exception as e:
            return False, f"Token exchange exception: {str(e)}", None

    def refresh_token_by_id(self, account_id: int) -> Tuple[bool, Optional[str]]:
        """
        刷新長期 Access Token

        必須提供 App ID/Secret 才能進行 Token 刷新
        Meta Graph API v23.0 已不再支援 ig_refresh_token

        Args:
            account_id: Instagram 帳號 ID

        Returns:
            (success, message)
            - success: 是否成功刷新
            - message: 成功訊息或錯誤訊息
        """
        account = self.db.query(InstagramAccount).filter_by(id=account_id).first()
        if not account:
            return False, f"Account with ID {account_id} not found"

        if not account.app_id or not account.app_secret_encrypted:
            error_msg = "此帳號未設定 App ID/Secret，無法刷新 Token。請更新帳號設定或重新創建帳號。"
            account.last_error = error_msg
            account.last_error_at = datetime.utcnow()
            self.db.commit()
            return False, error_msg

        try:
            current_token = decrypt_token(account.access_token_encrypted)
            app_secret = decrypt_token(account.app_secret_encrypted)

            success, error, token_data = self.exchange_short_lived_token(
                current_token, account.app_id, app_secret
            )

            if success and token_data:
                encrypted_token = encrypt_token(token_data['access_token'])
                new_expires_at = datetime.utcnow() + timedelta(seconds=token_data['expires_in'])

                account.access_token_encrypted = encrypted_token
                account.token_expires_at = new_expires_at
                account.last_token_refresh = datetime.utcnow()
                account.last_error = None
                account.last_error_at = None

                self.db.commit()

                return True, f"Token refreshed successfully, expires at {new_expires_at.strftime('%Y-%m-%d %H:%M:%S')}"
            else:
                account.last_error = error
                account.last_error_at = datetime.utcnow()
                self.db.commit()

                return False, error

        except Exception as e:
            error_msg = f"Token refresh exception: {str(e)}"
            account.last_error = error_msg
            account.last_error_at = datetime.utcnow()
            self.db.commit()

            return False, error_msg

    def check_token_expiry(self, account_id: int) -> Dict:
        """
        檢查 Token 過期狀態

        Args:
            account_id: Instagram 帳號 ID

        Returns:
            {
                'is_expired': bool,
                'needs_refresh': bool,
                'expires_at': datetime,
                'days_remaining': int,
                'last_refresh': datetime
            }
        """
        account = self.db.query(InstagramAccount).filter_by(id=account_id).first()
        if not account:
            return {'error': f"Account with ID {account_id} not found"}

        now = datetime.utcnow()
        expires_at = account.token_expires_at
        time_remaining = expires_at - now
        days_remaining = time_remaining.days

        return {
            'is_expired': days_remaining < 0,
            'needs_refresh': days_remaining < self.REFRESH_BUFFER_DAYS,
            'expires_at': expires_at,
            'days_remaining': days_remaining,
            'last_refresh': account.last_token_refresh
        }

    def get_accounts_needing_refresh(self) -> list[InstagramAccount]:
        """
        獲取需要刷新 Token 的帳號列表

        Returns:
            需要刷新的帳號列表（7天內過期或已過期）
        """
        buffer_date = datetime.utcnow() + timedelta(days=self.REFRESH_BUFFER_DAYS)

        return self.db.query(InstagramAccount).filter(
            InstagramAccount.is_active == True,
            InstagramAccount.token_expires_at <= buffer_date
        ).all()

    def auto_refresh_all(self) -> Dict[str, int]:
        """
        自動刷新所有需要刷新的 Token（用於 Celery 定時任務）

        Returns:
            {
                'total': int,
                'refreshed': int,
                'failed': int,
                'skipped': int
            }
        """
        accounts = self.get_accounts_needing_refresh()

        stats = {
            'total': len(accounts),
            'refreshed': 0,
            'failed': 0,
            'skipped': 0
        }

        for account in accounts:
            expiry_info = self.check_token_expiry(account.id)

            if not expiry_info.get('needs_refresh'):
                stats['skipped'] += 1
                continue

            success, message = self.refresh_token_by_id(account.id)

            if success:
                stats['refreshed'] += 1
                print(f"[IGTokenManager] Refreshed token for account {account.username} (ID: {account.id})")
            else:
                stats['failed'] += 1
                print(f"[IGTokenManager] Failed to refresh token for account {account.username} (ID: {account.id}): {message}")

        return stats


def validate_account_token(account_id: int) -> Tuple[bool, Optional[str]]:
    """
    便捷函數：驗證帳號 Token

    Args:
        account_id: Instagram 帳號 ID

    Returns:
        (is_valid, error_message)
    """
    with IGTokenManager() as manager:
        return manager.validate_token(account_id)


def refresh_account_token(account_id: int) -> Tuple[bool, Optional[str]]:
    """
    便捷函數：刷新帳號 Token

    Args:
        account_id: Instagram 帳號 ID

    Returns:
        (success, message)
    """
    with IGTokenManager() as manager:
        return manager.refresh_token_by_id(account_id)


def check_account_expiry(account_id: int) -> Dict:
    """
    便捷函數：檢查帳號 Token 過期狀態

    Args:
        account_id: Instagram 帳號 ID

    Returns:
        過期狀態資訊字典
    """
    with IGTokenManager() as manager:
        return manager.check_token_expiry(account_id)


if __name__ == "__main__":
    print("=== Instagram Token Manager Test ===\n")

    print("Note: This test requires a database connection and test account.")
    print("Run with: PYTHONPATH=/path/to/backend python services/ig_token_manager.py")
