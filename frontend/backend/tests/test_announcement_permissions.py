"""
測試公告系統的權限功能
"""

import pytest
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from models import User, School, Announcement, AnnouncementRead
from services.announcement_service import AnnouncementService


class TestAnnouncementPermissions:
    """測試公告權限系統"""
    
    def test_dev_admin_can_create_global_announcement(self, session: Session):
        """測試 dev_admin 可以創建全域公告"""
        # 創建測試用戶
        user = User(
            username="dev_admin",
            email="admin@test.com",
            role="dev_admin",
            school_id=None
        )
        session.add(user)
        session.flush()
        
        # 創建全域公告
        announcement = AnnouncementService.create_announcement(
            session=session,
            title="全域公告",
            content="這是全域公告內容",
            type="info",
            priority="normal",
            school_id=None,  # 全域公告
            created_by=user.id
        )
        
        assert announcement.school_id is None
        assert announcement.title == "全域公告"
        assert announcement.creator.id == user.id
    
    def test_campus_admin_can_create_school_announcement(self, session: Session):
        """測試 campus_admin 可以創建學校公告"""
        # 創建測試學校
        school = School(slug="test-school", name="測試學校")
        session.add(school)
        session.flush()
        
        # 創建測試用戶
        user = User(
            username="campus_admin",
            email="campus@test.com",
            role="campus_admin",
            school_id=school.id
        )
        session.add(user)
        session.flush()
        
        # 創建學校公告
        announcement = AnnouncementService.create_announcement(
            session=session,
            title="學校公告",
            content="這是學校公告內容",
            type="warning",
            priority="high",
            school_id=school.id,
            created_by=user.id
        )
        
        assert announcement.school_id == school.id
        assert announcement.title == "學校公告"
        assert announcement.creator.id == user.id
    
    def test_cross_admin_can_create_global_announcement(self, session: Session):
        """測試 cross_admin 可以創建全域公告"""
        # 創建測試用戶
        user = User(
            username="cross_admin",
            email="cross@test.com",
            role="cross_admin",
            school_id=None
        )
        session.add(user)
        session.flush()
        
        # 創建全域公告
        announcement = AnnouncementService.create_announcement(
            session=session,
            title="跨校公告",
            content="這是跨校公告內容",
            type="success",
            priority="normal",
            school_id=None,  # 全域公告
            created_by=user.id
        )
        
        assert announcement.school_id is None
        assert announcement.title == "跨校公告"
        assert announcement.creator.id == user.id
    
    def test_admin_announcements_filtering(self, session: Session):
        """測試管理員公告過濾功能"""
        # 創建測試學校
        school1 = School(slug="school1", name="學校1")
        school2 = School(slug="school2", name="學校2")
        session.add_all([school1, school2])
        session.flush()
        
        # 創建不同角色的用戶
        dev_admin = User(username="dev_admin", email="dev@test.com", role="dev_admin", school_id=None)
        campus_admin = User(username="campus_admin", email="campus@test.com", role="campus_admin", school_id=school1.id)
        cross_admin = User(username="cross_admin", email="cross@test.com", role="cross_admin", school_id=None)
        
        session.add_all([dev_admin, campus_admin, cross_admin])
        session.flush()
        
        # 創建不同範圍的公告
        global_announcement = AnnouncementService.create_announcement(
            session=session,
            title="全域公告",
            content="全域內容",
            school_id=None,
            created_by=dev_admin.id
        )
        
        school1_announcement = AnnouncementService.create_announcement(
            session=session,
            title="學校1公告",
            content="學校1內容",
            school_id=school1.id,
            created_by=campus_admin.id
        )
        
        school2_announcement = AnnouncementService.create_announcement(
            session=session,
            title="學校2公告",
            content="學校2內容",
            school_id=school2.id,
            created_by=dev_admin.id
        )
        
        session.commit()
        
        # 測試 dev_admin 可以看到所有公告
        dev_announcements = AnnouncementService.get_admin_announcements(
            session=session,
            user_id=dev_admin.id,
            user_role="dev_admin",
            user_school_id=None,
            limit=100,
            include_read=True
        )
        
        assert len(dev_announcements) == 3
        announcement_titles = [a["title"] for a in dev_announcements]
        assert "全域公告" in announcement_titles
        assert "學校1公告" in announcement_titles
        assert "學校2公告" in announcement_titles
        
        # 測試 campus_admin 只能看到自己學校的公告
        campus_announcements = AnnouncementService.get_admin_announcements(
            session=session,
            user_id=campus_admin.id,
            user_role="campus_admin",
            user_school_id=school1.id,
            limit=100,
            include_read=True
        )
        
        assert len(campus_announcements) == 1
        assert campus_announcements[0]["title"] == "學校1公告"
        
        # 測試 cross_admin 只能看到全域公告
        cross_announcements = AnnouncementService.get_admin_announcements(
            session=session,
            user_id=cross_admin.id,
            user_role="cross_admin",
            user_school_id=None,
            limit=100,
            include_read=True
        )
        
        assert len(cross_announcements) == 1
        assert cross_announcements[0]["title"] == "全域公告"
    
    def test_regular_user_announcements(self, session: Session):
        """測試一般用戶的公告顯示"""
        # 創建測試學校
        school = School(slug="test-school", name="測試學校")
        session.add(school)
        session.flush()
        
        # 創建一般用戶
        user = User(
            username="regular_user",
            email="user@test.com",
            role="user",
            school_id=school.id
        )
        session.add(user)
        session.flush()
        
        # 創建全域公告和學校公告
        global_announcement = AnnouncementService.create_announcement(
            session=session,
            title="全域公告",
            content="全域內容",
            school_id=None,
            created_by=user.id
        )
        
        school_announcement = AnnouncementService.create_announcement(
            session=session,
            title="學校公告",
            content="學校內容",
            school_id=school.id,
            created_by=user.id
        )
        
        session.commit()
        
        # 測試一般用戶可以看到全域公告和自己學校的公告
        user_announcements = AnnouncementService.get_active_announcements(
            session=session,
            user_id=user.id,
            school_id=school.id,
            limit=100,
            include_read=True
        )
        
        assert len(user_announcements) == 2
        announcement_titles = [a["title"] for a in user_announcements]
        assert "全域公告" in announcement_titles
        assert "學校公告" in announcement_titles
