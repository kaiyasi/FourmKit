"""
Support admin API routes - 後台管理 API（僅 dev_admin）
處理管理員支援單管理、統計、指派等功能
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import desc, func, and_, or_

from models.support import (
    SupportTicket, SupportMessage, SupportEvent, SupportLabel, SupportTicketLabel,
    TicketStatus, TicketCategory, TicketPriority, AuthorType, EventType
)
from models.base import User
from models.school import School
from services.support_service import SupportService
from utils.db import get_session
from utils.authz import require_role
from utils.sanitize import sanitize_html
from utils.notify import send_admin_event

bp = Blueprint("support_admin", __name__, url_prefix="/api/admin/support")


def clean_input(text: str, max_length: int = 1000) -> str:
    """清理用戶輸入"""
    if not text:
        return ""
    
    cleaned = text.strip()[:max_length]
    if '<' in cleaned and '>' in cleaned:
        cleaned = sanitize_html(cleaned)
    
    return cleaned


@bp.route("/tickets", methods=["GET"])
@jwt_required()
@require_role("dev_admin")
def get_admin_tickets():
    """取得管理員支援單列表（含多條件搜尋）"""
    
    try:
        # 取得查詢參數
        status = request.args.get('status')
        school_id = request.args.get('school_id', type=int)
        assigned_to = request.args.get('assigned_to', type=int)
        category = request.args.get('category')
        priority = request.args.get('priority')
        search_query = request.args.get('q', '').strip()
        
        # 分頁參數
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))
        
        with get_session() as session:
            tickets, total_count = SupportService.get_admin_tickets(
                session=session,
                status=status,
                school_id=school_id,
                assigned_to=assigned_to,
                category=category,
                search_query=search_query,
                limit=limit,
                offset=offset
            )
            
            tickets_data = []
            for ticket in tickets:
                # 載入關聯資料
                assignee_name = None
                if ticket.assigned_to:
                    assignee = session.get(User, ticket.assigned_to)
                    assignee_name = assignee.username if assignee else None
                
                school_name = None
                if ticket.school_id:
                    school = session.get(School, ticket.school_id)
                    school_name = school.name if school else None
                
                # 取得最後一條訊息
                last_message = session.query(SupportMessage).filter_by(
                    ticket_id=ticket.id
                ).order_by(desc(SupportMessage.created_at)).first()
                
                # 取得標籤
                labels_query = session.query(SupportLabel).join(
                    SupportTicketLabel, SupportTicketLabel.label_id == SupportLabel.id
                ).filter(SupportTicketLabel.ticket_id == ticket.id)
                labels = [{'key': l.key, 'display_name': l.display_name, 'color': l.color} for l in labels_query]
                
                ticket_data = {
                    'id': ticket.id,
                    'public_id': ticket.public_id,
                    'subject': ticket.subject,
                    'status': ticket.status,
                    'category': ticket.category,
                    'priority': ticket.priority,
                    'submitter': ticket.get_display_name(),
                    'submitter_type': 'user' if ticket.user_id else 'guest',
                    'submitter_email': ticket.guest_email,
                    'assignee': assignee_name,
                    'school': school_name,
                    'message_count': ticket.message_count,
                    'guest_verified': ticket.guest_verified,
                    'created_at': ticket.created_at.isoformat(),
                    'updated_at': ticket.updated_at.isoformat(),
                    'last_activity_at': ticket.last_activity_at.isoformat(),
                    'last_message_preview': last_message.body[:200] + ('...' if last_message and len(last_message.body) > 200 else '') if last_message else None,
                    'labels': labels
                }
                tickets_data.append(ticket_data)
            
            return jsonify({
                'ok': True,
                'tickets': tickets_data,
                'pagination': {
                    'total': total_count,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total_count
                }
            })
    
    except Exception as e:
        current_app.logger.error(f"Get admin tickets error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/tickets/<public_id>", methods=["GET"])
@jwt_required()
@require_role("dev_admin")
def get_admin_ticket_detail(public_id: str):
    """取得工單詳情（管理員視角，包含內部備註）"""
    
    try:
        with get_session() as session:
            ticket = session.query(SupportTicket).filter_by(public_id=public_id).first()
            if not ticket:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_NOT_FOUND', 'msg': '工單不存在'}), 404
            
            # 載入所有訊息（包含內部備註）
            messages = session.query(SupportMessage).filter_by(
                ticket_id=ticket.id
            ).order_by(SupportMessage.created_at).all()
            
            # 載入事件歷史
            events = session.query(SupportEvent).filter_by(
                ticket_id=ticket.id
            ).order_by(SupportEvent.created_at).all()
            
            # 格式化工單資料
            assignee_name = None
            if ticket.assigned_to:
                assignee = session.get(User, ticket.assigned_to)
                assignee_name = assignee.username if assignee else None
            
            school_name = None
            if ticket.school_id:
                school = session.get(School, ticket.school_id)
                school_name = school.name if school else None
            
            # 格式化訊息
            messages_data = []
            for msg in messages:
                message_data = {
                    'id': msg.id,
                    'body': msg.body,
                    'author_type': msg.author_type,
                    'author_name': msg.get_author_display_name(),
                    'is_internal': msg.is_internal,
                    'created_at': msg.created_at.isoformat(),
                    'attachments': msg.attachments or {}
                }
                messages_data.append(message_data)
            
            # 格式化事件
            events_data = []
            for event in events:
                actor_name = None
                if event.actor_user_id:
                    actor = session.get(User, event.actor_user_id)
                    actor_name = actor.username if actor else None
                
                event_data = {
                    'id': event.id,
                    'event_type': event.event_type,
                    'actor': actor_name,
                    'payload': event.payload or {},
                    'created_at': event.created_at.isoformat()
                }
                events_data.append(event_data)
            
            ticket_data = {
                'id': ticket.id,
                'public_id': ticket.public_id,
                'subject': ticket.subject,
                'status': ticket.status,
                'category': ticket.category,
                'priority': ticket.priority,
                'submitter': ticket.get_display_name(),
                'submitter_type': 'user' if ticket.user_id else 'guest',
                'submitter_email': ticket.guest_email,
                'assignee': assignee_name,
                'school': school_name,
                'guest_verified': ticket.guest_verified,
                'created_at': ticket.created_at.isoformat(),
                'updated_at': ticket.updated_at.isoformat(),
                'last_activity_at': ticket.last_activity_at.isoformat(),
                'messages': messages_data,
                'events': events_data
            }
            
            return jsonify({'ok': True, 'ticket': ticket_data})
    
    except Exception as e:
        current_app.logger.error(f"Get admin ticket detail error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/tickets/<public_id>", methods=["PATCH"])
@jwt_required()
@require_role("dev_admin")
def update_ticket(public_id: str):
    """更新工單（狀態、指派、標籤等）"""
    
    data = request.get_json() or {}
    admin_user_id = int(get_jwt_identity())
    
    try:
        with get_session() as session:
            ticket = session.query(SupportTicket).filter_by(public_id=public_id).first()
            if not ticket:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_NOT_FOUND', 'msg': '工單不存在'}), 404
            
            admin_user = session.get(User, admin_user_id)
            changes = []
            
            # 更新狀態
            if 'status' in data:
                new_status = data['status']
                if new_status != ticket.status:
                    if SupportService.change_status(
                        session, ticket.id, new_status, 
                        admin_user_id, data.get('status_reason')
                    ):
                        changes.append(f"狀態: {ticket.status} → {new_status}")
            
            # 更新指派
            if 'assigned_to' in data:
                new_assignee = data['assigned_to']  # 可能是 None
                if new_assignee != ticket.assigned_to:
                    if SupportService.assign_ticket(
                        session, ticket.id, new_assignee, admin_user_id
                    ):
                        old_name = "未指派"
                        new_name = "未指派"
                        if ticket.assigned_to:
                            old_user = session.get(User, ticket.assigned_to)
                            old_name = old_user.username if old_user else f"用戶#{ticket.assigned_to}"
                        if new_assignee:
                            new_user = session.get(User, new_assignee)
                            new_name = new_user.username if new_user else f"用戶#{new_assignee}"
                        changes.append(f"指派: {old_name} → {new_name}")
            
            # 更新優先級
            if 'priority' in data:
                new_priority = data['priority']
                if new_priority != ticket.priority and new_priority in [p.value for p in TicketPriority]:
                    old_priority = ticket.priority
                    ticket.priority = new_priority
                    
                    # 記錄事件
                    event = SupportEvent(
                        ticket_id=ticket.id,
                        event_type=EventType.PRIORITY_CHANGED,
                        actor_user_id=admin_user_id,
                        payload={'old_priority': old_priority, 'new_priority': new_priority}
                    )
                    session.add(event)
                    changes.append(f"優先級: {old_priority} → {new_priority}")
            
            # 更新標籤
            if 'labels' in data:
                label_keys = data['labels']  # 標籤 key 列表
                
                # 移除現有標籤
                session.query(SupportTicketLabel).filter_by(ticket_id=ticket.id).delete()
                
                # 添加新標籤
                if label_keys:
                    labels = session.query(SupportLabel).filter(SupportLabel.key.in_(label_keys)).all()
                    for label in labels:
                        ticket_label = SupportTicketLabel(
                            ticket_id=ticket.id,
                            label_id=label.id,
                            added_by=admin_user_id
                        )
                        session.add(ticket_label)
                
                changes.append(f"標籤已更新: {', '.join(label_keys) if label_keys else '無'}")
            
            # 更新最後活動時間
            if changes:
                ticket.last_activity_at = datetime.now(timezone.utc)
                session.commit()
            
            # 發送通知
            if changes:
                try:
                    send_admin_event(
                        kind="support_ticket_updated",
                        title=f"工單已更新：{ticket.subject}",
                        description=f"管理員 {admin_user.username} 更新了工單",
                        fields=[
                            {"name": "工單編號", "value": ticket.public_id, "inline": True},
                            {"name": "變更內容", "value": '\n'.join(changes), "inline": False}
                        ],
                        source=f"/api/admin/support/tickets/{public_id}",
                        actor=admin_user.username
                    )
                except Exception as e:
                    current_app.logger.warning(f"Failed to send admin event: {e}")
            
            return jsonify({
                'ok': True, 
                'msg': '工單已更新',
                'changes': changes
            })
    
    except ValueError as e:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_VALIDATION', 'msg': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Update ticket error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/tickets/<public_id>/internal-note", methods=["POST"])
@jwt_required()
@require_role("dev_admin")
def add_internal_note(public_id: str):
    """新增內部備註（不對客戶顯示）"""
    
    data = request.get_json() or {}
    body = clean_input(data.get('body', ''), 10000)
    admin_user_id = int(get_jwt_identity())
    
    if not body:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_MISSING_BODY', 'msg': '請輸入備註內容'}), 400
    
    try:
        with get_session() as session:
            ticket = session.query(SupportTicket).filter_by(public_id=public_id).first()
            if not ticket:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_NOT_FOUND', 'msg': '工單不存在'}), 404
            
            # 新增內部備註
            message = SupportService.add_message(
                session=session,
                ticket_id=ticket.id,
                body=body,
                author_user_id=admin_user_id,
                author_type=AuthorType.ADMIN,
                is_internal=True
            )
            
            admin_user = session.get(User, admin_user_id)
            
            return jsonify({
                'ok': True,
                'note': {
                    'id': message.id,
                    'body': message.body,
                    'author': admin_user.username if admin_user else '管理員',
                    'created_at': message.created_at.isoformat()
                },
                'msg': '內部備註已新增'
            }), 201
    
    except Exception as e:
        current_app.logger.error(f"Add internal note error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/tickets/<public_id>/reply", methods=["POST"])
@jwt_required()
@require_role("dev_admin")
def admin_reply(public_id: str):
    """管理員回覆工單"""
    
    data = request.get_json() or {}
    body = clean_input(data.get('body', ''), 10000)
    attachments = data.get('attachments', {})
    admin_user_id = int(get_jwt_identity())
    
    if not body:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_MISSING_BODY', 'msg': '請輸入回覆內容'}), 400
    
    try:
        with get_session() as session:
            ticket = session.query(SupportTicket).filter_by(public_id=public_id).first()
            if not ticket:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_NOT_FOUND', 'msg': '工單不存在'}), 404
            
            # 新增回覆
            message = SupportService.add_message(
                session=session,
                ticket_id=ticket.id,
                body=body,
                author_user_id=admin_user_id,
                author_type=AuthorType.ADMIN,
                is_internal=False,
                attachments=attachments
            )
            
            admin_user = session.get(User, admin_user_id)
            
            # 發送通知
            try:
                send_admin_event(
                    kind="support_admin_replied",
                    title=f"管理員回覆：{ticket.subject}",
                    description=f"管理員 {admin_user.username} 回覆了工單",
                    fields=[
                        {"name": "工單編號", "value": ticket.public_id, "inline": True},
                        {"name": "管理員", "value": admin_user.username, "inline": True},
                        {"name": "回覆內容", "value": body[:200] + ('...' if len(body) > 200 else ''), "inline": False}
                    ],
                    source=f"/api/admin/support/tickets/{public_id}/reply",
                    actor=admin_user.username
                )
            except Exception as e:
                current_app.logger.warning(f"Failed to send admin event: {e}")
            
            return jsonify({
                'ok': True,
                'message': {
                    'id': message.id,
                    'body': message.body,
                    'author': admin_user.username if admin_user else '管理員',
                    'created_at': message.created_at.isoformat()
                },
                'msg': '回覆已發送'
            }), 201
    
    except Exception as e:
        current_app.logger.error(f"Admin reply error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/stats", methods=["GET"])
@jwt_required()
@require_role("dev_admin")
def get_support_stats():
    """取得支援系統統計資料"""
    
    try:
        school_id = request.args.get('school_id', type=int)
        
        with get_session() as session:
            stats = SupportService.get_support_stats(session, school_id)
            
            # 額外的管理員統計
            # SLA 統計（24小時內首次回覆率）
            from datetime import timedelta
            sla_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
            
            overdue_query = session.query(SupportTicket).filter(
                SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.AWAITING_ADMIN]),
                SupportTicket.created_at < sla_cutoff
            )
            if school_id:
                overdue_query = overdue_query.filter(SupportTicket.school_id == school_id)
            
            overdue_tickets = overdue_query.count()
            
            # 未分配工單
            unassigned_query = session.query(SupportTicket).filter(
                SupportTicket.assigned_to.is_(None),
                SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.AWAITING_ADMIN])
            )
            if school_id:
                unassigned_query = unassigned_query.filter(SupportTicket.school_id == school_id)
            
            unassigned_tickets = unassigned_query.count()
            
            # 管理員工作負載
            admin_workload = session.query(
                User.username,
                func.count(SupportTicket.id)
            ).join(
                SupportTicket, User.id == SupportTicket.assigned_to
            ).filter(
                SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.AWAITING_ADMIN, TicketStatus.AWAITING_USER])
            ).group_by(User.username).all()
            
            stats.update({
                'sla_overdue': overdue_tickets,
                'unassigned_tickets': unassigned_tickets,
                'admin_workload': dict(admin_workload)
            })
            
            return jsonify({'ok': True, 'stats': stats})
    
    except Exception as e:
        current_app.logger.error(f"Get support stats error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/labels", methods=["GET"])
@jwt_required()
@require_role("dev_admin")
def get_labels():
    """取得所有支援標籤"""
    
    try:
        with get_session() as session:
            labels = session.query(SupportLabel).order_by(SupportLabel.key).all()
            
            labels_data = []
            for label in labels:
                label_data = {
                    'id': label.id,
                    'key': label.key,
                    'display_name': label.display_name,
                    'color': label.color,
                    'description': label.description
                }
                labels_data.append(label_data)
            
            return jsonify({'ok': True, 'labels': labels_data})
    
    except Exception as e:
        current_app.logger.error(f"Get labels error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500


@bp.route("/labels", methods=["POST"])
@jwt_required()
@require_role("dev_admin")
def create_label():
    """創建新標籤"""
    
    data = request.get_json() or {}
    key = clean_input(data.get('key', ''), 50)
    display_name = clean_input(data.get('display_name', ''), 100)
    color = data.get('color', '#6B7280')
    description = clean_input(data.get('description', ''), 200)
    
    if not key or not display_name:
        return jsonify({'ok': False, 'error': 'SUPPORT_E_MISSING_PARAMS', 'msg': '請提供標籤鍵值和顯示名稱'}), 400
    
    # 驗證顏色格式
    import re
    if not re.match(r'^#[0-9A-Fa-f]{6}$', color):
        color = '#6B7280'
    
    try:
        with get_session() as session:
            # 檢查重複
            existing = session.query(SupportLabel).filter_by(key=key).first()
            if existing:
                return jsonify({'ok': False, 'error': 'SUPPORT_E_DUPLICATE', 'msg': '標籤鍵值已存在'}), 400
            
            # 創建標籤
            label = SupportLabel(
                key=key,
                display_name=display_name,
                color=color,
                description=description or None
            )
            session.add(label)
            session.commit()
            
            return jsonify({
                'ok': True,
                'label': {
                    'id': label.id,
                    'key': label.key,
                    'display_name': label.display_name,
                    'color': label.color,
                    'description': label.description
                },
                'msg': '標籤已創建'
            }), 201
    
    except Exception as e:
        current_app.logger.error(f"Create label error: {e}")
        return jsonify({'ok': False, 'error': 'SUPPORT_E_SERVER', 'msg': '系統錯誤'}), 500