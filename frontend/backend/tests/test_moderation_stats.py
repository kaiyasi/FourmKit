"""
測試審核統計功能
"""

import pytest
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from models import User, School, Post, Media, ModerationLog, DeleteRequest
from services.delete_service import DeleteService


class TestModerationStats:
    """測試審核統計功能"""
    
    def test_stats_include_delete_request_processing(self, session: Session):
        """測試統計包含刪文請求的處理記錄"""
        # 創建測試學校
        school = School(slug="test-school", name="測試學校")
        session.add(school)
        session.flush()
        
        # 創建測試用戶
        user = User(
            username="test_user",
            email="test@example.com",
            role="user",
            school_id=school.id
        )
        moderator = User(
            username="moderator",
            email="moderator@example.com",
            role="campus_admin",
            school_id=school.id
        )
        session.add_all([user, moderator])
        session.flush()
        
        # 創建測試貼文
        post = Post(
            author_id=user.id,
            content="這是一個測試貼文",
            school_id=school.id
        )
        session.add(post)
        session.commit()
        
        # 創建刪文請求
        delete_request = DeleteRequest(
            post_id=post.id,
            reason="測試刪文請求",
            status="pending"
        )
        session.add(delete_request)
        session.commit()
        
        # 模擬核准刪文請求（這會創建 ModerationLog 記錄）
        result = DeleteService.approve_delete_request(
            session=session,
            request_id=delete_request.id,
            moderator_id=moderator.id,
            note="測試核准"
        )
        
        assert result["success"] is True
        
        # 驗證 ModerationLog 記錄
        log_entry = session.query(ModerationLog).filter(
            ModerationLog.target_type == "post",
            ModerationLog.action == "delete_approved"
        ).first()
        
        assert log_entry is not None
        assert log_entry.target_id == post.id
        assert log_entry.moderator_id == moderator.id
    
    def test_stats_include_delete_request_rejection(self, session: Session):
        """測試統計包含刪文請求的拒絕記錄"""
        # 創建測試學校
        school = School(slug="test-school", name="測試學校")
        session.add(school)
        session.flush()
        
        # 創建測試用戶
        user = User(
            username="test_user",
            email="test@example.com",
            role="user",
            school_id=school.id
        )
        moderator = User(
            username="moderator",
            email="moderator@example.com",
            role="campus_admin",
            school_id=school.id
        )
        session.add_all([user, moderator])
        session.flush()
        
        # 創建測試貼文
        post = Post(
            author_id=user.id,
            content="這是一個測試貼文",
            school_id=school.id
        )
        session.add(post)
        session.commit()
        
        # 創建刪文請求
        delete_request = DeleteRequest(
            post_id=post.id,
            reason="測試刪文請求",
            status="pending"
        )
        session.add(delete_request)
        session.commit()
        
        # 模擬拒絕刪文請求（這會創建 ModerationLog 記錄）
        result = DeleteService.reject_delete_request(
            session=session,
            request_id=delete_request.id,
            moderator_id=moderator.id,
            note="測試拒絕"
        )
        
        assert result["success"] is True
        
        # 驗證 ModerationLog 記錄
        log_entry = session.query(ModerationLog).filter(
            ModerationLog.target_type == "delete_request",
            ModerationLog.action == "delete_rejected"
        ).first()
        
        assert log_entry is not None
        assert log_entry.target_id == delete_request.id
        assert log_entry.moderator_id == moderator.id
    
    def test_stats_count_correctly(self, session: Session):
        """測試統計計數正確"""
        # 創建測試學校
        school = School(slug="test-school", name="測試學校")
        session.add(school)
        session.flush()
        
        # 創建測試用戶
        user = User(
            username="test_user",
            email="test@example.com",
            role="user",
            school_id=school.id
        )
        moderator = User(
            username="moderator",
            email="moderator@example.com",
            role="campus_admin",
            school_id=school.id
        )
        session.add_all([user, moderator])
        session.flush()
        
        # 創建測試貼文
        post = Post(
            author_id=user.id,
            content="這是一個測試貼文",
            school_id=school.id
        )
        session.add(post)
        session.commit()
        
        # 創建刪文請求
        delete_request = DeleteRequest(
            post_id=post.id,
            reason="測試刪文請求",
            status="pending"
        )
        session.add(delete_request)
        session.commit()
        
        # 核准刪文請求
        DeleteService.approve_delete_request(
            session=session,
            request_id=delete_request.id,
            moderator_id=moderator.id
        )
        
        # 計算今日統計
        today = datetime.now().date()
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        
        # 今日處理數量（應該包含刪文請求的核准）
        today_processed = (
            session.query(ModerationLog)
            .filter(
                ModerationLog.created_at >= today_start,
                ModerationLog.created_at <= today_end
            )
            .count()
        )
        
        # 今日核准數量（應該包含 delete_approved）
        today_approved = (
            session.query(ModerationLog)
            .filter(
                ModerationLog.created_at >= today_start,
                ModerationLog.created_at <= today_end,
                ModerationLog.action.in_(["approve", "delete_approved"])
            )
            .count()
        )
        
        assert today_processed >= 1  # 至少有一個處理記錄
        assert today_approved >= 1  # 至少有一個核准記錄
