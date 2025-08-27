from functools import wraps
from typing import Iterable
import os
from flask import jsonify, request
from flask_jwt_extended import (
    jwt_required, get_jwt_identity, create_access_token, create_refresh_token,
    verify_jwt_in_request
)
from models import User, UserRole
from utils.db import get_db
from utils.config_handler import load_config

def get_current_user() -> User | None:
    ident = get_jwt_identity()
    if not ident: 
        return None
    db = next(get_db())
    try:
        # ident 現在是字串形式的 user.id，需要轉換回整數
        user_id = int(ident)
        return db.query(User).filter_by(id=user_id).first()
    except (ValueError, TypeError):
        # 如果轉換失敗，可能是舊的 username 格式，嘗試用 username 查找
        return db.query(User).filter_by(username=ident).first()
    finally:
        db.close()


def _is_dev_bypass_enabled() -> bool:
    try:
        v = os.getenv("DEV_BYPASS_AUTH", "").strip().lower()
        if v in {"1", "true", "yes", "y"}:
            return True
    except Exception:
        pass
    try:
        cfg = load_config() or {}
        return (cfg.get("mode") == "development")
    except Exception:
        return False


def get_effective_user_id() -> int | None:
    """回傳 JWT 身分；若啟用 dev bypass，找/建 dev_bypass 使用者並回傳其 id。"""
    ident = None
    try:
        # optional=True：即使未帶 JWT 也不會丟例外，之後 get_jwt_identity() 會回 None
        verify_jwt_in_request(optional=True)
        ident = get_jwt_identity()
        if ident is not None:
            try:
                return int(ident)
            except Exception:
                pass
    except Exception:
        # 未帶 JWT 或驗證失敗都視為未登入；後續看是否啟用 dev bypass
        ident = None
    # 1) 完整匿名：允許以 X-Client-Id 做為匿名使用（無需登入）
    #    過去會為每個 client 建立一個使用者（anon_{client_id})，造成帳號氾濫。
    #    改為統一掛載到單一來賓帳號：username='anon_guest'（role='user'），
    #    顯示名稱仍由貼文的 client_id 產生 6 碼匿名碼，不受使用者名稱影響。
    try:
        client_id = request.headers.get("X-Client-Id", "").strip()
        if client_id:
            db = next(get_db())
            try:
                uname = "anon_guest"
                u = db.query(User).filter_by(username=uname).first()
                if not u:
                    u = User(username=uname, password_hash="", role="user")
                    db.add(u)
                    db.commit()
                    db.refresh(u)
                return int(u.id)
            finally:
                db.close()
    except Exception:
        # 匿名建立失敗，進一步嘗試 dev bypass
        pass

    # 2) 開發繞過：僅在 development 模式啟用
    if _is_dev_bypass_enabled():
        db = next(get_db())
        try:
            u = db.query(User).filter_by(username="dev_bypass").first()
            if not u:
                u = User(username="dev_bypass", password_hash="", role="user")
                db.add(u)
                db.commit()
                db.refresh(u)
            return int(u.id)
        finally:
            db.close()

    # 否則視為未登入
    return None

def role_required(roles: Iterable[UserRole]):
    allowed = set(roles)
    def deco(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            u = get_current_user()
            if not u or u.role not in allowed:
                return jsonify({"msg":"permission denied"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return deco

def platform_role_required(platform: str, roles: Iterable[UserRole]):
    allowed = set(roles)
    assert platform in ("campus","cross"), "platform must be 'campus' or 'cross'"
    def deco(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            u = get_current_user()
            if not u or u.role not in allowed:
                return jsonify({"msg":"permission denied"}), 403
            if platform == "campus" and not u.school_id:
                return jsonify({"msg":"campus role requires school_id"}), 403
            if platform == "cross" and u.school_id:
                return jsonify({"msg":"cross role must not bind to a school"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return deco
