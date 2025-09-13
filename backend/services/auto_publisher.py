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
from celery import Celery

from utils.db import get_session
from models.social_publishing import (
    SocialAccount, ContentTemplate, CarouselGroup, SocialPost,
    PlatformType, AccountStatus, PublishTrigger, PostStatus
)
from models.base import Post as ForumPost
from services.content_generator import ContentGenerator, ContentGenerationError
from services.platform_publishers import get_platform_publisher
from services.celery_app import celery_app

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
        
        # 如果貼文有關聯學校，優先匹配學校帳號
        if forum_post.school_id:
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
        """獲取帳號的預設模板"""
        if account.default_template_id:
            tpl = db.query(ContentTemplate).filter(
                ContentTemplate.id == account.default_template_id,
                ContentTemplate.is_active == True
            ).first()
            if tpl:
                return tpl
        # 若未設定，優先選擇可出圖的模板（combined/image），並以 is_default=True 與建立時間排序
        preferred = (
            db.query(ContentTemplate)
              .filter(ContentTemplate.account_id == account.id,
                      ContentTemplate.is_active == True,
                      ContentTemplate.template_type.in_(["combined", "image"]))
              .order_by(ContentTemplate.is_default.desc(), ContentTemplate.created_at.desc())
              .first()
        )
        if preferred:
            return preferred
        # 退回任一啟用模板
        return (
            db.query(ContentTemplate)
              .filter(ContentTemplate.account_id == account.id, ContentTemplate.is_active == True)
              .order_by(ContentTemplate.is_default.desc(), ContentTemplate.created_at.desc())
              .first()
        )
    
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
            # 查找或創建當前的輪播群組
            carousel_group = self._get_or_create_carousel_group(account, db)
            
            # 將貼文加入輪播群組
            social_post.carousel_group_id = carousel_group.id
            social_post.position_in_carousel = carousel_group.collected_count
            social_post.status = PostStatus.QUEUED
            
            # 預先生成內容（穩定路徑）：讓輪播時不再卡在生成階段
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
                    'carousel_group_id': carousel_group.id,
                    'current_count': carousel_group.collected_count,
                    'target_count': account.batch_size,
                    'message': '單篇內容生成失敗，已標記該貼文為失敗，不納入輪播'
                }

            # 更新群組統計
            carousel_group.collected_count += 1
            
            db.commit()
            
            # 檢查是否達到發布閾值
            if carousel_group.collected_count >= account.batch_size:
                # 先確認群組中至少有 2 張已生成的圖片，避免立刻觸發後因不足而失敗
                ready_items = db.query(SocialPost).filter(
                    SocialPost.carousel_group_id == carousel_group.id,
                    SocialPost.status != PostStatus.FAILED,
                    SocialPost.generated_image_url.isnot(None)
                ).count()

                if ready_items >= 2:
                    task = publish_carousel.delay(carousel_group.id)
                    return {
                        'success': True,
                        'publish_type': 'batch_triggered',
                        'carousel_group_id': carousel_group.id,
                        'task_id': task.id,
                        'message': f'已達到批次閾值({account.batch_size})，觸發輪播發布'
                    }
                else:
                    return {
                        'success': True,
                        'publish_type': 'batch_wait_images',
                        'carousel_group_id': carousel_group.id,
                        'current_count': carousel_group.collected_count,
                        'target_count': account.batch_size,
                        'message': '已達到數量但圖片尚未齊備，稍後由定時任務再嘗試'
                    }
            else:
                return {
                    'success': True,
                    'publish_type': 'batch_queued',
                    'carousel_group_id': carousel_group.id,
                    'current_count': carousel_group.collected_count,
                    'target_count': account.batch_size,
                    'message': f'已加入批次佇列 ({carousel_group.collected_count}/{account.batch_size})'
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
            
            # 生成內容
            generator = ContentGenerator()
            content = generator.generate_content(
                social_post.forum_post, 
                social_post.template
            )
            
            # 更新生成的內容
            social_post.generated_image_url = content.get('image_url')
            social_post.generated_caption = content.get('caption')
            social_post.hashtags = content.get('hashtags', [])
            
            # 發布到平台
            publisher = get_platform_publisher(social_post.account.platform)
            publish_result = publisher.publish_single_post(
                account=social_post.account,
                image_url=social_post.generated_image_url,
                caption=social_post.generated_caption,
                hashtags=social_post.hashtags
            )
            
            # 更新發布結果
            social_post.platform_post_id = publish_result.get('post_id')
            social_post.platform_post_url = publish_result.get('post_url')
            social_post.status = PostStatus.PUBLISHED
            social_post.published_at = datetime.now(timezone.utc)
            
            # 更新帳號統計
            social_post.account.total_posts += 1
            social_post.account.last_post_at = datetime.now(timezone.utc)
            
            db.commit()
            
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
            
            # 獲取群組中的所有貼文
            # 注意：狀態欄位為 String(16)，避免 Enum 比對不一致，使用字串比對
            posts = db.query(SocialPost).filter(
                SocialPost.carousel_group_id == carousel_group_id,
                ~SocialPost.status.in_(["failed", "published"])  # 只要不是失敗/已發布都納入處理
            ).order_by(SocialPost.position_in_carousel).all()
            
            if not posts:
                raise AutoPublishError("輪播群組中沒有待發布的貼文")
            
            # 為每個貼文確認內容；若尚未生成才補生成
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

                    # 嚴格驗證圖片是否生成成功（輪播至少需要圖片）
                    if not post.generated_image_url:
                        post.status = PostStatus.FAILED
                        post.error_message = '內容生成缺少圖片，無法加入輪播'
                        post.updated_at = datetime.now(timezone.utc)
                        db.commit()
                        continue

                    carousel_items.append({
                        'image_url': post.generated_image_url,
                        'caption': post.generated_caption
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
            
            # 更新群組和貼文狀態
            carousel_group.platform_post_id = publish_result.get('post_id')
            carousel_group.platform_post_url = publish_result.get('post_url')
            carousel_group.status = 'published'
            carousel_group.published_at = datetime.now(timezone.utc)
            
            # 更新所有貼文狀態
            for post in posts:
                if post.status == PostStatus.PROCESSING:
                    post.status = PostStatus.PUBLISHED
                    post.platform_post_id = publish_result.get('post_id')
                    post.platform_post_url = publish_result.get('post_url')
                    now_ts = datetime.now(timezone.utc)
                    post.published_at = now_ts
                    post.updated_at = now_ts
            
            # 更新帳號統計
            carousel_group.account.total_posts += 1
            carousel_group.account.last_post_at = datetime.now(timezone.utc)
            
            db.commit()
            
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
        
        # 重試邏輯
        if self.request.retries < self.max_retries:
            countdown = 2 ** self.request.retries * 60
            raise self.retry(countdown=countdown, exc=e)
        
        raise

def _combine_carousel_captions(posts: List[SocialPost]) -> str:
    """組合輪播貼文的文案"""
    # 使用第一個貼文的標題作為主文案
    if posts and posts[0].generated_caption:
        return posts[0].generated_caption
    
    # 如果沒有生成文案，組合標題
    titles = []
    for post in posts:
        if hasattr(post.forum_post, 'title') and post.forum_post.title:
            titles.append(post.forum_post.title)
    
    if titles:
        return f"📢 校園動態更新\n\n" + "\n".join(f"• {title}" for title in titles[:5])
    
    return "📢 校園生活分享"

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
