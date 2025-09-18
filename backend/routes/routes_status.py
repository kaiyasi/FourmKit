from __future__ import annotations
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt
from utils.admin_events import get_recent_events, get_event_statistics

bp = Blueprint("status", __name__, url_prefix="/api/status")

def _require_dev_admin() -> tuple[bool, dict] | None:
    try:
        claims = get_jwt() or {}
        if claims.get('role') != 'dev_admin':
            return False, { 'ok': False, 'error': { 'code': 'FORBIDDEN', 'message': '僅限 dev_admin 檢視' } }
        return None
    except Exception:
        return False, { 'ok': False, 'error': { 'code': 'UNAUTHORIZED', 'message': '需要授權' } }

@bp.get('/events')
@jwt_required()
def recent_events():
    chk = _require_dev_admin()
    if chk is not None:
        ok, payload = chk
        return (jsonify(payload), 403 if not ok else 200)
    try:
        limit = int(request.args.get('limit', '50'))
    except Exception:
        limit = 50
    et = request.args.get('type') or None
    sv = request.args.get('severity') or None
    items = get_recent_events(limit=limit, event_type=et, severity=sv)
    return jsonify({ 'ok': True, 'items': items, 'limit': limit })

@bp.get('/events/stats')
@jwt_required()
def events_stats():
    chk = _require_dev_admin()
    if chk is not None:
        ok, payload = chk
        return (jsonify(payload), 403 if not ok else 200)
    stats = get_event_statistics()
    return jsonify({ 'ok': True, 'stats': stats })


