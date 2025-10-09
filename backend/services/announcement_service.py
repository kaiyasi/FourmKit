"""
公告通知服務
負責處理公告的創建、管理和閱讀狀態
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from models import Announcement, AnnouncementRead


class AnnouncementService:
    """公告服務類"""
    
    @classmethod
    def create_announcement(
        cls,
        session: Session,
        title: str,
        content: str,
        is_pinned: bool = False,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
        school_id: Optional[int] = None,
        created_by: int = None
    ) -> Announcement:
        """
        創建公告
        
        Args:
            session: 數據庫會話
            title: 公告標題
            content: 公告內容
            is_pinned: 是否置頂
            start_at: 開始時間
            end_at: 結束時間
            school_id: 學校ID（null為全域公告）
            created_by: 創建者ID
        
        Returns:
            Announcement: 創建的公告
        """
        announcement = Announcement(
            title=title,
            content=content,
            is_pinned=is_pinned,
            start_at=start_at,
            end_at=end_at,
            school_id=school_id,
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        session.add(announcement)
        session.flush()
        
        return announcement
    
    @classmethod
    def get_active_announcements(
        cls,
        session: Session,
        user_id: int,
        school_id: Optional[int] = None,
        limit: int = 50,
        include_read: bool = False
    ) -> List[Dict[str, Any]]:
        """
        獲取活躍公告列表
        
        Args:
            session: 數據庫會話
            user_id: 用戶ID
            school_id: 學校ID
            limit: 限制數量
            include_read: 是否包含已讀公告
        
        Returns:
            List[Dict]: 公告列表（包含閱讀狀態）
        """
        now = datetime.now(timezone.utc)
        
        # 構建查詢條件
        conditions = [
            Announcement.is_active == True,
            or_(
                Announcement.start_at.is_(None),
                Announcement.start_at <= now
            ),
            or_(
                Announcement.end_at.is_(None),
                Announcement.end_at >= now
            )
        ]
        
        # 學校過濾：顯示全域公告和該學校的公告
        if school_id:
            conditions.append(
                or_(
                    Announcement.school_id.is_(None),  # 全域公告
                    Announcement.school_id == school_id
                )
            )
        else:
            # 如果沒有學校ID，只顯示全域公告
            conditions.append(Announcement.school_id.is_(None))
        
        # 查詢公告
        announcements = session.query(Announcement).filter(
            and_(*conditions)
        ).order_by(
            Announcement.is_pinned.desc(),
            Announcement.created_at.desc()
        ).limit(limit).all()
        
        # 獲取用戶的閱讀狀態
        announcement_ids = [a.id for a in announcements]
        read_records = {}
        if announcement_ids:
            reads = session.query(AnnouncementRead).filter(
                AnnouncementRead.announcement_id.in_(announcement_ids),
                AnnouncementRead.user_id == user_id
            ).all()
            read_records = {r.announcement_id: r.read_at for r in reads}
        
        # 構建返回數據
        result = []
        for announcement in announcements:
            if not include_read and announcement.id in read_records:
                continue  # 跳過已讀公告
            
            announcement_data = {
                "id": announcement.id,
                "title": announcement.title,
                "content": announcement.content,
                "is_pinned": announcement.is_pinned,
                "school_id": announcement.school_id,
                "created_at": announcement.created_at.isoformat() if announcement.created_at else None,
                "updated_at": announcement.updated_at.isoformat() if announcement.updated_at else None,
                "is_read": announcement.id in read_records,
                "read_at": read_records.get(announcement.id).isoformat() if announcement.id in read_records else None,
                "creator": {
                    "id": announcement.creator.id,
                    "username": announcement.creator.username,
                    "role": announcement.creator.role
                } if announcement.creator else None,
                "school": {
                    "id": announcement.school.id,
                    "name": announcement.school.name
                } if announcement.school else None
            }
            result.append(announcement_data)
        
        return result

    @classmethod
    def get_admin_announcements(
        cls,
        session: Session,
        user_id: int,
        user_role: str,
        user_school_id: Optional[int] = None,
        limit: int = 50,
        include_read: bool = False
    ) -> List[Dict[str, Any]]:
        """
        獲取管理員可見的公告列表（包含所有欄位，用於管理頁面）
        
        Args:
            session: 數據庫會話
            user_id: 用戶ID
            user_role: 用戶角色
            user_school_id: 用戶學校ID
            limit: 限制數量
            include_read: 是否包含已讀公告
        
        Returns:
            List[Dict]: 公告列表（包含完整資訊）
        """
        now = datetime.now(timezone.utc)
        
        # 構建查詢條件
        conditions = [
            Announcement.is_active == True,
            or_(
                Announcement.start_at.is_(None),
                Announcement.start_at <= now
            ),
            or_(
                Announcement.end_at.is_(None),
                Announcement.end_at >= now
            )
        ]
        
        # 根據角色過濾公告
        if user_role == "campus_admin":
            # 校內管理員：只顯示自己學校的公告
            if user_school_id:
                conditions.append(Announcement.school_id == user_school_id)
            else:
                return []  # 沒有學校ID，返回空列表
        elif user_role == "cross_admin":
            # 跨校管理員：只顯示全域公告
            conditions.append(Announcement.school_id.is_(None))
        elif user_role == "dev_admin":
            # 開發管理員：顯示所有公告
            pass  # 不過濾學校
        else:
            # 其他角色：只顯示全域公告
            conditions.append(Announcement.school_id.is_(None))
        
        # 查詢公告
        announcements = session.query(Announcement).filter(
            and_(*conditions)
        ).order_by(
            Announcement.is_pinned.desc(),
            Announcement.created_at.desc()
        ).limit(limit).all()
        
        # 獲取用戶的閱讀狀態
        announcement_ids = [a.id for a in announcements]
        read_records = {}
        if announcement_ids:
            reads = session.query(AnnouncementRead).filter(
                AnnouncementRead.announcement_id.in_(announcement_ids),
                AnnouncementRead.user_id == user_id
            ).all()
            read_records = {r.announcement_id: r.read_at for r in reads}
        
        # 構建返回數據
        result = []
        for announcement in announcements:
            if not include_read and announcement.id in read_records:
                continue  # 跳過已讀公告
            
            announcement_data = {
                "id": announcement.id,
                "title": announcement.title,
                "content": announcement.content,
                "is_pinned": announcement.is_pinned,
                "school_id": announcement.school_id,
                "created_at": announcement.created_at.isoformat() if announcement.created_at else None,
                "updated_at": announcement.updated_at.isoformat() if announcement.updated_at else None,
                "is_active": announcement.is_active,
                "is_read": announcement.id in read_records,
                "read_at": read_records.get(announcement.id).isoformat() if announcement.id in read_records else None,
                "creator": {
                    "id": announcement.creator.id,
                    "username": announcement.creator.username,
                    "role": announcement.creator.role
                } if announcement.creator else None,
                "school": {
                    "id": announcement.school.id,
                    "name": announcement.school.name
                } if announcement.school else None
            }
            result.append(announcement_data)
        
        return result
    
    @classmethod
    def mark_as_read(
        cls,
        session: Session,
        announcement_id: int,
        user_id: int
    ) -> bool:
        """
        標記公告為已讀
        
        Args:
            session: 數據庫會話
            announcement_id: 公告ID
            user_id: 用戶ID
        
        Returns:
            bool: 是否成功標記
        """
        # 檢查是否已經讀過
        existing_read = session.query(AnnouncementRead).filter(
            AnnouncementRead.announcement_id == announcement_id,
            AnnouncementRead.user_id == user_id
        ).first()
        
        if existing_read:
            return True  # 已經讀過
        
        # 創建閱讀記錄
        read_record = AnnouncementRead(
            announcement_id=announcement_id,
            user_id=user_id,
            read_at=datetime.now(timezone.utc)
        )
        
        session.add(read_record)
        session.flush()
        
        return True
    
    @classmethod
    def get_unread_count(
        cls,
        session: Session,
        user_id: int,
        school_id: Optional[int] = None
    ) -> int:
        """
        獲取未讀公告數量
        
        Args:
            session: 數據庫會話
            user_id: 用戶ID
            school_id: 學校ID
        
        Returns:
            int: 未讀公告數量
        """
        now = datetime.now(timezone.utc)
        
        # 構建查詢條件
        conditions = [
            Announcement.is_active == True,
            or_(
                Announcement.start_at.is_(None),
                Announcement.start_at <= now
            ),
            or_(
                Announcement.end_at.is_(None),
                Announcement.end_at >= now
            )
        ]
        
        # 學校過濾
        if school_id:
            conditions.append(
                or_(
                    Announcement.school_id.is_(None),
                    Announcement.school_id == school_id
                )
            )
        else:
            conditions.append(Announcement.school_id.is_(None))
        
        # 查詢所有活躍公告
        active_announcements = session.query(Announcement).filter(
            and_(*conditions)
        ).all()
        
        if not active_announcements:
            return 0
        
        announcement_ids = [a.id for a in active_announcements]
        
        # 查詢已讀的公告
        read_announcements = session.query(AnnouncementRead.announcement_id).filter(
            AnnouncementRead.announcement_id.in_(announcement_ids),
            AnnouncementRead.user_id == user_id
        ).all()
        
        read_ids = {r.announcement_id for r in read_announcements}
        
        # 計算未讀數量
        unread_count = len(announcement_ids) - len(read_ids)
        
        return max(0, unread_count)
    
    @classmethod
    def update_announcement(
        cls,
        session: Session,
        announcement_id: int,
        title: Optional[str] = None,
        content: Optional[str] = None,
        is_active: Optional[bool] = None,
        is_pinned: Optional[bool] = None,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None
    ) -> Optional[Announcement]:
        """
        更新公告
        
        Args:
            session: 數據庫會話
            announcement_id: 公告ID
            title: 標題
            content: 內容
            is_active: 是否啟用
            is_pinned: 是否置頂
            start_at: 開始時間
            end_at: 結束時間
        
        Returns:
            Announcement: 更新後的公告
        """
        announcement = session.query(Announcement).filter(
            Announcement.id == announcement_id
        ).first()
        
        if not announcement:
            return None
        
        if title is not None:
            announcement.title = title
        if content is not None:
            announcement.content = content
        if is_active is not None:
            announcement.is_active = is_active
        if is_pinned is not None:
            announcement.is_pinned = is_pinned
        if start_at is not None:
            announcement.start_at = start_at
        if end_at is not None:
            announcement.end_at = end_at
        
        announcement.updated_at = datetime.now(timezone.utc)
        session.flush()
        
        return announcement
    
    @classmethod
    def delete_announcement(cls, session: Session, announcement_id: int) -> bool:
        """
        刪除公告（軟刪除）
        
        Args:
            session: 數據庫會話
            announcement_id: 公告ID
        
        Returns:
            bool: 是否成功刪除
        """
        announcement = session.query(Announcement).filter(
            Announcement.id == announcement_id
        ).first()
        
        if not announcement:
            return False
        
        announcement.is_active = False
        announcement.updated_at = datetime.now(timezone.utc)
        session.flush()
        
        return True
