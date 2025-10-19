"""
Module: backend/utils/auth.py
Unified comment style: module docstring + minimal inline notes.
"""
from functools import wraps
from typing import Iterable
import os
from flask import jsonify, request
from flask_jwt_extended import (
    jwt_required, get_jwt_identity, verify_jwt_in_request
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
        user_id = int(ident)
        return db.query(User).filter_by(id=user_id).first()
    except (ValueError, TypeError):
        return db.query(User).filter_by(username=ident).first()
    finally:
        db.close()


def get_role() -> str | None:
    """獲取當前用戶的角色"""
    user = get_current_user()
    return user.role if user else None


def require_role(*roles: str):
    """要求特定角色的裝飾器"""
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user or user.role not in roles:
                return jsonify({"error": "權限不足"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def token_required(fn):
    """簡單的 JWT 驗證裝飾器（向後相容）。
    - 驗證通過後在 g 物件上設置 user 與 user_id，供舊路由使用。
    - 未登入時回 401。
    """
    from flask import g
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"ok": False, "error": "未登入或 Token 無效"}), 401
        try:
            g.user = user
            g.user_id = int(user.id)
        except Exception:
            pass
        return fn(*args, **kwargs)
    return wrapper

def get_user_role() -> str | None:
    """向後相容別名：回傳當前用戶角色。"""
    return get_role()


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
        verify_jwt_in_request(optional=True)
        ident = get_jwt_identity()
        if ident is not None:
            try:
                return int(ident)
            except Exception:
                pass
    except Exception:
        ident = None
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
        pass

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
