from flask import Blueprint, request, jsonify, abort, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import Media, User
from utils.db import get_session
from utils.fsops import UPLOAD_ROOT
from utils.upload_utils import generate_unique_filename, save_upload_chunk, merge_chunks
from utils.upload_utils import resolve_or_publish_public_media
import mimetypes
from pathlib import Path

bp = Blueprint("media", __name__, url_prefix="/api/media")

# 支援的檔案類型
SUPPORTED_TYPES = {
    'image': ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    'video': ['.mp4', '.webm', '.mov', '.avi'],
    'document': ['.pdf', '.doc', '.docx', '.txt']
}

# 檔案大小限制（MB）
SIZE_LIMITS = {
    'image': 10,
    'video': 100,
    'document': 5
}

@bp.post("/upload")
@jwt_required()
def upload_media():
    """分塊上傳媒體檔案"""
    try:
        user_id = get_jwt_identity()
        post_id = request.form.get('post_id', type=int)
        chunk_index = request.form.get('chunk', type=int, default=0)
        total_chunks = request.form.get('chunks', type=int, default=1)
        file_hash = request.form.get('hash', '').strip()
        file_name = request.form.get('name', '').strip()
        
        if not file_name or not file_hash:
            return jsonify({"ok": False, "error": "缺少檔案資訊"}), 400
            
        # 驗證檔案類型
        file_ext = Path(file_name).suffix.lower()
        file_type = None
        for media_type, extensions in SUPPORTED_TYPES.items():
            if file_ext in extensions:
                file_type = media_type
                break
                
        if not file_type:
            return jsonify({"ok": False, "error": f"不支援的檔案類型: {file_ext}"}), 400
            
        # 驗證檔案大小
        if 'file' not in request.files:
            return jsonify({"ok": False, "error": "沒有檔案"}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"ok": False, "error": "沒有選擇檔案"}), 400
            
        # 檢查檔案大小限制
        file.seek(0, 2)  # 移到檔案末尾
        file_size = file.tell()
        file.seek(0)  # 回到開頭
        
        if file_size > SIZE_LIMITS[file_type] * 1024 * 1024:
            return jsonify({"ok": False, "error": f"檔案太大，最大 {SIZE_LIMITS[file_type]}MB"}), 400
            
        with get_session() as s:
            # 檢查用戶權限
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 401
                
            # 生成唯一檔案名
            unique_name = generate_unique_filename(file_name, file_hash)
            
            # 保存分塊
            _ = save_upload_chunk(file, unique_name, chunk_index, user_id)
            
            # 如果是最後一個分塊，合併所有分塊
            if chunk_index == total_chunks - 1:
                final_path = merge_chunks(unique_name, total_chunks, user_id)
                
                # 創建媒體記錄
                media = Media(
                    post_id=post_id,
                    path=final_path,
                    file_name=file_name,
                    file_size=file_size,
                    file_type=file_type,
                    mime_type=mimetypes.guess_type(file_name)[0] or 'application/octet-stream',
                    status='pending',
                    author_id=user_id,
                    school_id=getattr(user, 'school_id', None),
                    client_id=request.headers.get('X-Client-ID'),
                    ip=request.remote_addr
                )
                
                s.add(media)
                s.commit()
                
                return jsonify({
                    "ok": True,
                    "media_id": media.id,
                    "path": final_path,
                    "message": "檔案上傳完成"
                })
            else:
                return jsonify({
                    "ok": True,
                    "chunk": chunk_index,
                    "message": f"分塊 {chunk_index + 1}/{total_chunks} 上傳成功"
                })
                
    except Exception as e:
        return jsonify({"ok": False, "error": f"上傳失敗: {str(e)}"}), 500

@bp.get("/<int:media_id>")
@jwt_required()
def get_media_info(media_id):
    """獲取媒體資訊"""
    with get_session() as s:
        media = s.query(Media).get(media_id)
        if not media:
            abort(404)
            
        # 檢查權限
        user_id = get_jwt_identity()
        user = s.query(User).get(user_id)
        
        # 只有作者、管理員或同校用戶可以查看
        if (media.author_id != user_id and 
            not hasattr(user, 'role') or 
            user.role not in ['dev_admin', 'campus_admin', 'cross_admin']):
            abort(403)
            
        return jsonify({
            "id": media.id,
            "post_id": media.post_id,
            "file_name": media.file_name,
            "file_size": media.file_size,
            "file_type": media.file_type,
            "mime_type": media.mime_type,
            "status": media.status,
            "created_at": media.created_at.isoformat() if media.created_at else None,
            "path": media.path
        })

