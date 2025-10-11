# backend/services/auto_publisher.py
"""
自動化發布服務 - 重新設計
處理論壇貼文審核通過後的自動發布流程
支援定時發布和定量觸發的輪播發布
"""
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone, timedelta
import uuid
import logging
import os
from celery import Celery

from utils.db import get_session
from sqlalchemy import func
from sqlalchemy.orm import joinedload
from models.social_publishing import (
    SocialAccount, ContentTemplate, CarouselGroup, SocialPost,
    PlatformType, AccountStatus, PublishTrigger, PostStatus
)
from models.base import Post as ForumPost
from services.content_generator import ContentGenerator, ContentGenerationError
from services.platform_publishers import get_platform_publisher
from services.celery_app import celery_app
from services import monitoring

logger = logging.getLogger(__name__)

class AutoPublishError(Exception):
    """自動發布錯誤"""
    pass

class AutoPublisher:
    """自動化發布管理器"""
    
    def __init__(self):
        self.content_generator = ContentGenerator()
    
    def process_approved_post(self, forum_post: ForumPost) -> Dict[str, any]:
        """
        處理審核通過的論壇貼文
        根據關聯的社交帳號設定決定發布策略
        """
        try:
            results = []
            
            with get_session() as db:
                # 查找與此貼文相關的活躍社交帳號
                accounts = self._find_relevant_accounts(forum_post, db)
                
                for account in accounts:
                    try:
                        result = self._process_post_for_account(forum_post, account, db)
                        results.append(result)
                    except Exception as e:
                        logger.error(f"處理帳號 {account.id} 失敗: {e}")
                        results.append({
                            'account_id': account.id,
                            'success': False,
                            'error': str(e)
                        })
                
                return {
                    'success': len([r for r in results if r.get('success')]) > 0,
                    'processed_accounts': len(results),
                    'results': results
                }
                
        except Exception as e:
            logger.error(f"處理審核通過貼文失敗: {e}")
            raise AutoPublishError(f"處理審核通過貼文失敗: {str(e)}")
    
    def _find_relevant_accounts(self, forum_post: ForumPost, db) -> List[SocialAccount]:
        """查找與貼文相關的社交帳號"""
        query = db.query(SocialAccount).filter(
            SocialAccount.status == AccountStatus.ACTIVE
        )

        # **修復**: 處理跨校公告邏輯
        is_announcement = getattr(forum_post, 'is_announcement', False)
        announcement_type = getattr(forum_post, 'announcement_type', None)

        if is_announcement and announcement_type == 'cross':
            # 跨校公告：發布到所有活躍帳號，不論學校
            logger.info(f"貼文 {forum_post.id} 為跨校公告，發布到所有活躍帳號")
            return query.all()
        elif forum_post.school_id:
            # 一般貼文或校內公告：匹配學校帳號
            query = query.filter(
                (SocialAccount.school_id == forum_post.school_id) |
                (SocialAccount.school_id.is_(None))  # 全域帳號
            )

        return query.all()
    
    def _process_post_for_account(
        self, 
        forum_post: ForumPost, 
        account: SocialAccount, 
        db
    ) -> Dict[str, any]:
        """為特定帳號處理貼文"""
        try:
            # 獲取預設模板
            template = self._get_default_template(account, db)
            if not template:
                return {
                    'account_id': account.id,
                    'success': False,
                    'error': '找不到可用的內容模板'
                }
            
            # 創建社交媒體發文記錄
            social_post = SocialPost(
                account_id=account.id,
                forum_post_id=forum_post.id,
                template_id=template.id,
                status=PostStatus.PENDING
            )
            
            db.add(social_post)
            db.commit()
            db.refresh(social_post)
            
            # 根據發布觸發條件決定處理方式
            if account.publish_trigger == PublishTrigger.IMMEDIATE:
                # 立即發布
                result = self._immediate_publish(social_post, db)
            elif account.publish_trigger == PublishTrigger.BATCH_COUNT:
                # 加入批次佇列
                result = self._add_to_batch_queue(social_post, account, db)
            elif account.publish_trigger == PublishTrigger.SCHEDULED:
                # 加入定時佇列
                result = self._add_to_scheduled_queue(social_post, account, db)
            else:
                raise AutoPublishError(f"不支援的發布觸發條件: {account.publish_trigger}")
            
            result['account_id'] = account.id
            result['social_post_id'] = social_post.id
            return result
            
        except Exception as e:
            logger.error(f"處理帳號 {account.id} 的貼文失敗: {e}")
            if 'social_post' in locals():
                social_post.status = PostStatus.FAILED
                social_post.error_message = str(e)
                db.commit()
            raise
    
    def _get_default_template(self, account: SocialAccount, db) -> Optional[ContentTemplate]:
        """獲取帳號的預設模板 - 強制要求明確配置，不使用回退機制"""
        if not account.default_template_id:
            raise ValueError(f"帳號 {account.platform_username} 未設定 default_template_id，必須明確指定模板，不可使用回退機制")

        template = db.query(ContentTemplate).filter(
            ContentTemplate.id == account.default_template_id,
            ContentTemplate.is_active == True
        ).first()

        if not template:
            raise ValueError(f"帳號 {account.platform_username} 指定的模板 ID {account.default_template_id} 不存在或未啟用")

        return template
    
    def _immediate_publish(self, social_post: SocialPost, db) -> Dict[str, any]:
        """立即發布"""
        try:
            # 更新狀態為處理中
            social_post.status = PostStatus.PROCESSING
            db.commit()
            
            # 提交到 Celery 任務佇列
            task = publish_single_post.delay(social_post.id)
            
            return {
                'success': True,
                'publish_type': 'immediate',
                'task_id': task.id,
                'message': '已提交立即發布任務'
            }
            
        except Exception as e:
            social_post.status = PostStatus.FAILED
            social_post.error_message = str(e)
            db.commit()
            raise
    
    def _add_to_batch_queue(self, social_post: SocialPost, account: SocialAccount, db) -> Dict[str, any]:
        """加入批次佇列"""
        try:
            # 預先生成內容（先生成，失敗則不計入群組，避免膨脹 collected_count）
            try:
                self._generate_post_content_with_retry(social_post, db, max_retries=2)
            except Exception as ge:
                # 單篇生成失敗，直接標記失敗並寫入錯誤，避免拖累整個群組
                social_post.status = PostStatus.FAILED
                social_post.error_message = f"內容預生成失敗: {str(ge)}"
                db.commit()
                # 繼續流程讓呼叫端能看到隊列統計，但不計入群組數量
                return {
                    'success': False,
                    'publish_type': 'batch_queued',
                    'carousel_group_id': None,
                    'current_count': None,
                    'target_count': account.batch_size,
                    'message': '單篇內容生成失敗，已標記該貼文為失敗，不納入輪播'
                }

            # 查找或創建當前的輪播群組（非鎖）
            carousel_group = self._get_or_create_carousel_group(account, db)

            # 進入關鍵區（鎖住群組行，避免併發錯位與重複觸發）
            locked_group = (
                db.query(CarouselGroup)
                  .filter(CarouselGroup.id == carousel_group.id)
                  .with_for_update()
                  .first()
            )
            if not locked_group:
                # group 瞬間被刪或不存在，重取一次
                carousel_group = self._get_or_create_carousel_group(account, db)
                locked_group = (
                    db.query(CarouselGroup)
                      .filter(CarouselGroup.id == carousel_group.id)
                      .with_for_update()
                      .first()
                )

            # 設定貼文隊列資訊與位置（使用鎖後的 collected_count）
            next_pos = int(locked_group.collected_count or 0)
            social_post.carousel_group_id = locked_group.id
            social_post.position_in_carousel = next_pos
            social_post.status = PostStatus.QUEUED

            # 更新群組統計（原子：在鎖內增量）
            locked_group.collected_count = next_pos + 1
            db.commit()

            # 檢查是否達到發布閾值（仍在鎖內狀態下讀取最新資料）
            current_count = int(locked_group.collected_count or 0)
            if current_count >= int(account.batch_size or 0):
                # 準備檢查實際可用圖片數（離鎖前操作查詢）
                ready_items = db.query(SocialPost).filter(
                    SocialPost.carousel_group_id == locked_group.id,
                    SocialPost.status != PostStatus.FAILED,
                    SocialPost.generated_image_url.isnot(None)
                ).count()

                if getattr(locked_group, 'status', 'collecting') == 'collecting' and ready_items >= 2:
                    # 標記為 queued（單一寫入，避免多次觸發）
                    locked_group.status = 'queued'
                    db.commit()
                    # 解鎖後觸發 Celery（避免持鎖時間過長）
                    task = publish_carousel.delay(locked_group.id)
                    return {
                        'success': True,
                        'publish_type': 'batch_triggered',
                        'carousel_group_id': locked_group.id,
                        'task_id': task.id,
                        'message': f'已達到批次閾值({account.batch_size})，觸發輪播發布'
                    }
                else:
                    return {
                        'success': True,
                        'publish_type': 'batch_wait_images',
                        'carousel_group_id': locked_group.id,
                        'current_count': current_count,
                        'target_count': account.batch_size,
                        'message': '已達到數量但圖片尚未齊備，稍後由定時任務再嘗試'
                    }

            # 未達閾值
            return {
                'success': True,
                'publish_type': 'batch_queued',
                'carousel_group_id': locked_group.id,
                'current_count': current_count,
                'target_count': account.batch_size,
                'message': f'已加入批次佇列 ({current_count}/{account.batch_size})'
            }
                
        except Exception as e:
            social_post.status = PostStatus.FAILED
            social_post.error_message = str(e)
            db.commit()
            raise
    
    def _add_to_scheduled_queue(self, social_post: SocialPost, account: SocialAccount, db) -> Dict[str, any]:
        """加入定時佇列"""
        try:
            # 計算下次發布時間
            next_publish_time = self._calculate_next_publish_time(account)
            
            # 查找或創建定時輪播群組
            carousel_group = self._get_or_create_scheduled_carousel_group(account, next_publish_time, db)
            
            # 將貼文加入輪播群組
            social_post.carousel_group_id = carousel_group.id
            social_post.position_in_carousel = carousel_group.collected_count
            social_post.status = PostStatus.QUEUED
            social_post.scheduled_at = next_publish_time
            
            # 更新群組統計
            carousel_group.collected_count += 1
            
            db.commit()
            
            return {
                'success': True,
                'publish_type': 'scheduled',
                'carousel_group_id': carousel_group.id,
                'scheduled_at': next_publish_time.isoformat(),
                'message': f'已加入定時佇列，預計發布時間: {next_publish_time.strftime("%Y-%m-%d %H:%M")}'
            }
            
        except Exception as e:
            social_post.status = PostStatus.FAILED
            social_post.error_message = str(e)
            db.commit()
            raise
    
    def _get_or_create_carousel_group(self, account: SocialAccount, db) -> CarouselGroup:
        """獲取或創建當前的輪播群組"""
        # 查找當前正在收集的群組
        existing_group = db.query(CarouselGroup).filter(
            CarouselGroup.account_id == account.id,
            CarouselGroup.status == 'collecting'
        ).first()
        
        if existing_group:
            return existing_group
        
        # 創建新群組
        group_id = f"batch_{account.id}_{int(datetime.now().timestamp())}"
        new_group = CarouselGroup(
            group_id=group_id,
            account_id=account.id,
            title=f"批次發布 - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            target_count=account.batch_size,
            status='collecting'
        )
        
        db.add(new_group)
        db.commit()
        db.refresh(new_group)
        
        return new_group
    
    def _get_or_create_scheduled_carousel_group(
        self, 
        account: SocialAccount, 
        publish_time: datetime, 
        db
    ) -> CarouselGroup:
        """獲取或創建定時輪播群組"""
        # 查找指定時間的群組
        existing_group = db.query(CarouselGroup).filter(
            CarouselGroup.account_id == account.id,
            CarouselGroup.scheduled_at == publish_time,
            CarouselGroup.status == 'collecting'
        ).first()
        
        if existing_group:
            return existing_group
        
        # 創建新群組
        group_id = f"scheduled_{account.id}_{int(publish_time.timestamp())}"
        new_group = CarouselGroup(
            group_id=group_id,
            account_id=account.id,
            title=f"定時發布 - {publish_time.strftime('%Y-%m-%d %H:%M')}",
            target_count=999,  # 定時發布沒有數量限制
            status='collecting',
            scheduled_at=publish_time
        )
        
        db.add(new_group)
        db.commit()
        db.refresh(new_group)
        
        return new_group
    
    def _calculate_next_publish_time(self, account: SocialAccount) -> datetime:
        """計算下次發布時間"""
        now = datetime.now(timezone.utc)
        target_hour = account.schedule_hour or 12  # 預設中午 12 點
        
        # 計算今天的目標時間
        today_target = now.replace(hour=target_hour, minute=0, second=0, microsecond=0)
        
        if now < today_target:
            # 今天還沒到發布時間
            return today_target
        else:
            # 今天已過發布時間，改為明天
            return today_target + timedelta(days=1)

    def _ensure_group_images(self, db, carousel_group_id: int, limit: int = 5) -> int:
        """嘗試為群組內缺圖的貼文補生成圖片，返回成功補上的數量（單次最多 limit 筆）。"""
        fixed = 0
        try:
            q = db.query(SocialPost).filter(
                SocialPost.carousel_group_id == carousel_group_id,
                ~SocialPost.status.in_(["failed", "published"]),
                SocialPost.generated_image_url.is_(None)
            ).order_by(SocialPost.position_in_carousel).limit(max(1, limit))
            items = q.all()
            if not items:
                return 0
            gen = ContentGenerator()
            for post in items:
                try:
                    content = gen.generate_content(post.forum_post, post.template)
                    post.generated_image_url = content.get('image_url')
                    post.generated_caption = content.get('caption')
                    post.hashtags = content.get('hashtags', [])
                    post.updated_at = datetime.now(timezone.utc)
                    fixed += 1 if post.generated_image_url else 0
                except Exception as ge:
                    post.error_message = f"補圖失敗: {str(ge)}"
                    post.updated_at = datetime.now(timezone.utc)
            db.commit()
        except Exception:
            db.rollback()
        return fixed

    def _generate_post_content_with_retry(self, social_post: SocialPost, db, max_retries: int = 2):
        """預先為單篇貼文生成內容（圖片+文案），帶重試以提高穩定性"""
        last_err: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                generator = ContentGenerator()
                content = generator.generate_content(social_post.forum_post, social_post.template)
                social_post.generated_image_url = content.get('image_url')
                social_post.generated_caption = content.get('caption')
                social_post.hashtags = content.get('hashtags', [])

                # 儲存多張圖片資訊
                image_urls = content.get('image_urls', [])
                if len(image_urls) > 1:
                    social_post.generated_image_urls = ','.join(image_urls)

                if not social_post.generated_image_url:
                    raise ContentGenerationError('生成圖片為空')
                social_post.updated_at = datetime.now(timezone.utc)
                db.commit()
                return
            except Exception as e:
                last_err = e
                try:
                    social_post.error_message = f"預生成失敗(第{attempt+1}次): {str(e)}"
                    social_post.updated_at = datetime.now(timezone.utc)
                    db.commit()
                except Exception:
                    db.rollback()
        # 全部嘗試失敗
        raise last_err if last_err else ContentGenerationError('未知的內容生成錯誤')

