from __future__ import annotations
import os
import json
import ssl
from typing import Any, Dict, List, Optional, Deque
from collections import deque
from datetime import datetime, timezone
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
import os
import json
try:
    from redis import Redis
    import redis
except Exception:  # pragma: no cover - redis optional in some envs
    Redis = None  # type: ignore
    redis = None  # type: ignore


# Morandi palette (muted, non-overlapping)
_MORANDI_HEX = [
    "#B8C0C2",  # mist blue-gray
    "#CDB7A3",  # warm taupe
    "#A8B8A5",  # sage
    "#B9A5B2",  # mauve
    "#C6C3B9",  # stone beige
    "#AEB6BF",  # steel blue
    "#B7C1AA",  # olive gray
    "#BFA8A0",  # dusty rose
]

def _hex_to_int(color_hex: str) -> int:
    try:
        h = color_hex.strip().lstrip('#')
        return int(h[:6], 16)
    except Exception:
        return 0x2B3137

MORANDI = [_hex_to_int(h) for h in _MORANDI_HEX]

EVENT_COLOR: Dict[str, int] = {
    "issue_report": MORANDI[0],
    "theme_proposal": MORANDI[5],
    "simple_choice": MORANDI[4],
    "school_onboarding": MORANDI[2],
    "moderation": MORANDI[1],
    "system": MORANDI[3],
}


def color_for_kind(kind: str) -> int:
    if kind in EVENT_COLOR:
        return EVENT_COLOR[kind]
    # stable rotate by hash
    idx = (abs(hash(kind)) % len(MORANDI))
    return MORANDI[idx]


def get_admin_webhook_url() -> str:
    url = os.getenv("ADMIN_NOTIFY_WEBHOOK", "").strip()
    if url:
        return url
    # backward compatibility
    return os.getenv("DISCORD_REPORT_WEBHOOK", os.getenv("DISCORD_THEME_WEBHOOK", "")).strip()


def _get_delivery_mode() -> str:
    """Return delivery mode: webhook | bot | both (default: webhook)."""
    mode = (os.getenv("ADMIN_NOTIFY_DELIVERY", "webhook") or "webhook").strip().lower()
    if mode in {"webhook", "bot", "both"}:
        return mode
    return "webhook"


_redis_client: Optional[Redis] = None  # type: ignore

def _get_redis() -> Optional[Redis]:  # type: ignore
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        url = os.getenv("REDIS_URL", "redis://redis:80/0")
        if not url:
            return None
        # Use synchronous client; bot will consume asynchronously
        _redis_client = redis.from_url(url, decode_responses=True)  # type: ignore
        return _redis_client
    except Exception:
        return None


