from flask import Blueprint, request, jsonify, redirect
import os
from urllib.parse import urlencode
from werkzeug.security import check_password_hash, generate_password_hash
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
)
from sqlalchemy import func

from utils.db import get_session
from models import User, School

# Google OAuth 基本工具
from utils.oauth_google import (
    is_config_ready as google_ready,
    build_auth_redirect,
    exchange_code_for_tokens,
    fetch_user_info,
    # 你原本在 callback 用到但沒先 import，這裡補上
    _find_school_by_domain,
    derive_school_slug_from_domain,
)

# 管理員通知
from utils.notify import send_admin_event as admin_notify

# 統一的 email 規則：支援任意子網域 .edu / .edu.tw，且會 normalize
from utils.email_rules import (
    is_valid_email_format,
    is_allowed_edu_email,
    extract_domain,
)

from utils.config_handler import load_config

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# -----------------------------
# 基礎驗證工具
# -----------------------------
def _validate_password_strength(pw: str) -> tuple[bool, str]:
    """密碼強度檢查（依新規）
    - 長度 ≥ 8
    - 至少包含英文字母與數字各一
    - 不可為純數字
    - 禁止出現任一方向連續 4 碼以上序列（數字/字母，例：1234、abcd、dcba、9876）
    回傳 (ok, reason)
    """
    pw = (pw or '').strip()
    if len(pw) < 8:
        return False, '密碼至少 8 碼'
    has_alpha = any(c.isalpha() for c in pw)
    has_digit = any(c.isdigit() for c in pw)
    if not has_alpha or not has_digit:
        return False, '需同時包含英文字母與數字'
    if pw.isdigit():
        return False, '不可為純數字'

    def has_seq(s: str) -> bool:
        s = s.lower()
        digits = '0123456789'
        letters = 'abcdefghijklmnopqrstuvwxyz'

        def contains_any(seq: str) -> bool:
            for i in range(len(seq) - 3):
                if seq[i:i+4] in s:
                    return True
            return False

        if contains_any(digits) or contains_any(digits[::-1]):
            return True
        if contains_any(letters) or contains_any(letters[::-1]):
            return True
        return False

    if has_seq(pw):
        return False, '不得包含連續序列（例如 1234、abcd、dcba、9876）'
    return True, ''


def _validate_username(nick: str) -> tuple[bool, str, str]:
    """暱稱規則：長度 2–20；僅允許中英文、數字、底線、句點；不可全空白或全標點。
    回傳 (ok, why, normalized)
    """
    if not isinstance(nick, str):
        return False, '暱稱不能為空', ''
    name = nick.strip()
    if len(name) < 2:
        return False, '暱稱至少需要 2 個字元', name
    if len(name) > 20:
        return False, '暱稱不能超過 20 個字元', name

    import re
    allowed = re.compile(r'^[\u4e00-\u9fff\u3400-\u4dbf\uff01-\uff60a-zA-Z0-9_.]+$')
    if not allowed.match(name):
        return False, '暱稱只能包含中英文、數字、底線和句點', name

    # 粗略檢查是否全為空白或標點（移除字母數字中文字後是否為空）
    stripped = re.sub(r'[\u4e00-\u9fff\u3400-\u4dbfA-Za-z0-9]+', '', name)
    if len(stripped) == len(name):
        return False, '暱稱不可全為空白或標點符號', name

    if name.startswith(('.', '_')) or name.endswith(('.', '_')):
        return False, '暱稱不能以底線或句點開頭/結尾', name
    if '..' in name or '__' in name:
        return False, '暱稱不能包含連續的句點或底線', name
    return True, '', name


def check_login_mode():
    """檢查當前登入模式並返回是否允許登入/註冊"""
    try:
        config = load_config() or {}
        login_mode = (config.get("login_mode", "admin_only") or "admin_only").strip()
        if login_mode == "open":
            return True, None
        elif login_mode == "single":
            return False, "single"
        elif login_mode == "admin_only":
            return False, "admin_only"
        else:
            return False, "admin_only"
    except Exception:
        return False, "admin_only"

