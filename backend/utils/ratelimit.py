"""
Module: backend/utils/ratelimit.py
Unified comment style: module docstring + minimal inline notes.
"""
from __future__ import annotations
import time, os
from typing import Callable, Dict, Tuple
from flask import request, jsonify
import ipaddress


Bucket = Tuple[float, float]
_buckets: Dict[str, Bucket] = {}

_redis = None
_redis_ok = False
_redis_url = os.getenv('REDIS_URL') or os.getenv('FORUMKIT_REDIS_URL')
if _redis_url:
    try:
        import redis
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
        try:
            from flask_jwt_extended import get_jwt_identity
            u = get_jwt_identity()
            if u is not None:
                return f'user:{u}'
        except Exception:
            pass
        return request.headers.get('X-Client-Id') or request.remote_addr or 'unknown'
    return request.remote_addr or 'unknown'

def rate_limit(calls: int, per_seconds: int, by: str = 'ip') -> Callable:
    """
    簡易 Token Bucket：每個 key 在 per_seconds 內允許 calls 次請求。
    by: 'ip' | 'client' | 'user'
    """
    capacity = float(calls)
    refill_rate = capacity / float(per_seconds)

    def _is_exempt_ip(ip: str | None) -> bool:
        try:
            ip = _normalize_ip(ip or '')
            raw = (os.getenv('EXEMPT_IPS') or os.getenv('IP_WHITELIST') or '').strip()
            if not raw:
                return False
            parts = [p.strip() for p in raw.split(',') if p.strip()]
            for item in parts:
                try:
                    if '/' in item:
                        if ipaddress.ip_address(ip) in ipaddress.ip_network(item, strict=False):
                            return True
                    else:
                        if _normalize_ip(item) == ip:
                            return True
                except Exception:
                    continue
            return False
        except Exception:
            return False

    def deco(fn: Callable):
        def wrapper(*args, **kwargs):
            try:
                if request.path.startswith('/api/admin/chat/'):
                    return fn(*args, **kwargs)
            except Exception:
                pass

            key_id = _key_from(by)
            key = f'rl:{by}:{key_id}:{fn.__name__}:{per_seconds}'

            try:
                if _is_exempt_ip(get_client_ip()):
                    return fn(*args, **kwargs)
            except Exception:
                pass
            if _redis_ok and _redis is not None:
                try:
                    pipe = _redis.pipeline()
                    pipe.incr(key)
                    pipe.expire(key, per_seconds)
                    count, _ = pipe.execute()
                    if int(count) > int(calls):
                        ttl = _redis.ttl(key)
                        retry = int(ttl) if ttl and ttl > 0 else per_seconds
                        try:
                            if not _is_exempt_ip(get_client_ip()):
                                add_ip_strike()
                        except Exception:
                            pass
                        return jsonify({
                            'ok': False,
                            'error': {
                                'code': 'RATE_LIMIT',
                                'message': '請求過於頻繁，請稍後再試',
                                'hint': f'retry_after={retry}s'
                            }
                        }), 429
                    return fn(*args, **kwargs)
                except Exception:
                    pass

            now = time.time()
            tokens, last = _buckets.get(key, (capacity, now))
            delta = max(0.0, now - last)
            tokens = min(capacity, tokens + delta * refill_rate)
            if tokens < 1.0:
                retry = int(max(1, (1.0 - tokens) / refill_rate))
                try:
                    if not _is_exempt_ip(get_client_ip()):
                        add_ip_strike()
                except Exception:
                    pass
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
        wrapper.__name__ = fn.__name__
        return wrapper
    return deco

def _ip_key(ip: str, name: str) -> str:
    return f'ipsec:{name}:{ip}'


def _ip_meta_key(ip: str) -> str:
    return f'ipsec:meta:{ip}'

def _normalize_ip(ip: str | None) -> str:
    try:
        s = (ip or '').strip()
        if s.startswith('::ffff:') and s.count(':') >= 2 and s.rfind(':') != -1:
            s = s.split(':')[-1]
        if s.startswith('[') and s.endswith(']'):
            s = s[1:-1]
        return s
    except Exception:
        return ip or 'unknown'


def get_client_ip() -> str:
    ip = (
        request.headers.get('CF-Connecting-IP')
        or request.headers.get('X-Real-IP')
        or (request.headers.get('X-Forwarded-For', '').split(',')[0].strip() if request.headers.get('X-Forwarded-For') else '')
        or request.remote_addr
        or 'unknown'
    )
    return _normalize_ip(ip)