@bp.get("/<int:media_id>/url")
def get_media_public_url(media_id: int):
    """回傳媒體的公開 URL（自動發布/尋找）。對 approved 不需登入。"""
    with get_session() as s:
        media = s.query(Media).get(media_id)
        if not media:
            abort(404)
        # 僅對已核准提供公開 URL
        if (media.status or '').lower() != 'approved':
            abort(403)
        rel = resolve_or_publish_public_media(media.path or '', int(media.id), getattr(media,'mime_type',None))
        if not rel or not rel.startswith('public/'):
            abort(404)
        return jsonify({"url": f"/uploads/{rel}"})


@bp.get("/<int:media_id>/public")
def get_media_public_meta(media_id: int):
    """回傳核准媒體的公開 URL 與精簡中繼資料（合併 v2 行為）。
    響應：{ id, url, mime, size, file_type }
    """
    with get_session() as s:
        m = s.query(Media).get(media_id)
        if not m:
            abort(404)
        if (m.status or "").lower() != "approved":
            abort(403)
        rel = resolve_or_publish_public_media(m.path or "", int(m.id), getattr(m, "mime_type", None))
        if not rel or not rel.startswith("public/"):
            abort(404)
        url = f"/uploads/{rel}"
        return jsonify({
            "id": m.id,
            "url": url,
            "mime": getattr(m, "mime_type", None),
            "size": getattr(m, "file_size", None),
            "file_type": getattr(m, "file_type", None),
        })

@bp.get("/<int:media_id>/file")
def serve_media_file(media_id):
    """提供媒體檔案下載"""
    from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
    with get_session() as s:
        media = s.query(Media).get(media_id)
        if not media:
            abort(404)
            
        # 權限：approved → 公開；pending → 審核員或作者
        if (media.status or '').lower() != 'approved':
            try:
                verify_jwt_in_request(optional=False)
                uid = get_jwt_identity()
                user = s.query(User).get(uid)
                role = getattr(user, 'role', None) if user else None
                if not (user and (role in ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'] or media.author_id == uid)):
                    abort(403)
            except Exception:
                abort(401)
            
        # 檢查檔案是否存在（支援新的簡化結構）
        file_path = Path(UPLOAD_ROOT) / media.path
        
        # 如果檔案不存在，嘗試從 public 目錄讀取（新結構）或 public/media（相容舊結構）
        if not file_path.exists():
            media_filename = f"{media.id}.{(media.file_type or 'jpg').strip('.')}"
            cand_new = Path(UPLOAD_ROOT) / "public" / media_filename
            cand_old = Path(UPLOAD_ROOT) / "public" / "media" / media_filename
            if cand_old.exists():
                file_path = cand_old
            elif cand_new.exists():
                file_path = cand_new
            else:
                # 廣義搜尋 id.* 兩個目錄
                found = None
                try:
                    for p in list((Path(UPLOAD_ROOT)/'public'/'media').glob(f"{media.id}.*")) + list((Path(UPLOAD_ROOT)/'public').glob(f"{media.id}.*")):
                        if p.is_file():
                            found = p
                            break
                except Exception:
                    pass
                if found is not None:
                    file_path = found

        if not file_path.exists():
            abort(404)
            
        return send_file(
            str(file_path),
            mimetype=media.mime_type or (mimetypes.guess_type(str(file_path))[0] or 'application/octet-stream'),
            as_attachment=True,
            download_name=media.file_name
        )

@bp.delete("/<int:media_id>")
@jwt_required()
def delete_media(media_id):
    """刪除媒體檔案"""
    with get_session() as s:
        media = s.query(Media).get(media_id)
        if not media:
            abort(404)
            
        # 檢查權限
        user_id = get_jwt_identity()
        user = s.query(User).get(user_id)
        
        # 只有作者或管理員可以刪除
        if (media.author_id != user_id and 
            not hasattr(user, 'role') or 
            user.role not in ['dev_admin', 'campus_admin', 'cross_admin']):
            abort(403)
            
        # 刪除檔案
        try:
            file_path = Path(UPLOAD_ROOT) / media.path
            if file_path.exists():
                file_path.unlink()
        except Exception:
            pass  # 檔案刪除失敗不影響資料庫記錄
            
        # 刪除資料庫記錄
        s.delete(media)
        s.commit()
        
        return jsonify({"ok": True, "message": "檔案已刪除"})
