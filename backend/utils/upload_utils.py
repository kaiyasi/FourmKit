"""
Module: backend/utils/upload_utils.py
Unified comment style: module docstring + minimal inline notes.
"""
import os, uuid, io
from datetime import datetime
from PIL import Image, UnidentifiedImageError
import hashlib
import shutil
from pathlib import Path
from typing import Optional

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

def infer_ext_from_mime(mime: Optional[str], fallback: str = "jpg") -> str:
    mime = (mime or '').lower().strip()
    if mime in ALLOWED_IMAGE:
        return ALLOWED_IMAGE[mime]
    if mime in ALLOWED_VIDEO:
        return ALLOWED_VIDEO[mime]
    if mime in {"image/jpg"}: return "jpg"
    if mime in {"image/jpeg"}: return "jpg"
    if mime in {"image/png"}: return "png"
    if mime in {"image/webp"}: return "webp"
    if mime in {"video/mp4"}: return "mp4"
    if mime in {"video/webm"}: return "webm"
    return fallback

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
        if buf.startswith(b'\xFF\xD8\xFF'):
            return 'image/jpeg'
        elif buf.startswith(b'\x89PNG\r\n\x1A\n'):
            return 'image/png'
        elif buf.startswith(b'RIFF') and b'WEBP' in buf[:12]:
            return 'image/webp'
        elif len(buf) > 8 and buf[4:8] == b'ftyp':
            return 'video/mp4'
        elif buf.startswith(b'\x1a\x45\xdf\xa3'):
            return 'video/webm'
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

def generate_unique_filename(original_name: str, file_hash: str) -> str:
    """生成唯一的檔案名"""
    timestamp = str(int(os.urandom(4).hex(), 16))
    extension = Path(original_name).suffix
    return f"{file_hash}_{timestamp}{extension}"

def save_upload_chunk(file, unique_name: str, chunk_index: int, user_id: int) -> str:
    """保存上傳分塊"""
    chunks_dir = Path("uploads/chunks") / str(user_id) / unique_name
    chunks_dir.mkdir(parents=True, exist_ok=True)
    
    chunk_path = chunks_dir / f"chunk_{chunk_index:04d}"
    file.save(str(chunk_path))
    
    return str(chunk_path)

def merge_chunks(unique_name: str, total_chunks: int, user_id: int) -> str:
    """合併所有分塊為完整檔案"""
    chunks_dir = Path("uploads/chunks") / str(user_id) / unique_name
    final_dir = Path("uploads/pending") / str(user_id)
    final_dir.mkdir(parents=True, exist_ok=True)
    
    final_path = final_dir / unique_name
    
    with open(final_path, 'wb') as outfile:
        for i in range(total_chunks):
            chunk_path = chunks_dir / f"chunk_{i:04d}"
            if chunk_path.exists():
                with open(chunk_path, 'rb') as infile:
                    shutil.copyfileobj(infile, outfile)
    
    try:
        shutil.rmtree(chunks_dir)
    except Exception:
        pass  # 清理失敗不影響主流程
    
    return str(final_path.relative_to("uploads"))

def validate_file_type(filename: str, allowed_types: list) -> bool:
    """驗證檔案類型"""
    extension = Path(filename).suffix.lower()
    return extension in allowed_types

def validate_file_size(file_size: int, max_size_mb: int) -> bool:
    """驗證檔案大小"""
    max_size_bytes = max_size_mb * 1024 * 1024
    return file_size <= max_size_bytes

def publish_media_by_id(current_rel_path: str, media_id: int, mime_type: Optional[str]) -> str:
    """將媒體發布為 public/media/<id>.<ext> 並建立 public/<id>.<ext> 的相容副本。

    回傳相對 uploads 的新路徑（例如：public/media/123.jpg）。
    若找不到來源檔，回傳原路徑（呼叫端可決定是否忽略）。
    """
    upload_root = Path(os.getenv("UPLOAD_ROOT", "uploads"))
    
    name = Path(current_rel_path).name
    candidates = []
    candidates.append(upload_root / current_rel_path.lstrip("/"))
    candidates.append(upload_root / "media" / name)
    pending_root = upload_root / "pending"
    if pending_root.exists():
        try:
            for p in pending_root.rglob(name):
                if p.is_file():
                    candidates.append(p)
                    break
        except Exception:
            pass

    src: Optional[Path] = None
    for c in candidates:
        try:
            if c.exists():
                src = c
                break
        except Exception:
            continue
    if not src:
        return current_rel_path

    ext = Path(src.name).suffix.lstrip('.').lower() or infer_ext_from_mime(mime_type, 'jpg')
    if ext == 'jpeg':
        ext = 'jpg'

    dst_dir = upload_root / "public/media"
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / f"{media_id}.{ext}"

    try:
        if src.resolve() != dst.resolve():
            try:
                shutil.move(str(src), str(dst))
            except Exception:
                shutil.copy2(str(src), str(dst))
    except Exception:
        return current_rel_path

    try:
        alias_dir = upload_root / "public"
        alias_dir.mkdir(parents=True, exist_ok=True)
        alias_path = alias_dir / f"{media_id}.{ext}"
        if not alias_path.exists():
            try:
                os.link(str(dst), str(alias_path))
            except Exception:
                shutil.copy2(str(dst), str(alias_path))
    except Exception:
        pass

    return str(dst.relative_to(upload_root))


