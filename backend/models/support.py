"""
Support system models - 可營運版支援系統
包含支援單、訊息、事件、標籤等完整資料模型
"""
from __future__ import annotations
from datetime import datetime
from typing import TYPE_CHECKING, List
import enum
import secrets
import string

from sqlalchemy import (
    Integer, String, Text, Boolean, DateTime, 
    ForeignKey, JSON, Index, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from utils.db import Base

if TYPE_CHECKING:
    from models.base import User
    from models.school import School


class TicketStatus(str, enum.Enum):
    """支援單狀態機"""
    OPEN = "open"                    # 新建支援單，等待處理
    AWAITING_USER = "awaiting_user"  # 等待用戶回覆
    AWAITING_ADMIN = "awaiting_admin"  # 等待管理員回覆
    RESOLVED = "resolved"            # 已解決，等待確認
    CLOSED = "closed"               # 已關閉
    REOPENED = "reopened"           # 重新開啟


class TicketCategory(str, enum.Enum):
    """支援單分類"""
    TECHNICAL = "technical"         # 技術問題
    ACCOUNT = "account"            # 帳戶問題
    FEATURE = "feature"            # 功能建議
    BUG = "bug"                   # 錯誤回報
    ABUSE = "abuse"               # 濫用檢舉
    OTHER = "other"               # 其他問題


class TicketPriority(str, enum.Enum):
    """支援單優先級"""
    LOW = "low"           # 低優先級
    MEDIUM = "medium"     # 中優先級  
    HIGH = "high"         # 高優先級
    URGENT = "urgent"     # 緊急


class AuthorType(str, enum.Enum):
    """訊息作者類型"""
    USER = "user"         # 登入用戶
    ADMIN = "admin"       # 管理員
    GUEST = "guest"       # 訪客


class EventType(str, enum.Enum):
    """支援系統事件類型"""
    TICKET_CREATED = "ticket_created"
    MESSAGE_SENT = "message_sent"
    STATUS_CHANGED = "status_changed"
    PRIORITY_CHANGED = "priority_changed"
    LABEL_ADDED = "label_added"
    LABEL_REMOVED = "label_removed"
    ASSIGNED = "assigned"
    UNASSIGNED = "unassigned"
    GUEST_VERIFIED = "guest_verified"
    NOTIFICATION_SENT = "notification_sent"
    NOTIFICATION_FAILED = "notification_failed"


def generate_public_id() -> str:
    """生成公開支援單 ID: SUP-XXXXXX 格式"""
    random_part = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    return f"SUP-{random_part}"


def generate_pseudonym_code() -> str:
    """為訪客生成匿名代碼: GUEST-XXXX 格式"""
    random_part = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
    return f"GUEST-{random_part}"


class SupportTicket(Base):
    """支援單主表"""
    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 公開 ID（對外顯示，不透露內部 ID）
    public_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    
    # 所屬學校/租戶（支援多校擴展）
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True, index=True)
    
    # 用戶身份（登入用戶或訪客）
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    guest_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    pseudonym_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)  # 訪客顯示名稱
    
    # 支援單內容
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False, default=TicketCategory.OTHER)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default=TicketPriority.MEDIUM)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=TicketStatus.OPEN, index=True)
    
    # 指派與負責人
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    
    # 訪客驗證狀態
    guest_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    guest_reply_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)  # 訪客回覆token的hash
    
    # 時間戳記
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # 統計數據
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # 關聯關係
    school: Mapped["School | None"] = relationship("School", back_populates="support_tickets")
    user: Mapped["User | None"] = relationship("User", foreign_keys=[user_id], back_populates="submitted_tickets")
    assigned_user: Mapped["User | None"] = relationship("User", foreign_keys=[assigned_to], back_populates="assigned_tickets")
    messages: Mapped[List["SupportMessage"]] = relationship("SupportMessage", back_populates="ticket", cascade="all, delete-orphan", order_by="SupportMessage.created_at")
    events: Mapped[List["SupportEvent"]] = relationship("SupportEvent", back_populates="ticket", cascade="all, delete-orphan", order_by="SupportEvent.created_at")
    watchers: Mapped[List["TicketWatcher"]] = relationship("TicketWatcher", back_populates="ticket", cascade="all, delete-orphan")
    labels: Mapped[List["SupportTicketLabel"]] = relationship("SupportTicketLabel", back_populates="ticket", cascade="all, delete-orphan")
    
    def __init__(self, **kwargs):
        # 自動生成 public_id
        if 'public_id' not in kwargs:
            kwargs['public_id'] = generate_public_id()
        
        # 如果是訪客工單，生成匿名代碼
        if 'user_id' not in kwargs or kwargs['user_id'] is None:
            if 'pseudonym_code' not in kwargs:
                kwargs['pseudonym_code'] = generate_pseudonym_code()
        
        super().__init__(**kwargs)
    
    def can_access(self, user_id: int | None = None, guest_signature: str | None = None) -> bool:
        """檢查是否有權限存取此支援單"""
        # 登入用戶：必須是建立者
        if user_id and self.user_id == user_id:
            return True
        
        # 訪客：需要有效簽章或已驗證
        if guest_signature and self.guest_email:
            # TODO: 實際驗證簽章
            return True
            
        # 管理員權限在 API 層處理
        return False
    
    def get_display_name(self) -> str:
        """取得顯示名稱"""
        if self.user:
            return self.user.username
        elif self.pseudonym_code:
            return self.pseudonym_code
        else:
            return "匿名用戶"


