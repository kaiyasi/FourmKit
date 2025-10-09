# backend/services/post_approval_hook.py
"""
貼文審核通過鉤子
當論壇貼文狀態變為 'approved' 時觸發 Instagram 自動發布
"""
import logging
import secrets
from typing import Dict, Any, Optional
from datetime import datetime

from models.base import Post as ForumPost
from models.instagram import InstagramPost, InstagramAccount, IGTemplate, PostStatus, PublishMode, TemplateType
from utils.db import get_session

logger = logging.getLogger(__name__)

def _generate_public_id() -> str:
    """生成唯一的 public_id"""
    return f"IGP_{secrets.token_urlsafe(12)}"

class PostApprovalHook:
    """貼文審核通過鉤子"""

    def on_post_approved(self, forum_post: ForumPost) -> Dict[str, Any]:
        """
        當貼文審核通過時被調用

        流程：
        1. 檢查是否符合發布條件
        2. 確定發布模式（instant/batch/scheduled）
        3. 選擇合適的模板
        4. 建立 InstagramPost 記錄
        5. 設定狀態為 pending（等待渲染）

        Args:
            forum_post: 審核通過的論壇貼文

        Returns:
            處理結果字典
        """
        try:
            logger.info(f"[Post Approval Hook] 貼文 {forum_post.id} 審核通過")

            # 檢查是否符合自動發布條件
            if not self._should_auto_publish(forum_post):
                return {
                    'success': True,
                    'created': False,
                    'reason': '不符合自動發布條件'
                }

            with get_session() as db:
                # 1. 獲取對應的 Instagram 帳號
                account = self._get_account(db, forum_post)
                if not account:
                    logger.warning(f"[Post Approval Hook] 貼文 {forum_post.id} 找不到對應的 Instagram 帳號")
                    return {
                        'success': True,
                        'created': False,
                        'reason': '找不到對應的 Instagram 帳號'
                    }

                # 2. 確定發布模式和模板類型
                publish_mode, template_type = self._determine_publish_mode(db, forum_post)

                # 3. 選擇模板
                template = self._get_template(db, forum_post.school_id, template_type)
                if not template:
                    logger.warning(f"[Post Approval Hook] 找不到合適的模板（school_id={forum_post.school_id}, type={template_type}）")
                    return {
                        'success': True,
                        'created': False,
                        'reason': f'找不到 {template_type} 類型的模板'
                    }

                # 4. 建立 InstagramPost 記錄
                ig_post = InstagramPost(
                    public_id=_generate_public_id(),
                    forum_post_id=forum_post.id,
                    ig_account_id=account.id,
                    template_id=template.id,
                    status=PostStatus.PENDING,
                    publish_mode=publish_mode,
                    scheduled_at=None  # 排程時間由發布服務設定
                )

                db.add(ig_post)
                db.commit()

                logger.info(f"[Post Approval Hook] 建立 Instagram 發布記錄: post_id={ig_post.id}, mode={publish_mode}, template={template.name}")

                return {
                    'success': True,
                    'created': True,
                    'ig_post_id': ig_post.id,
                    'publish_mode': publish_mode.value,
                    'template_name': template.name
                }

        except Exception as e:
            logger.error(f"[Post Approval Hook] 處理失敗: {e}", exc_info=True)
            return {
                'success': False,
                'created': False,
                'error': str(e)
            }

    def _should_auto_publish(self, forum_post: ForumPost) -> bool:
        """
        檢查貼文是否符合自動發布條件
        """
        # 基本條件檢查
        if not forum_post:
            return False

        # 檢查貼文狀態
        if forum_post.status != 'approved':
            return False

        # 檢查是否已被刪除
        if getattr(forum_post, 'is_deleted', False):
            return False

        # 排除廣告貼文
        if getattr(forum_post, 'is_advertisement', False):
            logger.info(f"[Post Approval Hook] 貼文 {forum_post.id} 為廣告貼文，跳過")
            return False

        # 檢查內容基本要求
        if not forum_post.content or not forum_post.content.strip():
            logger.info(f"[Post Approval Hook] 貼文 {forum_post.id} 內容為空")
            return False

        return True

    def _get_account(self, db, forum_post: ForumPost) -> Optional[InstagramAccount]:
        """
        獲取對應的 Instagram 帳號
        優先選擇學校專屬帳號，否則使用全域帳號
        """
        query = db.query(InstagramAccount).filter(
            InstagramAccount.is_active == True
        )

        # 優先選擇學校專屬帳號
        if forum_post.school_id:
            school_account = query.filter(
                InstagramAccount.school_id == forum_post.school_id
            ).first()

            if school_account:
                return school_account

        # 回退到全域帳號
        global_account = query.filter(
            InstagramAccount.school_id.is_(None)
        ).first()

        return global_account

    def _determine_publish_mode(self, db, forum_post: ForumPost) -> tuple[PublishMode, TemplateType]:
        """
        確定發布模式和模板類型

        規則：
        - 公告類型貼文 → instant + announcement 模板（檢查 post.announcement_type）
        - 一般貼文 → 根據發布設定決定（batch/scheduled）+ general 模板
        """
        # 檢查貼文是否為公告類型（使用 Post.announcement_type 欄位）
        is_announcement = getattr(forum_post, 'announcement_type', None) is not None

        if is_announcement:
            return PublishMode.INSTANT, TemplateType.ANNOUNCEMENT
        else:
            # 一般貼文：預設使用批次發布
            # TODO: 未來可以從學校設定讀取發布策略
            return PublishMode.BATCH, TemplateType.GENERAL

    def _get_template(self, db, school_id: Optional[int], template_type: TemplateType) -> Optional[IGTemplate]:
        """
        選擇合適的模板
        優先選擇學校專屬模板，否則使用全域模板
        """
        query = db.query(IGTemplate).filter(
            IGTemplate.is_active == True,
            IGTemplate.template_type == template_type
        )

        # 優先選擇學校專屬模板
        if school_id:
            school_template = query.filter(
                IGTemplate.school_id == school_id
            ).first()

            if school_template:
                return school_template

        # 回退到全域模板
        global_template = query.filter(
            IGTemplate.school_id.is_(None)
        ).first()

        return global_template


# 全域鉤子實例
post_approval_hook = PostApprovalHook()

def trigger_auto_publish_on_approval(forum_post: ForumPost) -> Dict[str, Any]:
    """
    便捷函數：觸發自動發布
    可以在貼文審核邏輯中調用此函數

    Args:
        forum_post: 審核通過的論壇貼文

    Returns:
        處理結果
    """
    return post_approval_hook.on_post_approved(forum_post)
