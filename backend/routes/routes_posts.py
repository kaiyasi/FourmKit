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
        from flask import current_app
        current_app.logger.debug(f"create_post started, content_type: {request.content_type}")
        
        # 檢查 Content-Type 是否為 JSON
        if not request.content_type or not request.content_type.startswith('application/json'):
            return fail("INVALID_CONTENT_TYPE", "請使用 application/json 格式", http=400)
        
        try:
            data: dict[str, Any] = request.get_json(force=True, silent=True) or {}
        except Exception as e:
            current_app.logger.warning(f"JSON parse failed: {e}")
            return fail("INVALID_JSON", "無效的 JSON 格式", http=400)

        raw_content = (data.get("content") or "").strip()
        if not raw_content:
            return fail("MISSING_CONTENT", "缺少 content 欄位", http=422)
        if len(raw_content) < 15:
            return fail("CONTENT_TOO_SHORT", "內容太短（需 ≥ 15 字）", http=400)
        if len(raw_content) > 2000:
            return fail("CONTENT_TOO_LONG", "內容過長（≤ 2000 字）", http=400)

        fp = _author_hash()
        ok_rate, wait = _rate_limit_ok(fp, window=30)
        if not ok_rate:
            return fail("RATE_LIMIT", f"發文太頻繁，請 {wait} 秒後再試", http=429)

        content = clean_html(raw_content)

        with next(get_db()) as db:  # type: ignore
            db: Session
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            p = Post(
                author_hash=fp, 
                content=content,
                created_at=now,
                updated_at=now,
                deleted=False
            )
            db.add(p)
            db.commit()
            db.refresh(p)

        result = {
            "id": p.id,
            "content": p.content,
            "author_hash": (p.author_hash or "")[:8],
            "created_at": p.created_at.isoformat(),
        }
        
        # 廣播新貼文事件，包含來源追蹤
        try:
            from app import socketio
            import time, uuid
            if socketio:
                origin = request.headers.get("X-Client-Id") or "-"
                client_tx_id = request.headers.get("X-Tx-Id") or data.get("client_tx_id")
                
                # 產生唯一事件 ID
                event_id = f"post:{int(time.time()*1000)}:{uuid.uuid4().hex[:8]}"
                
                # 確保 payload 100% JSON-safe，避免任何 generator/SQLAlchemy 物件
                def _post_to_public_dict(row):
                    return {
                        "id": int(row.id),
                        "content": str(row.content or ""),
                        "author_hash": str(row.author_hash or "")[:8],
                        "created_at": row.created_at.astimezone(timezone.utc).isoformat() if getattr(row, "created_at", None) else None,
                    }
                
                safe_post = _post_to_public_dict(p)
                broadcast_payload = {
                    "post": safe_post,
                    "origin": str(origin),
                    "client_tx_id": str(client_tx_id) if client_tx_id else None,
                    "event_id": event_id,
                }
                
                # 詳細廣播日誌
                current_app.logger.info(f"[SocketIO] emit post_created: event_id={event_id} post_id={safe_post['id']} origin={origin} tx_id={client_tx_id} content_preview='{safe_post['content'][:30]}...'")
                
                # 安全地檢查當前連線的客戶端數量（避免 len(generator) 錯誤）
                try:
                    participants_iter = socketio.server.manager.get_participants(namespace="/", room=None)
                    connected_clients = sum(1 for _ in participants_iter)  # 安全地計數 generator
                    current_app.logger.info(f"[SocketIO] broadcasting to {connected_clients} connected clients")
                except Exception as count_err:
                    current_app.logger.warning(f"[SocketIO] failed to count clients: {count_err}, proceeding with broadcast")
                
                socketio.emit("post_created", broadcast_payload, namespace="/")
                current_app.logger.info(f"[SocketIO] post_created broadcast completed: event_id={event_id} post_id={safe_post['id']}")
        except Exception as e:
            current_app.logger.exception(f"[SocketIO] Failed to broadcast post_created: {e}")
        
        return ok(result, http=201)
    except Exception as e:
        from flask import current_app
        current_app.logger.exception("create_post failed")
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