# -----------------------------
# 帳密登入
# -----------------------------
@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    account = (data.get("username") or "").strip()
    password = data.get("password") or ""

    # 檢查登入模式
    allowed, mode = check_login_mode()
    if not allowed:
        if mode == "single":
            single_name = os.getenv("SINGLE_ADMIN_USERNAME", "Kaiyasi").strip() or "Kaiyasi"
            if account != single_name:
                return jsonify({"msg": "目前僅允許指定帳號登入", "login_mode": "single"}), 403
        elif mode == "admin_only":
            with get_session() as s:
                u = s.query(User).filter_by(username=account).first()
                if (not u) and ("@" in account):
                    u = s.query(User).filter(func.lower(User.email) == account.lower()).first()
                if not u or u.role not in ["dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator"]:
                    return jsonify({"msg": "目前僅允許管理員登入", "login_mode": "admin_only"}), 403

    with get_session() as s:  # type: Session
        # 支援「帳號或 Email」登入
        u = s.query(User).filter_by(username=account).first()
        if (not u) and ("@" in account):
            u = s.query(User).filter(func.lower(User.email) == account.lower()).first()

        if not u or not check_password_hash(u.password_hash, password):
            return jsonify({"msg": "帳號或密碼錯誤"}), 401

        # 補綁定學校
        try:
            if (not getattr(u, 'school_id', None)) and (u.email or '').strip():
                mail = (u.email or '').lower().strip()
                if '@' in mail:
                    dom = mail.split('@', 1)[1]
                    # 只要是 edu / edu.tw 或帶有 .edu. 片段就嘗試推導
                    if dom.endswith('.edu') or dom.endswith('.edu.tw') or '.edu.' in dom or dom.endswith('.edu.cn') or dom.endswith('.edu.hk'):
                        slug = derive_school_slug_from_domain(dom)
                        if slug:
                            sch = s.query(School).filter(School.slug == slug).first()
                            if not sch:
                                sch = School(slug=slug, name=slug)
                                s.add(sch); s.flush(); s.refresh(sch)
                            u.school_id = sch.id
                            s.commit()
        except Exception:
            pass

        token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
        refresh = create_refresh_token(identity=str(u.id))

        # 記錄登入事件（失敗不致命）
        try:
            from utils.admin_events import log_user_action
            log_user_action(
                event_type="user_login",
                actor_id=u.id,
                actor_name=u.username,
                action="登入系統"
            )
        except Exception:
            pass

        return jsonify({
            "access_token": token,
            "refresh_token": refresh,
            "role": u.role,
            "school_id": getattr(u, 'school_id', None),
        })

# -----------------------------
# 令牌刷新
# -----------------------------
@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh_token():
    ident = get_jwt_identity()
    with get_session() as s:  # type: Session
        u = s.get(User, int(ident)) if ident is not None else None
        if not u:
            return jsonify({"msg": "使用者不存在"}), 401
        token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
        return jsonify({"access_token": token})

# -----------------------------
# 關閉純表單註冊（統一走 Google）
# -----------------------------
@bp.post("/register")
def register():
    return jsonify({"msg": "目前僅提供 Google 註冊，請點擊『使用 Google 繼續』"}), 403

