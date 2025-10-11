"""
Module: backend/routes/routes_account.py
Unified comment style: module docstring + minimal inline notes.
"""
from __future__ import annotations
from flask import Blueprint, jsonify, request
import hmac, hashlib, base64, os
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_session
from models import User, School
from PIL import Image
import os
import json as _json
from urllib.parse import urlparse
try:
    import redis
except Exception:
    redis = None

bp = Blueprint("account", __name__, url_prefix="/api/account")


@bp.get("/profile")
@jwt_required()
def get_profile():
    ident = get_jwt_identity()
    with get_session() as s:
        u = s.get(User, int(ident)) if ident is not None else None
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        sch = s.get(School, getattr(u, 'school_id', None)) if getattr(u, 'school_id', None) else None
        auth_provider = 'local'
        try:
            if not (u.password_hash or '').strip():
                auth_provider = 'google'
        except Exception:
            pass
        try:
            secret = os.getenv('SECRET_KEY', 'forumkit-dev-secret')
            digest = hmac.new(secret.encode('utf-8'), str(u.id).encode('utf-8'), hashlib.sha256).digest()
            personal_id = base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')[:12]
        except Exception:
            personal_id = f"u{u.id:08d}"

        return jsonify({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'role': u.role,
            'school': ({ 'id': sch.id, 'slug': sch.slug, 'name': sch.name } if sch else None),
            'avatar_path': u.avatar_path,
            'auth_provider': auth_provider,
            'has_password': bool((u.password_hash or '').strip()),
            'personal_id': personal_id,
            'is_premium': u.is_premium,
            'premium_until': u.premium_until.isoformat() if u.premium_until else None,
        })


@bp.put("/profile")
@jwt_required()
def update_profile():
    ident = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    new_name = (data.get('username') or '').strip()
    if not new_name or len(new_name) < 2:
        return jsonify({ 'msg': '名稱至少 2 字' }), 400
    if not all(ch.isalnum() or ch in '-_.' for ch in new_name):
        return jsonify({ 'msg': '名稱限英數與 - _ .'}), 400
    with get_session() as s:
        u = s.get(User, int(ident)) if ident is not None else None
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        other = s.query(User).filter(User.username==new_name, User.id!=u.id).first()
        if other:
            return jsonify({ 'msg': '名稱已被使用' }), 409
        u.username = new_name
        s.commit()
        return jsonify({ 'ok': True })


@bp.post("/avatar")
@jwt_required()
def upload_avatar():
    ident = get_jwt_identity()
    fs = request.files.get('file')
    if not fs or not fs.filename:
        return jsonify({ 'msg': '缺少檔案' }), 400
    try:
        im = Image.open(fs.stream)
        im = im.convert('RGB')
        im.thumbnail((512,512))
        root = os.getenv('UPLOAD_ROOT', 'uploads')
        dirp = os.path.join(root, 'public', 'avatars', str(ident))
        os.makedirs(dirp, exist_ok=True)
        out_path = os.path.join(dirp, 'avatar.webp')
        im.save(out_path, format='WEBP', quality=90, method=6)
        rel = os.path.relpath(out_path, start=root).replace('\\','/')
    except Exception as e:
        return jsonify({ 'msg': f'處理圖片失敗: {e}' }), 400
    with get_session() as s:
        u = s.get(User, int(ident)) if ident is not None else None
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        u.avatar_path = rel
        s.commit()
    return jsonify({ 'ok': True, 'path': rel })


@bp.post("/profile-card")
@jwt_required()
def upload_profile_card():
    """上傳個人卡片預覽圖（Base64 Data URL），存入 CDN 公開目錄。
    參數：{ image_data: 'data:image/png;base64,...' }
    輸出：{ ok: true, path: 'public/profile_cards/<uid>/card.webp' }
    """
    ident = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    data_url = str(data.get('image_data') or '').strip()
    if not data_url.startswith('data:image/') or ';base64,' not in data_url:
        return jsonify({ 'msg': '缺少或無效的 image_data' }), 400

    try:
        header, b64 = data_url.split(',', 1)
        raw = base64.b64decode(b64)
        from io import BytesIO
        im = Image.open(BytesIO(raw))
        im = im.convert('RGB')
        root = os.getenv('UPLOAD_ROOT', 'uploads')
        dirp = os.path.join(root, 'public', 'profile_cards', str(ident))
        os.makedirs(dirp, exist_ok=True)
        out_path = os.path.join(dirp, 'card.webp')
        im.save(out_path, format='WEBP', quality=90, method=6)
        rel = os.path.relpath(out_path, start=root).replace('\\','/')
    except Exception as e:
        return jsonify({ 'msg': f'處理圖片失敗: {e}' }), 400

    return jsonify({ 'ok': True, 'path': rel })


