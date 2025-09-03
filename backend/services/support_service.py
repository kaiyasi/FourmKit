"""
Support ticket service layer - 支援工單業務邏輯
處理工單創建、狀態變更、訊息管理等核心業務
"""
from __future__ import annotations
import hashlib
import hmac
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, func

from models.support import (
    SupportTicket, SupportMessage, SupportEvent, TicketStatus, TicketCategory, TicketPriority, AuthorType, EventType
)
from models.base import User
from flask import current_app


class SupportService:
    """支援工單服務類"""
    
    @staticmethod
    def create_ticket(
        session: Session,
        subject: str,
        body: str,
        category: str = TicketCategory.OTHER,
        priority: str = TicketPriority.MEDIUM,
        user_id: Optional[int] = None,
        guest_email: Optional[str] = None,
        school_id: Optional[int] = None,
        attachments: Optional[Dict] = None
    ) -> SupportTicket:
        """創建新工單"""
        
        # 驗證必要參數
        if not subject.strip() or not body.strip():
            raise ValueError("主題和內容不能為空")
        
        # 登入用戶或訪客必須二選一
        if not user_id and not guest_email:
            raise ValueError("必須提供用戶ID或訪客Email")
        
        # 創建工單
        ticket = SupportTicket(
            subject=subject.strip()[:500],  # 限制長度
            category=category,
            priority=priority,
            user_id=user_id,
            guest_email=guest_email.strip().lower() if guest_email else None,
            school_id=school_id,
            status=TicketStatus.OPEN
        )
        
        session.add(ticket)
        session.flush()  # 獲取 ticket.id
        
        # 創建初始訊息
        initial_message = SupportMessage(
            ticket_id=ticket.id,
            author_type=AuthorType.USER if user_id else AuthorType.GUEST,
            author_user_id=user_id,
            body=body,
            attachments=attachments or {}
        )
        session.add(initial_message)
        
        # 記錄創建事件
        event = SupportEvent(
            ticket_id=ticket.id,
            event_type=EventType.TICKET_CREATED,
            actor_user_id=user_id,
            payload={
                'subject': subject,
                'category': category,
                'priority': priority,
                'is_guest': user_id is None,
                'guest_email': guest_email
            }
        )
        session.add(event)
        
        # 更新統計
        ticket.message_count = 1
        ticket.last_activity_at = datetime.now(timezone.utc)
        
        session.commit()
        
        # 發送 Socket.IO 事件
        try:
            from socket_events import broadcast_support_event
            broadcast_support_event("ticket_created", ticket.public_id, {
                "subject": ticket.subject,
                "category": ticket.category,
                "priority": ticket.priority,
                "submitter": ticket.get_display_name(),
                "is_guest": user_id is None
            })
        except Exception as e:
            current_app.logger.warning(f"Failed to broadcast ticket_created event: {e}")
        
        return ticket
    
    @staticmethod
    def add_message(
        session: Session,
        ticket_id: int,
        body: str,
        author_user_id: Optional[int] = None,
        author_type: str = AuthorType.USER,
        is_internal: bool = False,
        attachments: Optional[Dict] = None
    ) -> SupportMessage:
        """新增工單訊息"""
        
        if not body.strip():
            raise ValueError("訊息內容不能為空")
        
        # 檢查工單是否存在
        ticket = session.get(SupportTicket, ticket_id)
        if not ticket:
            raise ValueError("工單不存在")
        
        # 檢查工單狀態
        if ticket.status == TicketStatus.CLOSED:
            raise ValueError("已關閉的工單無法回覆")
        
        # 創建訊息
        message = SupportMessage(
            ticket_id=ticket_id,
            author_type=author_type,
            author_user_id=author_user_id,
            body=body.strip(),
            is_internal=is_internal,
            attachments=attachments or {}
        )
        session.add(message)
        
        # 記錄事件
        event = SupportEvent(
            ticket_id=ticket_id,
            event_type=EventType.MESSAGE_SENT,
            actor_user_id=author_user_id,
            payload={
                'author_type': author_type,
                'is_internal': is_internal,
                'message_length': len(body),
                'has_attachments': bool(attachments)
            }
        )
        session.add(event)
        
        # 更新工單統計和狀態
        ticket.message_count += 1
        ticket.last_activity_at = datetime.now(timezone.utc)
        
        # 自動狀態轉換
        if author_type == AuthorType.ADMIN:
            if ticket.status in [TicketStatus.OPEN, TicketStatus.AWAITING_ADMIN]:
                ticket.status = TicketStatus.AWAITING_USER
        else:
            if ticket.status == TicketStatus.AWAITING_USER:
                ticket.status = TicketStatus.AWAITING_ADMIN
        
        session.commit()
        
        # 發送 Socket.IO 事件
        try:
            from socket_events import broadcast_support_event
            broadcast_support_event("message_sent", ticket.public_id, {
                "message_id": message.id,
                "author_type": author_type,
                "author_name": message.get_author_display_name(),
                "body_preview": body[:100] + ('...' if len(body) > 100 else ''),
                "is_internal": is_internal,
                "new_status": ticket.status
            })
        except Exception as e:
            current_app.logger.warning(f"Failed to broadcast message_sent event: {e}")
        
        return message
    
    @staticmethod
    def change_status(
        session: Session,
        ticket_id: int,
        new_status: str,
        actor_user_id: Optional[int] = None,
        reason: Optional[str] = None
    ) -> bool:
        """變更工單狀態"""
        
        ticket = session.get(SupportTicket, ticket_id)
        if not ticket:
            raise ValueError("工單不存在")
        
        old_status = ticket.status
        if old_status == new_status:
            return False  # 狀態無變化
        
        # 狀態轉換驗證
        # 狀態機調整：不再使用 REOPENED，改以回到 OPEN 表示重新開啟。
        valid_transitions = {
            TicketStatus.OPEN: [
                TicketStatus.AWAITING_USER,
                TicketStatus.AWAITING_ADMIN,
                TicketStatus.RESOLVED,
                TicketStatus.CLOSED,
            ],
            TicketStatus.AWAITING_USER: [
                TicketStatus.AWAITING_ADMIN,
                TicketStatus.RESOLVED,
                TicketStatus.CLOSED,
                TicketStatus.OPEN,   # 允許回到 OPEN（重新開啟）
            ],
            TicketStatus.AWAITING_ADMIN: [
                TicketStatus.AWAITING_USER,
                TicketStatus.RESOLVED,
                TicketStatus.CLOSED,
                TicketStatus.OPEN,   # 允許回到 OPEN（重新開啟）
            ],
            TicketStatus.RESOLVED: [
                TicketStatus.CLOSED,
                TicketStatus.OPEN,   # 允許回到 OPEN（重新開啟）
            ],
            TicketStatus.CLOSED: [
                TicketStatus.OPEN,   # 允許回到 OPEN（重新開啟）
            ],
            # TicketStatus.REOPENED: 不再使用
        }
        
        if new_status not in valid_transitions.get(old_status, []):
            raise ValueError(f"無法從 {old_status} 轉換到 {new_status}")
        
        # 更新狀態
        ticket.status = new_status
        ticket.last_activity_at = datetime.now(timezone.utc)
        
        # 記錄狀態變更事件
        event = SupportEvent(
            ticket_id=ticket_id,
            event_type=EventType.STATUS_CHANGED,
            actor_user_id=actor_user_id,
            payload={
                'old_status': old_status,
                'new_status': new_status,
                'reason': reason
            }
        )
        session.add(event)
        
        session.commit()
        
        # 發送 Socket.IO 事件
        try:
            from socket_events import broadcast_support_event
            broadcast_support_event("status_changed", ticket.public_id, {
                "old_status": old_status,
                "new_status": new_status,
                "reason": reason,
                "subject": ticket.subject
            })
        except Exception as e:
            current_app.logger.warning(f"Failed to broadcast status_changed event: {e}")
        
        return True
    
    @staticmethod
    def assign_ticket(
        session: Session,
        ticket_id: int,
        assignee_user_id: Optional[int],
        actor_user_id: Optional[int] = None
    ) -> bool:
        """指派工單"""
        
        ticket = session.get(SupportTicket, ticket_id)
        if not ticket:
            raise ValueError("工單不存在")
        
        old_assignee = ticket.assigned_to
        if old_assignee == assignee_user_id:
            return False  # 指派對象無變化
        
        # 檢查被指派者是否為管理員
        if assignee_user_id:
            assignee = session.get(User, assignee_user_id)
            if not assignee or assignee.role not in ['dev_admin', 'campus_admin', 'cross_admin']:
                raise ValueError("只能指派給管理員")
        
        # 更新指派
        ticket.assigned_to = assignee_user_id
        ticket.last_activity_at = datetime.now(timezone.utc)
        
        # 記錄指派事件
        event_type = EventType.ASSIGNED if assignee_user_id else EventType.UNASSIGNED
        event = SupportEvent(
            ticket_id=ticket_id,
            event_type=event_type,
            actor_user_id=actor_user_id,
            payload={
                'old_assignee_id': old_assignee,
                'new_assignee_id': assignee_user_id
            }
        )
        session.add(event)
        
        # 添加前端通知事件
        try:
            from utils.notify import send_admin_event
            
            if assignee_user_id:
                # 指派通知
                send_admin_event(
                    kind="support_ticket_assigned",
                    title=f"工單已指派：{ticket.subject}",
                    description=f"工單已指派給管理員處理",
                    fields=[
                        {"name": "工單編號", "value": ticket.public_id, "inline": True},
                        {"name": "主旨", "value": ticket.subject, "inline": True},
                        {"name": "優先級", "value": ticket.priority, "inline": True},
                        {"name": "指派者", "value": f"管理員 #{actor_user_id}" if actor_user_id else "系統", "inline": True}
                    ],
                    source=f"/api/admin/support/tickets/{ticket.public_id}",
                    actor=f"管理員 #{actor_user_id}" if actor_user_id else "系統"
                )
            else:
                # 移除指派通知
                send_admin_event(
                    kind="support_ticket_unassigned",
                    title=f"工單指派已移除：{ticket.subject}",
                    description=f"工單指派已被移除",
                    fields=[
                        {"name": "工單編號", "value": ticket.public_id, "inline": True},
                        {"name": "主旨", "value": ticket.subject, "inline": True},
                        {"name": "操作者", "value": f"管理員 #{actor_user_id}" if actor_user_id else "系統", "inline": True}
                    ],
                    source=f"/api/admin/support/tickets/{ticket.public_id}",
                    actor=f"管理員 #{actor_user_id}" if actor_user_id else "系統"
                )
        except Exception as e:
            # 通知失敗不影響主要功能
            print(f"Failed to send assignment notification: {e}")
        
        session.commit()
        return True
    
    @staticmethod
    def get_tickets_by_user(
        session: Session,
        user_id: int,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> List[SupportTicket]:
        """取得用戶的工單列表（包含之前以訪客身份建立的）"""
        
        # 獲取用戶的 email
        user = session.get(User, user_id)
        user_email = user.email.lower() if user and user.email else None
        
        # 查詢條件：user_id 匹配 或 guest_email 匹配
        if user_email:
            query = session.query(SupportTicket).filter(
                or_(
                    SupportTicket.user_id == user_id,
                    SupportTicket.guest_email == user_email
                )
            )
        else:
            query = session.query(SupportTicket).filter(
                SupportTicket.user_id == user_id
            )
        
        if status:
            query = query.filter(SupportTicket.status == status)
        
        return query.order_by(desc(SupportTicket.last_activity_at)).offset(offset).limit(limit).all()
    
    @staticmethod
    def get_admin_tickets(
        session: Session,
        status: Optional[str] = None,
        school_id: Optional[int] = None,
        assigned_to: Optional[int] = None,
        category: Optional[str] = None,
        search_query: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        user_role: Optional[str] = None
    ) -> Tuple[List[SupportTicket], int]:
        """取得管理員工單列表（含總數）"""
        
        query = session.query(SupportTicket)
        
        # 權限控制：非 dev_admin 只能看到已分配的工單
        if user_role and user_role != 'dev_admin':
            query = query.filter(SupportTicket.assigned_to.isnot(None))
        
        # 應用篩選條件
        if status:
            query = query.filter(SupportTicket.status == status)
        if school_id:
            query = query.filter(SupportTicket.school_id == school_id)
        if assigned_to:
            query = query.filter(SupportTicket.assigned_to == assigned_to)
        if category:
            query = query.filter(SupportTicket.category == category)
        
        # 搜尋功能
        if search_query:
            search_term = f"%{search_query}%"
            query = query.filter(
                or_(
                    SupportTicket.subject.ilike(search_term),
                    SupportTicket.public_id.ilike(search_term)
                )
            )
        
        # 計算總數
        total_count = query.count()
        
        # 取得分頁結果
        tickets = query.order_by(desc(SupportTicket.last_activity_at)).offset(offset).limit(limit).all()
        
        return tickets, total_count
    
    @staticmethod
    def generate_guest_token(ticket_id: int, guest_email: str, secret_key: str) -> str:
        """為訪客生成簽章 token"""
        
        # 創建簽章載荷
        expires_at = datetime.now(timezone.utc) + timedelta(days=30)  # 30天有效
        payload = f"{ticket_id}:{guest_email}:{int(expires_at.timestamp())}"
        
        # 使用 HMAC 簽章
        signature = hmac.new(
            secret_key.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return f"{payload}:{signature}"
    
    @staticmethod
    def verify_guest_token(token: str, secret_key: str) -> Optional[Tuple[int, str]]:
        """驗證訪客 token"""
        
        try:
            parts = token.split(':')
            if len(parts) != 4:
                return None
            
            ticket_id, guest_email, expires_str, signature = parts
            
            # 檢查是否過期
            expires_at = datetime.fromtimestamp(int(expires_str), tz=timezone.utc)
            if datetime.now(timezone.utc) > expires_at:
                return None
            
            # 驗證簽章
            payload = f"{ticket_id}:{guest_email}:{expires_str}"
            expected_signature = hmac.new(
                secret_key.encode('utf-8'),
                payload.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            
            if not hmac.compare_digest(signature, expected_signature):
                return None
            
            return int(ticket_id), guest_email
            
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def get_support_stats(session: Session, school_id: Optional[int] = None) -> Dict[str, Any]:
        """取得支援系統統計資料"""
        
        base_query = session.query(SupportTicket)
        if school_id:
            base_query = base_query.filter(SupportTicket.school_id == school_id)
        
        # 基本統計
        total_tickets = base_query.count()
        open_tickets = base_query.filter(SupportTicket.status.in_([
            TicketStatus.OPEN, TicketStatus.AWAITING_ADMIN, TicketStatus.AWAITING_USER
        ])).count()
        resolved_tickets = base_query.filter(SupportTicket.status == TicketStatus.RESOLVED).count()
        closed_tickets = base_query.filter(SupportTicket.status == TicketStatus.CLOSED).count()
        
        # 優先級統計
        priority_stats = session.query(
            SupportTicket.priority,
            func.count(SupportTicket.id)
        ).group_by(SupportTicket.priority).all()
        
        # 分類統計
        category_stats = session.query(
            SupportTicket.category,
            func.count(SupportTicket.id)
        ).group_by(SupportTicket.category).all()
        
        # 今日統計
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_tickets = base_query.filter(SupportTicket.created_at >= today_start).count()
        
        return {
            'total_tickets': total_tickets,
            'open_tickets': open_tickets,
            'resolved_tickets': resolved_tickets,
            'closed_tickets': closed_tickets,
            'today_tickets': today_tickets,
            'priority_distribution': dict(priority_stats),
            'category_distribution': dict(category_stats),
            'resolution_rate': round((resolved_tickets + closed_tickets) / total_tickets * 100, 2) if total_tickets > 0 else 0
        }