# -----------------------------
# Google 註冊確認（JSON）
# -----------------------------
@bp.post("/register-confirm")
def register_confirm():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    username = (data.get("username") or "").strip()
    confirmed_school_slug = (data.get("school_slug") or "").strip()
    password = (data.get("password") or "").strip()
    password2 = (data.get("password2") or "").strip()

    if not email or not username:
        return jsonify({"msg": "缺少必要資訊"}), 400

    if not is_valid_email_format(email):
        return jsonify({"msg": "Email 格式不正確"}), 400
    if not is_allowed_edu_email(email):
        return jsonify({"msg": "僅限 .edu 或 .edu.tw 校園信箱註冊"}), 403

    domain = extract_domain(email)

    if not password or password != password2:
        return jsonify({"msg": "兩次密碼不一致"}), 400
    ok_pw, why = _validate_password_strength(password)
    if not ok_pw:
        return jsonify({"msg": f"密碼不符合安全規範：{why}"}), 400

    ok_uname, whyu, username_norm = _validate_username(username)
    if not ok_uname:
        return jsonify({"msg": f"暱稱不符合規範：{whyu}"}), 400

    with get_session() as s:
        # 檢查 Email 黑名單（註銷）
        try:
            from utils.config_handler import load_config
            cfg = load_config() or {}
            bl = set((cfg.get('email_blacklist') or []))
            if email in bl:
                return jsonify({"msg": "此 Email 已被註銷，無法註冊"}), 403
        except Exception:
            pass
        if s.query(User).filter(func.lower(User.email) == email).first():
            return jsonify({"msg": "Email 已被使用"}), 409
        if s.query(User).filter(User.username == username_norm).first():
            return jsonify({"msg": "使用者名稱已被使用"}), 409

        u = User(username=username_norm, password_hash=generate_password_hash(password), role='user', email=email)

        # 綁定學校
        try:
            target_slug = confirmed_school_slug
            if not target_slug:
                bound = _find_school_by_domain(domain)  # 你的 util 版：傳 domain
                target_slug = bound.slug if bound else derive_school_slug_from_domain(domain)

            if target_slug:
                sch = s.query(School).filter(School.slug == target_slug).first()
                if not sch:
                    sch = School(slug=target_slug, name=target_slug.upper())
                    s.add(sch); s.flush(); s.refresh(sch)
                    # 通知管理員
                    try:
                        admin_notify(
                            kind="school_onboarding",
                            title="New School Registration",
                            description=f"First user from {target_slug}: {email}\nDomain: {domain}",
                            actor=email,
                            source="auth/register-confirm",
                            fields=[{"name": "slug", "value": target_slug, "inline": True}]
                        )
                    except Exception:
                        pass

                u.school_id = sch.id
        except Exception:
            pass

        s.add(u)
        s.commit()
        s.refresh(u)

        # 記錄事件
        try:
            from utils.admin_events import log_user_action
            log_user_action(
                event_type="user_registered_oauth",
                actor_id=u.id,
                actor_name=u.username,
                action=f"Google OAuth註冊完成 (school: {target_slug})",
                session=s
            )
        except Exception:
            pass

        token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
        refresh = create_refresh_token(identity=str(u.id))

        return jsonify({
            "msg": "註冊成功",
            "access_token": token,
            "refresh_token": refresh,
            "role": u.role,
            "school_id": getattr(u, 'school_id', None),
        })

# -----------------------------
# Google OAuth 入口
# -----------------------------
@bp.get("/google/oauth")
def google_oauth_alias():
    if not google_ready():
        return jsonify({"msg": "Google OAuth 未啟用或缺少設定"}), 503
    return redirect(build_auth_redirect(), code=302)

@bp.get("/google/login")
def google_login():
    if not google_ready():
        return jsonify({"msg": "Google OAuth 未啟用或缺少設定"}), 503
    url = build_auth_redirect()
    return redirect(url, code=302)

