from flask import Blueprint, jsonify, request
from utils.db import get_session
from models import School, User, Post, Media, SchoolSetting, Comment
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.authz import require_role
from PIL import Image
from werkzeug.utils import secure_filename
import io
import os
from services.event_service import EventService
import json
import secrets
from datetime import datetime, timezone, timedelta
from sqlalchemy import func
from utils.oauth_google import derive_school_slug_from_domain, check_school_domain  # noqa: F401  # 可能未用到
from pathlib import Path


ALLOWED_LOGO_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.svg'}
MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024  # 5MB 安全上限

bp = Blueprint("schools", __name__, url_prefix="/api/schools")


def _get_upload_root_path() -> Path:
    root = os.getenv("UPLOAD_ROOT", "uploads")
    base = Path(root)
    if not base.is_absolute():
        base = Path.cwd() / base
    return base.resolve()


def _normalize_public_url(relative_path: str | None) -> str | None:
    if not relative_path:
        return None
    rel = relative_path.replace('\\', '/').lstrip('/')
    return f"/uploads/{rel}"


def _relative_to_root(target: Path, root: Path) -> str:
    try:
        return target.resolve().relative_to(root).as_posix()
    except Exception:
        # 若發生任何奇怪的路徑錯誤，退回一般化處理
        rel = os.path.relpath(target.resolve(), root)
        return Path(rel).as_posix()


def _purge_existing_files(directory: Path, prefix: str) -> None:
    if not directory.exists():
        return
    for entry in directory.iterdir():
        if entry.is_file() and entry.name.startswith(prefix):
            try:
                entry.unlink()
            except Exception:
                pass


def _save_logo_variants(data: bytes, directory: Path, base_name: str) -> str:
    """儲存原始檔案並嘗試輸出 WEBP，回傳主要使用的檔名。"""
    directory.mkdir(parents=True, exist_ok=True)
    original_path = directory / base_name
    try:
        with original_path.open('wb') as f:
            f.write(data)
    except Exception:
        raise

    name, ext = os.path.splitext(base_name)
    primary = base_name
    if ext.lower() != '.svg':
        try:
            with Image.open(io.BytesIO(data)) as img:
                if img.mode not in ('RGB', 'RGBA'):
                    img = img.convert('RGBA' if 'A' in img.mode else 'RGB')
                webp_path = directory / f"{name}.webp"
                img.save(webp_path, format='WEBP', quality=90)
                primary = f"{name}.webp"
        except Exception:
            # 轉檔失敗時保留原檔
            pass
    return primary


def _find_cross_logo_file(directory: Path) -> Path | None:
    if not directory.exists():
        return None
    preferred = ['cross.webp', 'cross.png', 'cross.jpg', 'cross.jpeg', 'cross.svg']
    for name in preferred:
        candidate = directory / name
        if candidate.is_file():
            return candidate
    for entry in directory.iterdir():
        if entry.is_file() and entry.name.startswith('cross.'):
            return entry
    return None


def _settings_dict(row: SchoolSetting | None) -> dict:
    if not row or not row.data:
        return {}
    data = row.data
    if isinstance(data, str):
        try:
            parsed = json.loads(data)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return data if isinstance(data, dict) else {}


def _ensure_setting_row(session, school_id: int) -> SchoolSetting:
    row = session.query(SchoolSetting).filter(SchoolSetting.school_id == school_id).first()
    if not row:
        row = SchoolSetting(school_id=school_id, data='{}')
        session.add(row)
        session.flush()
    return row


def _generate_unlock_code(slug: str) -> str:
    token = secrets.token_hex(4).upper()
    safe_slug = slug.upper().replace(' ', '').replace('/', '-').strip()
    return f"{safe_slug}-{token}"