def find_public_media_rel(media_id: int) -> Optional[str]:
    """尋找既有的公開媒體相對路徑：優先 public/media/<id>.*，次之 public/<id>.*。找不到回 None。"""
    upload_root = Path(os.getenv("UPLOAD_ROOT", "uploads"))
    pub_media = upload_root / "public/media"
    pub_root = upload_root / "public"
    
    try:
        for p in list(pub_media.glob(f"{media_id}.*")) + list(pub_root.glob(f"{media_id}.*")):
            if p.is_file():
                rel = str(p.relative_to(upload_root))
                if rel.startswith("public/") and not rel.startswith("public/media/"):
                    try:
                        alias = pub_media / p.name
                        alias.parent.mkdir(parents=True, exist_ok=True)
                        if not alias.exists():
                            try:
                                os.link(str(p), str(alias))
                            except Exception:
                                shutil.copy2(str(p), str(alias))
                        rel = str(alias.relative_to(upload_root))
                    except Exception:
                        pass
                return rel
    except Exception:
        return None
    return None


from utils.cdn_uploader import publish_to_cdn

def resolve_or_publish_public_media(current_rel_path: str, media_id: int, mime_type: Optional[str]) -> Optional[str]:
    """確保並回傳完整的公開媒體 URL。
    優先從 CDN 提供，若 CDN 設定不存在則回退到本地相對路徑。
    """
    cdn_base_url = (os.getenv("CDN_PUBLIC_BASE_URL") or os.getenv("PUBLIC_CDN_URL") or "").strip().rstrip("/")
    
    public_rel_path = find_public_media_rel(media_id)
    
    if not public_rel_path:
        public_rel_path = publish_media_by_id(current_rel_path or '', media_id, mime_type)

    if public_rel_path and public_rel_path.startswith('public/'):
        if cdn_base_url:
            upload_root = Path(os.getenv("UPLOAD_ROOT", "uploads"))
            full_local_path = upload_root / public_rel_path
            
            if full_local_path.exists():
                cdn_url = publish_to_cdn(str(full_local_path), subdir="media")
                if cdn_url:
                    return cdn_url
        
        return f"/uploads/{public_rel_path}"

    return None

def cleanup_orphaned_chunks(user_id: int, max_age_hours: int = 24):
    """清理孤兒分塊檔案"""
    import time
    chunks_base = Path("uploads/chunks") / str(user_id)
    if not chunks_base.exists():
        return
    
    current_time = time.time()
    max_age_seconds = max_age_hours * 3600
    
    for chunk_dir in chunks_base.iterdir():
        if chunk_dir.is_dir():
            dir_age = current_time - chunk_dir.stat().st_mtime
            if dir_age > max_age_seconds:
                try:
                    shutil.rmtree(chunk_dir)
                except Exception:
                    pass

def get_file_hash(file_path: str) -> str:
    """計算檔案雜湊值"""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def save_media_simple(file_storage, media_id: int, root: str = "uploads") -> dict:
    """簡化的媒體檔案保存函數，使用 ID 作為檔案名"""
    raw = file_storage.read()
    if not raw:
        raise ValueError("empty file")
    
    mime = _mime_magic(raw)
    
    if mime in ALLOWED_IMAGE:
        file_type = "image"
        ext = ALLOWED_IMAGE[mime]
    elif mime in ALLOWED_VIDEO:
        file_type = "video"
        ext = ALLOWED_VIDEO[mime]
    else:
        raise ValueError(f"unsupported mime type: {mime}")
    
    media_dir = Path(root) / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"{media_id}.{ext}"
    file_path = media_dir / filename
    
    with open(file_path, "wb") as f:
        f.write(raw)
    
    return {
        "mime": mime,
        "file_type": file_type,
        "path": str(file_path.relative_to(root)),
        "filename": filename
    }

def move_media_file(old_id: int, new_id: int, root: str = "uploads") -> bool:
    """移動媒體檔案到新的 ID"""
    media_dir = Path(root) / "media"
    
    old_files = list(media_dir.glob(f"{old_id}.*"))
    if not old_files:
        return False
    
    old_file = old_files[0]
    ext = old_file.suffix
    new_file = media_dir / f"{new_id}{ext}"
    
    try:
        old_file.rename(new_file)
        return True
    except Exception:
        return False

def cleanup_temp_files(temp_id: int, root: str = "uploads") -> bool:
    """清理臨時檔案"""
    media_dir = Path(root) / "media"
    
    temp_files = list(media_dir.glob(f"{temp_id}.*"))
    if not temp_files:
        return False
    
    try:
        for temp_file in temp_files:
            temp_file.unlink()
        return True
    except Exception:
        return False

def save_page_file(file_storage, page_id: int, root: str = "uploads") -> dict:
    """保存頁面檔案，使用 ID 作為檔案名"""
    raw = file_storage.read()
    if not raw:
        raise ValueError("empty file")
    
    mime = _mime_magic(raw)
    
    if mime not in ALLOWED_IMAGE:
        raise ValueError(f"unsupported mime type for page: {mime}")
    
    ext = ALLOWED_IMAGE[mime]
    
    pages_dir = Path(root) / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"{page_id}.{ext}"
    file_path = pages_dir / filename
    
    with open(file_path, "wb") as f:
        f.write(raw)
    
    return {
        "mime": mime,
        "file_type": "image",
        "path": str(file_path.relative_to(root)),
        "filename": filename
    }

def get_media_url(media_id: int, file_type: str = "image") -> str:
    """根據媒體 ID 生成檔案 URL"""
    ext = "jpg"  # 預設值，實際應該從資料庫查詢
    return f"/uploads/public/media/{media_id}.{ext}"

def get_page_url(page_id: int) -> str:
    """根據頁面 ID 生成檔案 URL"""
    ext = "jpg"
    return f"/uploads/pages/{page_id}.{ext}"
