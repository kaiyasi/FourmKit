from __future__ import annotations
import time, os
from typing import Callable, Dict, Tuple
from flask import request, jsonify

# 速率限制：優先使用 Redis，否則退回記憶體 Token Bucket（單進程）

Bucket = Tuple[float, float]  # (tokens, last_refill_ts)
_buckets: Dict[str, Bucket] = {}

_redis = None
_redis_ok = False
_redis_url = os.getenv('REDIS_URL') or os.getenv('FORUMKIT_REDIS_URL')
if _redis_url:
    try:
        import redis  # type: ignore
        _redis = redis.Redis.from_url(_redis_url, decode_responses=True)
        _redis.ping()
        _redis_ok = True
    except Exception:
        _redis = None
        _redis_ok = False

def _key_from(by: str) -> str:
    by = by.lower()
    if by == 'client':
        return request.headers.get('X-Client-Id') or request.remote_addr or 'unknown'
    if by == 'user':
        # 嘗試從 JWT 取得身分（若沒有就退回 client/ip）
        try:
            from flask_jwt_extended import get_jwt_identity
            u = get_jwt_identity()
            if u is not None:
                return f'user:{u}'
        except Exception:
            pass
        return request.headers.get('X-Client-Id') or request.remote_addr or 'unknown'
    # default ip
    return request.remote_addr or 'unknown'

def rate_limit(calls: int, per_seconds: int, by: str = 'ip') -> Callable:
    """
    簡易 Token Bucket：每個 key 在 per_seconds 內允許 calls 次請求。
    by: 'ip' | 'client' | 'user'
    """
    capacity = float(calls)
    refill_rate = capacity / float(per_seconds)

    def deco(fn: Callable):
        def wrapper(*args, **kwargs):
            key_id = _key_from(by)
            key = f'rl:{by}:{key_id}:{fn.__name__}:{per_seconds}'
            if _redis_ok and _redis is not None:
                try:
                    # 簡單固定視窗：INCR + EXPIRE
                    pipe = _redis.pipeline()
                    pipe.incr(key)
                    pipe.expire(key, per_seconds)
                    count, _ = pipe.execute()
                    if int(count) > int(calls):
                        ttl = _redis.ttl(key)
                        retry = int(ttl) if ttl and ttl > 0 else per_seconds
                        # 記錄一次封鎖嘗試與自動升級封鎖
                        add_ip_strike()
                        return jsonify({
                            'ok': False,
                            'error': {
                                'code': 'RATE_LIMIT',
                                'message': '請求過於頻繁，請稍後再試',
                                'hint': f'retry_after={retry}s'
                            }
                        }), 429
                    # 允許請求
                    return fn(*args, **kwargs)
                except Exception:
                    # Redis 故障時退回記憶體方案
                    pass

            # 記憶體 Token Bucket（單進程）
            now = time.time()
            tokens, last = _buckets.get(key, (capacity, now))
            delta = max(0.0, now - last)
            tokens = min(capacity, tokens + delta * refill_rate)
            if tokens < 1.0:
                retry = int(max(1, (1.0 - tokens) / refill_rate))
                add_ip_strike()
                return jsonify({
                    'ok': False,
                    'error': {
                        'code': 'RATE_LIMIT',
                        'message': '請求過於頻繁，請稍後再試',
                        'hint': f'retry_after={retry}s'
                    }
                }), 429
            tokens -= 1.0
            _buckets[key] = (tokens, now)
            return fn(*args, **kwargs)
        wrapper.__name__ = fn.__name__  # type: ignore[attr-defined]
        return wrapper
    return deco

# --------- IP Block helpers ---------
def _ip_key(ip: str, name: str) -> str:
    return f'ipsec:{name}:{ip}'

def get_client_ip() -> str:
    return request.headers.get('X-Real-IP') or request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or request.remote_addr or 'unknown'

def add_ip_strike(ip: str | None = None) -> int:
    ip = ip or get_client_ip()
    threshold = int(os.getenv('IP_BLOCK_STRIKES_THRESHOLD', '2'))
    ttl = int(os.getenv('IP_STRIKE_TTL_SECONDS', '1800'))  # 30 分鐘內連續違規
    key = _ip_key(ip, 'strikes')
    if _redis_ok and _redis is not None:
        pipe = _redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, ttl)
        count, _ = pipe.execute()
        count = int(count)
    else:
        now = time.time()
        c, t = _buckets.get(key, (0.0, now))
        # 簡單的 TTL：若過期則重置
        if now - t > ttl:
            c = 0.0
        c += 1.0
        _buckets[key] = (c, now)
        count = int(c)
    # 自動封鎖
    if count >= threshold:
        block_ip(ip)
    return count

def block_ip(ip: str | None = None) -> None:
    ip = ip or get_client_ip()
    ttl = int(os.getenv('IP_BLOCK_TTL_SECONDS', '86400'))  # 預設封鎖 1 天
    key = _ip_key(ip, 'blocked')
    # 事件紀錄：IP 被封鎖
    try:
        from utils.admin_events import log_security_event
        log_security_event(
            event_type="ip_blocked",
            description=f"IP {ip} 因違規或頻繁登入被封鎖 {ttl} 秒。",
            severity="high",
            metadata={"ip": ip, "ttl": ttl}
        )
    except Exception as e:
        print(f"[admin_events] log_security_event failed: {e}")
    if _redis_ok and _redis is not None:
        _redis.setex(key, ttl, '1')
    else:
        _buckets[key] = (1.0, time.time())

def unblock_ip(ip: str | None = None) -> None:
    ip = ip or get_client_ip()
    bkey = _ip_key(ip, 'blocked')
    skey = _ip_key(ip, 'strikes')
    if _redis_ok and _redis is not None:
        _redis.delete(bkey)
        _redis.delete(skey)
    else:
        _buckets.pop(bkey, None)
        _buckets.pop(skey, None)

def is_ip_blocked(ip: str | None = None) -> bool:
    ip = ip or get_client_ip()
    key = _ip_key(ip, 'blocked')
    if _redis_ok and _redis is not None:
        return bool(_redis.get(key))
    # in-memory：若曾設置便視為封鎖（未處理 TTL，足夠開發/單機）
    return key in _buckets
