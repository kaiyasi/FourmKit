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