def _log_unauthorized(actor: User | None, action: str, slug_or_id: str | int | None = None):
    try:
        name = getattr(actor, 'username', None) or 'unknown'
        role = getattr(actor, 'role', None) or 'guest'
        desc = (
            f"actor={name} role={role} path={request.path} method={request.method} "
            f"action={action} target={slug_or_id}"
        )
        from utils.db import get_session
        with get_session() as s:
            EventService.log_event(
                session=s,
                event_type='security.suspicious_activity',
                title='未授權學校管理嘗試',
                description=desc,
                severity='high',
                actor_id=actor.id if actor else None,
                actor_name=name,
                actor_role=role if role != 'guest' else None,
                target_type="school",
                target_id=slug_or_id if isinstance(slug_or_id, int) else None,
                metadata={
                    'ip': request.headers.get('X-Forwarded-For') or request.remote_addr,
                    'user_agent': request.headers.get('User-Agent'),
                    'target_slug': slug_or_id if isinstance(slug_or_id, str) else None
                },
                is_important=True,
                send_webhook=True
            )
    except Exception:
        pass


@bp.get("/<string:slug>/settings")
@jwt_required(optional=True)
def get_school_settings(slug: str):
    """取得某校設定。未登入允許讀取（僅公開內容），但目前返回整包 JSON，前端自行控制。"""
    with get_session() as s:  # type: Session
        sch = s.query(School).filter(School.slug == slug).first()
        if not sch:
            return jsonify({'msg': 'not found'}), 404
        row = s.query(SchoolSetting).filter(SchoolSetting.school_id == sch.id).first()
        return jsonify({
            'school': {'id': sch.id, 'slug': sch.slug, 'name': sch.name},
            'data': (row.data if row else '{}')
        })


@bp.put("/<string:slug>/settings")
@jwt_required()
def update_school_settings(slug: str):
    """更新某校設定。校內管理員僅能更新自己學校；dev_admin 無限制。"""
    data = request.get_json(silent=True) or {}
    try:
        # 僅允許 JSON 物件或 JSON 字串
        if isinstance(data, str):
            json.loads(data)  # 驗證字串是有效 JSON
            payload = data
        else:
            payload = json.dumps(data, ensure_ascii=False)
    except Exception:
        return jsonify({'msg': '無效的JSON'}), 400

    with get_session() as s:  # type: Session
        sch = s.query(School).filter(School.slug == slug).first()
        if not sch:
            return jsonify({'msg': 'not found'}), 404

        # 權限：campus_moderator 必須同校；dev_admin 無限制
        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid else None
        
        # 詳細除錯資訊
        debug_info = {
            'user_id': actor.id if actor else None,
            'user_role': actor.role if actor else None,
            'user_school_id': actor.school_id if actor else None,
            'target_school_id': sch.id,
            'target_slug': slug,
            'jwt_identity': uid
        }
        print(f"[DEBUG] 學校設定更新權限檢查: {debug_info}")
        
        # 權限檢查：campus_moderator 和 campus_admin 只能編輯自己學校的設定
        if actor and (actor.role == 'campus_moderator' or actor.role == 'campus_admin'):
            if not actor.school_id or int(actor.school_id) != int(sch.id):
                debug_msg = f"權限檢查失敗: user_id={actor.id}, user_role={actor.role}, user_school_id={actor.school_id}, target_school_id={sch.id}, slug={slug}"
                print(f"[DEBUG] {debug_msg}")  # 伺服器日誌
                _log_unauthorized(actor, 'update_school_settings', slug)
                return jsonify({
                    'msg': '無權限：僅能更新自己學校設定',
                    'debug': debug_info  # 返回詳細除錯資訊
                }), 403

        row = s.query(SchoolSetting).filter(SchoolSetting.school_id == sch.id).first()
        if not row:
            row = SchoolSetting(school_id=sch.id, data=payload)
            s.add(row)
        else:
            row.data = payload
        s.commit()

        # 紀錄系統事件（best-effort）
        try:
            actor_user = None
            actor_name = None
            if uid:
                actor_user = s.get(User, int(uid))
                actor_name = actor_user.username if actor_user else None
            
            EventService.log_event(
                session=s,
                event_type='school.settings_changed',
                title='學校設定變更',
                description=f'學校 {slug} 的設定已被更新' + (f' (by {actor_name})' if actor_name else ''),
                severity='medium',
                actor_id=int(uid) if uid else None,
                actor_name=actor_name,
                actor_role=actor_user.role if actor_user else None,
                target_type="school",
                target_id=sch.id,
                school_id=sch.id,
                metadata={'school_slug': slug, 'settings_data': payload},
                is_important=False,
                send_webhook=True
            )
        except Exception:
            pass

        return jsonify({'ok': True})