# Celery 任務
@celery_app.task(bind=True, max_retries=3)
def publish_single_post(self, social_post_id: int):
    """發布單一貼文的 Celery 任務"""
    try:
        with get_session() as db:
            social_post = db.query(SocialPost).filter(SocialPost.id == social_post_id).first()
            if not social_post:
                raise AutoPublishError(f"找不到社交貼文 ID: {social_post_id}")
            try:
                monitoring.mark_worker_seen('worker')
                monitoring.record_event('single_post_start', social_post_id=int(social_post_id))
            except Exception:
                pass
            
            # 使用修復後的 IG 統一系統
            from services.ig_unified_system import IGUnifiedSystem

            ig_system = IGUnifiedSystem()

            # 生成圖片和內容
            try:
                template_config = ig_system.get_template_config(social_post.template.id)
                content_data = ig_system.get_content_data(
                    social_post.forum_post_id,
                    getattr(social_post, 'custom_caption', ''),
                    getattr(social_post, 'hashtags', [])
                )
                logo_url = ig_system.get_logo_url(social_post.account.id, template_config)

                # 獲取原始模板數據以支持獨立的時間戳和貼文ID設定
                instagram_template_data = social_post.template.config if social_post.template.config else {}

                render_result = ig_system.template_engine.render_to_image(
                    template_config, content_data, logo_url, instagram_template_data
                )

                if not render_result.success:
                    raise AutoPublishError(f"圖片生成失敗: {render_result.error_message}")

                # 更新生成的內容
                social_post.generated_image_url = render_result.image_url
                social_post.generated_caption = content_data.content
                social_post.hashtags = getattr(social_post, 'hashtags', [])

            except Exception as e:
                raise AutoPublishError(f"內容生成失敗: {str(e)}")

            # 目前只支援單張圖片，直接發布
            db.commit()  # 保存生成的內容

            # 發布到平台
            publisher = get_platform_publisher(social_post.account.platform)
            publish_result = publisher.publish_single_post(
                account=social_post.account,
                image_url=social_post.generated_image_url,
                caption=social_post.generated_caption,
                hashtags=social_post.hashtags
            )

            # 檢查發布是否成功
            if not publish_result.get('success', False):
                error_msg = publish_result.get('error', '發布失敗，未取得錯誤訊息')
                raise AutoPublishError(f"Instagram 發布失敗: {error_msg}")

            # 檢查是否有真正的貼文 ID
            post_id = publish_result.get('post_id')
            if not post_id:
                raise AutoPublishError("發布回應成功但未取得 Instagram 貼文 ID")

            # 更新發布結果
            social_post.platform_post_id = post_id
            social_post.platform_post_url = publish_result.get('post_url')
            social_post.status = PostStatus.PUBLISHED
            social_post.published_at = datetime.now(timezone.utc)
            
            # 更新帳號統計
            social_post.account.total_posts += 1
            social_post.account.last_post_at = datetime.now(timezone.utc)
            
            db.commit()
            try:
                monitoring.record_event('single_post_done', social_post_id=int(social_post_id), post_id=social_post.platform_post_id)
            except Exception:
                pass
            
            return {
                'success': True,
                'social_post_id': social_post_id,
                'platform_post_id': social_post.platform_post_id,
                'platform_post_url': social_post.platform_post_url
            }
            
    except Exception as e:
        logger.error(f"發布單一貼文失敗: {e}")
        
        # 更新錯誤狀態
        with get_session() as db:
            social_post = db.query(SocialPost).filter(SocialPost.id == social_post_id).first()
            if social_post:
                social_post.status = PostStatus.FAILED
                social_post.error_message = str(e)
                social_post.retry_count += 1
                db.commit()
        try:
            monitoring.record_event('single_post_failed', social_post_id=int(social_post_id), error=str(e))
        except Exception:
            pass
        
        # 重試邏輯
        if self.request.retries < self.max_retries:
            countdown = 2 ** self.request.retries * 60  # 指數退避
            raise self.retry(countdown=countdown, exc=e)
        
        raise

