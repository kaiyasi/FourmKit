"""
Module: backend/manage.py
Unified comment style: module docstring + minimal inline notes.
"""
import sys
from werkzeug.security import generate_password_hash
from utils.db import get_session, init_engine_session
from models import User


def create_user(username: str, password: str, role: str = "user") -> None:
    """Idempotent user creation helper.
    Creates the user if it does not exist; otherwise prints a notice.
    """
    with get_session() as s:
        if s.query(User).filter_by(username=username).first():
            print(f"exists: {username}")
            return
        u = User(username=username, password_hash=generate_password_hash(password), role=role)
        s.add(u)
        s.commit()
        print(f"created: {username} ({role})")


def seed_defaults() -> None:
    create_user("admin", "admin123", "admin")
    create_user("moder", "moder123", "moderator")
    create_user("tester", "tester123", "user")


def main(argv: list[str]) -> int:
    try:
        init_engine_session()
    except Exception as e:
        print(f"DB init failed: {e}")
        return 1

    if len(argv) >= 2 and argv[1] == "create-admin":
        if len(argv) < 4:
            print("usage: python manage.py create-admin <username> <password>")
            return 2
        username, password = argv[2], argv[3]
        create_user(username, password, role="admin")
        return 0

    if len(argv) >= 2 and argv[1] == "create-superadmin":
        if len(argv) < 4:
            print("usage: python manage.py create-superadmin <username> <password>")
            return 2
        username, password = argv[2], argv[3]
        from utils.db import get_session
        with get_session() as s:
            u = s.query(User).filter_by(username=username).first()
            if u:
                if u.role != "dev_admin":
                    u.role = "dev_admin"
                    s.add(u)
                    s.commit()
                    print(f"promoted: {username} -> dev_admin")
                else:
                    print(f"exists: {username} (dev_admin)")
            else:
                create_user(username, password, role="dev_admin")
        return 0

    if len(argv) >= 2 and argv[1] == "set-password":
        if len(argv) < 4:
            print("usage: python manage.py set-password <username> <password>")
            return 2
        username, password = argv[2], argv[3]
        from utils.db import get_session
        with get_session() as s:
            u = s.query(User).filter_by(username=username).first()
            if not u:
                u = User(username=username, password_hash=generate_password_hash(password), role="user")
                s.add(u)
                s.commit()
                print(f"created: {username} (user)")
            else:
                u.password_hash = generate_password_hash(password)
                s.add(u)
                s.commit()
                print(f"updated password: {username}")
        return 0

    seed_defaults()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
