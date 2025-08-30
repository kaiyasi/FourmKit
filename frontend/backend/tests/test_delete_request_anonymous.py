"""
測試未登入用戶的刪文請求功能
"""

import pytest
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from models import User, School, Post, DeleteRequest
from services.delete_service import DeleteService


class TestAnonymousDeleteRequest:
    """測試未登入用戶的刪文請求"""
    
    def test_anonymous_user_can_create_delete_request(self, session: Session):
        """測試未登入用戶可以創建刪文請求"""
        # 創建測試學校
        school = School(slug="test-school", name="測試學校")
        session.add(school)
        session.flush()
        
        # 創建測試用戶和貼文
        user = User(
            username="test_user",
            email="test@example.com",
            role="user",
            school_id=school.id
        )
        session.add(user)
        session.flush()
        
        post = Post(
            author_id=user.id,
            content="這是一個測試貼文",
            school_id=school.id
        )
        session.add(post)
        session.commit()
        
        # 測試未登入用戶創建刪文請求
        result = DeleteService.create_delete_request(
            session=session,
            post_id=post.id,
            reason="測試刪文請求",
            requester_id=None  # 未登入用戶
        )
        
        assert result["success"] is True
        assert "delete_request_id" in result
        
        # 驗證刪文請求記錄
        delete_request = session.query(DeleteRequest).filter(
            DeleteRequest.id == result["delete_request_id"]
        ).first()
        
        assert delete_request is not None
        assert delete_request.post_id == post.id
        assert delete_request.reason == "測試刪文請求"
        assert delete_request.status == "pending"
        assert delete_request.requester_ip is not None  # 應該記錄 IP
        assert delete_request.requester_user_agent is not None  # 應該記錄 User-Agent
    
    def test_anonymous_user_cannot_create_duplicate_request(self, session: Session):
        """測試未登入用戶不能對同一貼文創建重複的刪文請求"""
        # 創建測試學校
        school = School(slug="test-school", name="測試學校")
        session.add(school)
        session.flush()
        
        # 創建測試用戶和貼文
        user = User(
            username="test_user",
            email="test@example.com",
            role="user",
            school_id=school.id
        )
        session.add(user)
        session.flush()
        
        post = Post(
            author_id=user.id,
            content="這是一個測試貼文",
            school_id=school.id
        )
        session.add(post)
        session.commit()
        
        # 第一次創建刪文請求
        result1 = DeleteService.create_delete_request(
            session=session,
            post_id=post.id,
            reason="第一個刪文請求",
            requester_id=None
        )
        
        assert result1["success"] is True
        
        # 第二次創建刪文請求（應該失敗）
        result2 = DeleteService.create_delete_request(
            session=session,
            post_id=post.id,
            reason="第二個刪文請求",
            requester_id=None
        )
        
        assert result2["success"] is False
        assert "已有待審核的刪文請求" in result2["error"]
    
    def test_anonymous_user_cannot_request_deleted_post(self, session: Session):
        """測試未登入用戶不能對已刪除的貼文創建刪文請求"""
        # 創建測試學校
        school = School(slug="test-school", name="測試學校")
        session.add(school)
        session.flush()
        
        # 創建測試用戶和已刪除的貼文
        user = User(
            username="test_user",
            email="test@example.com",
            role="user",
            school_id=school.id
        )
        session.add(user)
        session.flush()
        
        post = Post(
            author_id=user.id,
            content="這是一個已刪除的測試貼文",
            school_id=school.id,
            is_deleted=True,
            deleted_at=datetime.now(timezone.utc)
        )
        session.add(post)
        session.commit()
        
        # 嘗試創建刪文請求（應該失敗）
        result = DeleteService.create_delete_request(
            session=session,
            post_id=post.id,
            reason="對已刪除貼文的刪文請求",
            requester_id=None
        )
        
        assert result["success"] is False
        assert "貼文不存在或已被刪除" in result["error"]
    
    def test_logged_in_user_can_create_delete_request(self, session: Session):
        """測試已登入用戶可以創建刪文請求"""
        # 創建測試學校
        school = School(slug="test-school", name="測試學校")
        session.add(school)
        session.flush()
        
        # 創建測試用戶和貼文
        author = User(
            username="author",
            email="author@example.com",
            role="user",
            school_id=school.id
        )
        requester = User(
            username="requester",
            email="requester@example.com",
            role="user",
            school_id=school.id
        )
        session.add_all([author, requester])
        session.flush()
        
        post = Post(
            author_id=author.id,
            content="這是一個測試貼文",
            school_id=school.id
        )
        session.add(post)
        session.commit()
        
        # 測試已登入用戶創建刪文請求
        result = DeleteService.create_delete_request(
            session=session,
            post_id=post.id,
            reason="已登入用戶的刪文請求",
            requester_id=requester.id
        )
        
        assert result["success"] is True
        assert "delete_request_id" in result
        
        # 驗證刪文請求記錄
        delete_request = session.query(DeleteRequest).filter(
            DeleteRequest.id == result["delete_request_id"]
        ).first()
        
        assert delete_request is not None
        assert delete_request.post_id == post.id
        assert delete_request.reason == "已登入用戶的刪文請求"
        assert delete_request.status == "pending"
        assert delete_request.requester_ip is not None
        assert delete_request.requester_user_agent is not None
