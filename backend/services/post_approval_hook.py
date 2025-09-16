# backend/services/post_approval_hook.py
"""
貼文審核通過鉤子
當論壇貼文狀態變為 'approved' 時觸發社交媒體自動發布
"""
import logging
from typing import Dict, Any
from datetime import datetime, timezone

from models.base import Post as ForumPost
from services.auto_publisher import AutoPublisher
from utils.db import get_session

logger = logging.getLogger(__name__)

class PostApprovalHook:
    """貼文審核通過鉤子"""
    
    def __init__(self):
        self.auto_publisher = AutoPublisher()
    
    def on_post_approved(self, forum_post: ForumPost) -> Dict[str, Any]:
        """
        當貼文審核通過時被調用
        
        Args:
            forum_post: 審核通過的論壇貼文
            
        Returns:
            處理結果字典
        """
        try:
            logger.info(f"貼文 {forum_post.id} 審核通過，開始處理自動發布...")
            
            # 檢查是否符合自動發布條件
            if not self._should_auto_publish(forum_post):
                return {
                    'success': True,
                    'auto_publish': False,
                    'reason': '不符合自動發布條件'
                }
            
            # 觸發自動發布處理
            result = self.auto_publisher.process_approved_post(forum_post)
            
            logger.info(f"貼文 {forum_post.id} 自動發布處理完成: {result}")
            
            return {
                'success': True,
                'auto_publish': True,
                'publish_result': result
            }
            
        except Exception as e:
            logger.error(f"貼文 {forum_post.id} 自動發布處理失敗: {e}")
            return {
                'success': False,
                'auto_publish': False,
                'error': str(e)
            }
    
    def _should_auto_publish(self, forum_post: ForumPost) -> bool:
        """
        檢查貼文是否符合自動發布條件
        
        Args:
            forum_post: 論壇貼文
            
        Returns:
            是否應該自動發布
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
        
        # 檢查內容基本要求
        if not forum_post.content or not forum_post.content.strip():
            logger.info(f"貼文 {forum_post.id} 內容為空")
            return False
        
        # 檢查是否有關聯的活躍社交帳號
        with get_session() as db:
            from models.social_publishing import SocialAccount, AccountStatus
            
            query = db.query(SocialAccount).filter(
                SocialAccount.status == AccountStatus.ACTIVE
            )
            
            # 如果貼文有關聯學校，檢查是否有對應帳號
            if forum_post.school_id:
                query = query.filter(
                    (SocialAccount.school_id == forum_post.school_id) |
                    (SocialAccount.school_id.is_(None))  # 全域帳號
                )
            
            active_accounts = query.count()
            
            if active_accounts == 0:
                logger.info(f"貼文 {forum_post.id} 沒有找到相關的活躍社交帳號")
                return False
        
        return True

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