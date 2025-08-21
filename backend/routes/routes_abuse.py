from __future__ import annotations
from flask import Blueprint, request, jsonify
from typing import Any
from utils.ratelimit import unblock_ip, get_client_ip, is_ip_blocked
from utils.ratelimit import _redis, _redis_ok  # type: ignore
from utils.ticket import new_ticket_id  # reuse ticket generator (avoids circular import)
import os, json, time

bp = Blueprint('abuse', __name__, url_prefix='/api')

@bp.post('/audit_report')
def audit_report():
    data: dict[str, Any] = request.get_json(silent=True) or {}
    contact = str(data.get('contact') or '').strip()
    message = str(data.get('message') or '').strip()
    reason = str(data.get('reason') or '').strip()
    if len(message) < 10:
        return jsonify({ 'ok': False, 'error': { 'code': 'REPORT_TOO_SHORT', 'message': '請提供至少 10 個字的說明' } }), 422
    ticket = new_ticket_id('FKA')
    ip = get_client_ip()

    # 儲存一份 JSONL（若有 Redis/DB 可替換）
    try:
        root = os.getenv('AUDIT_SAVE_DIR', 'uploads')
        os.makedirs(root, exist_ok=True)
        path = os.path.join(root, 'audit_reports.jsonl')
        rec = { 'ticket': ticket, 'ip': ip, 'contact': contact, 'reason': reason, 'message': message, 'ts': int(time.time()) }
        with open(path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    except Exception:
        pass

    # 解封該 IP
    try:
        unblock_ip(ip)
    except Exception:
        pass

    return jsonify({ 'ok': True, 'ticket': ticket })

@bp.get('/abuse/blocked_ips')
def list_blocked_ips():
    out = []
    if _redis_ok and _redis is not None:
        try:
            # 粗略列出所有封鎖 key（需 Redis 5+ 支援 scan）
            cursor = 0
            pattern = 'ipsec:blocked:*'
            while True:
                cursor, keys = _redis.scan(cursor=cursor, match=pattern, count=100)
                for k in keys:
                    ip = k.split(':')[-1]
                    ttl = _redis.ttl(k)
                    out.append({ 'ip': ip, 'ttl': ttl })
                if cursor == 0:
                    break
        except Exception:
            pass
    # 單機模式無法枚舉，回傳空陣列（仍可透過 451 與解封 API 作業）
    return jsonify({ 'items': out, 'total': len(out) })

@bp.post('/abuse/unblock')
def api_unblock():
    data = request.get_json(silent=True) or {}
    ip = str(data.get('ip') or '').strip() or get_client_ip()
    unblock_ip(ip)
    return jsonify({ 'ok': True, 'ip': ip })

@bp.get('/abuse/audit_reports')
def list_audit_reports():
    limit = max(min(int(request.args.get('limit', 100) or 100), 1000), 1)
    root = os.getenv('AUDIT_SAVE_DIR', 'uploads')
    path = os.path.join(root, 'audit_reports.jsonl')
    items = []
    try:
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()[-limit:]
            import json
            for line in lines:
                try:
                    items.append(json.loads(line))
                except Exception:
                    continue
    except FileNotFoundError:
        items = []
    return jsonify({ 'items': list(reversed(items)), 'total': len(items) })