def track_and_check_user_ip(uid: int | None, ip: str | None) -> tuple[bool, int, int]:
    """追蹤使用者 24 小時內使用過的不同 IP 數量，並檢查是否超過門檻。
    Returns: (allowed, current_count, threshold)
    若沒有 Redis 則直接允許（不阻擋）。
    """
    try:
        if not uid or not ip:
            return True, 0, 0
        threshold = int(os.getenv('USER_IP_24H_LIMIT', '5'))
        if threshold <= 0:
            return True, 0, 0
        if _redis_ok and _redis is not None:
            key = f'user:ips:{int(uid)}'
            _redis.sadd(key, ip)
            if _redis.ttl(key) < 0:
                _redis.expire(key, 86400)
            cnt = int(_redis.scard(key) or 0)
            return (cnt <= threshold), cnt, threshold
        return True, 0, threshold
    except Exception:
        return True, 0, 0

def add_ip_strike(ip: str | None = None) -> int:
    ip = ip or get_client_ip()
    captcha_th = int(os.getenv('IP_CAPTCHA_STRIKES_THRESHOLD', '1'))
    threshold = int(os.getenv('IP_BLOCK_STRIKES_THRESHOLD', '2'))
    ttl = int(os.getenv('IP_STRIKE_TTL_SECONDS', '1800'))
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
        if now - t > ttl:
            c = 0.0
        c += 1.0
        _buckets[key] = (c, now)
        count = int(c)
    try:
        if count >= threshold:
            block_ip(ip)
        elif count >= captcha_th:
            _mark_captcha_required(ip)
    except Exception:
        pass
    return count

def _normalize_ttl(desired: int | None) -> int:
    try:
        min_ttl = int(os.getenv('IP_BLOCK_MIN_TTL_SECONDS', '60'))
    except Exception:
        min_ttl = 60
    try:
        max_ttl = int(os.getenv('IP_BLOCK_MAX_TTL_SECONDS', '2592000'))
    except Exception:
        max_ttl = 2592000
    try:
        default_ttl = int(os.getenv('IP_BLOCK_TTL_SECONDS', '86400'))
    except Exception:
        default_ttl = 86400

    ttl = desired if desired and desired > 0 else default_ttl
    ttl = max(min_ttl, ttl)
    if max_ttl > 0:
        ttl = min(ttl, max_ttl)
    return ttl


def block_ip(ip: str | None = None, ttl_seconds: int | None = None, metadata: dict | None = None) -> int:
    import json

    ip = ip or get_client_ip()
    ttl = _normalize_ttl(ttl_seconds)
    key = _ip_key(ip, 'blocked')
    try:
        from utils.admin_events import log_security_event
        log_security_event(
            event_type="ip_blocked",
            description=f"IP {ip} 被封鎖 {ttl} 秒。",
            severity="high",
            metadata={"ip": ip, "ttl": ttl}
        )
    except Exception as e:
        print(f"[admin_events] log_security_event failed: {e}")
    if _redis_ok and _redis is not None:
        _redis.setex(key, ttl, '1')
        if metadata:
            meta = metadata.copy()
            meta['blocked_at'] = int(time.time())
            meta['ttl_seconds'] = ttl
            _redis.setex(_ip_meta_key(ip), ttl, json.dumps(meta))
    else:
        _buckets[key] = (1.0, time.time())
        if metadata:
            meta = metadata.copy()
            meta['blocked_at'] = int(time.time())
            meta['ttl_seconds'] = ttl
            _buckets[_ip_meta_key(ip)] = (meta, time.time())

    return ttl

def unblock_ip(ip: str | None = None) -> None:
    ip = ip or get_client_ip()
    bkey = _ip_key(ip, 'blocked')
    skey = _ip_key(ip, 'strikes')
    mkey = _ip_meta_key(ip)
    if _redis_ok and _redis is not None:
        _redis.delete(bkey)
        _redis.delete(skey)
        _redis.delete(mkey)
    else:
        _buckets.pop(bkey, None)
        _buckets.pop(skey, None)
        _buckets.pop(mkey, None)


