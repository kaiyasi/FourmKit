"""
Module: backend/utils/single_admin.py
Unified comment style: module docstring + minimal inline notes.
"""
from __future__ import annotations
import os
from typing import Optional
from werkzeug.security import generate_password_hash

from models import User
from utils.db import get_session


def is_enabled() -> bool:
    v = os.getenv("ENFORCE_SINGLE_ADMIN", "1").strip().lower()
    return v not in {"0", "false", "no", "off"}


def configured_username() -> str:
    return os.getenv("SINGLE_ADMIN_USERNAME", "Kaiyasi").strip() or "Kaiyasi"


def configured_password() -> Optional[str]:
    pwd = os.getenv("SINGLE_ADMIN_PASSWORD", "").strip()
    return pwd or None


def ensure_single_admin() -> None:
    """
    清空所有非單一管理者帳號，並確保指定帳號存在且為最高權限。
    以環境變數控制：
      - ENFORCE_SINGLE_ADMIN: 預設 1 開啟。
      - SINGLE_ADMIN_USERNAME: 預設 'Kaiyasi'
      - SINGLE_ADMIN_PASSWORD: 若提供則同步重設密碼；未提供則保留既有密碼
    """
    if not is_enabled():
        return

    username = configured_username()
    override_pwd = configured_password()

    with get_session() as s:
        u = s.query(User).filter_by(username=username).first()
        if not u:
            temp_pwd = override_pwd or "admin123"
            u = User(username=username, password_hash=generate_password_hash(temp_pwd), role="dev_admin")
            s.add(u)
        else:
            u.role = "dev_admin"
            if override_pwd:
                u.password_hash = generate_password_hash(override_pwd)
        s.commit()