class SupportMessage(Base):
    """支援單訊息"""
    __tablename__ = "support_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id"), nullable=False, index=True)
    
    # 訊息作者
    author_type: Mapped[str] = mapped_column(String(10), nullable=False, default=AuthorType.USER)
    author_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    
    # 訊息內容
    body: Mapped[str] = mapped_column(Text, nullable=False)
    attachments: Mapped[dict] = mapped_column(JSON, nullable=True)  # 附件清單 JSON
    
    # 內部備註（不對客戶顯示）
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # 時間戳記
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 關聯關係
    ticket: Mapped["SupportTicket"] = relationship("SupportTicket", back_populates="messages")
    author_user: Mapped["User | None"] = relationship("User", back_populates="support_messages")
    
    def get_author_display_name(self) -> str:
        """取得作者顯示名稱"""
        if self.author_type == AuthorType.ADMIN:
            return self.author_user.username if self.author_user else "管理員"
        elif self.author_type == AuthorType.USER:
            return self.author_user.username if self.author_user else "用戶"
        else:  # GUEST
            return self.ticket.pseudonym_code if self.ticket.pseudonym_code else "訪客"


class SupportEvent(Base):
    """支援系統事件紀錄（審計用）"""
    __tablename__ = "support_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id"), nullable=False, index=True)
    
    # 事件類型與內容
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=True)  # 事件相關資料
    
    # 觸發者
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    
    # 時間戳記
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 關聯關係
    ticket: Mapped["SupportTicket"] = relationship("SupportTicket", back_populates="events")
    actor: Mapped["User | None"] = relationship("User", back_populates="support_events")


class TicketWatcher(Base):
    """支援單關注者（用於通知）"""
    __tablename__ = "ticket_watchers"

    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    
    # 關注時間
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 關聯關係
    ticket: Mapped["SupportTicket"] = relationship("SupportTicket", back_populates="watchers")
    user: Mapped["User"] = relationship("User", back_populates="watched_tickets")


class SupportLabel(Base):
    """支援單標籤"""
    __tablename__ = "support_labels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6B7280")  # hex color
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    
    # 時間戳記
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 關聯關係
    ticket_labels: Mapped[List["SupportTicketLabel"]] = relationship("SupportTicketLabel", back_populates="label", cascade="all, delete-orphan")


class SupportTicketLabel(Base):
    """支援單標籤關聯表"""
    __tablename__ = "support_ticket_labels"

    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id"), primary_key=True)
    label_id: Mapped[int] = mapped_column(ForeignKey("support_labels.id"), primary_key=True)
    
    # 添加時間與操作者
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    added_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    
    # 關聯關係
    ticket: Mapped["SupportTicket"] = relationship("SupportTicket", back_populates="labels")
    label: Mapped["SupportLabel"] = relationship("SupportLabel", back_populates="ticket_labels")
    added_by_user: Mapped["User | None"] = relationship("User")


# 創建索引以優化查詢效能
Index("idx_support_tickets_status_created", SupportTicket.status, SupportTicket.created_at.desc())
Index("idx_support_tickets_school_status", SupportTicket.school_id, SupportTicket.status)
Index("idx_support_tickets_assigned_status", SupportTicket.assigned_to, SupportTicket.status)
Index("idx_support_tickets_last_activity", SupportTicket.last_activity_at.desc())
Index("idx_support_messages_ticket_created", SupportMessage.ticket_id, SupportMessage.created_at)
Index("idx_support_events_ticket_type", SupportEvent.ticket_id, SupportEvent.event_type)
Index("idx_support_tickets_guest_email", SupportTicket.guest_email)
Index("idx_support_tickets_public_id", SupportTicket.public_id, unique=True)