@celery_app.task(bind=True, max_retries=3)
def publish_carousel(self, carousel_group_id: int):
    """發布輪播貼文的 Celery 任務"""
    try:
        with get_session() as db:
            carousel_group = db.query(CarouselGroup).filter(
                CarouselGroup.id == carousel_group_id
            ).first()
            
            if not carousel_group:
                raise AutoPublishError(f"找不到輪播群組 ID: {carousel_group_id}")
            # 併發保護：第一時間標記為 publishing，避免重複觸發
            try:
                if getattr(carousel_group, 'status', 'collecting') != 'publishing':
                    carousel_group.status = 'publishing'
                    db.commit()
            except Exception:
                db.rollback()
            
            # 獲取群組中的所有貼文
            # 注意：狀態欄位為 String(16)，避免 Enum 比對不一致，使用字串比對
            from sqlalchemy.orm import joinedload
            posts = db.query(SocialPost).options(
                joinedload(SocialPost.template),
                joinedload(SocialPost.forum_post)
            ).filter(
                SocialPost.carousel_group_id == carousel_group_id,
                ~SocialPost.status.in_(["failed", "published"])  # 只要不是失敗/已發布都納入處理
            ).order_by(SocialPost.position_in_carousel).all()
            
            if not posts:
                raise AutoPublishError("輪播群組中沒有待發布的貼文")

            # 為每個貼文確認內容；若尚未生成才補生成
            try:
                monitoring.mark_worker_seen('worker')
                monitoring.record_event('carousel_start', carousel_group_id=int(carousel_group_id))
            except Exception:
                pass
            carousel_items = []
            for post in posts:
                try:
                    # 將狀態標記為 processing
                    post.status = PostStatus.PROCESSING
                    post.updated_at = datetime.now(timezone.utc)
                    db.commit()

                    # 若尚未有圖，再嘗試生成一次
                    if not post.generated_image_url:
                        generator = ContentGenerator()
                        content = generator.generate_content(post.forum_post, post.template)
                        post.generated_image_url = content.get('image_url')
                        post.generated_caption = content.get('caption')
                        post.hashtags = content.get('hashtags', [])

                        # 儲存多張圖片資訊（新功能：支援用戶附件 + 文字圖片）
                        image_urls = content.get('image_urls', [])
                        if len(image_urls) > 1:
                            # 如果有多張圖片，把額外的圖片資訊暫存
                            post.generated_image_urls = ','.join(image_urls)  # 暫時用逗號分隔儲存

                    # 嚴格驗證圖片是否生成成功（輪播至少需要圖片）
                    if not post.generated_image_url:
                        post.status = PostStatus.FAILED
                        post.error_message = '內容生成缺少圖片，無法加入輪播'
                        post.updated_at = datetime.now(timezone.utc)
                        db.commit()
                        continue

                    # 處理多張圖片：為每張圖片建立輪播項目
                    image_urls = []
                    if hasattr(post, 'generated_image_urls') and post.generated_image_urls:
                        image_urls = post.generated_image_urls.split(',')
                    elif post.generated_image_url:
                        image_urls = [post.generated_image_url]

                    # 為每張圖片建立輪播項目
                    for i, image_url in enumerate(image_urls):
                        carousel_items.append({
                            'image_url': image_url,
                            'caption': post.generated_caption if i == 0 else ''  # 只有第一張圖片有文案
                        })
                    
                except Exception as e:
                    logger.error(f"生成貼文 {post.id} 內容失敗: {e}")
                    post.status = PostStatus.FAILED
                    post.error_message = str(e)
                    db.commit()
                    continue
            
            if not carousel_items:
                raise AutoPublishError("沒有成功生成內容的貼文")
            # Instagram 輪播至少 2 項，否則直接標記失敗
            if len(carousel_items) < 2:
                raise AutoPublishError("輪播項目不足（至少 2 張圖片）")
            
            # 組合輪播文案
            combined_caption = _combine_carousel_captions(posts)
            combined_hashtags = _combine_carousel_hashtags(posts)
            
            # 發布輪播到平台
            publisher = get_platform_publisher(carousel_group.account.platform)
            publish_result = publisher.publish_carousel(
                account=carousel_group.account,
                items=carousel_items,
                caption=combined_caption,
                hashtags=combined_hashtags
            )

            # 檢查發布是否成功
            if not publish_result.get('success', False):
                error_msg = publish_result.get('error', '發布失敗，未取得錯誤訊息')
                raise AutoPublishError(f"Instagram 發布失敗: {error_msg}")

            # 檢查是否有真正的貼文 ID
            post_id = publish_result.get('post_id')
            if not post_id:
                raise AutoPublishError("發布回應成功但未取得 Instagram 貼文 ID")

            # 更新群組和貼文狀態
            carousel_group.platform_post_id = post_id
            carousel_group.platform_post_url = publish_result.get('post_url')
            carousel_group.status = 'published'
            carousel_group.published_at = datetime.now(timezone.utc)
            
            # 更新所有貼文狀態
            for post in posts:
                if post.status == PostStatus.PROCESSING:
                    post.status = PostStatus.PUBLISHED
                    post.platform_post_id = post_id
                    post.platform_post_url = publish_result.get('post_url')
                    now_ts = datetime.now(timezone.utc)
                    post.published_at = now_ts
                    post.updated_at = now_ts
            
            # 更新帳號統計
            carousel_group.account.total_posts += 1
            carousel_group.account.last_post_at = datetime.now(timezone.utc)
            
            db.commit()
            try:
                monitoring.record_event('carousel_done', carousel_group_id=int(carousel_group_id), post_id=carousel_group.platform_post_id)
            except Exception:
                pass
            
            return {
                'success': True,
                'carousel_group_id': carousel_group_id,
                'platform_post_id': carousel_group.platform_post_id,
                'platform_post_url': carousel_group.platform_post_url,
                'published_count': len([p for p in posts if p.status == PostStatus.PUBLISHED])
            }
            
    except Exception as e:
        logger.error(f"發布輪播失敗: {e}")
        
        # 更新錯誤狀態
        with get_session() as db:
            carousel_group = db.query(CarouselGroup).filter(
                CarouselGroup.id == carousel_group_id
            ).first()
            if carousel_group:
                carousel_group.status = 'failed'
                # 將群組內仍在 queued/processing 的貼文一併標記失敗，寫入錯誤訊息
                try:
                    affected = db.query(SocialPost).filter(
                        SocialPost.carousel_group_id == carousel_group_id,
                        SocialPost.status.in_(["queued", "processing"])
                    ).all()
                    for p in affected:
                        p.status = PostStatus.FAILED
                        p.error_message = f"輪播發布失敗: {str(e)}"
                    db.commit()
                except Exception:
                    db.rollback()
                    db.commit()
        try:
            monitoring.record_event('carousel_failed', carousel_group_id=int(carousel_group_id), error=str(e))
        except Exception:
            pass
        
        # 重試邏輯
        if self.request.retries < self.max_retries:
            countdown = 2 ** self.request.retries * 60
            raise self.retry(countdown=countdown, exc=e)
        
        raise


