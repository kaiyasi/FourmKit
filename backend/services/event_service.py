"""
事件服務
負責記錄和管理系統事件
"""

from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from models import SystemEvent
from utils.notify import send_admin_event
from utils.ratelimit import get_client_ip
from flask import request


class EventService:
    """事件服務類"""
    
    EVENT_TYPES = {
        "content.post.created": {"category": "content", "title": "貼文發布"},
        "content.post.approved": {"category": "content", "title": "貼文核准"},
        "content.post.rejected": {"category": "content", "title": "貼文拒絕"},
        "content.post.deleted": {"category": "content", "title": "貼文刪除"},
        "content.comment.created": {"category": "content", "title": "留言發布"},
        "content.comment.approved": {"category": "content", "title": "留言核准"},
        "content.comment.rejected": {"category": "content", "title": "留言拒絕"},
        "content.comment.deleted": {"category": "content", "title": "留言刪除"},
        "content.announcement.created": {"category": "announcement", "title": "公告發布"},
        
        "chat.room.created": {"category": "chat", "title": "聊天室創建"},
        "chat.room.deleted": {"category": "chat", "title": "聊天室刪除"},
        "chat.room.member.added": {"category": "chat", "title": "聊天室成員加入"},
        "chat.room.member.removed": {"category": "chat", "title": "聊天室成員移除"},
        "chat.room.invitation.sent": {"category": "chat", "title": "聊天室邀請發送"},
        "notification.user.mentioned": {"category": "notification", "title": "用戶被提及"},
        
        "member.premium_status_changed": {"category": "member", "title": "會員狀態變更"},
        "member.subscription_created": {"category": "member", "title": "會員訂閱創建"},
        "member.subscription_cancelled": {"category": "member", "title": "會員訂閱取消"},
        "member.subscription_expired": {"category": "member", "title": "會員訂閱過期"},
        
        "advertisement.created": {"category": "advertisement", "title": "廣告貼文創建"},
        "advertisement.reviewed": {"category": "advertisement", "title": "廣告貼文審核"},
        "advertisement.approved": {"category": "advertisement", "title": "廣告貼文核准"},
        "advertisement.rejected": {"category": "advertisement", "title": "廣告貼文拒絕"},
        
        "user.registered": {"category": "user", "title": "用戶註冊"},
        "user.login": {"category": "user", "title": "用戶登入"},
        "user.logout": {"category": "user", "title": "用戶登出"},
        "user.role_changed": {"category": "user", "title": "角色變更"},
        "user.password_changed": {"category": "user", "title": "密碼變更"},
        "user.deleted": {"category": "user", "title": "用戶刪除"},
        "user.profile_updated": {"category": "user", "title": "個人資料更新"},
        
        "school.created": {"category": "school", "title": "學校新增"},
        "school.updated": {"category": "school", "title": "學校更新"},
        "school.deleted": {"category": "school", "title": "學校刪除"},
        "school.settings_changed": {"category": "school", "title": "學校設定變更"},
        
        "system.mode_changed": {"category": "system", "title": "系統模式變更"},
        "system.settings_changed": {"category": "system", "title": "系統設定變更"},
        "system.maintenance": {"category": "system", "title": "系統維護"},
        "system.platform_started": {"category": "system", "title": "平台啟動"},
        "system.platform_stopped": {"category": "system", "title": "平台關閉"},
        "system.platform_restarted": {"category": "system", "title": "平台重啟"},
        
        "security.failed_login": {"category": "security", "title": "登入失敗"},
        "security.suspicious_activity": {"category": "security", "title": "可疑活動"},
        "security.rate_limit_exceeded": {"category": "security", "title": "速率限制"},
        "security.unauthorized_access": {"category": "security", "title": "未授權訪問"},
        
        
        "moderation.delete_request_created": {"category": "moderation", "title": "刪文請求"},
        "moderation.delete_request_approved": {"category": "moderation", "title": "刪文請求核准"},
        "moderation.delete_request_rejected": {"category": "moderation", "title": "刪文請求拒絕"},
    }
    
    @classmethod
    def log_event(
        cls,
        session: Session,
        event_type: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        severity: str = "medium",
        actor_id: Optional[int] = None,
        actor_name: Optional[str] = None,
        actor_role: Optional[str] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        target_name: Optional[str] = None,
        school_id: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        client_ip: Optional[str] = None,
        client_id: Optional[str] = None,
        user_agent: Optional[str] = None,
        is_important: bool = False,
        send_webhook: bool = True
    ) -> SystemEvent:
        """
        記錄系統事件
        
        Args:
            session: 數據庫會話
            event_type: 事件類型
            title: 事件標題（可選，會從EVENT_TYPES推導）
            description: 事件描述
            severity: 嚴重程度 (low, medium, high, critical)
            actor_id: 操作者用戶ID
            actor_name: 操作者用戶名
            actor_role: 操作者角色
            target_type: 目標類型
            target_id: 目標ID
            target_name: 目標名稱
            school_id: 相關學校ID
            metadata: 額外數據
            client_ip: 客戶端IP
            client_id: 客戶端ID
            user_agent: 用戶代理
            is_important: 是否重要事件
            send_webhook: 是否發送webhook通知
        
        Returns:
            SystemEvent: 創建的事件記錄
        """
        
        event_info = cls.EVENT_TYPES.get(event_type)
        if not event_info:
            category = event_type.split('.')[0] if '.' in event_type else 'unknown'
            default_title = event_type.replace('_', ' ').replace('.', ' ').title()
        else:
            category = event_info['category']
            default_title = event_info['title']
        
        if client_ip is None:
            try:
                client_ip = get_client_ip()
            except:
                client_ip = None
                
        if client_id is None:
            try:
                client_id = request.headers.get("X-Client-Id")
            except:
                client_id = None
                
        if user_agent is None:
            try:
                user_agent = request.headers.get("User-Agent")
            except:
                user_agent = None
        
        event = SystemEvent(
            event_type=event_type,
            title=title or default_title,
            description=description,
            category=category,
            severity=severity,
            actor_id=actor_id,
            actor_name=actor_name,
            actor_role=actor_role,
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            school_id=school_id,
            client_ip=client_ip,
            client_id=client_id,
            user_agent=user_agent,
            metadata_json=metadata or {},
            is_important=is_important,
            created_at=datetime.now(timezone.utc)
        )
        
        session.add(event)
        session.flush()  # 獲取ID但不提交
        
        if send_webhook:
            cls._send_webhook_notification(event)
        
        return event
    
    @classmethod
    def _send_webhook_notification(cls, event: SystemEvent):
        """發送webhook通知"""
        try:
            fields = []
            
            if event.actor_name:
                fields.append({"name": "操作者", "value": event.actor_name, "inline": True})
            
            if event.target_name:
                fields.append({"name": "目標", "value": event.target_name, "inline": True})
                
            if event.school_id:
                fields.append({"name": "學校", "value": f"ID: {event.school_id}", "inline": True})
                
            if event.severity in ["high", "critical"]:
                fields.append({"name": "嚴重程度", "value": event.severity.upper(), "inline": True})
            
            send_admin_event(
                kind=event.event_type,
                title=event.title,
                description=event.description or "",
                actor=event.actor_name,
                source=f"EventService",
                fields=fields
            )
        except Exception as e:
            print(f"[WARNING] Webhook notification failed: {e}")
    
    @classmethod
    def get_events(
        cls,
        session: Session,
        limit: int = 50,
        offset: int = 0,
        category: Optional[str] = None,
        event_type: Optional[str] = None,
        severity: Optional[str] = None,
        actor_id: Optional[int] = None,
        school_id: Optional[int] = None,
        unread_only: bool = False,
        important_only: bool = False,
        include_hidden: bool = False,
        current_user_id: Optional[int] = None,
        current_user_role: Optional[str] = None
    ) -> List[SystemEvent]:
        """
        獲取事件列表
        
        Args:
            session: 數據庫會話
            limit: 限制數量
            offset: 偏移量
            category: 事件分類過濾
            event_type: 事件類型過濾
            severity: 嚴重程度過濾
            actor_id: 操作者過濾
            school_id: 學校過濾
            unread_only: 只顯示未讀
            important_only: 只顯示重要事件
            include_hidden: 包含隱藏事件
        
        Returns:
            List[SystemEvent]: 事件列表
        """
        query = session.query(SystemEvent)
        
        if category:
            query = query.filter(SystemEvent.category == category)
        if event_type:
            query = query.filter(SystemEvent.event_type == event_type)
        if severity:
            query = query.filter(SystemEvent.severity == severity)
        if actor_id:
            query = query.filter(SystemEvent.actor_id == actor_id)
        if school_id is not None:
            query = query.filter(SystemEvent.school_id == school_id)
        if unread_only:
            query = query.filter(SystemEvent.is_read == False)
        if important_only:
            query = query.filter(SystemEvent.is_important == True)
        if not include_hidden:
            query = query.filter(SystemEvent.is_hidden == False)
        
        if current_user_role and current_user_role != 'dev_admin':
            if current_user_id:
                query = query.filter(
                    (SystemEvent.actor_id == current_user_id) |
                    (SystemEvent.target_id == str(current_user_id)) |
                    (SystemEvent.metadata_json.contains(f'"user_id":{current_user_id}')) |
                    (SystemEvent.metadata_json.contains(f'"target_user_id":{current_user_id}'))
                )
            
            if current_user_role in ['campus_admin', 'campus_moderator'] and school_id is not None:
                query = query.filter(SystemEvent.school_id == school_id)
        
        query = query.order_by(SystemEvent.created_at.desc())
        
        return query.offset(offset).limit(limit).all()
    
    @classmethod
    def mark_as_read(cls, session: Session, event_ids: List[int], user_id: int) -> int:
        """
        標記事件為已讀
        
        Args:
            session: 數據庫會話
            event_ids: 事件ID列表
            user_id: 用戶ID
        
        Returns:
            int: 更新的事件數量
        """
        updated = session.query(SystemEvent).filter(
            SystemEvent.id.in_(event_ids),
            SystemEvent.is_read == False
        ).update(
            {
                "is_read": True,
                "read_at": datetime.now(timezone.utc)
            },
            synchronize_session=False
        )
        
        return updated
    
    @classmethod
    def get_event_statistics(
        cls,
        session: Session,
        days: int = 7,
        school_id: Optional[int] = None,
        current_user_id: Optional[int] = None,
        current_user_role: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        獲取事件統計
        
        Args:
            session: 數據庫會話
            days: 統計天數
            school_id: 學校ID過濾
        
        Returns:
            Dict[str, Any]: 統計數據
        """
        from datetime import timedelta
        
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        query = session.query(SystemEvent).filter(
            SystemEvent.created_at >= start_date
        )
        
        if school_id is not None:
            query = query.filter(SystemEvent.school_id == school_id)
        
        if current_user_role and current_user_role != 'dev_admin':
            if current_user_id:
                query = query.filter(
                    (SystemEvent.actor_id == current_user_id) |
                    (SystemEvent.target_id == str(current_user_id)) |
                    (SystemEvent.metadata_json.contains(f'"user_id":{current_user_id}')) |
                    (SystemEvent.metadata_json.contains(f'"target_user_id":{current_user_id}'))
                )
            
            if current_user_role in ['campus_admin', 'campus_moderator'] and school_id is not None:
                query = query.filter(SystemEvent.school_id == school_id)
        
        events = query.all()
        
        category_stats = {}
        severity_stats = {}
        daily_stats = {}
        
        for event in events:
            category_stats[event.category] = category_stats.get(event.category, 0) + 1
            
            severity_stats[event.severity] = severity_stats.get(event.severity, 0) + 1
            
            date_key = event.created_at.date().isoformat()
            daily_stats[date_key] = daily_stats.get(date_key, 0) + 1
        
        return {
            "total_events": len(events),
            "category_stats": category_stats,
            "severity_stats": severity_stats,
            "daily_stats": daily_stats,
            "unread_count": sum(1 for e in events if not e.is_read),
            "important_count": sum(1 for e in events if e.is_important),
        }