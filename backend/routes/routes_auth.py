from flask import Blueprint, request, jsonify, abort, redirect
import os
from werkzeug.security import check_password_hash, generate_password_hash
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
)
from sqlalchemy.orm import Session
from utils.db import get_session
from models import User, School
from utils.oauth_google import is_config_ready as google_ready, build_auth_redirect, exchange_code_for_tokens, fetch_user_info, check_school_domain, derive_school_slug_from_domain
from utils.config_handler import load_config

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

def check_login_mode():
    """檢查當前登入模式並返回是否允許登入/註冊"""
    try:
        config = load_config() or {}
        login_mode = config.get("login_mode", "admin_only")
        
        if login_mode == "open":
            return True, None  # 全開模式，允許所有登入
        elif login_mode == "single":
            return False, "single"  # 單一模式，只允許指定帳號
        elif login_mode == "admin_only":
            return False, "admin_only"  # 管理組模式，只允許管理員
        else:
            return False, "admin_only"  # 默認管理組模式
    except Exception:
        return False, "admin_only"  # 錯誤時默認管理組模式

@bp.post("/login")
def login():
    data = request.get_json() or {}
    account = (data.get("username") or "").strip()
    password = data.get("password") or ""
    
    # 檢查登入模式
    allowed, mode = check_login_mode()
    if not allowed:
        if mode == "single":
            # 單一模式：只允許指定帳號
            single_name = os.getenv("SINGLE_ADMIN_USERNAME", "Kaiyasi").strip() or "Kaiyasi"
            if account != single_name:
                return jsonify({"msg": "目前僅允許指定帳號登入", "login_mode": "single"}), 403
        elif mode == "admin_only":
            # 管理組模式：只允許管理員帳號
            with get_session() as s:
                u = s.query(User).filter_by(username=account).first()
                if (not u) and ("@" in account):
                    u = s.query(User).filter(User.email == account.lower()).first()
                if not u or u.role not in ["dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator"]:
                    return jsonify({"msg": "目前僅允許管理員登入", "login_mode": "admin_only"}), 403
    
    with get_session() as s:  # type: Session
        # 支援「帳號或 Email」登入
        u = s.query(User).filter_by(username=account).first()
        if (not u) and ("@" in account):
            u = s.query(User).filter(User.email == account.lower()).first()
        if not u or not check_password_hash(u.password_hash, password):
            # 統一回傳 JSON，避免前端只看到空白 401
            return jsonify({"msg": "帳號或密碼錯誤"}), 401
        # 補綁定：若使用者尚未綁 school，依 email 網域推導綁定（自動建立暫存學校）
        try:
            if (not getattr(u, 'school_id', None)) and (u.email or '').strip():
                mail = (u.email or '').lower().strip()
                if '@' in mail:
                    dom = mail.split('@',1)[1]
                    if dom != 'gmail.com' and (dom.endswith('.edu') or dom.endswith('.edu.tw') or dom.endswith('.edu.cn') or dom.endswith('.edu.hk') or '.edu.' in dom):
                        slug = derive_school_slug_from_domain(dom)
                        if slug:
                            sch = s.query(School).filter(School.slug==slug).first()
                            if not sch:
                                sch = School(slug=slug, name=slug)
                                s.add(sch); s.flush(); s.refresh(sch)
                            u.school_id = sch.id
                            s.commit()
        except Exception:
            pass
        # Flask-JWT-Extended/PyJWT 對 sub 類型較嚴格，統一使用字串
        token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
        refresh = create_refresh_token(identity=str(u.id))
        # 記錄登入事件
        try:
            from utils.admin_events import log_user_action
            log_user_action(
                event_type="user_login",
                actor_id=u.id,
                actor_name=u.username,
                action="登入系統"
            )
        except Exception:
            pass  # 事件記錄失敗不影響登入
        
        # 與前端期待的欄位對齊：提供 access_token/refresh_token/role/school_id（此專案無校系欄位，回傳 null）
        return jsonify({
            "access_token": token,
            "refresh_token": refresh,
            "role": u.role,
            "school_id": getattr(u, 'school_id', None),
        })

