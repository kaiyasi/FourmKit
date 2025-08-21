from flask import Blueprint, request, jsonify, abort
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.orm import Session
from sqlalchemy import func
from utils.db import get_session
from utils.auth import get_effective_user_id
from utils.ratelimit import get_client_ip
from models import Post, Media
from utils.upload_validation import is_allowed, sniff_kind
from utils.sanitize import clean_html
from utils.ratelimit import rate_limit
import uuid, os, datetime

bp = Blueprint("posts", __name__, url_prefix="/api/posts")

def _wrap_ok(data, http: int = 200):
    return jsonify({"ok": True, "data": data}), http

def _wrap_err(code: str, message: str, http: int = 400):
    return jsonify({"ok": False, "error": {"code": code, "message": message}}), http

@bp.get("/list")
def list_posts():
    limit = max(min(int(request.args.get("limit", 20)), 100), 1)
    with get_session() as s:
        q = s.query(Post).filter(Post.status=="approved").order_by(Post.id.desc()).limit(limit)
        items = [{"id":p.id,"content":p.content} for p in q.all()]
        return jsonify({"items": items})

@bp.get("")
def list_posts_compat():
    """Compatibility: GET /api/posts?page=&per_page=
    Returns wrapper { ok, data: { items, page, per_page, total } }
    """
    page = max(int(request.args.get("page", 1) or 1), 1)
    per_page = min(max(int(request.args.get("per_page", 10) or 10), 1), 100)
    with get_session() as s:
        base = s.query(Post).filter(Post.status == "approved")
        total = base.count()
        rows = (
            base.order_by(Post.created_at.desc(), Post.id.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
                .all()
        )
        items = [
            {
                "id": p.id,
                "content": p.content,
                "created_at": (p.created_at.isoformat() if getattr(p, "created_at", None) else None),
            }
            for p in rows
        ]
        return _wrap_ok({
            "items": items,
            "page": page,
            "per_page": per_page,
            "total": int(total),
        })

@bp.post("/create")
@rate_limit(calls=5, per_seconds=60, by='client')
def create_post():
    uid = get_effective_user_id()
    if uid is None:
        abort(401)
    data = request.get_json() or {}
    content = (data.get("content") or "").strip()
    if not content:
        abort(422)
    max_len = int(os.getenv("POST_MAX_CHARS", "5000"))
    if len(content) > max_len:
        return _wrap_err("CONTENT_TOO_LONG", f"內容過長（最多 {max_len} 字）", 422)
    with get_session() as s:
        p = Post(author_id=uid, content=content, status="pending")
        try:
            p.client_id = (request.headers.get('X-Client-Id') or '').strip() or None
            p.ip = get_client_ip()
        except Exception:
            pass
        s.add(p); s.flush(); s.refresh(p)
        s.commit()
        return jsonify({"id": p.id, "status": p.status})

@bp.post("/upload")
@rate_limit(calls=10, per_seconds=300, by='client')
def upload_media():
    uid = get_effective_user_id()
    if uid is None:
        abort(401)
    # 接 multipart/form-data: file, post_id
    f = request.files.get("file")
    post_id = int(request.form.get("post_id", "0"))
    if not f or not is_allowed(f.filename): abort(422)
    # 大小與嗅探
    max_size_mb = int(os.getenv("UPLOAD_MAX_SIZE_MB", "10"))
    max_bytes = max_size_mb * 1024 * 1024
    try:
        f.stream.seek(0, os.SEEK_END)
        size = f.stream.tell(); f.stream.seek(0)
    except Exception:
        size = None
    if size is not None and size > max_bytes:
        return _wrap_err("FILE_TOO_LARGE", f"檔案過大（上限 {max_size_mb} MB）", 413)
    try:
        head = f.stream.read(64); f.stream.seek(0)
        if sniff_kind(head) == 'unknown':
            return _wrap_err("SUSPECT_FILE", "檔案內容與格式不符或未知", 400)
    except Exception:
        return _wrap_err("SUSPECT_FILE", "檔案檢查失敗", 400)
    ext = os.path.splitext(f.filename)[1].lower()
    gid = f"{uuid.uuid4().hex}{ext}"
    rel = f"{post_id}/{gid}"  # 子資料夾以 post_id 分流
    pending_path = os.path.join(os.getenv("UPLOAD_ROOT","uploads"), "pending", rel)
    os.makedirs(os.path.dirname(pending_path), exist_ok=True)
    f.save(pending_path)

    with get_session() as s:
        m = Media(post_id=post_id, path=f"pending/{rel}", status="pending")
        try:
            m.client_id = (request.headers.get('X-Client-Id') or '').strip() or None
            m.ip = get_client_ip()
        except Exception:
            pass
        s.add(m); s.flush(); s.commit()
        return jsonify({"media_id": m.id, "path": m.path, "status": m.status})

@bp.post("")
@rate_limit(calls=5, per_seconds=60, by='client')
def create_post_compat():
    """Compatibility: POST /api/posts
    Accepts JSON { content, client_tx_id? } and returns wrapper with post object.
    """
    uid = get_effective_user_id()
    if uid is None:
        abort(401)
    data = request.get_json() or {}
    content = clean_html((data.get("content") or "").strip())
    if len(content) < 1:
        return _wrap_err("CONTENT_REQUIRED", "內容不可為空", 422)
    max_len = int(os.getenv("POST_MAX_CHARS", "5000"))
    if len(content) > max_len:
        return _wrap_err("CONTENT_TOO_LONG", f"內容過長（最多 {max_len} 字）", 422)
    with get_session() as s:
        p = Post(author_id=uid, content=content, status="pending")
        try:
            p.client_id = (request.headers.get('X-Client-Id') or '').strip() or None
            p.ip = get_client_ip()
        except Exception:
            pass
        s.add(p); s.flush(); s.refresh(p)
        s.commit()
        payload = {
            "id": p.id,
            "content": p.content,
            "created_at": (p.created_at.isoformat() if getattr(p, "created_at", None) else None),
        }
    # best-effort broadcast (optional)
    try:
        from app import socketio
        socketio.emit("post_created", {"post": payload, "origin": request.headers.get("X-Client-Id") or "-", "client_tx_id": data.get("client_tx_id")})
    except Exception:
        pass
    return _wrap_ok(payload, 201)

@bp.post("/with-media")
@rate_limit(calls=3, per_seconds=60, by='client')
def create_post_with_media_compat():
    """Compatibility: POST /api/posts/with-media (multipart)
    Creates a pending post and attach multiple files as pending media under uploads/pending/.
    Returns wrapper with basic post object.
    """
    uid = get_effective_user_id()
    if uid is None:
        return _wrap_err("UNAUTHORIZED", "缺少授權資訊", 401)
    # Must be multipart/form-data
    if not request.content_type or not request.content_type.startswith("multipart/form-data"):
        return _wrap_err("INVALID_CONTENT_TYPE", "請使用 multipart/form-data", 400)

    content = clean_html((request.form.get("content", "") or "").strip())
    if len(content) < 1:
        return _wrap_err("CONTENT_REQUIRED", "內容不可為空", 422)

    files = request.files.getlist("files")
    if not files:
        return _wrap_err("NO_FILES", "未上傳任何檔案", 422)

    # 與 /api/posts/upload 對齊：預設使用專案內 uploads 目錄，避免容器外 /data 權限問題
    upload_root = os.getenv("UPLOAD_ROOT", "uploads")
    max_size_mb = int(os.getenv("UPLOAD_MAX_SIZE_MB", "10"))
    max_bytes = max_size_mb * 1024 * 1024

    saved_any = False
    with get_session() as s:
        p = Post(author_id=uid, content=content, status="pending")
        try:
            p.client_id = (request.headers.get('X-Client-Id') or '').strip() or None
            p.ip = get_client_ip()
        except Exception:
            pass
        s.add(p); s.flush(); s.refresh(p)

        for fs in files:
            fname = (fs.filename or "").strip()
            if not fname:
                continue
            if not is_allowed(fname):
                return _wrap_err("UNSUPPORTED_FILE", f"不支援的檔案格式: {fname}", 400)
            # 大小限制（單檔）
            try:
                fs.stream.seek(0, os.SEEK_END)
                size = fs.stream.tell()
                fs.stream.seek(0)
            except Exception:
                size = None
            if size is not None and size > max_bytes:
                return _wrap_err("FILE_TOO_LARGE", f"檔案過大（上限 {max_size_mb} MB）: {fname}", 413)
            # 內容嗅探
            try:
                head = fs.stream.read(64)
                fs.stream.seek(0)
                kind = sniff_kind(head)
                if kind == 'unknown':
                    return _wrap_err("SUSPECT_FILE", f"檔案內容與格式不符或未知: {fname}", 400)
            except Exception:
                return _wrap_err("SUSPECT_FILE", f"檔案檢查失敗: {fname}", 400)
            ext = os.path.splitext(fname)[1].lower()
            gid = f"{uuid.uuid4().hex}{ext}"
            rel = os.path.join(str(p.id), gid)  # by post id
            pending_path = os.path.join(upload_root, "pending", rel)
            try:
                os.makedirs(os.path.dirname(pending_path), exist_ok=True)
                fs.save(pending_path)
            except Exception as e:
                return _wrap_err("FS_WRITE_FAILED", f"無法儲存檔案：{e}", 500)
            m = Media(post_id=p.id, path=f"pending/{rel}", status="pending")
            try:
                m.client_id = (request.headers.get('X-Client-Id') or '').strip() or None
                m.ip = get_client_ip()
            except Exception:
                pass
            s.add(m)
            saved_any = True

        if not saved_any:
            return _wrap_err("NO_VALID_FILES", "沒有有效的檔案", 422)

        s.commit()

        payload = {
            "id": p.id,
            "content": p.content,
            "created_at": (p.created_at.isoformat() if getattr(p, "created_at", None) else None),
        }

    # best-effort broadcast (optional)
    try:
        from app import socketio
        socketio.emit("post_created", {"post": payload, "origin": request.headers.get("X-Client-Id") or "-", "client_tx_id": request.form.get("client_tx_id")})
    except Exception:
        pass

    return _wrap_ok(payload, 201)