# -----------------------------
# Google Callback（GET，重導式）
# -----------------------------
@bp.get("/google/callback")
def google_callback():
    code = (request.args.get('code') or '').strip()
    if not code:
        return jsonify({"msg": "缺少授權碼"}), 400
    if not google_ready():
        return jsonify({"msg": "Google OAuth 未啟用或缺少設定"}), 503

    try:
        tokens = exchange_code_for_tokens(code)
        access_token = tokens.get('access_token')
        id_token = tokens.get('id_token')

        profile = fetch_user_info(access_token=access_token, id_token=id_token)
        email = (profile.get('email') or '').strip().lower()
        verified = bool(profile.get('verified_email') or profile.get('email_verified') or False)
        if not email or not verified:
            return jsonify({"msg": "無法取得已驗證的 Email"}), 400

        # 用統一規則判斷 edu / edu.tw
        if not is_allowed_edu_email(email):
            domain = extract_domain(email)
            qs = urlencode({"domain": domain, "email": email.split('@')[0]})
            return redirect(f"/error/external-account?{qs}", code=302)

        # 登入模式
        try:
            allowed, mode = check_login_mode()
        except Exception:
            allowed, mode = True, "open"

        if not allowed:
            if mode == "single":
                single_name = os.getenv("SINGLE_ADMIN_USERNAME", "Kaiyasi").strip() or "Kaiyasi"
                if email.split('@')[0] != single_name:
                    return redirect("/error/login-restricted?mode=single", code=302)
            elif mode == "admin_only":
                return redirect("/error/login-restricted?mode=admin_only", code=302)

        username_base = email.split('@', 1)[0][:32]
        domain = extract_domain(email)

        with get_session() as s:
            u = s.query(User).filter(func.lower(User.email) == email).first()

            if not u:
                # 首登 → 重導到註冊確認頁（避免 ghost 帳號）
                bound = _find_school_by_domain(domain)
                suggested_slug = bound.slug if bound else derive_school_slug_from_domain(domain)
                params = {
                    'email': email,
                    'username': username_base,
                    'domain': domain,
                    'suggested_school': suggested_slug,
                    'auth_provider': 'google',
                    'verified': '1'
                }
                return redirect(f"/auth/register-confirm?{urlencode(params)}", code=302)

            # 老用戶但未綁學校 → 嘗試自動綁定
            if not getattr(u, "school_id", None):
                bound = _find_school_by_domain(domain)
                slug = bound.slug if bound else derive_school_slug_from_domain(domain)
                if slug:
                    sch = s.query(School).filter(School.slug == slug).first()
                    if not sch:
                        sch = School(slug=slug, name=slug)
                        s.add(sch); s.flush(); s.refresh(sch)
                    u.school_id = sch.id
                    s.commit()

                if not u.school_id:
                    return redirect("/setup/school?first_login=true", code=302)

            token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
            refresh = create_refresh_token(identity=str(u.id))
            frag = urlencode({
                "access_token": token,
                "refresh_token": refresh,
                "role": u.role,
                "school_id": str(getattr(u, 'school_id', '') or '')
            })
            return redirect(f"/auth#{frag}", code=302)

    except Exception as e:
        # 系統出錯應該導向 OAuth 失敗頁，而不是外部帳號頁
        try:
            admin_notify(
                kind='auth_error',
                title='Google OAuth 流程錯誤',
                description=str(e)[:500],
                actor='system',
                source='auth/google/callback',
            )
        except Exception:
            pass
        return redirect("/error/oauth-failed", code=302)

# -----------------------------
# Google Callback（POST，回 JSON）
# -----------------------------
@bp.post("/google/callback")
def google_callback_post():
    body = request.get_json(silent=True) or {}
    code = (body.get('code') or '').strip()
    _ = (body.get('state') or '').strip()  # 預留

    if not code:
        return jsonify({"success": False, "error": "缺少授權碼", "errorCode": "E_MISSING_CODE"}), 400
    if not google_ready():
        return jsonify({"success": False, "error": "Google OAuth 未啟用", "errorCode": "E_GOOGLE_DISABLED"}), 503

    try:
        tokens = exchange_code_for_tokens(code)
        access_token = tokens.get('access_token')
        id_token = tokens.get('id_token')

        profile = fetch_user_info(access_token=access_token, id_token=id_token)
        email = (profile.get('email') or '').strip().lower()
        verified = bool(profile.get('verified_email') or profile.get('email_verified') or False)
        name = (profile.get('name') or '').strip() or (email.split('@')[0] if email else '')
        picture = profile.get('picture')

        if not email or not verified:
            return jsonify({"success": False, "error": "無法取得已驗證的 Email", "errorCode": "E_EMAIL_VERIFICATION"}), 400

        if not is_allowed_edu_email(email):
            domain = extract_domain(email)
            # 通知一次即可，別把 UX 再壓爛
            try:
                admin_notify(
                    kind='auth',
                    title='非允許網域嘗試',
                    description=f'email={email} domain={domain} source=google',
                    actor=email,
                    source='auth/google',
                    fields=[{"name": "domain", "value": domain, "inline": True}],
                )
            except Exception:
                pass

            return jsonify({
                "success": True,
                "requiresRegistration": False,
                "googleData": {"email": email, "name": name, "picture": picture, "verified_email": True},
                "error": "目前僅接受學校信箱（.edu/.edu.tw）",
                "errorCode": "E_EMAIL_DOMAIN",
            }), 200

        with get_session() as s:  # type: Session
            u = s.query(User).filter(func.lower(User.email) == email).first()
        if u:
            # 若帳號被註銷（停權），拒絕登入
            try:
                from utils.config_handler import load_config
                cfg = load_config() or {}
                if int(u.id) in set(cfg.get('suspended_users') or []):
                    return jsonify({
                        "success": False,
                        "error": "此帳號已被註銷，請聯繫管理員恢復",
                        "errorCode": "E_USER_SUSPENDED"
                    }), 403
            except Exception:
                pass
            token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
            refresh = create_refresh_token(identity=str(u.id))
            return jsonify({
                "success": True,
                "requiresRegistration": False,
                "user": {"id": u.id, "email": email, "username": u.username, "role": u.role, "school_id": getattr(u, 'school_id', None)},
                "tokens": {"access_token": token, "refresh_token": refresh},
            })

        # 需要快速註冊
        return jsonify({
            "success": True,
            "requiresRegistration": True,
            "googleData": {"email": email, "name": name, "picture": picture, "verified_email": True},
        })
    except Exception as e:
        try:
            admin_notify(
                kind='auth_error',
                title='Google Callback 失敗',
                description=str(e)[:500],
                actor='system',
                source='auth/google/callback(post)',
            )
        except Exception:
            pass
        return jsonify({"success": False, "error": "Google 登入失敗，請稍後再試", "errorCode": "E_GOOGLE_CALLBACK"}), 502