@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh_token():
    ident = get_jwt_identity()
    with get_session() as s:  # type: Session
        u = s.query(User).get(int(ident)) if ident is not None else None
        if not u:
            return jsonify({"msg": "使用者不存在"}), 401
        token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
        return jsonify({"access_token": token})

@bp.post("/register")
def register():
    """
    Minimal registration endpoint for development/testing.
    Accepts { username, password } and creates a user with role 'user'.
    If username exists, returns 409.
    """
    # 檢查登入模式
    allowed, mode = check_login_mode()
    if not allowed:
        if mode == "single":
            return jsonify({"msg": "單一模式已停用註冊", "login_mode": "single"}), 403
        elif mode == "admin_only":
            return jsonify({"msg": "管理組模式已停用註冊", "login_mode": "admin_only"}), 403
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    school_slug = (data.get("school_slug") or "").strip() or None
    if not username or not password or not email:
        return jsonify({"msg": "缺少帳號、Email 或密碼"}), 400
    # 校園信箱限制：僅接受 .edu 或設定白名單網域
    try:
        domain = email.split("@", 1)[1]
    except Exception:
        return jsonify({"msg": "Email 格式不正確"}), 400
    from utils.oauth_google import _find_school_by_domain, derive_school_slug_from_domain
    allowed = [d.strip().lower() for d in (os.getenv("ALLOWED_EMAIL_DOMAINS", "").split(",") if os.getenv("ALLOWED_EMAIL_DOMAINS") else []) if d.strip()]
    is_edu = domain.endswith(".edu") or domain.endswith(".edu.tw") or domain.endswith(".edu.cn") or domain.endswith(".edu.hk")
    # 若學校設定已明確綁定完整網域，視為允許
    bound_school = _find_school_by_domain(domain)
    if not bound_school:
        if allowed:
            if domain not in allowed and not any(domain.endswith("."+d) for d in allowed):
                return jsonify({"msg": "僅限校園信箱註冊"}), 403
        else:
            # 沒有白名單時，預設僅接受 edu 類網域
            if not is_edu:
                return jsonify({"msg": "僅限校園信箱（.edu 網域）註冊"}), 403
    with get_session() as s:  # type: Session
        if s.query(User).filter_by(username=username).first():
            return jsonify({"msg": "使用者已存在"}), 409
        if s.query(User).filter_by(email=email).first():
            return jsonify({"msg": "Email 已被使用"}), 409
        u = User(username=username, password_hash=generate_password_hash(password), role="user", email=email)
        # 依 email 網域推導學校 slug；若呼叫端有提供 school_slug，需與推導一致
        try:
            # 若綁定了完整網域，優先使用該學校
            if bound_school:
                target_slug = bound_school.slug
            else:
                derived = derive_school_slug_from_domain(domain) if is_edu else None
                target_slug = (school_slug or derived or '').strip()
            if school_slug and derived and school_slug != derived:
                return jsonify({"msg": f"學校與 Email 網域不符，請使用 {derived} 或留空自動推導"}), 400
            if target_slug:
                sch = s.query(School).filter(School.slug==target_slug).first()
                if not sch:
                    sch = School(slug=target_slug, name=target_slug)
                    s.add(sch); s.flush(); s.refresh(sch)
                u.school_id = sch.id
        except Exception:
            pass
        s.add(u)
        s.commit()
        
        # 記錄註冊事件
        try:
            from utils.admin_events import log_user_action
            log_user_action(
                event_type="user_registered",
                actor_id=u.id,
                actor_name=u.username,
                action="註冊新帳號",
                session=s
            )
        except Exception:
            pass  # 事件記錄失敗不影響註冊
        
        return jsonify({"msg": "註冊成功"})


@bp.get("/profile")
@jwt_required(optional=True)
def profile_alias():
    """相容端點：/api/auth/profile → 轉為 /api/account/profile 資料格式。
    某些前端仍呼叫舊路徑，這裡直接回相同結構避免 404。
    """
    ident = get_jwt_identity()
    from utils.db import get_session
    from sqlalchemy.orm import Session
    from models import User, School
    with get_session() as s:  # type: Session
        u = s.get(User, int(ident)) if ident is not None else None
        if not u:
            # 未登入：回傳訪客結構，避免前端初次載入 401 噴錯
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