def get_ip_block_metadata(ip: str | None = None) -> dict | None:
    import json

    ip = ip or get_client_ip()
    key = _ip_meta_key(ip)
    if _redis_ok and _redis is not None:
        raw = _redis.get(key)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None
    meta = _buckets.get(key)
    if not meta:
        return None
    value, stored_at = meta
    if isinstance(value, dict):
        try:
            ttl = int(value.get('ttl_seconds') or 0)
            blocked_at = int(value.get('blocked_at') or 0)
            if ttl > 0 and blocked_at > 0 and time.time() - blocked_at > ttl:
                _buckets.pop(key, None)
                return None
        except Exception:
            pass
        return value
    return None

def _captcha_key(ip: str) -> str:
    return _ip_key(ip, 'captcha')

def _mark_captcha_required(ip: str) -> None:
    ttl = int(os.getenv('IP_CAPTCHA_TTL_SECONDS', '900'))
    if _redis_ok and _redis is not None:
        _redis.setex(_captcha_key(ip), ttl, '1')
    else:
        _buckets[_captcha_key(ip)] = (1.0, time.time())

def is_captcha_required(ip: str | None = None) -> bool:
    ip = ip or get_client_ip()
    if _redis_ok and _redis is not None:
        return bool(_redis.get(_captcha_key(ip)))
    return _captcha_key(ip) in _buckets

def clear_captcha_requirement(ip: str | None = None) -> None:
    ip = ip or get_client_ip()
    key = _captcha_key(ip)
    if _redis_ok and _redis is not None:
        _redis.delete(key)
        _redis.delete(_ip_key(ip, 'strikes'))
    else:
        _buckets.pop(key, None)
        _buckets.pop(_ip_key(ip, 'strikes'), None)

def verify_captcha(token: str | None) -> bool:
    """驗證前端回傳的 CAPTCHA token。
    支援 Turnstile 與 hCaptcha。開發模式可設定 CAPTCHA_PROVIDER=dummy 接受 token=="ok"。
    """
    if not token:
        return False
    provider = (os.getenv('CAPTCHA_PROVIDER') or '').strip().lower()
    secret = (os.getenv('CAPTCHA_SECRET') or '').strip()
    if provider in {'', 'none'}:
        return True
    if provider == 'dummy':
        return token == 'ok'
    try:
        import requests
        if provider == 'turnstile':
            url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
            data = {'secret': secret, 'response': token}
        elif provider == 'hcaptcha':
            url = 'https://hcaptcha.com/siteverify'
            data = {'secret': secret, 'response': token}
        else:
            return False
        r = requests.post(url, data=data, timeout=float(os.getenv('CAPTCHA_VERIFY_TIMEOUT','4')))
        if not r.ok:
            return False
        j = r.json()
        return bool(j.get('success'))
    except Exception:
        return False

def is_ip_blocked(ip: str | None = None) -> bool:
    ip = ip or get_client_ip()

    try:
        from flask_jwt_extended import get_jwt_identity
        uid = get_jwt_identity()
        if uid is not None:
            try:
                from utils.db import get_session
                from models import User
                with get_session() as session:
                    u = session.get(User, int(uid))
                    if u:
                        if u.role in ['dev_admin', 'admin']:
                            return False
                        exempt_usernames = ['Kaiyasi']
                        if u.username and u.username in exempt_usernames:
                            return False
            except Exception:
                pass
    except Exception:
        pass

    try:
        from flask import request
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            import jwt
            jwt_secret = os.getenv('JWT_SECRET_KEY', 'dev-secret-change-in-production')
            payload = jwt.decode(token, jwt_secret, algorithms=['HS256'])
            user_id = payload.get('sub')
            if user_id is not None:
                try:
                    from utils.db import get_session
                    from models import User
                    with get_session() as session:
                        u = session.get(User, int(user_id))
                        if u:
                            if u.role in ['dev_admin', 'admin']:
                                return False
                            exempt_usernames = ['Kaiyasi']
                            if u.username and u.username in exempt_usernames:
                                return False
                except Exception:
                    pass
    except Exception:
        pass

    whitelist_ips = os.getenv('IP_WHITELIST', '').split(',')
    whitelist_ips = [_normalize_ip(w.strip()) for w in whitelist_ips if w.strip()]
    if _normalize_ip(ip) in whitelist_ips:
        return False

    key = _ip_key(ip, 'blocked')
    if _redis_ok and _redis is not None:
        return bool(_redis.get(key))
    return key in _buckets
