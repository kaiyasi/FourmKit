"""
相容層：舊的 admin_events API 映射到新的 EventService/SystemEvent。

提供下列函式，維持原有呼叫點不需改動：
- log_admin_event
- get_recent_events
- get_event_statistics
- log_user_action
- log_content_moderation
- log_system_event
- log_security_event
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from services.event_service import EventService
from utils.db import get_session


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    session: Optional[Session] = None,
) -> Dict[str, Any]:
    """以新版事件系統落庫，回傳簡易字典（相容舊介面）。"""

    def _log(s: Session):
        ev = EventService.log_event(
            session=s,
            event_type=event_type,
            title=title,
            description=description,
            severity=severity,
            actor_id=actor_id,
            actor_name=actor_name,
            actor_role=None,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            target_name=None,
            school_id=None,
            metadata=metadata or {},
            client_ip=None,
            client_id=None,
            user_agent=None,
            is_important=severity in {"high", "critical"},
            send_webhook=True,
        )
        return {
            "id": ev.id,
            "timestamp": _now_iso(),
            "event_type": ev.event_type,
            "title": ev.title,
            "description": ev.description,
            "actor_id": ev.actor_id,
            "actor_name": ev.actor_name,
            "target_id": target_id,
            "target_type": target_type,
            "severity": ev.severity,
            "metadata": getattr(ev, "metadata_json", None) or {},
        }

    if session is not None:
        # 呼叫端自行管理交易，避免打斷既有流程
        return _log(session)
    # 若未提供 session，自行開啟一次性 session並確保提交
    with get_session() as s:
        res = _log(s)
        try:
            s.commit()
        except Exception:
            s.rollback()
            raise
        return res


def get_recent_events(
    limit: int = 50,
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """以新版事件系統查詢最近事件，轉成舊格式陣列。"""
    with get_session() as s:
        events = EventService.get_events(
            session=s,
            limit=limit,
            offset=0,
            category=None,
            event_type=event_type,
            severity=severity,
            actor_id=None,
            school_id=None,
            unread_only=False,
            important_only=False,
            include_hidden=False,
        )
        out: List[Dict[str, Any]] = []
        for ev in events:
            out.append(
                {
                    "timestamp": (ev.created_at.isoformat() if ev.created_at else _now_iso()),
                    "event_type": ev.event_type,
                    "title": ev.title,
                    "description": ev.description,
                    "actor_id": ev.actor_id,
                    "actor_name": ev.actor_name,
                    "target_id": ev.target_id,
                    "target_type": ev.target_type,
                    "severity": ev.severity,
                    "metadata": getattr(ev, "metadata_json", None) or {},
                }
            )
        return out


def get_event_statistics() -> Dict[str, Any]:
    with get_session() as s:
        return EventService.get_event_statistics(session=s)


def log_user_action(
    event_type: str,
    actor_id: int,
    actor_name: str,
    action: str,
    target_id: Optional[int] = None,
    target_type: Optional[str] = None,
    session: Optional[Session] = None,
):
    title = action or event_type
    desc = f"用戶 {actor_name} {action}" if actor_name and action else (action or title)
    return log_admin_event(
        event_type=event_type,
        title=title,
        description=desc,
        actor_id=actor_id,
        actor_name=actor_name,
        target_id=target_id,
        target_type=target_type,
        session=session,
    )


def log_content_moderation(
    event_type: str,
    moderator_id: int,
    moderator_name: str,
    content_type: str,
    content_id: int,
    action: str,
    reason: Optional[str] = None,
    session: Optional[Session] = None,
):
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
        session=session,
    )


def log_system_event(
    event_type: str,
    title: str,
    description: str,
    severity: str = "medium",
    metadata: Optional[Dict[str, Any]] = None,
):
    return log_admin_event(
        event_type=event_type,
        title=title,
        description=description,
        severity=severity,
        metadata=metadata,
    )


def log_security_event(
    event_type: str,
    description: str,
    actor_id: Optional[int] = None,
    actor_name: Optional[str] = None,
    severity: str = "high",
    metadata: Optional[Dict[str, Any]] = None,
):
    return log_admin_event(
        event_type=event_type,
        title="安全事件",
        description=description,
        actor_id=actor_id,
        actor_name=actor_name,
        severity=severity,
        metadata=metadata,
    )


