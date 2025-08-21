from flask import Blueprint, request, jsonify, abort
import os
from werkzeug.security import check_password_hash, generate_password_hash
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
)
from sqlalchemy.orm import Session
from utils.db import get_session
from models import User

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@bp.post("/login")
def login():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    with get_session() as s:  # type: Session
        # 單一管理者模式：只允許特定帳號登入
        enforce = (os.getenv("ENFORCE_SINGLE_ADMIN", "1").strip().lower() not in {"0","false","no","off"})
        single_name = os.getenv("SINGLE_ADMIN_USERNAME", "Kaiyasi").strip() or "Kaiyasi"
        if enforce and username != single_name:
            return jsonify({"msg": "此階段僅允許開發者帳號登入"}), 403
        u = s.query(User).filter_by(username=username).first()
        if not u or not check_password_hash(u.password_hash, password):
            # 統一回傳 JSON，避免前端只看到空白 401
            return jsonify({"msg": "帳號或密碼錯誤"}), 401
        # Flask-JWT-Extended/PyJWT 對 sub 類型較嚴格，統一使用字串
        token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
        refresh = create_refresh_token(identity=str(u.id))
        # 與前端期待的欄位對齊：提供 access_token/refresh_token/role/school_id（此專案無校系欄位，回傳 null）
        return jsonify({
            "access_token": token,
            "refresh_token": refresh,
            "role": u.role,
            "school_id": None,
        })

@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh_token():
    ident = get_jwt_identity()
    with get_session() as s:  # type: Session
        u = s.query(User).get(int(ident)) if ident is not None else None
        if not u:
            return jsonify({"msg": "使用者不存在"}), 401
        token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
        return jsonify({"access_token": token})

@bp.post("/register")
def register():
    """
    Minimal registration endpoint for development/testing.
    Accepts { username, password } and creates a user with role 'user'.
    If username exists, returns 409.
    """
    # 單一管理者模式：停用註冊
    enforce = (os.getenv("ENFORCE_SINGLE_ADMIN", "1").strip().lower() not in {"0","false","no","off"})
    if enforce:
        return jsonify({"msg": "已停用註冊（僅限開發者帳號）"}), 403
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"msg": "缺少帳號或密碼"}), 400
    with get_session() as s:  # type: Session
        if s.query(User).filter_by(username=username).first():
            return jsonify({"msg": "使用者已存在"}), 409
        u = User(username=username, password_hash=generate_password_hash(password), role="user")
        s.add(u); s.commit()
        return jsonify({"msg": "註冊成功"})