# -----------------------------
# 快速註冊（Google 後）
# -----------------------------
@bp.post("/quick-register")
def quick_register():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    confirm = (data.get('confirmPassword') or '').strip()
    school_id = data.get('schoolId')
    custom_req = bool(data.get('customSchoolRequested'))
    custom_info = data.get('customSchoolInfo') or {}

    if not email:
        return jsonify({"success": False, "error": "缺少 Email", "errorCode": "E_MISSING_EMAIL"}), 400

    if not is_valid_email_format(email) or not is_allowed_edu_email(email):
        return jsonify({"success": False, "error": "目前僅接受學校信箱（.edu/.edu.tw）", "errorCode": "E_EMAIL_DOMAIN"}), 403

    if not username:
        return jsonify({"success": False, "error": "缺少暱稱", "errorCode": "E_MISSING_USERNAME"}), 400
    if not password or password != confirm:
        return jsonify({"success": False, "error": "兩次密碼不一致", "errorCode": "E_PASSWORD_CONFIRM"}), 400

    ok_pw, why = _validate_password_strength(password)
    if not ok_pw:
        return jsonify({"success": False, "error": f"密碼不符合安全規範：{why}", "errorCode": "E_PASSWORD_POLICY"}), 400

    ok_uname, whyu, username_norm = _validate_username(username)
    if not ok_uname:
        return jsonify({"success": False, "error": f"暱稱不符合規範：{whyu}", "errorCode": "E_USERNAME_POLICY"}), 400

    with get_session() as s:  # type: Session
        # 檢查 Email 黑名單
        try:
            from utils.config_handler import load_config
            cfg = load_config() or {}
            if email in set(cfg.get('email_blacklist') or []):
                return jsonify({"success": False, "error": "此 Email 已被註銷，無法註冊", "errorCode": "E_EMAIL_REVOKED"}), 403
        except Exception:
            pass
        if s.query(User).filter(func.lower(User.email) == email).first():
            return jsonify({"success": False, "error": "Email 已被使用", "errorCode": "E_EMAIL_TAKEN"}), 409
        if s.query(User).filter(User.username == username_norm).first():
            return jsonify({"success": False, "error": "暱稱已被使用", "errorCode": "E_USERNAME_TAKEN"}), 409

        u = User(username=username_norm, password_hash=generate_password_hash(password), role='user', email=email)

        # 綁學校：前端若選單帶了 school_id 就綁，否則先略過
        target_school_id = None
        if isinstance(school_id, int):
            sch = s.get(School, int(school_id))
            if sch:
                target_school_id = sch.id
        if target_school_id:
            u.school_id = target_school_id

        s.add(u)
        s.commit()
        s.refresh(u)

        # 自訂學校請求
        if custom_req:
            try:
                fields = []
                domain = extract_domain(email)
                if custom_info.get('name'):
                    fields.append({"name": "School", "value": str(custom_info.get('name')), "inline": True})
                if custom_info.get('domain'):
                    fields.append({"name": "Domain", "value": str(custom_info.get('domain')), "inline": True})
                if custom_info.get('additionalInfo'):
                    fields.append({"name": "Note", "value": str(custom_info.get('additionalInfo'))[:500]})
                admin_notify(
                    kind='school_onboarding',
                    title='新增學校請求',
                    description=f'user={email} domain={domain}',
                    actor=email,
                    source='auth/quick-register',
                    fields=fields,
                )
            except Exception:
                pass

        token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
        refresh = create_refresh_token(identity=str(u.id))

        return jsonify({
            "success": True,
            "user": {"id": u.id, "email": u.email, "username": u.username, "role": u.role, "school_id": getattr(u, 'school_id', None)},
            "tokens": {"access_token": token, "refresh_token": refresh},
        })

