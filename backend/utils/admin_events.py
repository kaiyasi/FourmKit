"""
管理員事件記錄系統
記錄各種重要操作，包括但不限於：
- 留言審核
- 發文審核
- 刪文操作
- 登入記錄
- 帳號註冊
- 學校資料更動
- 系統設定變更
"""

import os
import json
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from collections import deque
from sqlalchemy.orm import Session
from models import User, School, Post, Comment, ModerationLog
from utils.notify import send_admin_event

# 事件類型定義
EVENT_TYPES = {
    # 內容審核
    "post_created": "貼文發布",
    "post_approved": "貼文核准",
    "post_rejected": "貼文拒絕",
    "post_deleted": "貼文刪除",
    "comment_created": "留言發布",
    "comment_approved": "留言核准",
    "comment_rejected": "留言拒絕",
    "comment_deleted": "留言刪除",
    
    # 用戶管理
    "user_registered": "用戶註冊",
    "user_login": "用戶登入",
    "user_logout": "用戶登出",
    "user_role_changed": "角色變更",
    "user_password_changed": "密碼變更",
    "user_deleted": "用戶刪除",
    
    # 學校管理
    "school_created": "學校新增",
    "school_updated": "學校更新",
    "school_deleted": "學校刪除",
    
    # 系統管理
    "system_mode_changed": "系統模式變更",
    "system_settings_changed": "系統設定變更",
    "maintenance_mode": "維護模式",
    
    # 安全事件
    "failed_login": "登入失敗",
    "suspicious_activity": "可疑活動",
    "rate_limit_exceeded": "速率限制",
    
    # 其他
    "delete_request_created": "刪文請求",
    "delete_request_approved": "刪文請求核准",
    "delete_request_rejected": "刪文請求拒絕",
    "file_uploaded": "檔案上傳",
    "file_deleted": "檔案刪除",
}

# 事件嚴重程度
SEVERITY_LEVELS = {
    "low": "低",
    "medium": "中", 
    "high": "高",
    "critical": "嚴重"
}

# 內存中的事件緩存（最近1000條）
_ADMIN_EVENTS_CACHE: deque = deque(maxlen=1000)

def log_admin_event(
    event_type: str,
    title: str,
    description: str,
    actor_id: Optional[int] = None,
    actor_name: Optional[str] = None,
    target_id: Optional[int] = None,
    target_type: Optional[str] = None,
    severity: str = "medium",
    metadata: Optional[Dict[str, Any]] = None,
    session: Optional[Session] = None
) -> Dict[str, Any]:
    """
    記錄管理員事件
    
    Args:
        event_type: 事件類型
        title: 事件標題
        description: 事件描述
        actor_id: 操作者ID
        actor_name: 操作者名稱
        target_id: 目標對象ID
        target_type: 目標對象類型
        severity: 嚴重程度
        metadata: 額外資料
        session: 資料庫會話
    """
    
    # 創建事件記錄
    event_data = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "title": title,
        "description": description,
        "actor_id": actor_id,
        "actor_name": actor_name,
        "target_id": target_id,
        "target_type": target_type,
        "severity": severity,
        "metadata": metadata or {},
        "event_type_display": EVENT_TYPES.get(event_type, event_type),
        "severity_display": SEVERITY_LEVELS.get(severity, severity)
    }
    
    # 添加到內存緩存
    _ADMIN_EVENTS_CACHE.appendleft(event_data)
    
    # 保存到資料庫（如果有session）
    if session:
        try:
            # 嘗試為內容事件補齊狀態欄位（moderation_logs.new_status 不能為 NULL）
            norm_target = (target_type or "").strip().lower()
            is_post = norm_target in {"post", "貼文"}
            is_comment = norm_target in {"comment", "留言"}

            resolved_old_status = None
            resolved_new_status = ""  # 使用空字串以滿足 NOT NULL，且在前端為 falsy 不顯示狀態箭頭

            if is_post and target_id:
                try:
                    post_obj = session.get(Post, target_id)
                    if post_obj is not None:
                        # 例如 post_created → new_status = "pending"
                        resolved_new_status = post_obj.status or "pending"
                except Exception:
                    pass
            elif is_comment and target_id:
                try:
                    comment_obj = session.get(Comment, target_id)
                    if comment_obj is not None:
                        resolved_new_status = comment_obj.status or "pending"
                except Exception:
                    pass

            log_entry = ModerationLog(
                target_type=target_type or "system",
                target_id=target_id,
                action=event_type,
                old_status=resolved_old_status,
                new_status=resolved_new_status,
                reason=description,
                moderator_id=actor_id
            )
            session.add(log_entry)
            session.commit()
        except Exception as e:
            print(f"Failed to save admin event to database: {e}")
    
    # 發送通知（重要事件）
    if severity in ["high", "critical"] or event_type in [
        "user_deleted", "system_mode_changed", "suspicious_activity"
    ]:
        try:
            fields = []
            if actor_name:
                fields.append({"name": "操作者", "value": actor_name, "inline": True})
            if target_id:
                fields.append({"name": "目標ID", "value": str(target_id), "inline": True})
            if target_type:
                fields.append({"name": "目標類型", "value": target_type, "inline": True})
            if severity != "medium":
                fields.append({"name": "嚴重程度", "value": SEVERITY_LEVELS.get(severity, severity), "inline": True})
            
            send_admin_event(
                kind=event_type,
                title=title,
                description=description,
                actor=actor_name,
                source="admin_events",
                fields=fields
            )
        except Exception as e:
            print(f"Failed to send admin event notification: {e}")
    
    return event_data

