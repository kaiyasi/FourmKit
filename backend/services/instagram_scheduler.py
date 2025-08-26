"""
Instagram 排程服務
處理自動發送和定時任務
"""
import asyncio
import schedule
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any
import threading
import logging
import requests
import os
from sqlalchemy.orm import Session
from utils.db import get_session
from utils.ig_generator import InstagramCardGenerator
from models import (InstagramScheduler, InstagramQueue, InstagramPost, 
                   InstagramAccount, InstagramTemplate, Post)

logger = logging.getLogger(__name__)


class InstagramSchedulerService:
    def __init__(self):
        self.generator = InstagramCardGenerator()
        self.running = False
        self.scheduler_thread = None
        
    def start(self):
        """啟動排程服務"""
        if self.running:
            return
            
        self.running = True
        logger.info("Instagram 排程服務啟動")
        
        # 設定定時任務
        schedule.every().hour.do(self._check_count_triggers)
        schedule.every().day.at("00:00").do(self._check_time_triggers)
        schedule.every(10).minutes.do(self._process_queue)
        
        # 啟動背景執行緒
        self.scheduler_thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self.scheduler_thread.start()
        
    def stop(self):
        """停止排程服務"""
        self.running = False
        schedule.clear()
        logger.info("Instagram 排程服務停止")
    
    def _run_scheduler(self):
        """執行排程器主迴圈"""
        while self.running:
            try:
                schedule.run_pending()
                time.sleep(30)  # 每30秒檢查一次
            except Exception as e:
                logger.error(f"排程器執行錯誤: {e}")
                time.sleep(60)
    
    def _check_count_triggers(self):
        """檢查計數觸發的排程"""
        try:
            with get_session() as session:
                # 獲取所有計數觸發的活躍排程
                schedulers = session.query(InstagramScheduler).filter_by(
                    trigger_type='count',
                    is_active=True
                ).all()
                
                for scheduler in schedulers:
                    approved_count = self._get_approved_posts_count(session, scheduler)
                    
                    if approved_count >= scheduler.trigger_count:
                        logger.info(f"觸發計數排程 {scheduler.name}: {approved_count}篇貼文")
                        self._trigger_scheduler(session, scheduler)
                        
        except Exception as e:
            logger.error(f"檢查計數觸發失敗: {e}")
    
    def _check_time_triggers(self):
        """檢查時間觸發的排程"""
        try:
            current_time = datetime.now().strftime("%H:%M:%S")
            
            with get_session() as session:
                # 獲取所有時間觸發的活躍排程
                schedulers = session.query(InstagramScheduler).filter_by(
                    trigger_type='time',
                    is_active=True,
                    trigger_time=current_time[:5]  # 只比對小時:分鐘
                ).all()
                
                for scheduler in schedulers:
                    logger.info(f"觸發定時排程 {scheduler.name}")
                    self._trigger_scheduler(session, scheduler)
                    
        except Exception as e:
            logger.error(f"檢查時間觸發失敗: {e}")
    
    def _get_approved_posts_count(self, session: Session, scheduler: InstagramScheduler) -> int:
        """獲取待發送的已核准貼文數量"""
        query = session.query(Post).filter_by(status='approved')
        
        # 排除已經排入 IG 佇列的貼文
        existing_queue = session.query(InstagramQueue.post_id).filter(
            InstagramQueue.status.in_(['queued', 'processing'])
        ).subquery()
        query = query.filter(~Post.id.in_(existing_queue))
        
        # 學校過濾
        if scheduler.filter_school_only and scheduler.school_id:
            query = query.filter_by(school_id=scheduler.school_id)
        
        # 內容長度過濾
        if scheduler.filter_min_length:
            query = query.filter(func.length(Post.content) >= scheduler.filter_min_length)
        
        # 是否排除有媒體的貼文
        if scheduler.filter_exclude_media:
            query = query.filter(~Post.media.any())
        
        return query.count()
    
    def _trigger_scheduler(self, session: Session, scheduler: InstagramScheduler):
        """觸發排程，將貼文加入佇列"""
        try:
            # 獲取符合條件的貼文
            query = session.query(Post).filter_by(status='approved')
            
            # 排除已經排入 IG 佇列的貼文
            existing_queue = session.query(InstagramQueue.post_id).filter(
                InstagramQueue.status.in_(['queued', 'processing'])
            ).subquery()
            query = query.filter(~Post.id.in_(existing_queue))
            
            # 應用過濾條件
            if scheduler.filter_school_only and scheduler.school_id:
                query = query.filter_by(school_id=scheduler.school_id)
            
            if scheduler.filter_min_length:
                query = query.filter(func.length(Post.content) >= scheduler.filter_min_length)
            
            if scheduler.filter_exclude_media:
                query = query.filter(~Post.media.any())
            
            # 按時間排序，取最新的貼文
            limit = scheduler.trigger_count if scheduler.trigger_type == 'count' else 5
            posts = query.order_by(Post.created_at.desc()).limit(limit).all()
            
            if not posts:
                logger.info(f"排程 {scheduler.name} 沒有找到符合條件的貼文")
                return
            
            # 生成批次ID
            batch_id = f"batch_{scheduler.id}_{int(time.time())}"
            
            # 加入佇列
            for post in posts:
                queue_item = InstagramQueue(
                    post_id=post.id,
                    scheduler_id=scheduler.id,
                    batch_id=batch_id,
                    scheduled_at=datetime.utcnow()
                )
                session.add(queue_item)
            
            session.commit()
            logger.info(f"排程 {scheduler.name} 已將 {len(posts)} 篇貼文加入佇列")
            
        except Exception as e:
            logger.error(f"觸發排程失敗 {scheduler.name}: {e}")
            session.rollback()
    
    def _process_queue(self):
        """處理發送佇列"""
        try:
            with get_session() as session:
                # 獲取待處理的佇列項目
                queue_items = session.query(InstagramQueue).filter(
                    InstagramQueue.status == 'queued',
                    InstagramQueue.scheduled_at <= datetime.utcnow()
                ).limit(10).all()  # 一次處理最多10篇
                
                for item in queue_items:
                    try:
                        self._process_single_post(session, item)
                    except Exception as e:
                        logger.error(f"處理貼文 {item.post_id} 失敗: {e}")
                        self._handle_failed_item(session, item, str(e))
                
                session.commit()
                
        except Exception as e:
            logger.error(f"處理佇列失敗: {e}")
    
    def _process_single_post(self, session: Session, queue_item: InstagramQueue):
        """處理單篇貼文"""
        # 標記為處理中
        queue_item.status = 'processing'
        queue_item.processed_at = datetime.utcnow()
        session.commit()
        
        # 獲取相關資料
        post = session.get(Post, queue_item.post_id)
        scheduler = session.get(InstagramScheduler, queue_item.scheduler_id)
        account = session.get(InstagramAccount, scheduler.account_id)
        template = session.get(InstagramTemplate, scheduler.template_id)
        
        if not all([post, scheduler, account, template]):
            raise Exception("缺少必要的關聯資料")
        
        # 生成圖片
        image_bytes = self._generate_post_image(post, template)
        
        # 儲存圖片
        image_filename = f"ig_post_{post.id}_{int(time.time())}.png"
        image_path = os.path.join("uploads/instagram", image_filename)
        os.makedirs(os.path.dirname(image_path), exist_ok=True)
        
        with open(image_path, "wb") as f:
            f.write(image_bytes)
        
        # 建立 IG 貼文記錄
        ig_post = InstagramPost(
            post_id=post.id,
            account_id=account.id,
            template_id=template.id,
            generated_image_path=image_path,
            caption=self._generate_caption(post),
            hashtags=self._generate_hashtags(post),
            status='generated'
        )
        session.add(ig_post)
        
        # 發送到 Instagram (如果有 API Token)
        if account.access_token:
            try:
                self._publish_to_instagram(account, ig_post, image_bytes)
                ig_post.status = 'published'
                ig_post.published_at = datetime.utcnow()
            except Exception as e:
                logger.error(f"發送到 Instagram 失敗: {e}")
                ig_post.status = 'failed'
                ig_post.error_message = str(e)
        
        # 標記佇列項目完成
        queue_item.status = 'completed'
        session.commit()
        
        logger.info(f"成功處理貼文 {post.id}")
    
    def _generate_post_image(self, post: Post, template: InstagramTemplate) -> bytes:
        """生成貼文圖片"""
        template_config = {
            'background_color': template.background_color,
            'text_color': template.text_color,
            'accent_color': template.accent_color,
            'title_font': template.title_font,
            'content_font': template.content_font,
            'title_size': template.title_size,
            'content_size': template.content_size,
            'watermark_text': template.watermark_text
        }
        
        school_name = post.school.name if post.school else ""
        school_logo_path = post.school.logo_path if post.school else ""
        
        return self.generator.generate_card(
            content=post.content,
            template_config=template_config,
            school_name=school_name,
            school_logo_path=school_logo_path,
            post_id=post.id
        )
    
    def _generate_caption(self, post: Post) -> str:
        """生成 IG 貼文說明"""
        # 從 HTML 內容提取純文字
        from utils.ig_generator import InstagramCardGenerator
        generator = InstagramCardGenerator()
        clean_text = generator._clean_html_content(post.content)
        
        # 限制長度
        if len(clean_text) > 200:
            clean_text = clean_text[:197] + "..."
        
        # 添加平台標識
        caption = f"{clean_text}\n\n"
        
        if post.school:
            caption += f"📍 {post.school.name}\n"
        
        caption += "💬 ForumKit 校園匿名討論平台\n"
        caption += "#校園生活 #匿名討論 #ForumKit"
        
        return caption
    
    def _generate_hashtags(self, post: Post) -> str:
        """生成標籤"""
        hashtags = ["#校園生活", "#匿名討論", "#ForumKit"]
        
        if post.school:
            # 添加學校相關標籤
            school_name = post.school.name
            if "大學" in school_name:
                hashtags.append(f"#{school_name.replace('國立', '').replace('私立', '')}")
        
        # 根據內容添加相關標籤
        content_lower = post.content.lower()
        if any(word in content_lower for word in ["考試", "期中", "期末"]):
            hashtags.append("#考試")
        if any(word in content_lower for word in ["課程", "選課", "上課"]):
            hashtags.append("#課程")
        if any(word in content_lower for word in ["住宿", "宿舍"]):
            hashtags.append("#宿舍生活")
        
        return " ".join(hashtags[:10])  # 限制標籤數量
    
    def _publish_to_instagram(self, account: InstagramAccount, ig_post: InstagramPost, image_bytes: bytes):
        """發送到 Instagram"""
        # 注意：這裡需要 Instagram Basic Display API 或 Instagram Graph API
        # 以下是基本的 API 呼叫範例
        
        if not account.access_token or not account.account_id:
            raise Exception("Instagram API 認證資訊不完整")
        
        # 1. 上傳圖片到 Instagram
        upload_url = f"https://graph.facebook.com/v18.0/{account.account_id}/media"
        
        files = {
            'image': ('post.png', image_bytes, 'image/png')
        }
        
        data = {
            'caption': ig_post.caption,
            'access_token': account.access_token
        }
        
        response = requests.post(upload_url, files=files, data=data)
        response.raise_for_status()
        
        upload_result = response.json()
        creation_id = upload_result.get('id')
        
        if not creation_id:
            raise Exception("圖片上傳失敗")
        
        # 2. 發布貼文
        publish_url = f"https://graph.facebook.com/v18.0/{account.account_id}/media_publish"
        
        publish_data = {
            'creation_id': creation_id,
            'access_token': account.access_token
        }
        
        publish_response = requests.post(publish_url, data=publish_data)
        publish_response.raise_for_status()
        
        publish_result = publish_response.json()
        
        # 更新貼文資訊
        ig_post.instagram_media_id = publish_result.get('id')
        
        # 獲取貼文連結（可選）
        if ig_post.instagram_media_id:
            media_url = f"https://graph.facebook.com/v18.0/{ig_post.instagram_media_id}"
            media_params = {
                'fields': 'permalink',
                'access_token': account.access_token
            }
            
            try:
                media_response = requests.get(media_url, params=media_params)
                media_response.raise_for_status()
                media_data = media_response.json()
                ig_post.instagram_permalink = media_data.get('permalink')
            except:
                pass  # 獲取連結失敗不影響主要流程
    
    def _handle_failed_item(self, session: Session, item: InstagramQueue, error_msg: str):
        """處理失敗的佇列項目"""
        item.attempts += 1
        
        if item.attempts >= item.max_attempts:
            item.status = 'failed'
            logger.error(f"佇列項目 {item.id} 達到最大嘗試次數，標記為失敗")
        else:
            item.status = 'queued'
            # 延遲重試
            item.scheduled_at = datetime.utcnow() + timedelta(minutes=30 * item.attempts)
            logger.info(f"佇列項目 {item.id} 將在 {item.scheduled_at} 重試")
        
        session.commit()
    
    def trigger_manual_send(self, scheduler_id: int, post_ids: List[int]) -> Dict[str, Any]:
        """手動觸發發送"""
        try:
            with get_session() as session:
                scheduler = session.get(InstagramScheduler, scheduler_id)
                if not scheduler:
                    return {"success": False, "error": "排程不存在"}
                
                batch_id = f"manual_{scheduler_id}_{int(time.time())}"
                
                for post_id in post_ids:
                    queue_item = InstagramQueue(
                        post_id=post_id,
                        scheduler_id=scheduler_id,
                        batch_id=batch_id,
                        scheduled_at=datetime.utcnow()
                    )
                    session.add(queue_item)
                
                session.commit()
                
                return {
                    "success": True,
                    "batch_id": batch_id,
                    "queued_count": len(post_ids)
                }
                
        except Exception as e:
            return {"success": False, "error": str(e)}


# 全局服務實例
instagram_scheduler_service = InstagramSchedulerService()


# 啟動函數
def start_instagram_scheduler():
    """啟動 Instagram 排程服務"""
    instagram_scheduler_service.start()


def stop_instagram_scheduler():
    """停止 Instagram 排程服務"""
    instagram_scheduler_service.stop()