# -----------------------------
# 小工具端點
# -----------------------------
@bp.post('/validate-domain')
def validate_domain():
    body = request.get_json(silent=True) or {}
    email = (body.get('email') or '').strip().lower()
    valid = bool(is_valid_email_format(email) and is_allowed_edu_email(email))
    domain = extract_domain(email) if email else ''
    # 嘗試推斷 slug（不依賴外部套件，僅針對 .edu/.edu.tw）
    slug_guess = None
    canonical_guess = None
    city_code = None
    confidence = 'low'
    try:
      host = domain
      if host.endswith('.edu.tw'):
          parts = host.split('.')
          rest = parts[:-2]
          if len(rest) == 1:
              # 大學樣式 ncku.edu.tw
              slug_guess = rest[0]
              canonical_guess = f"{slug_guess}.edu.tw"
              confidence = 'medium'
          elif len(rest) >= 2:
              # K-12 樣式 <school>.<city>.edu.tw ，移除常見雜訊前綴
              def strip_prefix(xs):
                  useless = {'mail','mx','gs','o365','owa','webmail','imap','smtp','student','stud','std','alumni','staff','teacher','teachers'}
                  ys = [x for x in xs if x]
                  while ys and ys[0].lower() in useless:
                      ys.pop(0)
                  return ys
              cleaned = strip_prefix(rest)
              if len(cleaned) >= 2:
                  slug_guess = cleaned[0]
                  city_code = cleaned[-1]
                  canonical_guess = f"{slug_guess}.{city_code}.edu.tw"
                  confidence = 'high'
      elif host.endswith('.edu'):
          parts = host.split('.')
          rest = parts[:-1]
          def strip_prefix(xs):
              useless = {'mail','mx','gs','o365','owa','webmail','imap','smtp','student','stud','std','alumni','staff','teacher','teachers'}
              ys = [x for x in xs if x]
              while ys and ys[0].lower() in useless:
                  ys.pop(0)
              return ys
          cleaned = strip_prefix(rest)
          if cleaned:
              slug_guess = cleaned[-1]
              canonical_guess = f"{slug_guess}.edu"
              confidence = 'medium'
    except Exception:
        pass
    return jsonify({
        "valid": valid,
        "domain": domain,
        "slug_guess": slug_guess,
        "canonical_guess": canonical_guess,
        "city_code": city_code,
        "confidence": confidence,
    })

@bp.post('/check-username')
def check_username():
    body = request.get_json(silent=True) or {}
    username = (body.get('username') or '').strip()
    ok_uname, whyu, username_norm = _validate_username(username)
    if not ok_uname:
        return jsonify({"available": False, "suggestions": []})
    with get_session() as s:  # type: Session
        exists = s.query(User).filter(User.username == username_norm).first() is not None
    if exists:
        sugs = [f"{username_norm}{n}" for n in (1, 2, 3) if len(f"{username_norm}{n}") <= 20]
        return jsonify({"available": False, "suggestions": sugs})
    return jsonify({"available": True})

@bp.get('/schools')
def auth_schools():
    with get_session() as s:  # type: Session
        rows = s.query(School).order_by(School.slug.asc()).all()
        items = [{"id": x.id, "name": x.name, "slug": x.slug} for x in rows]
        return jsonify({"schools": items})

