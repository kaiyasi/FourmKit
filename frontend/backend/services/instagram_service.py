"""
Instagram 整合服務
處理 Instagram API 調用、圖片生成、發布邏輯等
"""

import os
import json
import requests
import base64
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from PIL import Image, ImageDraw, ImageFont
import io
import re

from models import (
    InstagramAccount, InstagramSetting, InstagramTemplate, 
    InstagramPost, InstagramEvent, Post, User, School
)
from utils.crypto import encrypt_data, decrypt_data
from utils.fsops import UPLOAD_ROOT


class InstagramService:
    """Instagram 整合服務"""
    
    # Instagram API 基礎 URL
    BASE_URL = "https://graph.facebook.com/v18.0"
    
    @staticmethod
    def create_account(
        session: Session,
        school_id: Optional[int],
        ig_user_id: str,
        account_name: str,
        access_token: str
    ) -> Dict[str, Any]:
        """創建 Instagram 帳號"""
        try:
            # 加密 token
            encrypted_token = encrypt_data(access_token)
            
            # 計算到期時間（60天）
            expires_at = datetime.now(timezone.utc) + timedelta(days=60)
            
            # 創建帳號
            account = InstagramAccount(
                school_id=school_id,
                ig_user_id=ig_user_id,
                page_id="",  # 暫時設為空字串，因為資料庫欄位還是必填
                account_name=account_name,
                token_encrypted=encrypted_token,
                expires_at=expires_at
            )
            
            session.add(account)
            session.flush()  # 獲取 ID
            
            # 創建預設設定
            settings = InstagramSetting(
                account_id=account.id,
                enabled=True,
                post_interval_count=10,
                post_interval_hours=6,
                daily_limit=50
            )
            session.add(settings)
            
            # 創建預設模板
            template = InstagramTemplate(
                account_id=account.id,
                name="預設模板",
                is_default=True,
                layout={
                    "text": {"x": 0.5, "y": 0.5, "align": "center"},
                    "logo": {"x": 0.9, "y": 0.1, "size": 100},
                    "timestamp": {"x": 0.1, "y": 0.9, "size": 16}
                }
            )
            session.add(template)
            
            session.commit()
            
            return {
                "success": True,
                "account_id": account.id,
                "message": "Instagram 帳號創建成功"
            }
            
        except Exception as e:
            session.rollback()
            return {
                "success": False,
                "error": f"創建帳號失敗: {str(e)}"
            }
    
    @staticmethod
    def get_account_token(session: Session, account_id: int) -> Optional[str]:
        """獲取帳號的存取權杖"""
        try:
            account = session.query(InstagramAccount).filter(
                InstagramAccount.id == account_id,
                InstagramAccount.is_active == True
            ).first()
            
            if not account:
                return None
            
            # 檢查是否過期
            if account.expires_at <= datetime.now(timezone.utc):
                return None
            
            # 解密 token
            token = decrypt_data(account.token_encrypted)
            
            # 檢查解密是否成功
            if not token:
                return None
            
            return token
            
        except Exception as e:
            print(f"Error getting account token: {e}")
            return None
    
    @staticmethod
    def refresh_token(session: Session, account_id: int) -> bool:
        """刷新存取權杖"""
        try:
            account = session.query(InstagramAccount).get(account_id)
            if not account:
                return False
            
            current_token = decrypt_data(account.token_encrypted)
            if not current_token:
                print(f"Failed to decrypt token for account {account_id}")
                return False
            
            # 檢查環境變數
            app_id = os.getenv("FACEBOOK_APP_ID")
            app_secret = os.getenv("FACEBOOK_APP_SECRET")
            
            if not app_id or not app_secret:
                print("Facebook App ID or App Secret not configured")
                return False
            
            # 調用 Facebook API 刷新 token
            response = requests.get(
                f"{InstagramService.BASE_URL}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "fb_exchange_token": current_token
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                new_token = data.get("access_token")
                expires_in = data.get("expires_in", 5184000)  # 60天
                
                if not new_token:
                    print("No access token in response")
                    return False
                
                # 更新資料庫
                account.token_encrypted = encrypt_data(new_token)
                account.expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                account.updated_at = datetime.now(timezone.utc)
                
                session.commit()
                return True
            else:
                print(f"Token refresh failed: {response.status_code} - {response.text}")
                return False
            
        except Exception as e:
            print(f"Error refreshing token: {e}")
            return False
    
    @staticmethod
    def check_publishing_conditions(session: Session, account_id: int) -> Dict[str, Any]:
        """檢查是否滿足發布條件"""
        try:
            # 獲取設定
            settings = session.query(InstagramSetting).filter(
                InstagramSetting.account_id == account_id
            ).first()
            
            if not settings or not settings.enabled:
                return {"should_publish": False, "reason": "發布功能未啟用"}
            
            # 獲取帳號資訊
            account = session.query(InstagramAccount).get(account_id)
            if not account:
                return {"should_publish": False, "reason": "帳號不存在"}
            
            # 檢查今日發布數量
            today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            today_posts = session.query(InstagramPost).filter(
                and_(
                    InstagramPost.account_id == account_id,
                    InstagramPost.created_at >= today_start,
                    InstagramPost.status == "published"
                )
            ).count()
            
            if today_posts >= settings.daily_limit:
                return {"should_publish": False, "reason": "已達每日發布限制"}
            
            # 獲取待發布的貼文
            if account.school_id:
                # 學校帳號：只處理該學校的貼文
                pending_posts = session.query(Post).filter(
                    and_(
                        Post.school_id == account.school_id,
                        Post.status == "approved",
                        Post.is_deleted == False
                    )
                ).order_by(Post.created_at.desc()).limit(settings.post_interval_count).all()
            else:
                # 總平台帳號：處理跨校貼文
                pending_posts = session.query(Post).filter(
                    and_(
                        Post.school_id.is_(None),  # 跨校貼文
                        Post.status == "approved",
                        Post.is_deleted == False
                    )
                ).order_by(Post.created_at.desc()).limit(settings.post_interval_count).all()
            
            # 檢查數量條件
            if len(pending_posts) >= settings.post_interval_count:
                return {
                    "should_publish": True,
                    "reason": f"達到 {settings.post_interval_count} 篇貼文",
                    "posts": pending_posts
                }
            
            # 檢查時間條件
            last_post = session.query(InstagramPost).filter(
                InstagramPost.account_id == account_id
            ).order_by(InstagramPost.created_at.desc()).first()
            
            if last_post:
                time_diff = datetime.now(timezone.utc) - last_post.created_at
                if time_diff.total_seconds() >= settings.post_interval_hours * 3600:
                    return {
                        "should_publish": True,
                        "reason": f"距離上次發布已超過 {settings.post_interval_hours} 小時",
                        "posts": pending_posts
                    }
            
            return {"should_publish": False, "reason": "未滿足發布條件"}
            
        except Exception as e:
            return {"should_publish": False, "reason": f"檢查失敗: {str(e)}"}
    
    @staticmethod
    def generate_instagram_image(
        session: Session,
        account_id: int,
        posts: List[Post],
        template_id: Optional[int] = None
    ) -> Optional[str]:
        """生成 Instagram 圖片"""
        try:
            # 獲取模板
            if template_id:
                template = session.query(InstagramTemplate).filter(
                    InstagramTemplate.id == template_id,
                    InstagramTemplate.account_id == account_id
                ).first()
            else:
                template = session.query(InstagramTemplate).filter(
                    InstagramTemplate.account_id == account_id,
                    InstagramTemplate.is_default == True
                ).first()
            
            if not template:
                return None
            
            # 創建圖片
            img = Image.new('RGB', (1080, 1080), template.background_color)
            draw = ImageDraw.Draw(img)
            
            # 載入字體
            try:
                font = ImageFont.truetype(f"fonts/{template.text_font}.ttf", template.text_size)
            except:
                font = ImageFont.load_default()
            
            # 生成文字內容
            text_content = ""
            for i, post in enumerate(posts[:3]):  # 最多顯示3篇
                text_content += f"{i+1}. {post.content[:50]}...\n\n"
            
            # 繪製文字
            bbox = draw.textbbox((0, 0), text_content, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            x = (1080 - text_width) // 2
            y = (1080 - text_height) // 2
            
            draw.text((x, y), text_content, fill=template.text_color, font=font)
            
            # 添加校徽
            if template.logo_enabled:
                account = session.query(InstagramAccount).get(account_id)
                if account and account.school and account.school.logo_path:
                    try:
                        logo_path = os.path.join(UPLOAD_ROOT, account.school.logo_path)
                        if os.path.exists(logo_path):
                            logo = Image.open(logo_path)
                            logo = logo.resize((template.logo_size, template.logo_size))
                            
                            # 計算位置
                            if template.logo_position == "top-right":
                                logo_x = 1080 - template.logo_size - 20
                                logo_y = 20
                            else:
                                logo_x = 20
                                logo_y = 20
                            
                            img.paste(logo, (logo_x, logo_y), logo if logo.mode == 'RGBA' else None)
                    except Exception:
                        pass  # 忽略校徽載入錯誤
            
            # 添加時間戳
            if template.timestamp_enabled:
                timestamp = datetime.now().strftime(template.timestamp_format)
                timestamp_font = ImageFont.load_default()
                draw.text((20, 1080 - 40), timestamp, fill=template.timestamp_color, font=timestamp_font)
            
            # 保存圖片
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"instagram_{account_id}_{timestamp}.jpg"
            filepath = os.path.join(UPLOAD_ROOT, "instagram", filename)
            
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            img.save(filepath, "JPEG", quality=95)
            
            return f"instagram/{filename}"
            
        except Exception as e:
            print(f"生成圖片失敗: {str(e)}")
            return None
    
    @staticmethod
    def create_instagram_post(
        session: Session,
        account_id: int,
        posts: List[Post],
        template_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """創建 Instagram 發布任務"""
        try:
            # 生成圖片
            image_path = InstagramService.generate_instagram_image(session, account_id, posts, template_id)
            if not image_path:
                return {
                    "success": False,
                    "error": "圖片生成失敗"
                }
            
            # 獲取模板
            if template_id:
                template = session.query(InstagramTemplate).filter(
                    InstagramTemplate.id == template_id,
                    InstagramTemplate.account_id == account_id
                ).first()
            else:
                template = session.query(InstagramTemplate).filter(
                    InstagramTemplate.account_id == account_id,
                    InstagramTemplate.is_default == True
                ).first()
            
            # 生成 caption
            caption = InstagramService.generate_caption(template, posts)
            
            # 創建發布記錄
            ig_post = InstagramPost(
                account_id=account_id,
                forum_post_ids=[post.id for post in posts],
                status="draft",
                caption=caption,
                image_path=image_path
            )
            
            session.add(ig_post)
            session.commit()
            
            return {
                "success": True,
                "post_id": ig_post.id,
                "message": "Instagram 發布任務創建成功"
            }
            
        except Exception as e:
            session.rollback()
            return {
                "success": False,
                "error": f"創建發布任務失敗: {str(e)}"
            }
    
    @staticmethod
    def generate_caption(template: InstagramTemplate, posts: List[Post]) -> str:
        """生成 Instagram Caption"""
        try:
            caption = template.caption_template
            
            # 替換變數
            if posts:
                post = posts[0]  # 使用第一篇貼文作為主要資訊
                
                # 獲取學校名稱
                school_name = "跨校" if not post.school_id else post.school.name
                
                # 獲取作者名稱
                author_name = post.author.username if post.author else "匿名"
                
                # 格式化時間
                post_time = post.created_at.strftime("%Y/%m/%d %H:%M")
                
                # 生成標題
                post_title = post.content[:50] + "..." if len(post.content) > 50 else post.content
                
                # 替換模板變數
                caption = caption.replace("{school_name}", school_name)
                caption = caption.replace("{author_name}", author_name)
                caption = caption.replace("{post_time}", post_time)
                caption = caption.replace("{post_title}", post_title)
                
                # 添加多篇貼文資訊
                if len(posts) > 1:
                    caption += f"\n\n📝 本次同步 {len(posts)} 篇貼文"
            
            return caption
            
        except Exception:
            return "📚 校園生活分享\n\n#校園生活 #學生分享"
    
    @staticmethod
    def publish_to_instagram(session: Session, post_id: int) -> Dict[str, Any]:
        """發布到 Instagram"""
        try:
            # 獲取發布記錄
            ig_post = session.query(InstagramPost).get(post_id)
            if not ig_post:
                return {"success": False, "error": "發布記錄不存在"}
            
            # 獲取帳號 token
            token = InstagramService.get_account_token(session, ig_post.account_id)
            if not token:
                # 檢查帳號狀態
                account = session.query(InstagramAccount).get(ig_post.account_id)
                if not account:
                    return {"success": False, "error": "帳號不存在"}
                elif not account.is_active:
                    return {"success": False, "error": "帳號已停用"}
                elif account.expires_at <= datetime.now(timezone.utc):
                    return {"success": False, "error": "存取權杖已過期，請刷新權杖"}
                else:
                    return {"success": False, "error": "無法獲取存取權杖，可能是權杖解密失敗"}
            
            # 更新狀態
            ig_post.status = "publishing"
            session.commit()
            
            # 記錄事件
            InstagramService.log_event(session, post_id, "publishing_started", {
                "message": "開始發布到 Instagram"
            })
            
            # 上傳圖片
            image_path = os.path.join(UPLOAD_ROOT, ig_post.image_path)
            if not os.path.exists(image_path):
                return {"success": False, "error": "圖片檔案不存在"}
            
            # 獲取帳號資訊
            account = session.query(InstagramAccount).get(ig_post.account_id)
            
            # 上傳到 Instagram
            with open(image_path, 'rb') as f:
                files = {'source': f}
                data = {
                    'access_token': token,
                    'caption': ig_post.caption
                }
                
                response = requests.post(
                    f"{InstagramService.BASE_URL}/{account.ig_user_id}/media",
                    files=files,
                    data=data
                )
            
            if response.status_code != 200:
                error_msg = f"上傳失敗: {response.text}"
                ig_post.status = "failed"
                ig_post.error_code = "UPLOAD_FAILED"
                ig_post.error_message = error_msg
                session.commit()
                
                InstagramService.log_event(session, post_id, "upload_failed", {
                    "error": error_msg,
                    "response": response.text
                })
                
                return {"success": False, "error": error_msg}
            
            # 獲取 media_id
            media_data = response.json()
            media_id = media_data.get('id')
            
            if not media_id:
                error_msg = "無法獲取 media_id"
                ig_post.status = "failed"
                ig_post.error_code = "NO_MEDIA_ID"
                ig_post.error_message = error_msg
                session.commit()
                
                InstagramService.log_event(session, post_id, "no_media_id", {
                    "response": response.text
                })
                
                return {"success": False, "error": error_msg}
            
            # 發布
            publish_response = requests.post(
                f"{InstagramService.BASE_URL}/{account.ig_user_id}/media_publish",
                data={
                    'access_token': token,
                    'creation_id': media_id
                }
            )
            
            if publish_response.status_code != 200:
                error_msg = f"發布失敗: {publish_response.text}"
                ig_post.status = "failed"
                ig_post.error_code = "PUBLISH_FAILED"
                ig_post.error_message = error_msg
                session.commit()
                
                InstagramService.log_event(session, post_id, "publish_failed", {
                    "error": error_msg,
                    "response": publish_response.text
                })
                
                return {"success": False, "error": error_msg}
            
            # 發布成功
            publish_data = publish_response.json()
            ig_post.status = "published"
            ig_post.ig_media_id = media_id
            ig_post.ig_post_id = publish_data.get('id')
            ig_post.published_at = datetime.now(timezone.utc)
            session.commit()
            
            InstagramService.log_event(session, post_id, "published", {
                "ig_post_id": ig_post.ig_post_id,
                "ig_media_id": ig_post.ig_media_id
            })
            
            return {
                "success": True,
                "ig_post_id": ig_post.ig_post_id,
                "message": "發布成功"
            }
            
        except Exception as e:
            session.rollback()
            return {
                "success": False,
                "error": f"發布失敗: {str(e)}"
            }
    
    @staticmethod
    def log_event(session: Session, post_id: int, event_type: str, payload: Dict[str, Any]):
        """記錄事件"""
        try:
            event = InstagramEvent(
                ig_post_id=post_id,
                event_type=event_type,
                payload=payload
            )
            session.add(event)
            session.commit()
        except Exception:
            session.rollback()
    
    @staticmethod
    def get_posts_by_account(session: Session, account_id: int, limit: int = 50) -> List[Dict[str, Any]]:
        """獲取帳號的發布記錄"""
        try:
            posts = session.query(InstagramPost).filter(
                InstagramPost.account_id == account_id
            ).order_by(InstagramPost.created_at.desc()).limit(limit).all()
            
            result = []
            for post in posts:
                result.append({
                    "id": post.id,
                    "status": post.status,
                    "caption": post.caption,
                    "image_path": post.image_path,
                    "ig_post_id": post.ig_post_id,
                    "error_message": post.error_message,
                    "retry_count": post.retry_count,
                    "published_at": post.published_at.isoformat() if post.published_at else None,
                    "created_at": post.created_at.isoformat(),
                    "forum_posts_count": len(post.forum_post_ids)
                })
            
            return result
            
        except Exception:
            return []
