# backend/routes_posts.py
from __future__ import annotations
from typing import Any
import hashlib
from time import time

from flask import Blueprint, jsonify, request
from sqlalchemy import select, desc, func
from sqlalchemy.orm import Session

from utils.db import get_db
from utils.sanitize import clean_html
from models import Post, DeleteRequest

bp = Blueprint("posts", __name__, url_prefix="/api")

# -------- 統一回傳格式 --------
def ok(data: Any, http: int = 200):
    return jsonify({"ok": True, "data": data}), http

def fail(code: str, message: str, *, hint: str | None = None, details: str | None = None, http: int = 500):
    return jsonify({"ok": False, "error": {"code": code, "message": message, "hint": hint, "details": details}}), http

# -------- 匿名作者雜湊（IP + UA + 伺服器鹽）--------
def _author_hash() -> str:
    salt = "forumkit-salt-v1"
    ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "").split(",")[0].strip()
    ua = request.headers.get("User-Agent", "")
    raw = f"{ip}|{ua}|{salt}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:64]

# -------- 簡易節流：每 IP/UA 30 秒 1 次 --------
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
    try:
        page = max(int(request.args.get("page", 1) or 1), 1)
        per_page = min(max(int(request.args.get("per_page", 10) or 10), 1), 30)
        offset = (page - 1) * per_page

        # 這裡假設 get_db() 是 contextmanager，回傳 SQLAlchemy Session
        with next(get_db()) as db:  # type: ignore
            db: Session
            base_filter = Post.deleted.is_(False)

            total = db.scalar(
                select(func.count()).select_from(Post).where(base_filter)
            ) or 0

            q = (
                select(Post)
                .where(base_filter)
                .order_by(desc(Post.created_at))
                .offset(offset)
                .limit(per_page)
            )
            items = db.execute(q).scalars().all()

        payload = {
            "items": [
                {
                    "id": p.id,
                    "content": p.content,
                    "author_hash": (p.author_hash or "")[:8],
                    "created_at": p.created_at.isoformat(),
                }
                for p in items
            ],
            "page": page,
            "per_page": per_page,
            "total": int(total),
        }
        return ok(payload)

    except Exception as e:
        # 真正的 traceback 請看容器日誌；對外只給標準錯誤格式
        return fail("INTERNAL_LIST_POSTS", "讀取貼文失敗", hint="檢查資料庫遷移與序列化", details=str(e))

@bp.post("/posts")
def create_post():
    try:
        data: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}

    raw_content = (data.get("content") or "").strip()
    if len(raw_content) < 15:
        return fail("CONTENT_TOO_SHORT", "內容太短（需 ≥ 15 字）", http=400)
    if len(raw_content) > 2000:
        return fail("CONTENT_TOO_LONG", "內容過長（≤ 2000 字）", http=400)

    fp = _author_hash()
    ok_rate, wait = _rate_limit_ok(fp, window=30)
    if not ok_rate:
        return fail("RATE_LIMIT", f"發文太頻繁，請 {wait} 秒後再試", http=429)

    content = clean_html(raw_content)

    try:
        with next(get_db()) as db:  # type: ignore
            db: Session
            p = Post(author_hash=fp, content=content)
            db.add(p)
            db.commit()
            db.refresh(p)

        return ok(
            {
                "id": p.id,
                "content": p.content,
                "author_hash": (p.author_hash or "")[:8],
                "created_at": p.created_at.isoformat(),
            },
            http=201,
        )
    except Exception as e:
        return fail("INTERNAL_CREATE_POST", "建立貼文失敗", details=str(e))

@bp.get("/posts/<int:post_id>")
def get_post(post_id: int):
    try:
        with next(get_db()) as db:  # type: ignore
            db: Session
            p = db.get(Post, post_id)
            if not p or p.deleted:
                return fail("NOT_FOUND", "貼文不存在", http=404)

        return ok(
            {
                "id": p.id,
                "content": p.content,
                "author_hash": (p.author_hash or "")[:8],
                "created_at": p.created_at.isoformat(),
            }
        )
    except Exception as e:
        return fail("INTERNAL_GET_POST", "讀取貼文失敗", details=str(e))

@bp.post("/posts/<int:post_id>/delete_request")
def request_delete(post_id: int):
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}

    reason = (data.get("reason") or "").strip()
    if len(reason) < 10:
        return fail("REASON_TOO_SHORT", "請描述刪文理由（≥ 10 字）", http=400)

    try:
        with next(get_db()) as db:  # type: ignore
            db: Session
            p = db.get(Post, post_id)
            if not p or p.deleted:
                return fail("NOT_FOUND", "貼文不存在", http=404)

            dr = DeleteRequest(post_id=post_id, reason=reason)
            db.add(dr)
            db.commit()

        return ok({"post_id": post_id})
    except Exception as e:
        return fail("INTERNAL_DELETE_REQUEST", "建立刪文申請失敗", details=str(e))