@bp.post("/change_password")
@jwt_required()
def change_password():
    data = request.get_json(silent=True) or {}
    current = (data.get('current_password') or '').strip()
    new = (data.get('new_password') or '').strip()
    if len(new) < 8:
        return jsonify({ 'msg': '新密碼至少 8 碼' }), 400
    ident = get_jwt_identity()
    with get_session() as s:  # type: Session
        u = s.query(User).get(int(ident)) if ident is not None else None
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
            pass  # 事件記錄失敗不影響密碼變更
        
        return jsonify({ 'ok': True })


@bp.get("/google/login")
def google_login():
    if not google_ready():
        return jsonify({"msg": "Google OAuth 未啟用或缺少設定"}), 503
    url = build_auth_redirect()
    return redirect(url, code=302)


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
        ok, domain = check_school_domain(email)
        if not ok:
            # 重定向到專門的校外帳號錯誤頁面
            return redirect("/error/external-account", code=302)
        
        # 檢查登入模式
        allowed, mode = check_login_mode()
        if not allowed:
            if mode == "single":
                # 單一模式：只允許指定帳號
                single_name = os.getenv("SINGLE_ADMIN_USERNAME", "Kaiyasi").strip() or "Kaiyasi"
                if email.split('@')[0] != single_name:
                    return redirect("/error/login-restricted?mode=single", code=302)
            elif mode == "admin_only":
                # 管理組模式：檢查是否為管理員帳號
                # 這裡需要檢查該 email 是否對應到管理員帳號
                # 由於是 Google OAuth，我們需要重定向到錯誤頁面
                return redirect("/error/login-restricted?mode=admin_only", code=302)
        username_base = email.split('@',1)[0][:32]
        with get_session() as s:
            u = s.query(User).filter_by(email=email).first()
            if not u:
                uname = username_base
                i = 1
                while s.query(User).filter_by(username=uname).first() is not None:
                    uname = f"{username_base}{i}"
                    i += 1
                u = User(username=uname, password_hash='', role='user', email=email)
                # 綁定學校（若不存在則建立暫存學校並通知）
                from utils.oauth_google import _find_school_by_domain
                bound = _find_school_by_domain(domain)
                slug = bound.slug if bound else derive_school_slug_from_domain(domain)
                sch = s.query(School).filter(School.slug==slug).first()
                if not sch and slug:
                    sch = School(slug=slug, name=slug)
                    s.add(sch); s.flush(); s.refresh(sch)
                    # 簡易通知：寫入 stdout 或透過 Discord Webhook（若設定）
                    try:
                        from app import _admin_webhook_url
                        from app import _admin_notify_embed
                        hook = _admin_webhook_url()
                        if hook:
                            embed = _admin_notify_embed(
                                kind="school_onboarding",
                                title=f"School Onboarding：{slug}",
                                description=f"新校園首次登入：{email}（{domain}）\n已建立暫存學校 slug={slug}",
                                color=0x10B981,
                                author=email,
                                footer=f"domain={domain}"
                            )
                            from app import _post_discord
                            _post_discord(hook, {"content": None, "embeds": [embed]})
                    except Exception:
                        pass
                if sch:
                    u.school_id = sch.id
                s.add(u); s.flush(); s.refresh(u)
            token = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
            refresh = create_refresh_token(identity=str(u.id))
            # 為前端簡化：使用 fragment 導回 /auth，避免查詢長度限制
            from urllib.parse import quote
            frag = (
                f"access_token={quote(token)}&refresh_token={quote(refresh)}"
                f"&role={quote(u.role)}&school_id={quote(str(getattr(u,'school_id', '') or ''))}"
            )
            return redirect(f"/auth#{frag}", code=302)
    except Exception as e:
        # 重定向到校外帳號錯誤頁面，而不是返回 502 錯誤
        return redirect("/error/external-account", code=302)
