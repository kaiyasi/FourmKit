from __future__ import annotations
import os, hmac, hashlib, time
from flask import Blueprint, request, abort, send_file
from utils.ratelimit import get_client_ip

bp = Blueprint('protected_assets', __name__)

def _verify_admin_cookie() -> bool:
    token = request.cookies.get('fk_admin_token', '')
    if not token:
        return False
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return False
        uid_str, ts_str, sig = parts
        uid = int(uid_str)
        ts = int(ts_str)
        # 過期檢查（預設 30 分鐘）
        max_age = int(os.getenv('ADMIN_ASSET_COOKIE_MAXAGE', '1800'))
        if time.time() - ts > max_age:
            return False
        # 簽名檢查（含 IP 綁定，降低竄改風險）
        ip = get_client_ip()
        secret = (os.getenv('SECRET_KEY') or 'dev-secret').encode('utf-8')
        base = f"{uid}.{ts}.{ip}".encode('utf-8')
        expect = hmac.new(secret, base, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expect, sig)
    except Exception:
        return False

@bp.get('/protected-assets/admin/<path:subpath>')
def serve_admin_asset(subpath: str):
    if not _verify_admin_cookie():
        abort(403)
    root = os.getenv('FRONTEND_DIST_ROOT', '/app/frontend-dist')
    # 僅允許讀取 admin 子資料夾
    full_path = os.path.abspath(os.path.join(root, 'assets', 'admin', subpath))
    if not full_path.startswith(os.path.abspath(os.path.join(root, 'assets', 'admin'))):
        abort(403)
    if not os.path.exists(full_path):
        abort(404)
    return send_file(full_path)

