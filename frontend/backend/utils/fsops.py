import os, shutil
from pathlib import Path

UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", "uploads")).resolve()
PENDING_DIR = UPLOAD_ROOT / "pending"
PUBLIC_DIR  = UPLOAD_ROOT / "public"

def ensure_within(base: Path, p: Path) -> None:
    if not str(p.resolve()).startswith(str(base.resolve())):
        raise ValueError("path escape detected")

def move_to_public(rel_pending_path: str) -> str:
    """將 pending 相對路徑移至 public，回傳新相對路徑（public/...）。"""
    src = (PENDING_DIR / rel_pending_path.lstrip("/")).resolve()
    dst = (PUBLIC_DIR  / rel_pending_path.lstrip("/")).resolve()
    ensure_within(PENDING_DIR, src); ensure_within(PUBLIC_DIR, dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.exists():
        shutil.move(str(src), str(dst))
        os.chmod(dst, 0o644)
    # 若 dst 已存在，視同成功（冪等）
    return str((Path("public") / rel_pending_path).as_posix())
