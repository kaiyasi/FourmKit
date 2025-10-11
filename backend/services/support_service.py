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
    SupportTicket, SupportMessage, SupportEvent, TicketStatus, TicketCategory, AuthorType, EventType
)
from models.base import User
from flask import current_app
from sqlalchemy.orm import Session
import secrets
import string


class SupportService:
    """支援工單服務類"""
    
    @staticmethod
    def create_ticket(
        session: Session,
        subject: str,
        body: str,
        category: str = TicketCategory.OTHER,
        user_id: Optional[int] = None,
        guest_email: Optional[str] = None,
        school_id: Optional[int] = None,
        attachments: Optional[Dict] = None,
        client_ip: Optional[str] = None
    ) -> SupportTicket:
        """創建新工單"""
        
        if not subject.strip() or not body.strip():
            raise ValueError("主題和內容不能為空")
        
        if not user_id and not guest_email:
            raise ValueError("必須提供用戶ID或訪客Email")
        
        if user_id:
            public_id = SupportService._gen_user_ticket_id(session, int(user_id), category)
        else:
            public_id = SupportService._gen_guest_ticket_id(session, category)

        ticket = SupportTicket(
            subject=subject.strip()[:500],
            category=category,
            user_id=user_id,
            guest_email=guest_email.strip().lower() if guest_email else None,
            school_id=school_id,
            status=TicketStatus.OPEN,
            public_id=public_id
        )
        
        session.add(ticket)
        session.flush()
        
        initial_message = SupportMessage(
            ticket_id=ticket.id,
            author_type=AuthorType.USER if user_id else AuthorType.GUEST,
            author_user_id=user_id,
            body=body,
            attachments=attachments or {}
        )
        session.add(initial_message)
        
        event = SupportEvent(
            ticket_id=ticket.id,
            event_type=EventType.TICKET_CREATED,
            actor_user_id=user_id,
            payload={
                'subject': subject,
                'category': category,
                'is_guest': user_id is None,
                'guest_email': guest_email,
                'client_ip': client_ip
            }
        )
        session.add(event)
        
        ticket.message_count = 1
        ticket.last_activity_at = datetime.now(timezone.utc)
        
        session.commit()
        
        try:
            from socket_events import broadcast_support_event
            broadcast_support_event("ticket_created", ticket.public_id, {
                "subject": ticket.subject,
                "category": ticket.category,
                "submitter": ticket.get_display_name(),
                "is_guest": user_id is None
            })
        except Exception as e:
            try:
                current_app.logger.warning(f"Failed to broadcast ticket_created event: {e}")
            except RuntimeError:
                print(f"Failed to broadcast ticket_created event: {e}")
        
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
        
        ticket = session.get(SupportTicket, ticket_id)
        if not ticket:
            raise ValueError("工單不存在")
        
        if ticket.status == TicketStatus.CLOSED:
            raise ValueError("已關閉的工單無法回覆")
        
        message = SupportMessage(
            ticket_id=ticket_id,
            author_type=author_type,
            author_user_id=author_user_id,
            body=body.strip(),
            is_internal=is_internal,
            attachments=attachments or {}
        )
        session.add(message)
        
        event = SupportEvent(
            ticket_id=ticket_id,
            event_type=EventType.MESSAGE_SENT,
            actor_user_id=author_user_id,
            payload={
                'author_type': author_type,
                'is_internal': is_internal,
                'message_length': len(body),
                'has_attachments': bool(attachments),
                'client_ip': None
            }
        )
        session.add(event)
        
        ticket.message_count += 1
        ticket.last_activity_at = datetime.now(timezone.utc)
        
        if author_type == AuthorType.ADMIN:
            if ticket.status in [TicketStatus.OPEN, TicketStatus.AWAITING_ADMIN]:
                ticket.status = TicketStatus.AWAITING_USER
        else:
            if ticket.status == TicketStatus.AWAITING_USER:
                ticket.status = TicketStatus.AWAITING_ADMIN
        
        session.commit()
        
        try:
            from socket_events import broadcast_support_event
            broadcast_support_event("message_sent", ticket.public_id, {
                "message_id": message.id,
                "author_type": author_type,
                "author_name": message.get_author_display_name(),
                "author_user_id": author_user_id,
                "body": body,
                "body_preview": body[:100] + ('...' if len(body) > 100 else ''),
                "is_internal": is_internal,
                "new_status": ticket.status
            })
        except Exception as e:
            try:
                current_app.logger.warning(f"Failed to broadcast message_sent event: {e}")
            except RuntimeError:
                print(f"Failed to broadcast message_sent event: {e}")
        
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
            return False
        
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
                TicketStatus.OPEN,
            ],
            TicketStatus.AWAITING_ADMIN: [
                TicketStatus.AWAITING_USER,
                TicketStatus.RESOLVED,
                TicketStatus.CLOSED,
                TicketStatus.OPEN,
            ],
            TicketStatus.RESOLVED: [
                TicketStatus.CLOSED,
                TicketStatus.OPEN,
            ],
            TicketStatus.CLOSED: [
                TicketStatus.OPEN,
            ],
        }
        
        if new_status not in valid_transitions.get(old_status, []):
            raise ValueError(f"無法從 {old_status} 轉換到 {new_status}")
        
        ticket.status = new_status
        ticket.last_activity_at = datetime.now(timezone.utc)
        
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
        
        try:
            from socket_events import broadcast_support_event
            broadcast_support_event("status_changed", ticket.public_id, {
                "old_status": old_status,
                "new_status": new_status,
                "reason": reason,
                "subject": ticket.subject
            })
        except Exception as e:
            try:
                current_app.logger.warning(f"Failed to broadcast status_changed event: {e}")
            except RuntimeError:
                print(f"Failed to broadcast status_changed event: {e}")
        
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
        
        if assignee_user_id:
            assignee = session.get(User, assignee_user_id)
            if not assignee or assignee.role not in ['dev_admin', 'campus_admin', 'cross_admin']:
                raise ValueError("只能指派給管理員")
        
        ticket.assigned_to = assignee_user_id
        ticket.last_activity_at = datetime.now(timezone.utc)
        
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
        
        try:
            from utils.notify import send_admin_event
            
            if assignee_user_id:
                send_admin_event(
                    kind="support_ticket_assigned",
                    title=f"工單已指派：{ticket.subject}",
                    description=f"工單已指派給管理員處理",
                    fields=[
                        {"name": "工單編號", "value": ticket.public_id, "inline": True},
                        {"name": "主旨", "value": ticket.subject, "inline": True},
                        {"name": "指派者", "value": f"管理員 #{actor_user_id}" if actor_user_id else "系統", "inline": True}
                    ],
                    source=f"/api/admin/support/tickets/{ticket.public_id}",
                    actor=f"管理員 #{actor_user_id}" if actor_user_id else "系統"
                )
            else:
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
        
        user = session.get(User, user_id)
        user_email = user.email.lower() if user and user.email else None
        
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
        
        if user_role and user_role != 'dev_admin':
            query = query.filter(SupportTicket.assigned_to.isnot(None))
        
        if status:
            query = query.filter(SupportTicket.status == status)
        if school_id:
            query = query.filter(SupportTicket.school_id == school_id)
        if assigned_to:
            query = query.filter(SupportTicket.assigned_to == assigned_to)
        if category:
            query = query.filter(SupportTicket.category == category)
        
        if search_query:
            search_term = f"%{search_query}%"
            query = query.filter(
                or_(
                    SupportTicket.subject.ilike(search_term),
                    SupportTicket.public_id.ilike(search_term)
                )
            )
        
        total_count = query.count()
        
        tickets = query.order_by(desc(SupportTicket.last_activity_at)).offset(offset).limit(limit).all()
        
        return tickets, total_count
    
    @staticmethod
    def generate_guest_token(ticket_id: int, guest_email: str, secret_key: str) -> str:
        """為訪客生成簽章 token"""
        
        expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        payload = f"{ticket_id}:{guest_email}:{int(expires_at.timestamp())}"
        
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
            
            expires_at = datetime.fromtimestamp(int(expires_str), tz=timezone.utc)
            if datetime.now(timezone.utc) > expires_at:
                return None
            
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
        
        total_tickets = base_query.count()
        open_tickets = base_query.filter(SupportTicket.status.in_([
            TicketStatus.OPEN, TicketStatus.AWAITING_ADMIN, TicketStatus.AWAITING_USER
        ])).count()
        resolved_tickets = base_query.filter(SupportTicket.status == TicketStatus.RESOLVED).count()
        closed_tickets = base_query.filter(SupportTicket.status == TicketStatus.CLOSED).count()
        