def get_recent_events(limit: int = 50, event_type: Optional[str] = None, 
                     severity: Optional[str] = None) -> List[Dict[str, Any]]:
    """獲取最近的事件記錄"""
    events = list(_ADMIN_EVENTS_CACHE)
    
    # 過濾事件類型
    if event_type:
        events = [e for e in events if e["event_type"] == event_type]
    
    # 過濾嚴重程度
    if severity:
        events = [e for e in events if e["severity"] == severity]
    
    return events[:limit]

def get_event_statistics() -> Dict[str, Any]:
    """獲取事件統計資料"""
    events = list(_ADMIN_EVENTS_CACHE)
    
    # 按類型統計
    type_stats = {}
    for event in events:
        event_type = event["event_type"]
        type_stats[event_type] = type_stats.get(event_type, 0) + 1
    
    # 按嚴重程度統計
    severity_stats = {}
    for event in events:
        severity = event["severity"]
        severity_stats[severity] = severity_stats.get(severity, 0) + 1
    
    # 最近24小時的事件
    now = datetime.now(timezone.utc)
    recent_24h = [
        e for e in events 
        if (now - datetime.fromisoformat(e["timestamp"].replace('Z', '+00:00'))).total_seconds() < 86400
    ]
    
    return {
        "total_events": len(events),
        "events_24h": len(recent_24h),
        "type_distribution": type_stats,
        "severity_distribution": severity_stats,
        "recent_events": recent_24h[:10]
    }

# 便捷函數
def log_user_action(event_type: str, actor_id: int, actor_name: str, 
                   action: str, target_id: Optional[int] = None, 
                   target_type: Optional[str] = None, session: Optional[Session] = None):
    """記錄用戶操作"""
    return log_admin_event(
        event_type=event_type,
        title=f"{EVENT_TYPES.get(event_type, event_type)}",
        description=f"用戶 {actor_name} {action}",
        actor_id=actor_id,
        actor_name=actor_name,
        target_id=target_id,
        target_type=target_type,
        session=session
    )

def log_content_moderation(event_type: str, moderator_id: int, moderator_name: str,
                          content_type: str, content_id: int, action: str, 
                          reason: Optional[str] = None, session: Optional[Session] = None):
    """記錄內容審核"""
    description = f"管理員 {moderator_name} {action}了{content_type} #{content_id}"
    if reason:
        description += f"，原因：{reason}"
    
    return log_admin_event(
        event_type=event_type,
        title=f"{content_type}審核",
        description=description,
        actor_id=moderator_id,
        actor_name=moderator_name,
        target_id=content_id,
        target_type=content_type,
        severity="medium",
        metadata={"reason": reason} if reason else None,
        session=session
    )

def log_system_event(event_type: str, title: str, description: str, 
                    severity: str = "medium", metadata: Optional[Dict[str, Any]] = None):
    """記錄系統事件"""
    return log_admin_event(
        event_type=event_type,
        title=title,
        description=description,
        severity=severity,
        metadata=metadata
    )

def log_security_event(event_type: str, description: str, 
                      actor_id: Optional[int] = None, actor_name: Optional[str] = None,
                      severity: str = "high", metadata: Optional[Dict[str, Any]] = None):
    """記錄安全事件"""
    return log_admin_event(
        event_type=event_type,
        title="安全事件",
        description=description,
        actor_id=actor_id,
        actor_name=actor_name,
        severity=severity,
        metadata=metadata
    )
