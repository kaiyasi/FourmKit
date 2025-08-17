import os, uuid, io
from datetime import datetime
from PIL import Image, UnidentifiedImageError

# 跨平台的 magic 支援
try:
    import magic
    HAS_MAGIC = True
except ImportError:
    HAS_MAGIC = False
    print("[WARNING] python-magic not available, using file extension fallback")

ALLOWED_IMAGE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
ALLOWED_VIDEO = {
    "video/mp4": "mp4",
    "video/webm": "webm",
}

def _ym_path(root: str, kind_dir: str) -> str:
    now = datetime.utcnow()
    p = os.path.join(root, kind_dir, f"{now.year:04d}", f"{now.month:02d}")
    os.makedirs(p, exist_ok=True)
    return p

def _mime_magic(buf: bytes) -> str:
    if HAS_MAGIC:
        mg = magic.Magic(mime=True)
        return mg.from_buffer(buf)
    else:
        # Fallback: 基於檔案 header 的簡單檢測
        if buf.startswith(b'\xFF\xD8\xFF'):
            return 'image/jpeg'
        elif buf.startswith(b'\x89PNG\r\n\x1A\n'):
            return 'image/png'
        elif buf.startswith(b'RIFF') and b'WEBP' in buf[:12]:
            return 'image/webp'
        elif buf.startswith(b'\x00\x00\x00\x20ftypmp4') or buf.startswith(b'\x00\x00\x00\x18ftypmp4'):
            return 'video/mp4'
        else:
            return 'application/octet-stream'

def _assert_ext_matches_mime(fname: str, mime: str):
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
    if mime in ALLOWED_IMAGE and ext not in {"jpg","jpeg","png","webp"}:
        raise ValueError("ext-mime mismatch")
    if mime in ALLOWED_VIDEO and ext not in {"mp4","webm"}:
        raise ValueError("ext-mime mismatch")

def save_image(file_storage, root: str):
    raw = file_storage.read()
    if not raw: raise ValueError("empty file")
    mime = _mime_magic(raw)
    if mime not in ALLOWED_IMAGE: raise ValueError("unsupported image mime")
    _assert_ext_matches_mime(file_storage.filename or "", mime)

    dirp = _ym_path(root, "images")
    stem = str(uuid.uuid4())
    ext = ALLOWED_IMAGE[mime]
    orig_path = os.path.join(dirp, f"{stem}.{ext}")
    thumb_path = os.path.join(dirp, f"{stem}.thumb.webp")

    with open(orig_path, "wb") as f: f.write(raw)

    try:
        im = Image.open(io.BytesIO(raw))
        im = im.convert("RGB")
        im.thumbnail((1280,1280))
        im.save(thumb_path, format="WEBP", quality=82, method=6)
    except UnidentifiedImageError:
        thumb_path = None

    def rel(p: str | None):
        if not p: return None
        return p if p.startswith("/uploads/") else p.split("/app")[-1]

    return {
        "mime": mime,
        "orig_rel": rel(orig_path),
        "thumb_rel": rel(thumb_path)
    }

def save_video(file_storage, root: str):
    head = file_storage.stream.read(4096)
    mime = _mime_magic(head)
    if mime not in ALLOWED_VIDEO: raise ValueError("unsupported video mime")
    _assert_ext_matches_mime(file_storage.filename or "", mime)

    file_storage.stream.seek(0)
    dirp = _ym_path(root, "videos")
    stem = str(uuid.uuid4())
    ext = ALLOWED_VIDEO[mime]
    orig_path = os.path.join(dirp, f"{stem}.{ext}")
    with open(orig_path, "wb") as f:
        while True:
            chunk = file_storage.stream.read(1024 * 1024)
            if not chunk: break
            f.write(chunk)

    return {
        "mime": mime,
        "orig_rel": orig_path.split("/app")[-1],
        "thumb_rel": None
    }