@bp.get("")
def list_schools():
    # Logo 處理器功能已停用，使用基本邏輯
    with get_session() as s:  # type: Session
        rows = s.query(School).order_by(School.slug.asc()).all()
        items = []
        for x in rows:
            # 直接使用路徑，不經過 logo_handler
            url = None
            if getattr(x, 'logo_path', None):
                url = f"/uploads/{x.logo_path}" if not x.logo_path.startswith('/') else x.logo_path
            items.append({
                "id": x.id,
                "slug": x.slug,
                "name": x.name,
                "logo_path": x.logo_path,
                "logo_url": url,
            })
        return jsonify({"items": items})


@bp.post("")
@jwt_required()
@require_role("dev_admin")
def create_school():
    data = request.get_json(silent=True) or {}
    slug = (data.get('slug') or '').strip().lower()
    name = (data.get('name') or '').strip() or slug
    if not slug:
        return jsonify({'msg': '缺少 slug'}), 400
    if not all(ch.isalnum() or ch in '-_' for ch in slug):
        return jsonify({'msg': 'slug 僅能包含英數與 - _'}), 400
    with get_session() as s:  # type: Session
        if s.query(School).filter(School.slug == slug).first():
            return jsonify({'msg': 'slug 已存在'}), 409
        sch = School(slug=slug, name=name or slug)
        s.add(sch)
        s.commit()
        s.refresh(sch)
        return jsonify({'ok': True, 'item': {'id': sch.id, 'slug': sch.slug, 'name': sch.name}})


@bp.patch("/<int:sid>")
@jwt_required()
@require_role("dev_admin", "campus_admin")
def update_school(sid: int):
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    new_slug = (data.get('slug') or '').strip().lower()

    # slug 驗證（若要更新）
    if new_slug:
        if not all(ch.isalnum() or ch in '-_' for ch in new_slug):
            return jsonify({'msg': 'slug 僅能包含英數與 - _'}), 400

    with get_session() as s:  # type: Session
        sch = s.get(School, sid)
        if not sch:
            return jsonify({'msg': 'not found'}), 404

        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or int(actor.school_id) != int(sid):
                _log_unauthorized(actor, 'update_school', sid)
                return jsonify({'msg': '僅能修改所屬學校'}), 403

        # 名稱更新
        if name:
            sch.name = name

        # 代碼(slug)更新：需唯一
        if new_slug and new_slug != sch.slug:
            exists = s.query(School).filter(School.slug == new_slug).first()
            if exists:
                return jsonify({'msg': 'slug 已存在'}), 409
            sch.slug = new_slug

        s.commit()
        return jsonify({'ok': True, 'item': {'id': sch.id, 'slug': sch.slug, 'name': sch.name}})