@bp.get('/integrations')
@jwt_required()
def integrations_status():
    """整合狀態：比照模式管理權限
    - 允許：dev_admin、campus_admin、cross_admin
      - dev_admin：完整資料
      - 其他兩者：精簡資料（隱去主機敏感指標）
    - 其他角色：403
    """
    claims = get_jwt() or {}
    role = claims.get('role')
    if role not in ('dev_admin', 'campus_admin', 'cross_admin'):
        return jsonify({ 'ok': False, 'error': { 'code': 'FORBIDDEN', 'message': '僅限管理角色檢視' } }), 403

    # 基本框架，前端可容忍缺欄位
    data: dict = {
        'ok': True,
        'admin_webhook': {
            'configured': False,
        },
        'queue': {
            'enabled': False,
            'size': 0,
        },
        'recent_admin_events': [],
        'system': {},
        'user_stats': { 'total': 0 },
    }

    # 近期事件（對三種管理角色可見）
    try:
        raw_items = get_recent_events(limit=10)
        norm_items: list[dict] = []
        from datetime import datetime, timezone
        for ev in raw_items or []:
            # 根據 get_recent_events 實際回傳結構轉換
            event_type = ev.get('event_type') if isinstance(ev, dict) else None
            title = ev.get('title') if isinstance(ev, dict) else None
            description = ev.get('description') if isinstance(ev, dict) else None
            severity = ev.get('severity') if isinstance(ev, dict) else None
            ts = ev.get('timestamp') if isinstance(ev, dict) else None
            actor_name = ev.get('actor_name') if isinstance(ev, dict) else None
            target_type = ev.get('target_type') if isinstance(ev, dict) else None
            target_id = ev.get('target_id') if isinstance(ev, dict) else None

            # 正規化時間為 ISO8601 字串
            ts_str: str | None = None
            try:
                if isinstance(ts, datetime):
                    ts_str = ts.isoformat()
                elif isinstance(ts, (int, float)):
                    ts_str = datetime.utcfromtimestamp(float(ts)).isoformat() + 'Z'
                elif isinstance(ts, str):
                    # 檢查是否已經是 ISO 格式
                    if 'T' in ts and ('+' in ts or 'Z' in ts):
                        ts_str = ts
                    else:
                        # 嘗試解析其他格式
                        parsed = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                        ts_str = parsed.isoformat()
                else:
                    ts_str = datetime.now(timezone.utc).isoformat()
            except Exception as parse_err:
                print(f"[WARNING] Failed to parse timestamp '{ts}': {parse_err}")
                ts_str = datetime.now(timezone.utc).isoformat()

            # 根據事件類型判斷操作成功與否
            ok = True  # 預設成功
            error_msg = None
            if severity == 'critical':
                ok = False
                error_msg = f"嚴重事件: {description}"
            elif severity == 'high':
                ok = False
                error_msg = f"高風險事件: {description}"
            elif '失敗' in (description or '') or '錯誤' in (description or ''):
                ok = False
                error_msg = description

            # 轉換為前端期望格式
            norm_items.append({
                'kind': event_type or 'admin_event',
                'ok': ok,
                'ts': ts_str or '',
                'title': title or '管理員事件',
                'description': description or '無描述',
                'severity': severity or 'medium',
                'actor': actor_name or '系統',
                'target': f"{target_type} #{target_id}" if target_type and target_id else None,
                **({'error': error_msg} if error_msg else {}),
            })
        data['recent_admin_events'] = norm_items
    except Exception as e:
        print(f"[ERROR] Failed to normalize admin events: {e}")
        data['recent_admin_events'] = []

    # 嘗試取系統資訊（僅 dev_admin 提供完整）
    if role == 'dev_admin':
        try:
            import psutil, os, platform, time
            uptime = time.time() - psutil.boot_time()
            loadavg = None
            try:
                la = os.getloadavg()
                loadavg = { '1m': la[0], '5m': la[1], '15m': la[2] }
            except Exception:
                loadavg = None
            mem = psutil.virtual_memory()
            data['system'] = {
                'hostname': platform.node(),
                'platform': f"{platform.system()} {platform.release()} ({platform.machine()})",
                'uptime': int(uptime),
                'loadavg': loadavg,
                'memory': {
                    'total': int(mem.total),
                    'available': int(mem.available),
                    'percent': float(mem.percent),
                },
                'cpu_percent': float(psutil.cpu_percent(interval=0.2)),
            }

            # DB/CDN 可用性概估：以布林映射為 1.0 或 None（供前端判斷顯示）
            try:
                from utils.db import get_db_health
                db_health = get_db_health()
                db_ok = bool(db_health.get('ok'))
            except Exception:
                db_ok = False
            data['system']['db_cpu_percent'] = 1.0 if db_ok else None

            try:
                import requests
                cdn_host = os.getenv('CDN_HOST', '127.0.0.1')
                cdn_port = int(os.getenv('CDN_PORT', '12002'))
                resp = requests.get(f"http://{cdn_host}:{cdn_port}", timeout=2)
                cdn_ok = resp.status_code < 500
            except Exception:
                cdn_ok = False
            data['system']['cdn_cpu_percent'] = 1.0 if cdn_ok else None
        except Exception:
            data['system'] = {}
    else:
        # 精簡：僅提供是否可用等非敏感概要
        data['system'] = {
            'platform': 'restricted',
        }

    # 佇列狀態（Redis）：所有允許角色皆可見
    try:
        import os
        from urllib.parse import urlparse
        import redis  # type: ignore
        url = os.getenv('REDIS_URL')
        if url:
            u = urlparse(url)
            r = redis.Redis(host=u.hostname or '127.0.0.1', port=u.port or 6379, db=int((u.path or '/0').strip('/')), password=u.password, decode_responses=True)
            key = os.getenv('FK_QUEUE_KEY', 'fk:queue')
            size = int(r.llen(key) or 0)
            data['queue'] = { 'enabled': True, 'size': size, 'redis_connected': True }
    except Exception:
        # 保持預設 disabled
        pass

    # 使用者統計：所有允許角色皆可見
    try:
        from models import User
        from utils.db import get_session
        with get_session() as s:
            total_users = s.query(User).count()
            data['user_stats'] = { 'total': int(total_users) }
    except Exception:
        # 保持預設 0
        pass

    return jsonify(data)