def _combine_carousel_captions(posts: List[SocialPost]) -> str:
    """組合輪播貼文的文案 - 必須使用模板配置，不允許回退"""
    if not posts:
        raise ValueError("輪播貼文列表為空")

    try:
        # 獲取模板配置（使用第一個貼文的模板）
        first_post = posts[0]
        logger.info(f"檢查輪播貼文模板: post_id={first_post.id}, template_id={first_post.template_id}")

        if not first_post.template:
            raise ValueError(f"貼文 {first_post.id} 缺少必要的模板配置")

        template_config = first_post.template.config
        multipost_config = template_config.get('multipost', {})
        caption_cfg = template_config.get('caption', {}) or {}
        logger.info(f"模板配置: multipost_config={multipost_config}")

        # 檢查是否使用 multipost 格式
        if multipost_config and multipost_config.get('template') and '{id}' in multipost_config.get('template', ''):
            return _generate_multipost_caption(posts, multipost_config)
        # 新版 caption 結構：以 caption.repeating/single/hashtags 合成整體輪播文案
        elif isinstance(caption_cfg, dict) and caption_cfg.get('repeating'):
            return _generate_carousel_caption_newstyle(posts, caption_cfg)
        else:
            raise ValueError("模板缺少有效的文案生成配置（multipost 或 caption.repeating）")

    except ValueError:
        # 重新拋出 ValueError，不進行回退
        raise
    except Exception as e:
        logger.error(f"組合輪播文案失敗: {e}")
        raise ValueError(f"文案生成失敗: {str(e)}")

