#!/usr/bin/env python3
"""
重置 Alembic 遷移：
- 將現有 backend/migrations/versions 目錄歸檔
- 建立全新的 versions 目錄與 __init__.py
- 產生單一 baseline 遷移，revision 固定為 'context'，檔名固定 'context.py'
- 顯示 Docker / 本機 的 stamp / upgrade 指令

使用方式：
  python scripts/reset_migrations.py          # 預覽（不執行）
  python scripts/reset_migrations.py --apply  # 實際重置並產出 baseline

注意：執行前請先備份 DB。若 DB 已有資料且與模型不同步，請先評估升級策略。
"""

import argparse
import os
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSIONS_DIR = ROOT / "backend" / "migrations" / "versions"
MIGRATIONS_DIR = ROOT / "backend" / "migrations"

BASELINE_REV_ID = "context"  # <= 32 chars
BASELINE_MSG = "context"
BASELINE_FILE = VERSIONS_DIR / "context.py"


def ensure_init_py(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    init_py = directory / "__init__.py"
    if not init_py.exists():
        init_py.write_text("# alembic versions\n", encoding="utf-8")


def run_alembic_revision(rev_id: str, message: str) -> None:
    # 產生暫時檔名，之後再改名為 context.py
    # 使用 --rev-id 指定固定 revision
    cmd = f"cd backend && alembic revision --rev-id {rev_id} --autogenerate -m \"{message}\""
    print(f"$ {cmd}")
    rc = os.system(cmd)
    if rc != 0:
        raise SystemExit("alembic revision 失敗，請確認已安裝 alembic 並可於 backend 目錄執行。")


def find_generated_file_by_revision(rev_id: str) -> Path | None:
    for p in sorted(VERSIONS_DIR.glob("*.py")):
        try:
            txt = p.read_text(encoding="utf-8", errors="ignore")
            if f"revision = '{rev_id}'" in txt or f'revision = "{rev_id}"' in txt:
                return p
        except Exception:
            continue
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="實際執行（預設為預覽）")
    args = ap.parse_args()

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = None

    if VERSIONS_DIR.exists():
        backup_dir = VERSIONS_DIR.parent / f"versions_backup_{ts}"
        print(f"將歸檔現有遷移：{VERSIONS_DIR} -> {backup_dir}")
    else:
        print("未發現現有 versions 目錄，將直接建立新的。")

    print(f"將建立 baseline 版本：revision='{BASELINE_REV_ID}', 檔名='{BASELINE_FILE.name}'")

    if not args.apply:
        print("\n🔎 預覽模式（未執行）。使用 --apply 進行實際操作。")
        print("後續步驟（Docker）：")
        print("  docker compose exec backend sh -lc \"cd /app && alembic upgrade head\"")
        print("或指定 heads 以保留多分支：")
        print("  docker compose exec backend sh -lc \"cd /app && alembic upgrade heads\"")
        return

    # 1) 歸檔現有遷移
    if VERSIONS_DIR.exists():
        shutil.move(str(VERSIONS_DIR), str(backup_dir))
    ensure_init_py(VERSIONS_DIR)

    # 2) 產生 baseline 遷移（使用 alembic autogenerate）
    run_alembic_revision(BASELINE_REV_ID, BASELINE_MSG)

    # 3) 將生成的檔案改名為 context.py
    gen = find_generated_file_by_revision(BASELINE_REV_ID)
    if not gen:
        raise SystemExit("找不到剛產生的遷移檔，請檢查 alembic 設定。")
    if gen.name != BASELINE_FILE.name:
        # 覆蓋同名舊檔（理論上不會存在）
        if BASELINE_FILE.exists():
            BASELINE_FILE.unlink()
        gen.rename(BASELINE_FILE)

    print("\n✅ 重置完成。新遷移位於：", BASELINE_FILE)
    print("📁 舊遷移已備份於：", backup_dir or "(無)")

    print("\n📌 接續步驟：")
    print("1) 容器內升級到 baseline：")
    print("   docker compose exec backend sh -lc \"cd /app && alembic upgrade head\"")
    print("   如需一次升級所有分支（仍保留 heads）：alembic upgrade heads")
    print("2) 若 alembic_version 欄位長度不足（32），可先放寬：")
    print(
        """
   docker compose exec backend sh -lc 'python - <<PY
from sqlalchemy import create_engine, text
import os
engine = create_engine(os.environ.get("DATABASE_URL"))
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)"))
print("done")
PY'
        """
    )

if __name__ == "__main__":
    main()