@bp.post('/request-school')
def request_school():
    body = request.get_json(silent=True) or {}
    user_email = (body.get('userEmail') or '').strip().lower()
    school_name = (body.get('schoolName') or '').strip()
    school_domain = (body.get('schoolDomain') or '').strip().lower()
    additional = (body.get('additionalInfo') or '').strip()
    if not user_email:
        return jsonify({"success": False, "error": "缺少使用者 Email"}), 400
    try:
        fields = []
        if school_name:
            fields.append({"name": "School", "value": school_name, "inline": True})
        if school_domain:
            fields.append({"name": "Domain", "value": school_domain, "inline": True})
            try:
                d = school_domain
                suffix = None
                if d.endswith('.edu'):
                    suffix = '.edu'
                else:
                    parts = d.split('.')
                    if len(parts) >= 2:
                        suffix = f".{parts[-2]}.{parts[-1]}"
                if suffix:
                    fields.append({"name": "Suffix", "value": suffix, "inline": True})
            except Exception:
                pass
        if additional:
            fields.append({"name": "Note", "value": additional[:500]})
        admin_notify(
            kind='school_onboarding',
            title='新增學校請求',
            description=f'user={user_email}',
            actor=user_email,
            source='auth/request-school',
            fields=fields,
        )
    except Exception:
        pass
    return jsonify({"success": True, "message": "已通知管理員"})

@bp.post('/report-slug')
def report_slug():
    body = request.get_json(silent=True) or {}
    user_email = (body.get('userEmail') or '').strip().lower()
    school_id = body.get('schoolId')
    school_name = (body.get('schoolName') or '').strip()
    current_slug = (body.get('currentSlug') or '').strip()
    reason = (body.get('reportReason') or '').strip()
    if not (user_email and school_id and current_slug):
        return jsonify({"success": False, "error": "缺少必要參數"}), 400
    try:
        fields = [
            {"name": "School", "value": school_name or str(school_id), "inline": True},
            {"name": "Slug", "value": current_slug, "inline": True},
        ]
        if reason:
            fields.append({"name": "Reason", "value": reason[:500]})
        admin_notify(
            kind='issue_report',
            title='slug 錯誤回報',
            description=f'user={user_email}',
            actor=user_email,
            source='auth/report-slug',
            fields=fields,
        )
    except Exception:
        pass
    return jsonify({"success": True, "message": "已回報"})

# -----------------------------
# Profile 舊路徑相容
# -----------------------------
@bp.get("/profile")
@jwt_required(optional=True)
def profile_alias():
    ident = get_jwt_identity()
    with get_session() as s:  # type: Session
        u = s.get(User, int(ident)) if ident is not None else None
        if not u:
            return jsonify({
                'id': None,
                'username': 'guest',
                'email': None,
                'role': 'guest',
                'school': None,
                'avatar_path': None,
                'auth_provider': 'guest',
                'has_password': False,
            })
        sch = s.get(School, getattr(u, 'school_id', None)) if getattr(u, 'school_id', None) else None
        auth_provider = 'local'
        try:
            if not (u.password_hash or '').strip():
                auth_provider = 'google'
        except Exception:
            pass
        return jsonify({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'role': u.role,
            'school': ({ 'id': sch.id, 'slug': sch.slug, 'name': sch.name } if sch else None),
            'avatar_path': u.avatar_path,
            'auth_provider': auth_provider,
            'has_password': bool((u.password_hash or '').strip()),
        })

# -----------------------------
# 變更密碼（遵守同一套強度政策）
# -----------------------------
@bp.post("/change_password")
@jwt_required()
def change_password():
    data = request.get_json(silent=True) or {}
    current = (data.get('current_password') or '').strip()
    new = (data.get('new_password') or '').strip()

    ok_pw, why = _validate_password_strength(new)
    if not ok_pw:
        return jsonify({'msg': f'新密碼不符合安全規範：{why}'}), 400

    ident = get_jwt_identity()
    with get_session() as s:  # type: Session
        u = s.get(User, int(ident)) if ident is not None else None
        if not u:
            return jsonify({ 'msg': 'not found' }), 404

        # 若原帳號有密碼，需驗證；若為外部登入（hash 空），可直接設定
        if u.password_hash:
            if not check_password_hash(u.password_hash, current):
                return jsonify({ 'msg': '當前密碼不正確' }), 403

        u.password_hash = generate_password_hash(new)
        s.commit()

        # 記錄密碼變更事件
        try:
            from utils.admin_events import log_user_action
            log_user_action(
                event_type="user_password_changed",
                actor_id=u.id,
                actor_name=u.username,
                action="變更密碼"
            )
        except Exception:
            pass

        return jsonify({ 'ok': True })
