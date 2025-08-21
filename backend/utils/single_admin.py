from __future__ import annotations
import os
from typing import Optional
from werkzeug.security import generate_password_hash
from sqlalchemy.orm import Session

from models import User
from utils.db import get_session


def is_enabled() -> bool:
    v = os.getenv("ENFORCE_SINGLE_ADMIN", "1").strip().lower()
    return v not in {"0", "false", "no", "off"}


def configured_username() -> str:
    return os.getenv("SINGLE_ADMIN_USERNAME", "Kaiyasi").strip() or "Kaiyasi"


def configured_password() -> Optional[str]:
    # 建議在環境變數設定強密碼；若未設定，回傳 None 代表保持現有密碼（若有）
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

    with get_session() as s:  # type: Session
        # 刪除所有不是目標帳號的使用者
        s.query(User).filter(User.username != username).delete(synchronize_session=False)

        u = s.query(User).filter_by(username=username).first()
        if not u:
            # 建立帳號，若沒有密碼設定則使用臨時弱密碼（並提示在日誌中更改）
            temp_pwd = override_pwd or "admin123"
            u = User(username=username, password_hash=generate_password_hash(temp_pwd), role="dev_admin")
            s.add(u)
        else:
            # 確保角色為最高權限
            u.role = "dev_admin"
            if override_pwd:
                u.password_hash = generate_password_hash(override_pwd)
        s.commit()