def _enqueue_bot_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Push event payload to Redis queue for Discord Bot to consume.
    Returns a result dict-like webhook sender for unified logging.
    """
    cli = _get_redis()
    if not cli:
        return {"ok": False, "status": 0, "error": "redis_unavailable"}
    try:
        cli.rpush("fk:admin_events", json.dumps(payload))
        return {"ok": True, "status": 202}
    except Exception as e:
        return {"ok": False, "status": 0, "error": str(e)}


def _enqueue_announcement(kind: str, title: str, description: str, **kwargs: Any) -> None:
    """Record an announcement-like event into a Redis sorted set for feeders.
    Stores with a monotonically increasing sequence and timestamp score.
    """
    cli = _get_redis()
    if not cli:
        return
    try:
        import time
        seq = cli.incr('fk:ann:seq')
        ts = int(time.time())
        payload = {
            'id': int(seq),
            'ts': ts,
            'kind': kind,
            'title': title,
            'description': description,
        }
        # include subset of kwargs
        for k in ('actor','source','fields','footer','color'):
            if k in kwargs:
                payload[k] = kwargs[k]
        cli.zadd('fk:announcements', {json.dumps(payload): ts})
        # trim to last 200
        try:
            cli.zremrangebyrank('fk:announcements', 0, -201)
        except Exception:
            pass
    except Exception:
        pass


def _brand_logo_url() -> Optional[str]:
    cdn = os.getenv('PUBLIC_CDN_URL', '').strip()
    base = os.getenv('PUBLIC_BASE_URL', '').strip()
    if cdn:
        return cdn.rstrip('/') + '/assets/ForumKit.png'
    if base:
        return base.rstrip('/') + '/uploads/assets/ForumKit.png'
    return None


def _brand_author() -> Dict[str, Any]:
    author: Dict[str, Any] = { 'name': 'ForumKit' }
    icon = _brand_logo_url()
    if icon:
        author['icon_url'] = icon
    return author


def _brand_footer_text() -> str:
    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).isoformat()
    return f"DEV. Serelix Studio • {ts}"


def build_embed(kind: str, title: str, description: str, *,
                author: str | None = None,
                footer: str | None = None,
                fields: List[Dict[str, Any]] | None = None,
                color: int | None = None) -> Dict[str, Any]:
    embed: Dict[str, Any] = {
        "title": title,
        "description": description,
        "color": color if isinstance(color, int) else color_for_kind(kind),
    }
    # Branding author
    if author:
        embed["author"] = {"name": author}
    else:
        embed["author"] = _brand_author()
    # Footer
    embed["footer"] = {"text": footer or _brand_footer_text()}
    if fields:
        embed["fields"] = fields
    return embed


def post_discord(webhook_url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not webhook_url:
        return {"ok": False, "status": 0, "error": "缺少 Webhook URL"}
    
    # 驗證 URL 格式
    try:
        from urllib.parse import urlparse
        parsed = urlparse(webhook_url)
        if not parsed.scheme or not parsed.netloc:
            return {"ok": False, "status": 0, "error": "Webhook URL 格式不正確，請確認是否為有效的 https://... 網址"}
        if parsed.scheme not in {'http', 'https'}:
            return {"ok": False, "status": 0, "error": "Webhook URL 必須使用 http:// 或 https://"}
    except Exception:
        return {"ok": False, "status": 0, "error": "無法解析 Webhook URL，請檢查網址格式"}
    
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urlrequest.Request(
            webhook_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "ForumKit/1.0",
            },
            method="POST",
        )
        ctx = ssl.create_default_context()
        with urlrequest.urlopen(req, timeout=10, context=ctx) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return {"ok": 200 <= resp.status < 300, "status": resp.status, "body": body}
    except HTTPError as he:  # noqa: PERF203
        detail = ""
        try:
            detail = he.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        error_msg = f"Webhook 請求失敗 (HTTP {he.code})"
        if he.code == 400:
            error_msg = "Webhook URL 無效或請求格式錯誤"
        elif he.code == 401:
            error_msg = "Webhook 權限不足，請檢查 URL 是否正確"
        elif he.code == 404:
            error_msg = "找不到 Webhook，請檢查 URL 是否存在"
        elif he.code == 429:
            error_msg = "Webhook 請求過於頻繁，請稍後重試"
        elif he.code >= 500:
            error_msg = "Webhook 服務器錯誤，請稍後重試"
        
        return {"ok": False, "status": he.code, "error": error_msg, "detail": detail}
    except URLError as ue:
        error_msg = "連接 Webhook 失敗"
        if "Name or service not known" in str(ue.reason) or "nodename nor servname provided" in str(ue.reason):
            error_msg = "無法找到 Webhook 主機，請檢查網址是否正確"
        elif "Connection refused" in str(ue.reason):
            error_msg = "Webhook 服務器拒絕連接"
        elif "timeout" in str(ue.reason).lower():
            error_msg = "連接 Webhook 超時，請檢查網路連接"
        
        return {"ok": False, "status": 0, "error": error_msg}
    except Exception as e:
        return {"ok": False, "status": 0, "error": f"發送 Webhook 時發生未知錯誤: {str(e)}"}


def admin_notify(kind: str, title: str, description: str, *,
                 author: str | None = None, footer: str | None = None,
                 fields: List[Dict[str, Any]] | None = None) -> Dict[str, Any]:
    """Low-level notify helper retained for compatibility (webhook-only)."""
    hook = get_admin_webhook_url()
    if not hook:
        return {"ok": False, "status": 0, "error": "no_admin_webhook"}
    embed = build_embed(kind, title, description, author=author, footer=footer, fields=fields)
    return post_discord(hook, {"content": None, "embeds": [embed]})


# ---- Unified message format (Morandi-themed) ----
def build_event_payload(
    kind: str,
    title: str,
    description: str,
    *,
    actor: Optional[str] = None,
    source: Optional[str] = None,
    fields: Optional[List[Dict[str, Any]]] = None,
    request_id: Optional[str] = None,
    ticket_id: Optional[str] = None,
    ts: Optional[str] = None,
    footer: Optional[str] = None,
    color: Optional[int] = None,
) -> Dict[str, Any]:
    extras: List[Dict[str, Any]] = []
    if kind:
        extras.append({"name": "Event", "value": kind, "inline": True})
    if actor:
        extras.append({"name": "Actor", "value": actor, "inline": True})
    if source:
        extras.append({"name": "Source", "value": source, "inline": True})

    std_footer_parts: List[str] = []
    if request_id:
        std_footer_parts.append(f"req={request_id}")
    if ticket_id:
        std_footer_parts.append(f"ticket={ticket_id}")
    if ts:
        std_footer_parts.append(f"ts={ts}")
    std_footer = " | ".join(std_footer_parts)
    footer_text = footer or std_footer

    # Use brand author; include actor in fields
    embed = build_embed(
        kind,
        title,
        description,
        author=None,
        footer=footer_text,
        fields=[*(fields or []), *extras] if extras or fields else fields,
        color=color,
    )
    return {"content": None, "embeds": [embed]}


def send_admin_event(
    kind: str,
    title: str,
    description: str,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Send a Morandi-themed admin event via webhook, bot, or both.
    kwargs are passed to build_event_payload (actor, source, fields, request_id, ticket_id, ts, footer, color).
    Delivery mode controlled by ADMIN_NOTIFY_DELIVERY: webhook | bot | both.
    """
    mode = _get_delivery_mode()
    payload = build_event_payload(kind, title, description, **kwargs)

    results: List[Dict[str, Any]] = []
    if mode in {"webhook", "both"}:
        hook = get_admin_webhook_url()
        if hook:
            results.append(post_discord(hook, payload))
        else:
            results.append({"ok": False, "status": 0, "error": "no_admin_webhook"})
    if mode in {"bot", "both"}:
        results.append(_enqueue_bot_event({
            "kind": kind,
            "title": title,
            "description": description,
            **{k: v for k, v in kwargs.items() if k in {"actor", "source", "fields", "request_id", "ticket_id", "ts", "footer", "color"}},
        }))

    # Announcement source hook
    try:
        if str(kind).lower() in {"announcement", "announce", "system_announcement"}:
            _enqueue_announcement(kind, title, description, **kwargs)
    except Exception:
        pass

    # unify: success if any ok
    ok_any = any(r.get("ok") for r in results) if results else False
    status = next((r.get("status") for r in results if r.get("ok")), 0)
    err = ";".join(filter(None, [str(r.get("error")) for r in results if not r.get("ok")])) or None
    result = {"ok": ok_any, "status": status, **({"error": err} if err else {})}
    _log_admin_event(kind, result)

    # 可選：同步寫入站內事件中心（預設啟用）。
    # 目的：避免只有 Discord 有通知、事件中心無紀錄的情況。
    try:
        enabled = (os.getenv("ADMIN_NOTIFY_LOG_EVENTS", "1").strip().lower() in {"1","true","yes","on"})
    except Exception:
        enabled = True
    if enabled:
        try:
            from services.event_service import EventService  # 避免模組層循環
            from utils.db import get_session
            # 盡力紀錄；失敗不影響 webhook 結果
            with get_session() as s:
                meta: Dict[str, Any] = {}
                for k in ("source","fields","request_id","ticket_id","ts","footer","color"):
                    if k in kwargs:
                        meta[k] = kwargs[k]
                EventService.log_event(
                    session=s,
                    event_type=f"notify.{kind}",
                    title=title,
                    description=description,
                    severity="medium",
                    actor_id=None,
                    actor_name=str(kwargs.get("actor") or "") or None,
                    actor_role=None,
                    target_type=None,
                    target_id=None,
                    school_id=None,
                    metadata=meta or None,
                    client_ip=None,
                    client_id=None,
                    user_agent=None,
                    is_important=False,
                    send_webhook=False,
                )
                try:
                    s.commit()
                except Exception:
                    pass
        except Exception:
            pass
    return result


# ---- Lightweight delivery log (in-memory) ----
_ADMIN_EVT_LOG: Deque[Dict[str, Any]] = deque(maxlen=30)

def _log_admin_event(kind: str, result: Dict[str, Any]) -> None:
    _ADMIN_EVT_LOG.appendleft({
        "ts": datetime.now(timezone.utc).isoformat(),
        "kind": kind,
        "ok": bool(result.get("ok")),
        "status": result.get("status"),
        "error": result.get("error"),
    })

def recent_admin_events(limit: int = 10) -> List[Dict[str, Any]]:
    return list(list(_ADMIN_EVT_LOG)[0:limit])
