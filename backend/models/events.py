"""
事件記錄系統數據模型
重新設計的事件記錄，取代舊的 admin_events 系統
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, JSON, Index
from sqlalchemy.sql import func
from .base import Base


class SystemEvent(Base):
    """系統事件記錄表"""
    __tablename__ = "system_events"
    
    id = Column(Integer, primary_key=True)
    
    # 基本事件信息
    event_type = Column(String(50), nullable=False, comment="事件類型")
    title = Column(String(200), nullable=False, comment="事件標題")
    description = Column(Text, comment="事件描述")
    
    # 事件分類和嚴重性
    category = Column(String(50), nullable=False, comment="事件分類")
    severity = Column(String(20), default="medium", comment="嚴重程度: low, medium, high, critical")
    
    # 操作者信息
    actor_id = Column(Integer, comment="操作者用戶ID")
    actor_name = Column(String(100), comment="操作者用戶名")
    actor_role = Column(String(50), comment="操作者角色")
    
    # 目標對象信息
    target_type = Column(String(50), comment="目標類型: user, post, comment, school, system")
    target_id = Column(String(100), comment="目標ID（支持字符串以適應不同類型）")
    target_name = Column(String(200), comment="目標名稱")
    
    # 學校範圍
    school_id = Column(Integer, comment="相關學校ID（null表示跨校）")
    
    # 客戶端信息
    client_ip = Column(String(45), comment="客戶端IP")
    client_id = Column(String(100), comment="客戶端ID")
    user_agent = Column(String(500), comment="用戶代理")
    
    # 擴展信息
    # 注意：SQLAlchemy Declarative API 保留屬性名 "metadata"，
    # 因此這裡將 Python 屬性命名為 metadata_json，但資料庫欄位名仍為 "metadata"。
    metadata_json = Column("metadata", JSON, comment="事件相關的額外數據")
    
    # 狀態控制
    is_read = Column(Boolean, default=False, comment="是否已讀")
    is_important = Column(Boolean, default=False, comment="是否重要事件")
    is_hidden = Column(Boolean, default=False, comment="是否隱藏")
    
    # 時間戳
    created_at = Column(DateTime, server_default=func.now(), comment="創建時間")
    read_at = Column(DateTime, comment="已讀時間")
    
    # 索引優化
    __table_args__ = (
        Index('idx_events_type_created', 'event_type', 'created_at'),
        Index('idx_events_category_created', 'category', 'created_at'),
        Index('idx_events_actor_created', 'actor_id', 'created_at'),
        Index('idx_events_school_created', 'school_id', 'created_at'),
        Index('idx_events_severity_created', 'severity', 'created_at'),
        Index('idx_events_unread', 'is_read', 'created_at'),
        Index('idx_events_important', 'is_important', 'created_at'),
    )
    
    def to_dict(self, include_metadata=True):
        """轉換為字典格式"""
        return {
            'id': self.id,
            'event_type': self.event_type,
            'title': self.title,
            'description': self.description,
            'category': self.category,
            'severity': self.severity,
            'actor_id': self.actor_id,
            'actor_name': self.actor_name,
            'actor_role': self.actor_role,
            'target_type': self.target_type,
            'target_id': self.target_id,
            'target_name': self.target_name,
            'school_id': self.school_id,
            'client_ip': self.client_ip,
            'client_id': self.client_id,
            'user_agent': self.user_agent,
            'metadata': self.metadata_json if include_metadata else None,
            'is_read': self.is_read,
            'is_important': self.is_important,
            'is_hidden': self.is_hidden,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'read_at': self.read_at.isoformat() if self.read_at else None,
        }


class NotificationPreference(Base):
    """用戶通知偏好設置"""
    __tablename__ = "notification_preferences"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, comment="用戶ID")
    
    # 通知類型開關
    email_notifications = Column(Boolean, default=True, comment="郵件通知")
    webhook_notifications = Column(Boolean, default=True, comment="Webhook通知")
    in_app_notifications = Column(Boolean, default=True, comment="應用內通知")
    
    # 事件類別通知設置
    security_events = Column(Boolean, default=True, comment="安全事件通知")
    moderation_events = Column(Boolean, default=True, comment="審核事件通知")
    user_events = Column(Boolean, default=True, comment="用戶事件通知")
    system_events = Column(Boolean, default=True, comment="系統事件通知")
    
    # 通知頻率控制
    digest_frequency = Column(String(20), default="immediate", comment="通知頻率: immediate, hourly, daily")
    quiet_hours_start = Column(String(5), comment="安靜時段開始 HH:MM")
    quiet_hours_end = Column(String(5), comment="安靜時段結束 HH:MM")
    
    # 時間戳
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # 索引
    __table_args__ = (
        Index('idx_notification_user', 'user_id'),
    )