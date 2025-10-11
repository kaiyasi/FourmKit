"""
Instagram 發布通知服務
支援平台內通知和 Discord Webhook 通知
"""

import logging
import os
import requests
from typing import Optional, Dict
from datetime import datetime

logger = logging.getLogger(__name__)


class IGNotificationService:
    """Instagram 發布通知服務"""

    def __init__(self):
        self.discord_webhook_url = os.getenv('IG_DISCORD_WEBHOOK_URL')

    def notify_publish_success(self, post, account, db_session=None):
        """
        發布成功通知

        Args:
            post: InstagramPost 對象
            account: InstagramAccount 對象
            db_session: 資料庫 Session（用於平台內通知）
        """
        try:
            if db_session:
                self._send_platform_notification(
                    db_session,
                    user_id=post.forum_post.user_id,
                    title="Instagram 發布成功",
                    message=f"您的貼文已成功發布到 Instagram: {post.public_id}",
                    link=post.ig_permalink,
                    notification_type='ig_publish_success'
                )

            if self.discord_webhook_url:
                self._send_discord_success(post, account)

            logger.info(f"成功發送發布成功通知: {post.public_id}")

        except Exception as e:
            logger.error(f"發送成功通知失敗: {e}")

    def notify_publish_failure(self, post, account, error_message: str, db_session=None):
        """
        發布失敗通知

        Args:
            post: InstagramPost 對象
            account: InstagramAccount 對象
            error_message: 錯誤訊息
            db_session: 資料庫 Session
        """
        try:
            if db_session:
                self._send_platform_notification(
                    db_session,
                    user_id=post.forum_post.user_id,
                    title="Instagram 發布失敗",
                    message=f"您的貼文發布失敗: {post.public_id}\n錯誤: {error_message}",
                    notification_type='ig_publish_failure',
                    level='error'
                )

                if account.school_id:
                    self._notify_campus_admin(
                        db_session,
                        account.school_id,
                        f"Instagram 發布失敗: {post.public_id}",
                        error_message
                    )

                self._notify_dev_admin(
                    db_session,
                    f"Instagram 發布失敗: {post.public_id}",
                    f"帳號: {account.username}\n錯誤: {error_message}"
                )

            if self.discord_webhook_url:
                self._send_discord_failure(post, account, error_message)

            logger.info(f"成功發送發布失敗通知: {post.public_id}")

        except Exception as e:
            logger.error(f"發送失敗通知失敗: {e}")

    def notify_token_expiring(self, account, days_remaining: int, db_session=None):
        """
        Token 即將過期通知

        Args:
            account: InstagramAccount 對象
            days_remaining: 剩餘天數
            db_session: 資料庫 Session
        """
        try:
            if db_session:
                if account.school_id:
                    self._notify_campus_admin(
                        db_session,
                        account.school_id,
                        f"Instagram Token 即將過期",
                        f"帳號 {account.username} 的 Token 將在 {days_remaining} 天後過期，請及時更新。"
                    )

                self._notify_dev_admin(
                    db_session,
                    f"Instagram Token 即將過期",
                    f"帳號: {account.username}\n剩餘天數: {days_remaining}"
                )

            if self.discord_webhook_url:
                self._send_discord_token_expiring(account, days_remaining)

            logger.info(f"成功發送 Token 過期通知: {account.username}")

        except Exception as e:
            logger.error(f"發送 Token 過期通知失敗: {e}")

    def _send_platform_notification(self, db_session, user_id: int, title: str,
                                    message: str, link: str = None,
                                    notification_type: str = 'info',
                                    level: str = 'info'):
        """
        發送平台內通知

        Args:
            db_session: 資料庫 Session
            user_id: 用戶 ID
            title: 通知標題
            message: 通知內容
            link: 連結（可選）
            notification_type: 通知類型
            level: 通知等級（info/warning/error）
        """
        try:
            from models import UserNotification

            notification = UserNotification(
                user_id=user_id,
                title=title,
                message=message,
                link=link,
                notification_type=notification_type,
                level=level,
                is_read=False
            )

            db_session.add(notification)
            db_session.commit()

            logger.debug(f"已創建平台通知給用戶 {user_id}: {title}")

        except Exception as e:
            logger.error(f"創建平台通知失敗: {e}")
            db_session.rollback()

    def _notify_campus_admin(self, db_session, school_id: int, title: str, message: str):
        """通知 Campus Admin"""
        try:
            from models import User, UserRole

            admins = db_session.query(User).filter(
                User.school_id == school_id,
                User.role == UserRole.CAMPUS_ADMIN
            ).all()

            for admin in admins:
                self._send_platform_notification(
                    db_session,
                    admin.user_id,
                    title,
                    message,
                    notification_type='ig_admin_alert',
                    level='warning'
                )

        except Exception as e:
            logger.error(f"通知 Campus Admin 失敗: {e}")

    def _notify_dev_admin(self, db_session, title: str, message: str):
        """通知 Dev Admin"""
        try:
            from models import User, UserRole

            dev_admins = db_session.query(User).filter(
                User.role == UserRole.DEV_ADMIN
            ).all()

            for admin in dev_admins:
                self._send_platform_notification(
                    db_session,
                    admin.user_id,
                    title,
                    message,
                    notification_type='ig_system_alert',
                    level='error'
                )

        except Exception as e:
            logger.error(f"通知 Dev Admin 失敗: {e}")

    def _send_discord_success(self, post, account):
        """發送 Discord 成功通知"""
        try:
            embed = {
                "title": "✅ Instagram 發布成功",
                "color": 0x00FF00,
                "fields": [
                    {"name": "貼文 ID", "value": post.public_id, "inline": True},
                    {"name": "帳號", "value": account.username, "inline": True},
                    {"name": "IG 連結", "value": post.ig_permalink or "N/A", "inline": False}
                ],
                "timestamp": datetime.utcnow().isoformat()
            }

            self._send_discord_webhook({"embeds": [embed]})

        except Exception as e:
            logger.error(f"發送 Discord 成功通知失敗: {e}")

    def _send_discord_failure(self, post, account, error_message: str):
        """發送 Discord 失敗通知"""
        try:
            embed = {
                "title": "❌ Instagram 發布失敗",
                "color": 0xFF0000,  # 紅色
                "fields": [
                    {"name": "貼文 ID", "value": post.public_id, "inline": True},
                    {"name": "帳號", "value": account.username, "inline": True},
                    {"name": "錯誤碼", "value": post.error_code or "N/A", "inline": True},
                    {"name": "錯誤訊息", "value": error_message[:1000], "inline": False},
                    {"name": "重試次數", "value": f"{post.retry_count}/{post.max_retries}", "inline": True}
                ],
                "timestamp": datetime.utcnow().isoformat()
            }

            self._send_discord_webhook({"embeds": [embed]})

        except Exception as e:
            logger.error(f"發送 Discord 失敗通知失敗: {e}")

    def _send_discord_token_expiring(self, account, days_remaining: int):
        """發送 Discord Token 過期通知"""
        try:
            embed = {
                "title": "⚠️ Instagram Token 即將過期",
                "color": 0xFFA500,
                "fields": [
                    {"name": "帳號", "value": account.username, "inline": True},
                    {"name": "剩餘天數", "value": str(days_remaining), "inline": True},
                    {"name": "過期時間", "value": account.token_expires_at.strftime('%Y-%m-%d'), "inline": False}
                ],
                "timestamp": datetime.utcnow().isoformat()
            }

            self._send_discord_webhook({"embeds": [embed]})

        except Exception as e:
            logger.error(f"發送 Discord Token 過期通知失敗: {e}")

    def _send_discord_webhook(self, payload: Dict):
        """發送 Discord Webhook"""
        if not self.discord_webhook_url:
            logger.debug("Discord Webhook URL 未設定，跳過通知")
            return

        try:
            response = requests.post(
                self.discord_webhook_url,
                json=payload,
                timeout=10
            )

            if response.status_code == 204:
                logger.debug("Discord Webhook 發送成功")
            else:
                logger.warning(f"Discord Webhook 發送失敗: {response.status_code}")

        except Exception as e:
            logger.error(f"發送 Discord Webhook 失敗: {e}")
