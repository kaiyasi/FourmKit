import os
import json
import urllib.parse
import urllib.request
from typing import Optional, Tuple, Dict, Any
from utils.db import get_session
from models import School, SchoolSetting
import json


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def is_config_ready() -> bool:
    return bool(os.getenv("GOOGLE_OAUTH_CLIENT_ID") and os.getenv("GOOGLE_OAUTH_CLIENT_SECRET") and os.getenv("OAUTH_REDIRECT_URL"))


def build_auth_redirect(scope: str = "openid email profile") -> str:
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
    redirect_uri = os.getenv("OAUTH_REDIRECT_URL", "")
    qs = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "access_type": "online",
        # 採用最小實作，未啟用 state 與 nonce；待 Day12 強化
        # "state": state,
        # "nonce": nonce,
        "prompt": "select_account",
    })
    return f"{GOOGLE_AUTH_URL}?{qs}"


def _post_form(url: str, data: Dict[str, str], timeout: int = 10) -> Dict[str, Any]:
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        txt = resp.read().decode("utf-8")
        try:
            return json.loads(txt)
        except Exception:
            return {"raw": txt}


def _get_json(url: str, headers: Optional[Dict[str, str]] = None, timeout: int = 10) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        txt = resp.read().decode("utf-8")
        try:
            return json.loads(txt)
        except Exception:
            return {"raw": txt}


def exchange_code_for_tokens(code: str) -> Dict[str, Any]:
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
    redirect_uri = os.getenv("OAUTH_REDIRECT_URL", "")
    payload = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    return _post_form(GOOGLE_TOKEN_URL, payload)


def fetch_user_info(access_token: Optional[str] = None, id_token: Optional[str] = None) -> Dict[str, Any]:
    # 優先嘗試 userinfo
    if access_token:
        try:
            return _get_json(f"{GOOGLE_USERINFO_URL}?alt=json", headers={"Authorization": f"Bearer {access_token}"})
        except Exception:
            pass
    # 備援：tokeninfo 解析 id_token
    if id_token:
        try:
            return _get_json(f"{GOOGLE_TOKENINFO_URL}?id_token={urllib.parse.quote(id_token)}")
        except Exception:
            pass
    return {}


def _find_school_by_domain(domain: str) -> Optional[School]:
    """根據完整網域（不含 @）在 SchoolSetting.allowed_domains 中尋找綁定學校。"""
    try:
        with get_session() as s:
            rows = s.query(School, SchoolSetting).join(SchoolSetting, School.id == SchoolSetting.school_id, isouter=True).all()
            for sch, setting in rows:
                if not setting or not (setting.data or '').strip():
                    continue
                try:
                    data = json.loads(setting.data)
                except Exception:
                    continue
                allowed = []
                if isinstance(data, dict):
                    allowed = data.get('allowed_domains') or []
                if not isinstance(allowed, list):
                    continue
                # 綁定格式要求以 @ 開頭儲存
                full = f"@{domain.lower()}"
                if any(isinstance(x, str) and x.strip().lower() == full for x in allowed):
                    return sch
    except Exception:
        return None
    return None


def check_school_domain(email: str) -> Tuple[bool, str]:
    """回傳 (是否允許, domain)。規則：
    - 明確拒絕 gmail.com
    - 允許所有 .edu 類網域（.edu / .edu.tw / .edu.* 或包含 .edu.）
    - 其餘一律拒絕（不再使用 GOOGLE_ALLOWED_HD 或其他白名單）
    """
    email = (email or "").strip().lower()
    if "@" not in email:
        return False, ""
    domain = email.split("@", 1)[1]
    if domain == "gmail.com":
        return False, domain
    # 先查詢是否被學校明確綁定（允許自定義完整網域）
    sch = _find_school_by_domain(domain)
    if sch:
        return True, domain
    if domain.endswith(".edu") or domain.endswith(".edu.tw") or \
       domain.endswith(".edu.cn") or domain.endswith(".edu.hk") or \
       ".edu." in domain:
        return True, domain
    return False, domain


def derive_school_slug_from_domain(domain: str) -> str:
    parts = (domain or "").lower().split('.')
    # 取 'edu' 之前的標籤；例如 dept.ncku.edu.tw -> ncku
    if 'edu' in parts:
        idx = parts.index('edu')
        if idx > 0:
            return parts[idx-1]
    # 否則取第一段
    return parts[0] if parts else ''
