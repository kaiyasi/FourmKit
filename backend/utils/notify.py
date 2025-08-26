from __future__ import annotations
import os
import json
import ssl
from typing import Any, Dict, List, Optional, Deque
from collections import deque
from datetime import datetime, timezone
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError


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
    if author:
        embed["author"] = {"name": author}
    if footer:
        embed["footer"] = {"text": footer}
    if fields:
        embed["fields"] = fields
    return embed


def post_discord(webhook_url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not webhook_url:
        return {"ok": False, "status": 0, "error": "missing webhook url"}
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
        return {"ok": False, "status": he.code, "error": f"HTTPError {he.code}: {he.reason}", "detail": detail}
    except URLError as ue:
        return {"ok": False, "status": 0, "error": f"URLError {ue.reason}"}


def admin_notify(kind: str, title: str, description: str, *,
                 author: str | None = None, footer: str | None = None,
                 fields: List[Dict[str, Any]] | None = None) -> Dict[str, Any]:
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

    embed = build_embed(
        kind,
        title,
        description,
        author=actor,
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
    """Send a Morandi-themed admin event to the configured webhook.
    kwargs are passed to build_event_payload (actor, source, fields, request_id, ticket_id, ts, footer, color).
    """
    hook = get_admin_webhook_url()
    if not hook:
        res = {"ok": False, "status": 0, "error": "no_admin_webhook"}
        _log_admin_event(kind, res)
        return res
    payload = build_event_payload(kind, title, description, **kwargs)
    res = post_discord(hook, payload)
    _log_admin_event(kind, res)
    return res


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
