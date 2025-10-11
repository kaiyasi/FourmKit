#!/usr/bin/env python3
"""
診斷媒體系統：列出 DB 與檔案系統的對齊問題，並可選擇修復（只讀預設）。

使用：
  docker compose exec -T backend python scripts/diagnose_media.py [--fix]
"""
from utils.db import get_session
from models import Media
from utils.upload_utils import find_public_media_rel, publish_media_by_id
from pathlib import Path
import argparse

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fix', action='store_true', help='嘗試將檔案發布到 public/media 並更新 DB path')
    args = ap.parse_args()

    upload_root = Path('uploads')
    miss = 0
    fixed = 0
    total = 0
    with get_session() as s:
        rows = s.query(Media).all()
        for m in rows:
            total += 1
            rel = (m.path or '').lstrip('/')
            if (m.status or '').lower() == 'approved':
                cand = find_public_media_rel(int(m.id))
                if cand:
                    if args.fix and m.path != cand:
                        m.path = cand
                        fixed += 1
                    continue
                if args.fix:
                    new_rel = publish_media_by_id(rel, int(m.id), getattr(m,'mime_type',None))
                    if new_rel.startswith('public/'):
                        m.path = new_rel
                        fixed += 1
                        continue
                miss += 1
            else:
                p = upload_root / rel
                if not p.exists():
                    miss += 1
        if args.fix:
            s.commit()

    print(f"[diagnose-media] total={total} missing={miss} fixed={fixed}")

if __name__ == '__main__':
    main()