@bp.get("/webhook")
@jwt_required()
def get_user_webhook():
    """取得當前使用者的個人 Webhook 設定（存於 Redis）。"""
    if not redis:
        return jsonify({ 'ok': False, 'error': 'redis_unavailable' }), 503
    ident = get_jwt_identity()
    url = os.getenv('REDIS_URL', 'redis://redis:80/0')
    r = redis.from_url(url, decode_responses=True)
    raw = r.hget('user:webhooks', str(ident)) or '{}'
    try:
        data = _json.loads(raw)
    except Exception:
        data = {}
    last = r.get(f'user:webhooks:last:{ident}')
    kinds = data.get('kinds') if isinstance(data.get('kinds'), dict) else { 'posts': True, 'comments': False, 'announcements': False }
    data['kinds'] = {
        'posts': bool(kinds.get('posts')),
        'comments': bool(kinds.get('comments')),
        'announcements': bool(kinds.get('announcements')),
    }
    last_c = r.get(f'user:webhooks:last_comment:{ident}')
    return jsonify({ 'ok': True, 'config': data, 'last_post_id': int(last) if (last and last.isdigit()) else None, 'last_comment_id': int(last_c) if (last_c and last_c.isdigit()) else None })


@bp.post("/webhook")
@jwt_required()
def set_user_webhook():
    """設定個人 Webhook（url、school_slug、enabled）。"""
    if not redis:
        return jsonify({ 'ok': False, 'error': 'redis_unavailable' }), 503
    ident = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    urlv = str(data.get('url') or '').strip()
    enabled = bool(data.get('enabled', True))
    raw_kinds = data.get('kinds') or {}
    kinds = {
        'posts': bool(raw_kinds.get('posts', True)),
        'comments': bool(raw_kinds.get('comments', False)),
        'announcements': bool(raw_kinds.get('announcements', False)),
    }
    batch = int(data.get('batch', 5) or 5)
    if batch < 1: batch = 1
    if batch > 10: batch = 10

    if enabled:
        if not urlv:
            return jsonify({ 'ok': False, 'msg': '請輸入 Webhook URL' }), 400
        try:
            u = urlparse(urlv)
            if u.scheme not in {'http','https'} or not u.netloc:
                return jsonify({ 'ok': False, 'msg': 'Webhook URL 格式無效' }), 400
        except Exception:
            return jsonify({ 'ok': False, 'msg': 'Webhook URL 格式無效' }), 400

    payload = { 'url': urlv, 'enabled': enabled, 'kinds': kinds, 'batch': batch }
    r = redis.from_url(os.getenv('REDIS_URL','redis://redis:80/0'), decode_responses=True)
    r.hset('user:webhooks', str(ident), _json.dumps(payload))
    return jsonify({ 'ok': True, 'config': payload })


@bp.post("/webhook/test")
@jwt_required()
def test_user_webhook():
    """對使用者設定或傳入的 URL 發送一則測試訊息。"""
    if not redis:
        return jsonify({ 'ok': False, 'error': 'redis_unavailable' }), 503
    from utils.notify import post_discord, build_embed
    ident = get_jwt_identity()
    r = redis.from_url(os.getenv('REDIS_URL','redis://redis:80/0'), decode_responses=True)
    data = request.get_json(silent=True) or {}
    url_override = str(data.get('url') or '').strip()
    conf_raw = r.hget('user:webhooks', str(ident)) or '{}'
    try:
        conf = _json.loads(conf_raw)
    except Exception:
        conf = {}
    urlv = url_override or str(conf.get('url') or '')
    if not urlv:
        return jsonify({ 'ok': False, 'msg': '尚未設定 Webhook URL' }), 400
    emb = build_embed('user_webhook_test', 'ForumKit 測試通知', 'Webhook 設定成功，將自動推送新貼文')
    res = post_discord(urlv, { 'content': None, 'embeds': [emb] })
    
    response = { 'ok': bool(res.get('ok')), 'status': res.get('status') }
    if not res.get('ok'):
        error = res.get('error', '未知錯誤')
        response['error'] = error
        response['msg'] = error  # 前端可能使用 msg 字段
    
    return jsonify(response)
