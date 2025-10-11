"""
輕量即時監控（Redis-based）
- 記錄任務事件（ZSET）與健康心跳（KEY）
- 提供快取計數與佇列健康快照
"""
from __future__ import annotations
from typing import Any, Dict, Optional, List
from datetime import datetime, timezone
import json
import os

try:
    import redis
except Exception:
    redis = None


def _r() -> Optional["redis.Redis"]:
    if not redis:
        return None
    try:
        url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        return redis.from_url(url, decode_responses=True)
    except Exception:
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def mark_worker_seen(kind: str = "worker") -> None:
    cli = _r()
    if not cli:
        return
    try:
        cli.setex(f"fk:mon:{kind}:last_seen", 600, _now_iso())
    except Exception:
        pass


def record_event(kind: str, **fields: Any) -> None:
    cli = _r()
    if not cli:
        return
    try:
        MAX_EVENTS = int(os.getenv("FK_MON_MAX_EVENTS", "200"))
        import time
        ts = int(time.time())
        payload = {"kind": kind, "ts": ts}
        payload.update(fields)
        key = "fk:mon:events"
        cli.zadd(key, {json.dumps(payload): ts})
        try:
            count = cli.zcard(key)
            if count and count > MAX_EVENTS:
                to_trim = count - MAX_EVENTS
                if to_trim > 0:
                    cli.zremrangebyrank(key, 0, to_trim - 1)
        except Exception:
            pass
    except Exception:
        pass


def get_recent_events(limit: int = 20) -> List[Dict[str, Any]]:
    cli = _r()
    out: List[Dict[str, Any]] = []
    if not cli:
        return out
    try:
        raw = cli.zrevrange("fk:mon:events", 0, max(0, limit - 1))
        for s in raw:
            try:
                out.append(json.loads(s))
            except Exception:
                continue
    except Exception:
        return out
    return out


def get_queue_health() -> Dict[str, Any]:
    cli = _r()
    def _age(key: str) -> Optional[int]:
        if not cli:
            return None
        try:
            import time
            v = cli.get(key)
            if not v:
                return None
            try:
                from datetime import datetime as _dt
                dt = _dt.fromisoformat(v.replace("Z", "+00:00"))
            except Exception:
                return None
            return int(time.time() - dt.timestamp())
        except Exception:
            return None

    return {
        "worker_last_seen_age": _age("fk:mon:worker:last_seen"),
        "beat_last_seen_age": _age("fk:mon:beat:last_seen"),
        "ts": _now_iso(),
    }


def mark_beat_seen() -> None:
    mark_worker_seen("beat")