<<<<<<< Updated upstream
        # 分類統計
=======
>>>>>>> Stashed changes
        category_stats = session.query(
            SupportTicket.category,
            func.count(SupportTicket.id)
        ).group_by(SupportTicket.category).all()
        
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_tickets = base_query.filter(SupportTicket.created_at >= today_start).count()
        
        return {
            'total_tickets': total_tickets,
            'open_tickets': open_tickets,
            'resolved_tickets': resolved_tickets,
            'closed_tickets': closed_tickets,
            'today_tickets': today_tickets,
            'category_stats': dict(category_stats)
        }

    @staticmethod
    def _gen_user_ticket_id(session: Session, user_id: int, category: str = "general") -> str:
        """為登入用戶生成工單公開ID：格式 XXX-U<user_id>-00X0 或 XXX-U<user_id>-00X0-00X0（如果用完）
        XXX = 類型前綴（根據 category）
        00X0 = 4位隨機混合字元（數字+大寫英文）
        確保在 support_tickets.public_id 上唯一。
        """
        category_prefix = {
            "technical": "TEC",
            "billing": "BIL",
            "account": "ACC",
            "feature": "FEA",
            "bug": "BUG",
            "general": "GEN",
            "other": "OTH"
        }

        prefix = category_prefix.get(category, "SUP")
        charset = string.digits + string.ascii_uppercase

        for _ in range(50):
            rand_code = ''.join(secrets.choice(charset) for _ in range(4))
            pid = f"{prefix}-U{user_id}-{rand_code}"
            exists = session.query(SupportTicket.id).filter(SupportTicket.public_id == pid).first()
            if not exists:
                return pid

        for _ in range(50):
            rand_code1 = ''.join(secrets.choice(charset) for _ in range(4))
            rand_code2 = ''.join(secrets.choice(charset) for _ in range(4))
            pid = f"{prefix}-U{user_id}-{rand_code1}-{rand_code2}"
            exists = session.query(SupportTicket.id).filter(SupportTicket.public_id == pid).first()
            if not exists:
                return pid

        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000) % 100000
        rand_suffix = ''.join(secrets.choice(charset) for _ in range(4))
        return f"{prefix}-U{user_id}-{timestamp:05d}-{rand_suffix}"

    @staticmethod
    def _gen_guest_ticket_id(session: Session, category: str = "general") -> str:
        """為訪客生成工單公開ID：格式 XXX-00X0 或 XXX-00X0-00X0（如果用完）
        XXX = 類型前綴（根據 category）
        00X0 = 4位隨機混合字元（數字+大寫英文）
        如果嘗試多次仍重複，則追加後綴 -00X0
        確保在 support_tickets.public_id 上唯一。
        """
        category_prefix = {
            "technical": "TEC",
            "billing": "BIL",
            "account": "ACC",
            "feature": "FEA",
            "bug": "BUG",
            "general": "GEN",
            "other": "OTH"
        }

        prefix = category_prefix.get(category, "SUP")

        charset = string.digits + string.ascii_uppercase

        for _ in range(50):
            rand_code = ''.join(secrets.choice(charset) for _ in range(4))
            pid = f"{prefix}-{rand_code}"
            exists = session.query(SupportTicket.id).filter(SupportTicket.public_id == pid).first()
            if not exists:
                return pid

        for _ in range(50):
            rand_code1 = ''.join(secrets.choice(charset) for _ in range(4))
            rand_code2 = ''.join(secrets.choice(charset) for _ in range(4))
            pid = f"{prefix}-{rand_code1}-{rand_code2}"
            exists = session.query(SupportTicket.id).filter(SupportTicket.public_id == pid).first()
            if not exists:
                return pid

        for _ in range(50):
            rand_code1 = ''.join(secrets.choice(charset) for _ in range(4))
            rand_code2 = ''.join(secrets.choice(charset) for _ in range(4))
            rand_code3 = ''.join(secrets.choice(charset) for _ in range(4))
            pid = f"{prefix}-{rand_code1}-{rand_code2}-{rand_code3}"
            exists = session.query(SupportTicket.id).filter(SupportTicket.public_id == pid).first()
            if not exists:
                return pid

        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000) % 100000
        rand_suffix = ''.join(secrets.choice(charset) for _ in range(4))
        return f"{prefix}-{timestamp:05d}-{rand_suffix}"
