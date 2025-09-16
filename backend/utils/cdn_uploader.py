"""
簡易 CDN 發佈工具（預設本機目錄當作 CDN 原始檔）

用途：
- 將已生成的本機圖片複製一份到 CDN 目錄（例如 repo 根目錄的 cdn-data/）
- 回傳對應的公開 URL（由 CDN_PUBLIC_BASE_URL 或 PUBLIC_CDN_URL 組出）

環境變數：
- CDN_PUBLIC_BASE_URL：CDN 的公開網域，例如 https://cdn.example.com
- PUBLIC_CDN_URL：相容舊名稱，若 CDN_PUBLIC_BASE_URL 未設，則使用此值
- CDN_LOCAL_ROOT：本機 CDN 根目錄，預設為 'cdn-data'

注意：
- 這是「檔案複製」型策略，交由 Nginx/反代去對外提供 cdn-data/ 內容。
- 若未設定任何公開 BASE URL，將回傳 None，呼叫端應降級為既有行為。
"""
from __future__ import annotations
import os
import shutil
from typing import Optional


def _ensure_dir(path: str) -> None:
    try:
        os.makedirs(path, exist_ok=True)
        # 確保目錄可被 nginx worker 讀取（x）與列出（r）
        try:
            os.chmod(path, 0o755)
            # 也修復父目錄權限（針對 schools 等目錄）
            parent_path = os.path.dirname(path)
            if parent_path and parent_path != path:
                os.chmod(parent_path, 0o755)
        except Exception:
            pass
    except Exception:
        pass


def publish_to_cdn(local_file_path: str, *, subdir: str = "social_media") -> Optional[str]:
    """將本機檔案複製到 CDN 目錄，並回傳公開 URL。

    Args:
        local_file_path: 來源檔案（已存在）
        subdir: CDN 目錄下的子資料夾名稱，預設 social_media

    Returns:
        str | None: 公開 URL；若沒有設定 CDN_PUBLIC_BASE_URL/PUBLIC_CDN_URL，回傳 None。
    """
    cdn_base = (os.getenv("CDN_PUBLIC_BASE_URL") or os.getenv("PUBLIC_CDN_URL") or "").strip().rstrip("/")
    if not cdn_base:
        return None

    cdn_root = (os.getenv("CDN_LOCAL_ROOT") or "cdn-data").strip()
    # 目標目錄：<cdn_root>/<subdir>
    target_dir = os.path.join(cdn_root, subdir)
    _ensure_dir(target_dir)

    filename = os.path.basename(local_file_path)
    target_path = os.path.join(target_dir, filename)

    try:
        # 同名覆蓋（確保最新）
        shutil.copy2(local_file_path, target_path)
        try:
            # 設定安全讀取權限（nginx 可讀）
            os.chmod(target_dir, 0o755)
            os.chmod(target_path, 0o644)
        except Exception:
            pass
    except Exception:
        # 若複製失敗，讓呼叫端有機會 fallback
        return None

    return f"{cdn_base}/{subdir}/{filename}"
