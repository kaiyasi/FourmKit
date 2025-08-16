# backend/routes_posts.py
from __future__ import annotations
from typing import Any
import hashlib
from flask import Blueprint, jsonify, request, g
from sqlalchemy import select, desc
from sqlalchemy.orm import Session
from utils.db import get_db
from utils.sanitize import clean_html
from models import Post, DeleteRequest

bp = Blueprint("posts", __name__, url_prefix="/api")

# 生成匿名作者雜湊（IP + UA + 伺服器鹽）
def _author_hash() -> str:
    salt = "forumkit-salt-v1"
    ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "").split(",")[0].strip()
    ua = request.headers.get("User-Agent", "")
    raw = f"{ip}|{ua}|{salt}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:64]

# 簡單節流：每 IP/UA 30 秒 1 次（交由 Nginx/前端再補更嚴格）
from time import time
_last_post_by_fingerprint: dict[str, float] = {}

def _rate_limit_ok(fp: str, window: int = 30) -> tuple[bool, int]:
    now = time()
    last = _last_post_by_fingerprint.get(fp, 0.0)
    if now - last < window:
        return False, int(window - (now - last))
    _last_post_by_fingerprint[fp] = now
    return True, 0

@bp.get("/posts")
def list_posts():
    page = max(int(request.args.get("page", 1) or 1), 1)
    per_page = min(max(int(request.args.get("per_page", 10) or 10), 1), 30)
    offset = (page - 1) * per_page
    with next(get_db()) as db:  # type: ignore
        db: Session
        q = select(Post).where(Post.deleted.is_(False)).order_by(desc(Post.created_at))
        total = db.scalar(select(Post).where(Post.deleted.is_(False)).count())  # SQLA 2.0 改法：用 subquery_count
        # 上面一行簡化處理，如遇舊版 SQLA 可改 raw SQL COUNT(*)
        items = db.execute(q.offset(offset).limit(per_page)).scalars().all()
    return jsonify({
        "page": page, "per_page": per_page, "total": total or 0,
        "items": [
            {
                "id": p.id,
                "content": p.content,
                "author_hash": p.author_hash[:8],
                "created_at": p.created_at.isoformat(),
            } for p in items
        ]
    })

@bp.post("/posts")
def create_post():
    try:
        data: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}
    raw_content = (data.get("content") or "").strip()
    if len(raw_content) < 15:
        return jsonify({"ok": False, "error": "內容太短（需 ≥ 15 字）"}), 400
    if len(raw_content) > 2000:
        return jsonify({"ok": False, "error": "內容過長（≤ 2000 字）"}), 400

    # 節流
    fp = _author_hash()
    ok, wait = _rate_limit_ok(fp, window=30)
    if not ok:
        return jsonify({"ok": False, "error": f"發文太頻繁，請 {wait} 秒後再試"}), 429

    content = clean_html(raw_content)

    with next(get_db()) as db:  # type: ignore
        db: Session
        p = Post(author_hash=fp, content=content)
        db.add(p)
        db.commit()
        db.refresh(p)
    return jsonify({"ok": True, "post": {
        "id": p.id, "content": p.content, "author_hash": p.author_hash[:8], "created_at": p.created_at.isoformat()
    }})

@bp.get("/posts/<int:post_id>")
def get_post(post_id: int):
    with next(get_db()) as db:  # type: ignore
        db: Session
        p = db.get(Post, post_id)
        if not p or p.deleted:
            return jsonify({"ok": False, "error": "貼文不存在"}), 404
    return jsonify({"ok": True, "post": {
        "id": p.id, "content": p.content, "author_hash": p.author_hash[:8], "created_at": p.created_at.isoformat()
    }})

@bp.post("/posts/<int:post_id>/delete_request")
def request_delete(post_id: int):
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}
    reason = (data.get("reason") or "").strip()
    if len(reason) < 10:
        return jsonify({"ok": False, "error": "請描述刪文理由（≥ 10 字）"}), 400

    with next(get_db()) as db:  # type: ignore
        db: Session
        p = db.get(Post, post_id)
        if not p or p.deleted:
            return jsonify({"ok": False, "error": "貼文不存在"}), 404
        dr = DeleteRequest(post_id=post_id, reason=reason)
        db.add(dr)
        db.commit()
    return jsonify({"ok": True})
