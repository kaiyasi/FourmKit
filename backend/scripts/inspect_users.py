#!/usr/bin/env python3
from __future__ import annotations
from datetime import datetime
from utils.db import init_engine_session, get_session
from models import User


def main() -> int:
    try:
        init_engine_session()
    except Exception as e:
        print(f"DB init failed: {e}")
        return 1

    with get_session() as s:
        rows = s.query(User).order_by(User.created_at.asc()).all()
        if not rows:
            print("(no users)")
            return 0
        print(f"id  username        role        created_at")
        print(f"--  --------------  ----------  -------------------------")
        for u in rows:
            ts = u.created_at.isoformat(sep=' ', timespec='seconds') if isinstance(u.created_at, datetime) else str(u.created_at)
            print(f"{u.id:<3} {u.username:<14} {u.role:<10} {ts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