def _generate_carousel_caption_newstyle(posts: List[SocialPost], cap_cfg: Dict) -> str:
    """使用新版 caption 結構合併多篇輪播文案：
    - 單次 header（first）
    - 重複 repeating（每篇）
    - 單次 footer（last）
    - 單次 hashtags
    """
    def replace_placeholders(text: str, post: SocialPost) -> str:
        if not text:
            return ''
        fp = post.forum_post
        sample = {
            'id': str(getattr(fp, 'id', '') or ''),
            'content': str(getattr(fp, 'content', '') or ''),
            'author': str(getattr(fp, 'author', None).username if getattr(fp, 'author', None) else '匿名'),
            'title': str(getattr(fp, 'title', '') or ''),
            'school_name': str(getattr(fp, 'school', None).name if getattr(fp, 'school', None) else '')
        }
        out = str(text)
        for k, v in sample.items():
            out = out.replace('{' + k + '}', v)
        return out

    parts: List[str] = []

    single = cap_cfg.get('single', {}) or {}
    header = single.get('header', {}) or {}
    footer = single.get('footer', {}) or {}
    repeating = cap_cfg.get('repeating', {}) or {}

    # Header once
    if header.get('enabled') and header.get('content'):
        parts.append(replace_placeholders(header.get('content', ''), posts[0]))

    # Repeating for each post
    for idx, post in enumerate(posts):
        rep_sections: List[str] = []
        id_fmt = repeating.get('idFormat', {}) or {}
        if id_fmt.get('enabled') and id_fmt.get('format'):
            rep_sections.append(replace_placeholders(id_fmt.get('format', ''), post))
        rep_content = repeating.get('content', {}) or {}
        if rep_content.get('enabled') and rep_content.get('template'):
            rep_sections.append(replace_placeholders(rep_content.get('template', ''), post))
        sep = repeating.get('separator', {}) or {}
        if sep.get('enabled') and sep.get('style'):
            rep_sections.append(sep.get('style'))
        if rep_sections:
            parts.append('\n'.join([s for s in rep_sections if str(s).strip()]))

    # Footer once
    if footer.get('enabled') and footer.get('content'):
        parts.append(replace_placeholders(footer.get('content', ''), posts[-1]))

    # Hashtags once（使用模板內設定；平台層再附加帳號/貼文標籤）
    try:
        hashtags_cfg = cap_cfg.get('hashtags', {}) or {}
        if hashtags_cfg.get('enabled') and hashtags_cfg.get('tags'):
            max_tags = int(hashtags_cfg.get('maxTags', len(hashtags_cfg.get('tags'))))
            tags = [t for t in hashtags_cfg.get('tags') if str(t).strip()][:max_tags]
            if tags:
                parts.append(' '.join(tags))
    except Exception:
        pass

    # 清理空行
    try:
        lines = [ln.rstrip() for ln in '\n\n'.join([p for p in parts if str(p).strip()]).splitlines()]
        cleaned: List[str] = []
        empty = 0
        for ln in lines:
            if ln.strip() == '':
                empty += 1
                if empty <= 1:
                    cleaned.append('')
            else:
                empty = 0
                cleaned.append(ln)
        while cleaned and cleaned[0] == '':
            cleaned.pop(0)
        while cleaned and cleaned[-1] == '':
            cleaned.pop()
        return '\n'.join(cleaned)
    except Exception:
        return '\n\n'.join([p for p in parts if str(p).strip()])

