from functools import wraps
from typing import Iterable
from flask import jsonify, request
from flask_jwt_extended import (
    jwt_required, get_jwt_identity, create_access_token, create_refresh_token
)
from models import User, UserRole
from utils.db import get_db

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
