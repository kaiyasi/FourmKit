from __future__ import annotations
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import Session
from utils.db import get_session
from models import User, School
from PIL import Image
import os

bp = Blueprint("account", __name__, url_prefix="/api/account")


@bp.get("/profile")
@jwt_required()
def get_profile():
    ident = get_jwt_identity()
    with get_session() as s:  # type: Session
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
        return jsonify({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'role': u.role,
            'school': ({ 'id': sch.id, 'slug': sch.slug, 'name': sch.name } if sch else None),
            'avatar_path': u.avatar_path,
            'auth_provider': auth_provider,
            'has_password': bool((u.password_hash or '').strip()),
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
    with get_session() as s:  # type: Session
        u = s.get(User, int(ident)) if ident is not None else None
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        # 唯一性
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
    with get_session() as s:  # type: Session
        u = s.get(User, int(ident)) if ident is not None else None
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        u.avatar_path = rel
        s.commit()
    return jsonify({ 'ok': True, 'path': rel })