@bp.route('/project/stats', methods=['GET'])
@jwt_required()
def project_stats():
    """專案狀態統計：比照整合權限
    - 允許：dev_admin、campus_admin、cross_admin
    - 提供業務層面的統計資料
    """
    claims = get_jwt() or {}
    role = claims.get('role')
    if role not in ('dev_admin', 'campus_admin', 'cross_admin'):
        return jsonify({ 'ok': False, 'error': { 'code': 'FORBIDDEN', 'message': '僅限管理角色檢視' } }), 403

    try:
        from utils.db import get_session
        # 模型匯入：原本引用 models.instagram（已移除），改為使用社群發布模組
        from models import User, Post, School, Comment, SocialAccount, SocialPost
        from datetime import datetime, timezone, timedelta
        import os
        
        # 計算時間範圍
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        with get_session() as db:
            # 學校統計
            total_schools = db.query(School).count()
            # 活躍學校定義：本週有用戶發文的學校
            active_schools = db.query(School).join(
                User, School.id == User.school_id
            ).join(
                Post, User.id == Post.author_id
            ).filter(
                Post.created_at >= week_ago
            ).distinct().count()
            new_schools_this_week = db.query(School).filter(School.created_at >= week_ago).count()
            
            # 用戶統計
            total_users = db.query(User).count()
            new_users_this_week = db.query(User).filter(User.created_at >= week_ago).count()
            
            # 活躍用戶定義：本週有發文或留言的用戶
            active_users_this_week = db.query(User).outerjoin(
                Post, User.id == Post.author_id
            ).outerjoin(
                Comment, User.id == Comment.author_id
            ).filter(
                (Post.created_at >= week_ago) | (Comment.created_at >= week_ago)
            ).distinct().count()
            
            # 計算30天留存率：30天前註冊且本週仍有活動的用戶
            thirty_days_ago = now - timedelta(days=30)
            users_registered_30_days_ago = db.query(User).filter(
                User.created_at >= thirty_days_ago,
                User.created_at <= thirty_days_ago + timedelta(days=1)
            ).count()
            
            still_active_users = db.query(User).outerjoin(
                Post, User.id == Post.author_id
            ).outerjoin(
                Comment, User.id == Comment.author_id
            ).filter(
                User.created_at >= thirty_days_ago,
                User.created_at <= thirty_days_ago + timedelta(days=1),
                (Post.created_at >= week_ago) | (Comment.created_at >= week_ago)
            ).distinct().count()
            
            retention_30d = (still_active_users / max(users_registered_30_days_ago, 1)) * 100
            
            # 貼文統計
            total_posts = db.query(Post).count()
            posts_today = db.query(Post).filter(Post.created_at >= today_start).count()
            posts_this_week = db.query(Post).filter(Post.created_at >= week_ago).count()
            avg_daily_posts = posts_this_week / 7.0
            
            # Instagram 整合狀態
            ig_accounts = db.query(SocialAccount).filter(SocialAccount.status == 'active').count()
            ig_posts_published = db.query(SocialPost).filter(SocialPost.status == 'published').count()
            
            # 獲取最近的 IG 同步時間
            latest_ig_post = (
                db.query(SocialPost)
                .filter(SocialPost.published_at != None)
                .order_by(SocialPost.published_at.desc())
                .first()
            )
            last_ig_sync = latest_ig_post.published_at.isoformat() if latest_ig_post and latest_ig_post.published_at else None
            
        # Discord Bot 狀態（檢查環境變數或配置）
        discord_configured = bool(os.getenv('DISCORD_BOT_TOKEN'))
        discord_servers = 0  # 可以從 Discord API 或資料庫獲取
        
        # CDN 狀態檢查
        cdn_connected = False
        cdn_usage = 0
        try:
            import requests
            cdn_host = os.getenv('CDN_HOST', '127.0.0.1')
            cdn_port = int(os.getenv('CDN_PORT', '12002'))
            resp = requests.get(f"http://{cdn_host}:{cdn_port}", timeout=2)
            cdn_connected = resp.status_code < 500
            cdn_usage = 45  # 模擬使用率
        except Exception:
            cdn_connected = False
        
        # 性能指標（從系統事件或其他來源獲取真實數據）
        # 這裡暫時使用基本值，後續可以從監控系統獲取
        avg_response_time = 200  # ms
        error_rate = 0.05  # %
        uptime = 99.9  # %
        
        stats = {
            'schools': {
                'total': total_schools,
                'active': active_schools,
                'newThisWeek': new_schools_this_week
            },
            'users': {
                'total': total_users,
                'activeThisWeek': active_users_this_week,
                'newThisWeek': new_users_this_week,
                'retention30d': retention_30d
            },
            'posts': {
                'total': total_posts,
                'todayCount': posts_today,
                'thisWeekCount': posts_this_week,
                'avgDailyPosts': int(avg_daily_posts)
            },
            'integrations': {
                'instagram': {
                    'connected': ig_accounts > 0,
                    'accountCount': ig_accounts,
                    'lastSync': last_ig_sync,
                    'postsPublished': ig_posts_published
                },
                'discord': {
                    'connected': discord_configured,
                    'serverCount': discord_servers,
                    'lastHeartbeat': now.isoformat() if discord_configured else None
                },
                'cdn': {
                    'connected': cdn_connected,
                    'usage': cdn_usage,
                    'lastCheck': now.isoformat()
                }
            },
            'performance': {
                'avgResponseTime': avg_response_time,
                'errorRate': error_rate,
                'uptime': uptime
            }
        }
        
        return jsonify({ 'ok': True, 'stats': stats })
        
    except Exception as e:
        print(f"[ERROR] Failed to get project stats: {e}")
        return jsonify({ 'ok': False, 'error': { 'code': 'INTERNAL_ERROR', 'message': str(e) } }), 500