@bp.delete("/<int:sid>")
@jwt_required()
@require_role("dev_admin")
def delete_school(sid: int):
    """刪除學校：預設需無關聯。若 ?force=1，會清除關聯貼文/媒體/留言，並將使用者 school_id 置空。"""
    with get_session() as s:  # type: Session
        sch = s.get(School, sid)
        if not sch:
            return jsonify({'msg': 'not found'}), 404

        # 檢查關聯
        has_user = s.query(User).filter(User.school_id == sid).first() is not None
        has_post = s.query(Post).filter(Post.school_id == sid).first() is not None
        has_media = s.query(Media).filter(Media.school_id == sid).first() is not None
        force = (request.args.get('force') or '').strip() in {'1', 'true', 'yes', 'on'}

        if (has_user or has_post or has_media) and not force:
            return jsonify({'msg': '存在關聯資料，無法刪除（可加 ?force=1 強制）'}), 409

        if force:
            # 1) 先清除與該校相關的貼文/媒體/留言
            try:
                post_ids = [pid for (pid,) in s.query(Post.id).filter(Post.school_id == sid).all()]
                if post_ids:
                    s.query(Media).filter(Media.post_id.in_(post_ids)).delete(synchronize_session=False)
                    s.query(Comment).filter(Comment.post_id.in_(post_ids)).delete(synchronize_session=False)
                    s.query(Post).filter(Post.id.in_(post_ids)).delete(synchronize_session=False)
            except Exception:
                pass
            # 2) 使用者 school 綁定解除
            try:
                s.query(User).filter(User.school_id == sid).update({User.school_id: None})
            except Exception:
                pass

        # 刪除資料列
        s.delete(sch)
        s.commit()

        # 嘗試移除校徽檔案夾（best-effort）
        try:
            root = os.getenv("UPLOAD_ROOT", "uploads")
            dirp = os.path.join(root, "public", "schools", str(sid))
            if os.path.isdir(dirp):
                for name in os.listdir(dirp):
                    try:
                        os.remove(os.path.join(dirp, name))
                    except Exception:
                        pass
                try:
                    os.rmdir(dirp)
                except Exception:
                    pass
        except Exception:
            pass

        return jsonify({'ok': True})