def _generate_multipost_caption(posts: List[SocialPost], multipost_config: Dict) -> str:
    """使用 multipost 模板格式生成輪播文案"""
    result = ""

    # 1. 開頭固定內容（只顯示一次）
    if multipost_config.get('prefix'):
        result += multipost_config['prefix'] + '\n'

    # 2. 重複每篇貼文內容
    template = multipost_config.get('template', '{id}\n{content}\n-----------------')
    id_format = multipost_config.get('idFormat', {})

    for post in posts:
        try:
            # 格式化 ID
            formatted_id = _format_post_id(post.forum_post_id, id_format)

            # 格式化單篇內容
            post_content = template.format(
                id=formatted_id,
                content=getattr(post.forum_post, 'content', '無內容') if post.forum_post else '無內容',
                title=getattr(post.forum_post, 'title', '無標題') if post.forum_post else '無標題',
                author=getattr(post.forum_post, 'author', '匿名用戶') if post.forum_post else '匿名用戶'
            )
            result += post_content

            # 如果不是最後一篇且模板沒有換行，自動加換行
            if post != posts[-1] and not template.endswith('\n'):
                result += '\n'
        except Exception as e:
            logger.error(f"格式化貼文 {post.id} 失敗: {e}")
            continue

    # 3. 結尾固定內容（只顯示一次）
    if multipost_config.get('suffix'):
        result += '\n' + multipost_config['suffix']

    return result.strip()

