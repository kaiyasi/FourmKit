# backend/models/tickets.py
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, ForeignKey, Text, Boolean, Index, func
import enum
from typing import TYPE_CHECKING
from utils.db import Base

if TYPE_CHECKING:
    from .base import User


class TicketStatus(str, enum.Enum):
    open = "open"           # 開放中（新建立）
    assigned = "assigned"   # 已指派
    in_progress = "in_progress"  # 處理中
    waiting = "waiting"     # 等待回應
    resolved = "resolved"   # 已解決
    closed = "closed"       # 已關閉


class TicketPriority(str, enum.Enum):
    low = "low"         # 低
    medium = "medium"   # 中
    high = "high"       # 高
    urgent = "urgent"   # 緊急


class TicketCategory(str, enum.Enum):
    account = "account"           # 帳戶問題
    technical = "technical"       # 技術問題
    content = "content"          # 內容相關
    feature = "feature"          # 功能建議
    abuse = "abuse"              # 濫用/檢舉
    moderation = "moderation"    # 審核相關
    other = "other"              # 其他問題


class SupportTicket(Base):
    """工單主表"""
    __tablename__ = "support_tickets"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)  # FK-20250828-AB12CD34
    
    # 提交者資訊
    submitter_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # 登入用戶ID，可能為空（匿名用戶）
    submitter_email: Mapped[str | None] = mapped_column(String(255), nullable=True)  # 匿名用戶Email
    submitter_name: Mapped[str | None] = mapped_column(String(64), nullable=True)    # 匿名用戶姓名
    submitter_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)      # 提交者IP
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)       # 瀏覽器資訊
    
    # 工單基本資訊
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    
    # 處理資訊
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # 指派的管理員
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)  # 關聯學校（校內問題）
    scope: Mapped[str] = mapped_column(String(10), nullable=False, default="cross")  # cross/school
    
    # 時間戳記
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 統計資訊
    response_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)    # 回應數量
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)        # 檢視次數
    
    # 標記
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)    # 是否公開（FAQ等）
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)    # 是否鎖定回覆
    is_urgent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)    # 緊急標記
    
    # 關聯關係
    submitter: Mapped["User | None"] = relationship("User", foreign_keys=[submitter_id], back_populates="submitted_tickets")
    assigned_user: Mapped["User | None"] = relationship("User", foreign_keys=[assigned_to], back_populates="assigned_tickets")
    responses: Mapped[list["TicketResponse"]] = relationship("TicketResponse", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketResponse.created_at")
    attachments: Mapped[list["TicketAttachment"]] = relationship("TicketAttachment", back_populates="ticket", cascade="all, delete-orphan")
    history: Mapped[list["TicketHistory"]] = relationship("TicketHistory", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketHistory.created_at")


class TicketResponse(Base):
    """工單回應表"""
    __tablename__ = "ticket_responses"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id"), nullable=False, index=True)
    
    # 回應者資訊
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # 回應者（管理員或用戶）
    author_name: Mapped[str | None] = mapped_column(String(64), nullable=True)            # 匿名用戶回應姓名
    author_email: Mapped[str | None] = mapped_column(String(255), nullable=True)         # 匿名用戶回應Email
    
    # 回應內容
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)     # 內部備註（不對用戶顯示）
    is_staff_response: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # 是否為員工回應
    
    # 元數據
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    
    # 關聯關係
    ticket: Mapped["SupportTicket"] = relationship("SupportTicket", back_populates="responses")
    author: Mapped["User | None"] = relationship("User", back_populates="ticket_responses")


class TicketAttachment(Base):
    """工單附件表"""
    __tablename__ = "ticket_attachments"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id"), nullable=False, index=True)
    response_id: Mapped[int | None] = mapped_column(ForeignKey("ticket_responses.id"), nullable=True)  # 屬於哪個回應（可選）
    
    # 檔案資訊
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)  # 實際儲存路徑
    
    # 上傳者資訊
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 關聯關係
    ticket: Mapped["SupportTicket"] = relationship("SupportTicket", back_populates="attachments")
    response: Mapped["TicketResponse | None"] = relationship("TicketResponse")
    uploader: Mapped["User | None"] = relationship("User")


class TicketHistory(Base):
    """工單歷史紀錄表"""
    __tablename__ = "ticket_history"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id"), nullable=False, index=True)
    
    # 異動資訊
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # created, assigned, status_changed, priority_changed, etc.
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # 執行動作的用戶
    actor_name: Mapped[str | None] = mapped_column(String(64), nullable=True)            # 匿名用戶名稱
    
    # 變更內容
    field_name: Mapped[str | None] = mapped_column(String(50), nullable=True)   # 變更的欄位名稱
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)          # 舊值
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)          # 新值
    description: Mapped[str | None] = mapped_column(Text, nullable=True)        # 異動描述
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 關聯關係
    ticket: Mapped["SupportTicket"] = relationship("SupportTicket", back_populates="history")
    actor: Mapped["User | None"] = relationship("User")


class UserIdentityCode(Base):
    """用戶識別碼表（匿名工單追蹤用）"""
    __tablename__ = "user_identity_codes"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)  # 識別碼
    
    # 綁定資訊
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # 綁定的用戶（可選）
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)              # 綁定的Email
    name: Mapped[str | None] = mapped_column(String(64), nullable=True)                # 姓名
    
    # 驗證資訊
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verification_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # 使用統計
    ticket_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)      # 工單數量
    last_used: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 關聯關係
    user: Mapped["User | None"] = relationship("User", back_populates="identity_codes")


# 更新 User 模型的關聯關係（需要在 base.py 中添加）
# submitted_tickets: Mapped[list["SupportTicket"]] = relationship("SupportTicket", foreign_keys="SupportTicket.submitter_id", back_populates="submitter")
# assigned_tickets: Mapped[list["SupportTicket"]] = relationship("SupportTicket", foreign_keys="SupportTicket.assigned_to", back_populates="assigned_user") 
# ticket_responses: Mapped[list["TicketResponse"]] = relationship("TicketResponse", back_populates="author")
# identity_codes: Mapped[list["UserIdentityCode"]] = relationship("UserIdentityCode", back_populates="user")


# 索引優化
Index("idx_tickets_status_created", SupportTicket.status, SupportTicket.created_at.desc())
Index("idx_tickets_assigned_status", SupportTicket.assigned_to, SupportTicket.status)
Index("idx_tickets_number", SupportTicket.ticket_number)
Index("idx_tickets_category_status", SupportTicket.category, SupportTicket.status)
Index("idx_responses_ticket_created", TicketResponse.ticket_id, TicketResponse.created_at)
Index("idx_identity_codes_code", UserIdentityCode.code)