@bp.post("/<int:sid>/logo")
@jwt_required()
@require_role("dev_admin", "campus_admin")
def upload_school_logo(sid: int):
    """上傳或更新單一學校校徽。"""

    uploaded_file = request.files.get('file')
    if not uploaded_file or not uploaded_file.filename:
        return jsonify({'msg': '缺少檔案'}), 400

    filename = secure_filename(uploaded_file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_LOGO_EXTENSIONS:
        return jsonify({'msg': '僅支援 PNG/JPG/WEBP/SVG'}), 400

    data = uploaded_file.read()
    if not data:
        return jsonify({'msg': '檔案為空'}), 400
    if len(data) > MAX_LOGO_SIZE_BYTES:
        return jsonify({'msg': '檔案過大，請壓縮至 5MB 以內'}), 413

    upload_root = _get_upload_root_path()
    school_dir = upload_root / 'public' / 'schools' / str(sid)

    with get_session() as s:
        school = s.get(School, sid)
        if not school:
            return jsonify({'msg': '學校不存在'}), 404

        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or int(actor.school_id) != int(sid):
                _log_unauthorized(actor, 'upload_school_logo', sid)
                return jsonify({'msg': '僅能修改所屬學校的校徽'}), 403

        # 清理舊檔，儲存新版
        _purge_existing_files(school_dir, 'logo.')
        primary_name = _save_logo_variants(data, school_dir, f"logo{ext}")
        relative_path = _relative_to_root(school_dir / primary_name, upload_root)
        school.logo_path = relative_path

        try:
            EventService.log_event(
                session=s,
                event_type='school.updated',
                title='學校校徽更新',
                description=f'學校 {school.slug} 更新校徽',
                severity='medium',
                actor_id=int(uid) if uid else None,
                actor_name=getattr(actor, 'username', None) if actor else None,
                actor_role=getattr(actor, 'role', None) if actor else None,
                target_type='school',
                target_id=school.id,
                target_name=school.name,
                school_id=school.id,
                metadata={'logo_path': relative_path}
            )
        except Exception:
            pass

        s.commit()
        public_url = _normalize_public_url(school.logo_path)
        return jsonify({'ok': True, 'path': school.logo_path, 'url': public_url})


@bp.get('/cross/logo')
@jwt_required(optional=True)
def get_cross_logo():
    """取得跨校（cross）Logo 設定。"""
    upload_root = _get_upload_root_path()
    directory = upload_root / 'public' / 'logos' / 'schools'
    logo_path = _find_cross_logo_file(directory)
    if not logo_path:
        return jsonify({'url': None, 'path': None})
    relative_path = _relative_to_root(logo_path, upload_root)
    return jsonify({'url': _normalize_public_url(relative_path), 'path': relative_path})


@bp.post('/cross/logo')
@jwt_required()
@require_role('dev_admin', 'cross_admin')
def upload_cross_logo():
    """上傳跨校（cross）Logo。"""
    uploaded_file = request.files.get('file')
    if not uploaded_file or not uploaded_file.filename:
        return jsonify({'msg': '缺少檔案'}), 400

    filename = secure_filename(uploaded_file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_LOGO_EXTENSIONS:
        return jsonify({'msg': '僅支援 PNG/JPG/WEBP/SVG'}), 400

    data = uploaded_file.read()
    if not data:
        return jsonify({'msg': '檔案為空'}), 400
    if len(data) > MAX_LOGO_SIZE_BYTES:
        return jsonify({'msg': '檔案過大，請壓縮至 5MB 以內'}), 413

    upload_root = _get_upload_root_path()
    directory = upload_root / 'public' / 'logos' / 'schools'
    _purge_existing_files(directory, 'cross.')
    primary_name = _save_logo_variants(data, directory, f"cross{ext}")
    relative_path = _relative_to_root(directory / primary_name, upload_root)

    uid = get_jwt_identity()
    with get_session() as s:
        actor = s.get(User, int(uid)) if uid is not None else None
        try:
            EventService.log_event(
                session=s,
                event_type='school.updated',
                title='跨校校徽更新',
                description='跨校區域 Logo 已更新',
                severity='medium',
                actor_id=int(uid) if uid else None,
                actor_name=getattr(actor, 'username', None) if actor else None,
                actor_role=getattr(actor, 'role', None) if actor else None,
                target_type='platform',
                target_name='cross',
                metadata={'logo_path': relative_path}
            )
        except Exception:
            pass
        s.commit()

    return jsonify({'ok': True, 'path': relative_path, 'url': _normalize_public_url(relative_path)})


@bp.get('/admin')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def admin_list():
    """學校清單（管理用）：
    - dev_admin: 返回全部
    - campus_admin: 僅返回自己學校
    """
    with get_session() as s:  # type: Session
        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin':
            if not actor.school_id:
                return jsonify({'items': []})
            sch = s.get(School, actor.school_id)
            items = []
            if sch:
                setting_row = s.query(SchoolSetting).filter(SchoolSetting.school_id == sch.id).first()
                setting_data = _settings_dict(setting_row)
                # Logo 處理器功能已停用，使用基本 URL
                url = None
                if getattr(sch, 'logo_path', None):
                    url = f"/uploads/{sch.logo_path}" if not sch.logo_path.startswith('/') else sch.logo_path
                items.append({
                    'id': sch.id,
                    'slug': sch.slug,
                    'name': sch.name,
                    'logo_path': sch.logo_path,
                    'logo_url': url,
                    'unlock_code': setting_data.get('unlock_code'),
                    'unlock_code_updated_at': setting_data.get('unlock_code_updated_at'),
                })
            return jsonify({'items': items})
        rows = s.query(School).order_by(School.slug.asc()).all()
        # Logo 處理器功能已停用，使用基本 URL
        school_ids = [x.id for x in rows]
        settings_rows = []
        if school_ids:
            settings_rows = s.query(SchoolSetting).filter(SchoolSetting.school_id.in_(school_ids)).all()
        settings_map = {row.school_id: _settings_dict(row) for row in settings_rows}
        items = []
        for x in rows:
            url = None
            if getattr(x, 'logo_path', None):
                url = f"/uploads/{x.logo_path}" if not x.logo_path.startswith('/') else x.logo_path
            setting_data = settings_map.get(x.id, {})
            items.append({
                'id': x.id,
                'slug': x.slug,
                'name': x.name,
                'logo_path': x.logo_path,
                'logo_url': url,
                'unlock_code': setting_data.get('unlock_code'),
                'unlock_code_updated_at': setting_data.get('unlock_code_updated_at'),
            })
        return jsonify({'items': items})


@bp.get('/<string:slug>/admin_overview')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def admin_overview(slug: str):
    """學校管理總覽（統計＋偵測回饋）"""
    with get_session() as s:  # type: Session
        sch = s.query(School).filter(School.slug == slug).first()
        if not sch:
            return jsonify({'msg': 'not found'}), 404

        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or actor.school_id != sch.id:
                _log_unauthorized(actor, 'admin_overview', slug)
                return jsonify({'msg': '僅能檢視自己學校'}), 403

        # 總數
        users_total = s.query(func.count(User.id)).filter(User.school_id == sch.id).scalar() or 0
        posts_total = s.query(func.count(Post.id)).filter(Post.school_id == sch.id).scalar() or 0
        # join Comment 計算該校貼文下的留言量
        comments_total = (
            s.query(func.count(Comment.id))
            .join(Post, Comment.post_id == Post.id)
            .filter(Post.school_id == sch.id)
            .scalar() or 0
        )
        media_total = (
            s.query(func.count(Media.id))
            .join(Post, Media.post_id == Post.id)
            .filter(Post.school_id == sch.id)
            .scalar() or 0
        )

        # 期間統計（今日/本週/本月）
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=today_start.weekday())
        month_start = today_start.replace(day=1)

        def _cnt_users_since(ts):
            try:
                return s.query(func.count(User.id)).filter(User.school_id == sch.id, User.created_at >= ts).scalar() or 0
            except Exception:
                return 0

        def _cnt_posts_since(ts):
            try:
                return s.query(func.count(Post.id)).filter(Post.school_id == sch.id, Post.created_at >= ts).scalar() or 0
            except Exception:
                return 0

        def _cnt_comments_since(ts):
            try:
                return (
                    s.query(func.count(Comment.id))
                    .join(Post, Comment.post_id == Post.id)
                    .filter(Post.school_id == sch.id, Comment.created_at >= ts)
                    .scalar() or 0
                )
            except Exception:
                return 0

        def _cnt_media_since(ts):
            try:
                return (
                    s.query(func.count(Media.id))
                    .join(Post, Media.post_id == Post.id)
                    .filter(Post.school_id == sch.id, Media.created_at >= ts)
                    .scalar() or 0
                )
            except Exception:
                return 0

        periods = {
            'today': {
                'users': _cnt_users_since(today_start),
                'posts': _cnt_posts_since(today_start),
                'comments': _cnt_comments_since(today_start),
                'media': _cnt_media_since(today_start),
            },
            'week': {
                'users': _cnt_users_since(week_start),
                'posts': _cnt_posts_since(week_start),
                'comments': _cnt_comments_since(week_start),
                'media': _cnt_media_since(week_start),
            },
            'month': {
                'users': _cnt_users_since(month_start),
                'posts': _cnt_posts_since(month_start),
                'comments': _cnt_comments_since(month_start),
                'media': _cnt_media_since(month_start),
            },
        }

        # 校內 vs 跨校發文比例（作者學校==本校 為校內）
        campus_posts = 0
        cross_posts = 0
        try:
            qsplit = (
                s.query(User.school_id, func.count(Post.id))
                .join(Post, Post.author_id == User.id)
                .filter(Post.school_id == sch.id)
                .group_by(User.school_id)
            )
            for author_school_id, cnt in qsplit.all():
                if author_school_id == sch.id:
                    campus_posts += int(cnt or 0)
                else:
                    cross_posts += int(cnt or 0)
        except Exception:
            pass

        # Email 網域分佈（前 5 名）
        domain_counts: dict[str, int] = {}
        top_domains: list[tuple[str, int]] = []
        try:
            rows = s.query(User.email).filter(User.school_id == sch.id, User.email.isnot(None)).all()
            for (em,) in rows:
                try:
                    eml = (em or '').lower().strip()
                    if '@' in eml:
                        dom = eml.split('@', 1)[1]
                        domain_counts[dom] = domain_counts.get(dom, 0) + 1
                except Exception:
                    pass
            top_domains = sorted(domain_counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
        except Exception:
            pass

        gmail_count = domain_counts.get('gmail.com', 0)
        edu_count = sum(cnt for dom, cnt in domain_counts.items() if ('.edu' in dom))

        # 偵測推導 slug（取最多數網域作為樣本）
        suggested_from_domain = None
        if top_domains:
            try:
                suggested_from_domain = derive_school_slug_from_domain(top_domains[0][0])
            except Exception:
                suggested_from_domain = None

        return jsonify({
            'school': {
                'id': sch.id,
                'slug': sch.slug,
                'name': sch.name,
                'logo_path': sch.logo_path,
                'created_at': sch.created_at.isoformat() if getattr(sch, 'created_at', None) else None
            },
            'stats': {
                'users_total': users_total,
                'posts_total': posts_total,
                'comments_total': comments_total,
                'media_total': media_total,
                'periods': periods,
                'cross_split': {'campus_posts': campus_posts, 'cross_posts': cross_posts},
                'top_email_domains': [{'domain': d, 'count': c} for d, c in top_domains],
                'gmail_count': gmail_count,
                'edu_email_count': edu_count,
            },
            'email_detection': {
                'suggested_slug_from_dominant_domain': suggested_from_domain,
                'note': 'gmail.com 不允許作為校園登入網域; 允許 .edu 類網域',
            }
        })


@bp.get('/<string:slug>/unlock_code')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def get_unlock_code(slug: str):
    slug = slug.strip().lower()
    with get_session() as s:
        school = s.query(School).filter(School.slug == slug).first()
        if not school:
            return jsonify({'msg': 'not found'}), 404

        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or actor.school_id != school.id:
                _log_unauthorized(actor, 'get_unlock_code', slug)
                return jsonify({'msg': '僅能操作自己學校'}), 403

        row = s.query(SchoolSetting).filter(SchoolSetting.school_id == school.id).first()
        data = _settings_dict(row)
        return jsonify({
            'code': data.get('unlock_code'),
            'updated_at': data.get('unlock_code_updated_at')
        })


@bp.post('/<string:slug>/unlock_code')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def generate_unlock_code(slug: str):
    slug = slug.strip().lower()
    with get_session() as s:
        school = s.query(School).filter(School.slug == slug).first()
        if not school:
            return jsonify({'msg': 'not found'}), 404

        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or actor.school_id != school.id:
                _log_unauthorized(actor, 'generate_unlock_code', slug)
                return jsonify({'msg': '僅能操作自己學校'}), 403
        if slug == 'cross' and (not actor or actor.role != 'dev_admin'):
            return jsonify({'msg': '僅限開發管理員更新跨校解鎖碼'}), 403

        row = _ensure_setting_row(s, school.id)
        data = _settings_dict(row)
        code = _generate_unlock_code(slug or 'cross')
        updated_at = datetime.now(timezone.utc).isoformat()
        data['unlock_code'] = code
        data['unlock_code_updated_at'] = updated_at
        row.data = json.dumps(data, ensure_ascii=False)
        s.add(row)

        try:
            EventService.log_event(
                session=s,
                event_type='school.unlock_code_refreshed',
                title='解鎖碼已更新',
                description=f'學校 {school.slug} 的解鎖碼已重新生成',
                severity='medium',
                actor_id=int(uid) if uid else None,
                actor_name=getattr(actor, 'username', None) if actor else None,
                actor_role=getattr(actor, 'role', None) if actor else None,
                target_type='school',
                target_id=school.id,
                school_id=school.id,
                metadata={'unlock_code': code}
            )
        except Exception:
            pass

        s.commit()
        return jsonify({'code': code, 'updated_at': updated_at})


@bp.get('/<string:slug>/domains')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def list_school_domains(slug: str):
    """列出學校綁定之完整網域清單（含 @）。"""
    with get_session() as s:
        sch = s.query(School).filter(School.slug == slug).first()
        if not sch:
            return jsonify({'msg': 'not found'}), 404
        # 權限：campus_admin 僅能操作自己學校
        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin' and (not actor.school_id or int(actor.school_id) != int(sch.id)):
            _log_unauthorized(actor, 'list_school_domains', slug)
            return jsonify({'msg': '僅能操作所屬學校'}), 403
        setting = s.query(SchoolSetting).filter(SchoolSetting.school_id == sch.id).first()
        data = {}
        try:
            if setting and (setting.data or '').strip():
                data = json.loads(setting.data)
        except Exception:
            data = {}
        allowed = data.get('allowed_domains') if isinstance(data, dict) else None
        if not isinstance(allowed, list):
            allowed = []
        # 僅回傳字串陣列
        out = [x for x in allowed if isinstance(x, str)]
        return jsonify({'items': out})


@bp.post('/<string:slug>/domains')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def add_school_domain(slug: str):
    """新增學校綁定網域。需以 @ 開頭，至少一個點（例：@nhsh.tp.edu.tw）。"""
    body = request.get_json(silent=True) or {}
    dom = (body.get('domain') or '').strip()
    if not (dom.startswith('@') and '.' in dom):
        return jsonify({'msg': '請輸入完整網域（例如 @nhsh.tp.edu.tw）'}), 400
    full = dom.lower()
    with get_session() as s:
        sch = s.query(School).filter(School.slug == slug).first()
        if not sch:
            return jsonify({'msg': 'not found'}), 404
        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin' and (not actor.school_id or int(actor.school_id) != int(sch.id)):
            _log_unauthorized(actor, 'add_school_domain', slug)
            return jsonify({'msg': '僅能操作所屬學校'}), 403
        setting = s.query(SchoolSetting).filter(SchoolSetting.school_id == sch.id).first()
        data = {}
        try:
            if setting and (setting.data or '').strip():
                data = json.loads(setting.data)
        except Exception:
            data = {}
        if not isinstance(data, dict):
            data = {}
        allowed = data.get('allowed_domains')
        if not isinstance(allowed, list):
            allowed = []
        if full not in allowed:
            allowed.append(full)
        data['allowed_domains'] = allowed
        payload = json.dumps(data, ensure_ascii=False)
        if not setting:
            setting = SchoolSetting(school_id=sch.id, data=payload)
            s.add(setting)
        else:
            setting.data = payload
        s.commit()
        return jsonify({'ok': True, 'items': allowed})


@bp.delete('/<string:slug>/domains')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def remove_school_domain(slug: str):
    body = request.get_json(silent=True) or {}
    dom = (body.get('domain') or '').strip().lower()
    if not dom:
        return jsonify({'msg': '缺少 domain'}), 400
    with get_session() as s:
        sch = s.query(School).filter(School.slug == slug).first()
        if not sch:
            return jsonify({'msg': 'not found'}), 404
        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin' and (not actor.school_id or int(actor.school_id) != int(sch.id)):
            _log_unauthorized(actor, 'remove_school_domain', slug)
            return jsonify({'msg': '僅能操作所屬學校'}), 403
        setting = s.query(SchoolSetting).filter(SchoolSetting.school_id == sch.id).first()
        if not setting or not (setting.data or '').strip():
            return jsonify({'ok': True, 'items': []})
        try:
            data = json.loads(setting.data)
        except Exception:
            data = {}
        allowed = data.get('allowed_domains') if isinstance(data, dict) else None
        if not isinstance(allowed, list):
            allowed = []
        new_list = [x for x in allowed if isinstance(x, str) and x.strip().lower() != dom]
        data['allowed_domains'] = new_list
        setting.data = json.dumps(data, ensure_ascii=False)
        s.commit()
        return jsonify({'ok': True, 'items': new_list})
