"""
CDN 靜態檔案服務
處理預覽檔案、靜態資源等
"""

from flask import Blueprint, send_file, jsonify, abort
from flask_jwt_extended import jwt_required
from pathlib import Path
import os
import mimetypes

bp = Blueprint("cdn", __name__, url_prefix="/cdn")

# CDN 根目錄
CDN_ROOT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "cdn-data")




@bp.get("/uploads/<path:filepath>")
def get_upload_file(filepath: str):
    """獲取上傳檔案（包括模板圖片等）"""
    try:
        # 安全檢查：防止路徑遍歷攻擊
        if ".." in filepath or filepath.startswith('/'):
            abort(404)
        
        # 構建檔案路徑
        upload_root = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "uploads")
        file_path = os.path.join(upload_root, filepath)
        
        # 檢查檔案是否存在
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            abort(404)
        
        # 檢查檔案是否在 uploads 目錄內
        try:
            file_path = os.path.abspath(file_path)
            upload_root = os.path.abspath(upload_root)
            if not file_path.startswith(upload_root):
                abort(404)
        except Exception:
            abort(404)
        
        # 獲取 MIME 類型
        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        # 發送檔案
        return send_file(
            file_path,
            mimetype=mime_type,
            as_attachment=False
        )
        
    except Exception as e:
        print(f"Error serving upload file {filepath}: {e}")
        abort(404)






