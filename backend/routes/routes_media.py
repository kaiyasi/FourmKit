from flask import Blueprint, request, jsonify
from utils.db import get_db
from models import Media, Post
from utils.upload_utils import save_image, save_video
from utils.sanitize import clean_html
import os, hashlib
from time import time
from sqlalchemy.orm import Session

bp = Blueprint("media", __name__, url_prefix="/api")

# -------- 統一回傳格式 --------
def ok(data: any, http: int = 200):
    return jsonify({"ok": True, "data": data}), http

def fail(code: str, message: str, *, hint: str | None = None, details: str | None = None, http: int = 500):
    return jsonify({"ok": False, "error": {"code": code, "message": message, "hint": hint, "details": details}}), http

# -------- 匿名作者雜湊 --------
def _author_hash() -> str:
    salt = "forumkit-salt-v1"
    ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "").split(",")[0].strip()
    ua = request.headers.get("User-Agent", "")
    raw = f"{ip}|{ua}|{salt}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:64]

# -------- 簡易節流 --------
_last_post_by_fingerprint: dict[str, float] = {}

def _rate_limit_ok(fp: str, window: int = 30) -> tuple[bool, int]:
    now = time()
    last = _last_post_by_fingerprint.get(fp, 0.0)
    if now - last < window:
        return False, int(window - (now - last))
    _last_post_by_fingerprint[fp] = now
    return True, 0

def _limit_bytes(max_mb: int) -> int:
    return max_mb * 1024 * 1024

@bp.route("/posts/with-media", methods=["POST"])
def create_post_with_media():
    try:
        from flask import current_app
        current_app.logger.debug(f"create_post_with_media started, content_type: {request.content_type}")
        
        # 檢查是否為 multipart/form-data
        if not request.content_type or not request.content_type.startswith('multipart/form-data'):
            return fail("INVALID_CONTENT_TYPE", "請使用 multipart/form-data 格式上傳", http=400)
        
        content = (request.form.get("content", "") or "").strip()
        if len(content) < 15:
            return fail("CONTENT_TOO_SHORT", "內容太短（需 ≥ 15 字）", http=400)
        if len(content) > 2000:
            return fail("CONTENT_TOO_LONG", "內容過長（≤ 2000 字）", http=400)

        # 檢查是否有檔案
        files = request.files.getlist("files")
        if not files or len(files) == 0:
            return fail("NO_FILES", "未上傳任何檔案", http=422)

        fp = _author_hash()
        ok_rate, wait = _rate_limit_ok(fp, window=30)
        if not ok_rate:
            return fail("RATE_LIMIT", f"發文太頻繁，請 {wait} 秒後再試", http=429)

        content = clean_html(content)

        with next(get_db()) as db:  # type: ignore
            db: Session
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            post = Post(
                author_hash=fp, 
                content=content,
                created_at=now,
                updated_at=now,
                deleted=False
            )
            db.add(post)
            db.flush()  # 取得 post.id

            upload_root = os.getenv("UPLOAD_ROOT", "/app/uploads")
            max_img = int(os.getenv("MAX_IMAGE_MB", "8"))
            max_vid = int(os.getenv("MAX_VIDEO_MB", "50"))

            media_rows = []
            for fs in files:
                if not fs.filename:
                    continue  # 跳過空檔案
                    
                fname = fs.filename.lower()
                current_app.logger.debug(f"Processing file: {fname}")
                
                if fname.endswith((".jpg", ".jpeg", ".png", ".webp")):
                    if request.content_length and request.content_length > _limit_bytes(max_img):
                        return fail("IMAGE_TOO_LARGE", f"圖片過大（≤ {max_img}MB）", http=413)
                    r = save_image(fs, upload_root)
                    m = Media(post_id=post.id, kind="image", url=r["orig_rel"], 
                             thumb_url=r["thumb_rel"], mime=r["mime"], status="pending")
                    media_rows.append(m)
                elif fname.endswith((".mp4", ".webm")):
                    if request.content_length and request.content_length > _limit_bytes(max_vid):
                        return fail("VIDEO_TOO_LARGE", f"影片過大（≤ {max_vid}MB）", http=413)
                    r = save_video(fs, upload_root)
                    m = Media(post_id=post.id, kind="video", url=r["orig_rel"], 
                             thumb_url=None, mime=r["mime"], status="pending")
                    media_rows.append(m)
                else:
                    return fail("UNSUPPORTED_FILE", f"不支援的檔案格式: {fname}", 
                               hint="只支援 JPG/PNG/WebP/MP4/WebM", http=400)

            if not media_rows:
                return fail("NO_VALID_FILES", "沒有有效的檔案", http=422)

            for m in media_rows:
                db.add(m)
            db.commit()
            db.refresh(post)

            def pub(u: str | None) -> str | None:
                if not u: return None
                return u if u.startswith("/uploads/") else f"/uploads{u}"

            result = {
                "id": post.id,
                "content": post.content,
                "author_hash": (post.author_hash or "")[:8],
                "created_at": post.created_at.isoformat(),
                "media": [{
                    "id": m.id,
                    "kind": m.kind,
                    "url": pub(m.url),
                    "thumb_url": pub(m.thumb_url),
                    "mime": m.mime,
                    "status": m.status
                } for m in media_rows]
            }
            
            # 廣播新貼文事件，包含來源追蹤
            try:
                from app import socketio
                from datetime import timezone
                import time, uuid
                if socketio:
                    origin = request.headers.get("X-Client-Id") or "-"
                    client_tx_id = request.headers.get("X-Tx-Id") or request.form.get("client_tx_id")
                    
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
                    
                    safe_post = _post_to_public_dict(post)
                    broadcast_payload = {
                        "post": safe_post,
                        "origin": str(origin),
                        "client_tx_id": str(client_tx_id) if client_tx_id else None,
                        "event_id": event_id,
                    }
                    
                    # 詳細廣播日誌 (帶媒體)
                    current_app.logger.info(f"[SocketIO] emit post_created (media): event_id={event_id} post_id={safe_post['id']} origin={origin} tx_id={client_tx_id} content_preview='{safe_post['content'][:30]}...' media_count={len(media_rows)}")
                    
                    # 安全地檢查當前連線的客戶端數量（避免 len(generator) 錯誤）
                    try:
                        participants_iter = socketio.server.manager.get_participants(namespace="/", room=None)
                        connected_clients = sum(1 for _ in participants_iter)  # 安全地計數 generator
                        current_app.logger.info(f"[SocketIO] broadcasting media post to {connected_clients} connected clients")
                    except Exception as count_err:
                        current_app.logger.warning(f"[SocketIO] failed to count clients: {count_err}, proceeding with broadcast")
                    
                    socketio.emit("post_created", broadcast_payload, namespace="/")
                    current_app.logger.info(f"[SocketIO] post_created media broadcast completed: event_id={event_id} post_id={safe_post['id']}")
            except Exception as e:
                current_app.logger.exception(f"[SocketIO] Failed to broadcast post_created for media post: {e}")
            
            return ok(result, http=201)

    except Exception as e:
        from flask import current_app
        current_app.logger.exception("create_post_with_media failed")
        return fail("INTERNAL_CREATE_POST_MEDIA", "建立含媒體貼文失敗", details=str(e))