def _format_post_id(post_id: int, id_format_config: Dict) -> str:
    """根據 idFormat 配置格式化貼文 ID"""
    if not post_id:
        return ''

    formatted = str(post_id)

    # 補零處理
    digits = id_format_config.get('digits', 0)
    if digits > 0:
        formatted = formatted.zfill(digits)

    # 加前後綴
    prefix = id_format_config.get('prefix', '')
    suffix = id_format_config.get('suffix', '')

    return f"{prefix}{formatted}{suffix}"

def _combine_carousel_hashtags(posts: List[SocialPost]) -> List[str]:
    """組合輪播貼文的標籤"""
    all_hashtags = []
    
    for post in posts:
        if post.hashtags:
            all_hashtags.extend(post.hashtags)
    
    # 去重並返回
    return list(dict.fromkeys(all_hashtags))

# 定時任務：檢查定時發布
@celery_app.task
def check_scheduled_publishes():
    """檢查定時發布任務和積壓的輪播組"""
    try:
        monitoring.mark_beat_seen()
        with get_session() as db:
            now = datetime.now(timezone.utc)
            
            # 1. 查找到期的定時群組
            scheduled_groups = db.query(CarouselGroup).filter(
                CarouselGroup.status == 'collecting',
                CarouselGroup.scheduled_at.isnot(None),
                CarouselGroup.scheduled_at <= now
            ).all()
            
            # 2. 檢查積壓的輪播組（超過批次大小但仍在收集中）
            from models.social_publishing import SocialAccount
            stuck_groups = []
            
            for account in db.query(SocialAccount).filter(SocialAccount.status == 'active').all():
                groups = db.query(CarouselGroup).filter(
                    CarouselGroup.account_id == account.id,
                    CarouselGroup.status == 'collecting',
                    CarouselGroup.collected_count >= account.batch_size
                ).all()
                
                for group in groups:
                    # 檢查組是否存在超過5分鐘且達到批次大小
                    time_diff = now - group.created_at
                    if time_diff.total_seconds() > 300:  # 5分鐘
                        stuck_groups.append(group)
                        logger.warning(f"發現積壓的輪播組 {group.id}: {group.collected_count}/{account.batch_size} 貼文，存在 {time_diff.total_seconds():.0f} 秒")
            
            results = []
            
            # 處理定時群組（先嘗試補圖；可用圖片數量 >= 2 時才觸發）
            for group in scheduled_groups:
                try:
                    # 嘗試為缺圖貼文補圖（有限次）
                    _ = AutoPublisher()._ensure_group_images(db, group.id, limit=5)
                    ready_items = db.query(SocialPost).filter(
                        SocialPost.carousel_group_id == group.id,
                        SocialPost.status != PostStatus.FAILED,
                        SocialPost.generated_image_url.isnot(None)
                    ).count()
                    if ready_items >= 2:
                        task = publish_carousel.delay(group.id)
                        results.append({'group_id': group.id, 'task_id': task.id, 'success': True})
                        monitoring.record_event('stuck_recovery_triggered', carousel_group_id=int(group.id), reason='scheduled_due')
                    else:
                        results.append({'group_id': group.id, 'success': False, 'reason': 'not_enough_images'})
                except Exception as e:
                    logger.error(f"觸發定時發布失敗: {e}")
                    results.append({
                        'group_id': group.id,
                        'type': 'scheduled',
                        'success': False,
                        'error': str(e)
                    })
            
            # 處理積壓的群組（先嘗試補圖；可用圖片數量 >= 2 時才觸發）
            for group in stuck_groups:
                try:
                    # 嘗試為缺圖貼文補圖（有限次）
                    _ = AutoPublisher()._ensure_group_images(db, group.id, limit=5)
                    ready_items = db.query(SocialPost).filter(
                        SocialPost.carousel_group_id == group.id,
                        SocialPost.status != PostStatus.FAILED,
                        SocialPost.generated_image_url.isnot(None)
                    ).count()
                    if ready_items >= 2:
                        logger.info(f"觸發積壓輪播組 {group.id} 的發布")
                        task = publish_carousel.delay(group.id)
                        results.append({'group_id': group.id, 'type': 'stuck_recovery', 'task_id': task.id, 'success': True, 'collected_count': group.collected_count})
                        monitoring.record_event('stuck_recovery_triggered', carousel_group_id=int(group.id), reason='stuck_collecting')
                    else:
                        results.append({'group_id': group.id, 'type': 'stuck_recovery', 'success': False, 'reason': 'not_enough_images'})
                except Exception as e:
                    logger.error(f"觸發積壓組發布失敗: {e}")
                    results.append({
                        'group_id': group.id,
                        'type': 'stuck_recovery',
                        'success': False,
                        'error': str(e)
                    })
            
            return {
                'success': True,
                'processed_groups': len(results),
                'results': results
            }
            
    except Exception as e:
        logger.error(f"檢查定時發布失敗: {e}")
        return {'success': False, 'error': str(e)}
