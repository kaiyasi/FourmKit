"""
媒體服務 - 處理檔案上傳和管理
"""

import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List
from werkzeug.utils import secure_filename
from utils.fsops import UPLOAD_ROOT


class MediaService:
    """媒體檔案服務"""
    
    # 支援的檔案類型
    ALLOWED_EXTENSIONS = {
        'image': ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        'document': ['pdf', 'doc', 'docx', 'txt'],
        'video': ['mp4', 'webm', 'mov']
    }
    
    @staticmethod
    def upload_file(file, upload_dir: str = 'support', allowed_extensions: List[str] = None, max_size: int = 10 * 1024 * 1024) -> Dict[str, Any]:
        """
        上傳檔案
        
        Args:
            file: 檔案物件
            upload_dir: 上傳目錄
            allowed_extensions: 允許的檔案副檔名
            max_size: 最大檔案大小（bytes）
            
        Returns:
            包含上傳結果的字典
        """
        try:
            if not file or not file.filename:
                return {'success': False, 'error': '沒有選擇檔案'}
            
            # 檢查檔案大小
            file.seek(0, 2)  # 移到檔案結尾
            file_size = file.tell()
            file.seek(0)  # 回到檔案開頭
            
            if file_size > max_size:
                return {'success': False, 'error': f'檔案大小超過限制 ({max_size // (1024*1024)}MB)'}
            
            # 檢查檔案副檔名
            filename = secure_filename(file.filename)
            file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
            
            if allowed_extensions and file_ext not in allowed_extensions:
                return {'success': False, 'error': f'不支援的檔案類型: {file_ext}'}
            
            # 生成唯一檔案名
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            unique_id = str(uuid.uuid4())[:8]
            new_filename = f"{timestamp}_{unique_id}.{file_ext}"
            
            # 創建上傳目錄
            upload_path = Path(UPLOAD_ROOT) / upload_dir
            upload_path.mkdir(parents=True, exist_ok=True)
            
            # 保存檔案
            file_path = upload_path / new_filename
            file.save(str(file_path))
            
            # 計算相對路徑
            relative_path = f"{upload_dir}/{new_filename}"
            
            return {
                'success': True,
                'path': relative_path,
                'filename': filename,
                'size': file_size,
                'mime_type': file.content_type
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def get_file_url(file_path: str) -> str:
        """
        取得檔案的公開 URL
        
        Args:
            file_path: 檔案相對路徑
            
        Returns:
            檔案的公開 URL
        """
        if not file_path:
            return ''
        
        # 如果是支援檔案，使用支援專用的端點
        if file_path.startswith('support/'):
            return f"/api/support/files/{file_path.replace('support/', '')}"
        
        # 其他檔案使用一般端點
        return f"/api/media/file/{file_path}"
    
    @staticmethod
    def delete_file(file_path: str) -> bool:
        """
        刪除檔案
        
        Args:
            file_path: 檔案相對路徑
            
        Returns:
            是否成功刪除
        """
        try:
            full_path = Path(UPLOAD_ROOT) / file_path
            if full_path.exists():
                full_path.unlink()
                return True
            return False
        except Exception:
            return False
