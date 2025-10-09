from __future__ import annotations
from flask import Blueprint, request, jsonify
from typing import Any
from utils.ratelimit import unblock_ip, get_client_ip, get_ip_block_metadata
from utils.ratelimit import _redis, _redis_ok  # type: ignore
from utils.ticket import new_ticket_id  # reuse ticket generator (avoids circular import)
from utils.admin_events import log_security_event
from utils.db import get_session
from models import School, SchoolSetting
import os, json, time

bp = Blueprint('abuse', __name__, url_prefix='/api')

def _load_unlock_codes() -> list[str]:
    codes: list[str] = []
    env_codes = os.getenv('IP_UNLOCK_CODES', '')
    if env_codes:
        codes.extend([c.strip() for c in env_codes.split(',') if c.strip()])

    file_path = os.getenv('IP_UNLOCK_CODES_FILE')
    if not file_path:
        base_dir = os.getenv('AUDIT_SAVE_DIR', 'uploads')
        file_path = os.path.join(base_dir, 'ip_unlock_codes.txt')

    try:
        if os.path.isfile(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    part = line.strip()
                    if not part:
                        continue
                    # 支援逗號分隔或逐行
                    for seg in part.split(','):
                        seg = seg.strip()
                        if seg:
                            codes.append(seg)
    except Exception:
        pass

    # 去除重複，維持輸入順序
    seen: set[str] = set()
    unique_codes: list[str] = []
    for code in codes:
        key = code.lower()
        if key not in seen:
            seen.add(key)
            unique_codes.append(code)
    return unique_codes


def _normalize_slug(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().lower().replace('_', '-').replace(' ', '')


def _get_school_unlock_code(slug: str) -> tuple[str | None, str | None]:
    slug = slug.lower()
    with get_session() as s:
        school = s.query(School).filter(School.slug == slug).first()
        if not school:
            return None, None
        setting = s.query(SchoolSetting).filter(SchoolSetting.school_id == school.id).first()
        if not setting or not setting.data:
            return None, None
        data = setting.data
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception:
                data = {}
        if not isinstance(data, dict):
            return None, None
        code = data.get('unlock_code')
        updated = data.get('unlock_code_updated_at')
        return code, updated


def _verify_unlock_code(provided: str, ip: str) -> bool:
    provided = provided.strip()
    if not provided:
        return False

    code_upper = provided.upper()
    code_slug = None
    if '-' in code_upper:
        prefix, suffix = code_upper.split('-', 1)
        if prefix and suffix:
            code_slug = prefix.lower()
    meta = get_ip_block_metadata(ip) or {}
    blocked_slug = (meta.get('school_slug') or '').lower()
    normalized_blocked = _normalize_slug(blocked_slug)
    normalized_code = _normalize_slug(code_slug)

    def _matches(expected: str | None) -> bool:
        return bool(expected and expected.upper() == code_upper)

    # Cross code可跨校
    if normalized_code == 'cross':
        expected, _ = _get_school_unlock_code('cross')
        if _matches(expected):
            return True
        # fallback：環境設定
        fallback = _load_unlock_codes()
        return any(c.lower() == provided.lower() for c in fallback)

    # 若封鎖記錄指向特定學校，僅允許相同學校或跨校碼
    if normalized_blocked and normalized_blocked not in {'cross', 'platform'}:
        if normalized_code and normalized_code != normalized_blocked:
            return False
        target_slug = blocked_slug
    else:
        target_slug = code_slug

    if target_slug:
        normalized_target = _normalize_slug(target_slug)
        if normalized_target == 'cross':
            expected, _ = _get_school_unlock_code('cross')
            if _matches(expected):
                return True
        else:
            expected, _ = _get_school_unlock_code(target_slug)
            if _matches(expected):
                return True
            # 若沒有對應，允許跨校碼（若封鎖沒有標記學校）
            if normalized_code is None:
                expected_cross, _ = _get_school_unlock_code('cross')
                if _matches(expected_cross):
                    return True
        return False

    # 沒有鎖定特定學校 → 嘗試跨校碼
    cross_code, _ = _get_school_unlock_code('cross')
    if _matches(cross_code):
        return True

    fallback = _load_unlock_codes()
    return any(c.lower() == provided.lower() for c in fallback)


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


@bp.post('/audit_report/unlock')
def audit_unlock():
    data: dict[str, Any] = request.get_json(silent=True) or {}
    code = str(data.get('code') or '').strip()
    ip = get_client_ip()

    if not code:
        return jsonify({
            'ok': False,
            'error': {
                'code': 'UNLOCK_CODE_REQUIRED',
                'message': '請輸入解鎖碼'
            }
        }), 400

    if not _verify_unlock_code(code, ip):
        return jsonify({
            'ok': False,
            'error': {
                'code': 'UNLOCK_CODE_INVALID',
                'message': '解鎖碼無效或已過期'
            }
        }), 403

    try:
        unblock_ip(ip)
    except Exception:
        pass

    meta = get_ip_block_metadata(ip) or {}

    try:
        log_security_event(
            event_type='ip_unblocked',
            description=f'使用解鎖碼解除 IP {ip} 的封鎖。',
            severity='medium',
            metadata={
                'ip': ip,
                'source': 'unlock_code',
                'school_slug': meta.get('school_slug'),
            }
        )
    except Exception:
        pass

    return jsonify({
        'ok': True,
        'ip': ip,
        'message': 'IP 已解除封鎖，請重新整理頁面'
    })

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
