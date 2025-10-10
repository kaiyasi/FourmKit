import os
import json
import urllib.parse
import urllib.request
from typing import Optional, Tuple, Dict, Any, List
from utils.db import get_session
from models import School, SchoolSetting
import json


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def _normalize_url(u: str) -> str:
    u = (u or "").strip()
    if not u:
        return u
    # 去除尾端多餘斜線
    while len(u) > 1 and u.endswith('/'):
        u = u[:-1]
    return u


def _resolve_redirect_uri() -> str:
    # 優先使用明確設定的 OAUTH_REDIRECT_URL
    explicit = _normalize_url(os.getenv("OAUTH_REDIRECT_URL", ""))
    if explicit:
        return explicit
    # 後備：由 PUBLIC_BASE_URL 推導
    base = _normalize_url(os.getenv("PUBLIC_BASE_URL", ""))
    if base:
        return f"{base}/api/auth/google/callback"
    # 仍無：回傳空字串（由呼叫方判斷）
    return ""


def is_config_ready() -> bool:
    return bool(
        os.getenv("GOOGLE_OAUTH_CLIENT_ID")
        and os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
        and _resolve_redirect_uri()
    )


def build_auth_redirect(scope: str = "openid email profile") -> str:
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
    redirect_uri = _resolve_redirect_uri()
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
    redirect_uri = _resolve_redirect_uri()
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
    """檢查域名是否允許登入/註冊。
    需求更新：僅允許 .edu 或 .edu.tw 網域；其餘一律不允許。
    維持拒絕常見個人信箱網域（gmail.com 等）。
    回傳 (ok, domain)
    """
    try:
        email = (email or "").strip().lower()
        if "@" not in email:
            print(f"[DEBUG] check_school_domain: 無效email格式 '{email}'")
            return False, ""
        domain = email.split("@", 1)[1]
        
        print(f"[DEBUG] check_school_domain: email={email}, domain={domain}")
        
        # 明確拒絕常見的個人信箱
        personal_domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com']
        if domain in personal_domains:
            print(f"[DEBUG] check_school_domain: 拒絕個人信箱 {domain}")
            return False, domain
        # 允許學校設定明列的綁定網域（SchoolSetting.allowed_domains）
        try:
            bound = _find_school_by_domain(domain)
            if bound is not None:
                print(f"[DEBUG] check_school_domain: 通過綁定學校 {bound.slug} for domain {domain}")
                return True, domain
        except Exception:
            pass

        # 額外允許的網域尾綴（以逗號分隔，例：.ac.uk,.edu.sg）
        extra: List[str] = []
        try:
            raw = (os.getenv('EXTRA_EMAIL_SUFFIXES') or os.getenv('ALLOWED_EMAIL_SUFFIXES') or '').strip()
            if raw:
                extra = [x.strip().lower() for x in raw.split(',') if x.strip()]
        except Exception:
            extra = []
        for suf in extra:
            if domain.endswith(suf):
                print(f"[DEBUG] check_school_domain: 通過額外尾綴 {suf} for {domain}")
                return True, domain

        # 僅允許教育網域：.edu 或 .edu.xx（如 .edu.tw/.edu.hk/.edu.cn）
        # 允許多層子網域：xxx.yyy.edu.tw 也算通過
        if domain.endswith('.edu'):
            print(f"[DEBUG] check_school_domain: 通過允許的教育網域 {domain}")
            return True, domain
        # .edu.xx（ccTLD）
        try:
            import re
            if re.search(r"\.edu\.[a-z]{2,}$", domain):
                print(f"[DEBUG] check_school_domain: 通過允許的教育網域 {domain}")
                return True, domain
        except Exception:
            pass
        # 舊規保留（明確列出）
        if domain.endswith('.edu.tw'):
            print(f"[DEBUG] check_school_domain: 通過允許的教育網域 {domain}")
            return True, domain
        print(f"[DEBUG] check_school_domain: 非允許教育網域 {domain}")
        return False, domain
        
    except Exception as e:
        print(f"[ERROR] check_school_domain: 處理過程中出錯 {e}")
        return False, ""


def derive_school_slug_from_domain(domain: str) -> str:
    """
    從學校域名中提取學校代碼，適配台灣學校格式和國際格式
    台灣格式：@schoolslug.county-cityslug.edu.tw -> schoolslug
    國際格式：@dept.schoolslug.edu -> schoolslug  
    一般格式：@schoolslug.edu -> schoolslug
    """
    parts = (domain or "").lower().split('.')
    
    # 台灣學校格式：@nhsh.tp.edu.tw -> nhsh
    if len(parts) >= 4 and parts[-2] == 'edu' and parts[-1] == 'tw':
        # 取第一個部分作為學校代碼
        return parts[0] if parts[0] else ''
    
    # 國際學校格式：查找 edu 之前的部分
    if 'edu' in parts:
        idx = parts.index('edu')
        if idx >= 2:
            # 如果有多個部分，取 edu 前面的部分
            # 例如：dept.ncku.edu -> ncku
            return parts[idx-1]
        elif idx >= 1:
            # 例如：schoolslug.edu -> schoolslug  
            return parts[idx-1]
    
    # 兜底：取第一段
    return parts[0] if parts else ''
