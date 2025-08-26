from flask import Blueprint, jsonify, request
from sqlalchemy.orm import Session
from utils.db import get_session
from models import School, User, Post, Media, SchoolSetting
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.authz import require_role
from PIL import Image
import os
from utils.admin_events import log_system_event

bp = Blueprint("schools", __name__, url_prefix="/api/schools")
@bp.get("/<string:slug>/settings")
@jwt_required(optional=True)
def get_school_settings(slug: str):
    """取得某校設定。未登入允許讀取（僅公開內容），但目前返回整包 JSON，前端自行控制。
    權限：
      - dev_admin 可讀任一學校
      - campus_admin/campus_moderator 僅讀自己學校
      - 其他角色允許讀取（唯讀）
    """
    with get_session() as s:  # type: Session
        sch = s.query(School).filter(School.slug == slug).first()
        if not sch:
            return jsonify({ 'msg': 'not found' }), 404
        row = s.query(SchoolSetting).filter(SchoolSetting.school_id == sch.id).first()
        return jsonify({
            'school': { 'id': sch.id, 'slug': sch.slug, 'name': sch.name },
            'data': (row.data if row else '{}')
        })


@bp.put("/<string:slug>/settings")
@jwt_required()
@require_role("dev_admin", "campus_admin")
def update_school_settings(slug: str):
    """更新某校設定。校內管理員僅能更新自己學校；dev_admin 無限制。"""
    data = request.get_json(silent=True) or {}
    import json
    try:
        # 僅允許 JSON 物件
        if isinstance(data, str):
            json.loads(data)  # 驗證字串是有效 JSON
            payload = data
        else:
            payload = json.dumps(data, ensure_ascii=False)
    except Exception:
        return jsonify({ 'msg': '無效的JSON' }), 400

    from flask_jwt_extended import get_jwt_identity
    with get_session() as s:  # type: Session
        sch = s.query(School).filter(School.slug == slug).first()
        if not sch:
            return jsonify({ 'msg': 'not found' }), 404
        # 權限：campus_admin 必須同校
        uid = get_jwt_identity()
        actor = s.query(User).get(uid) if uid else None
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or actor.school_id != sch.id:
                _log_unauthorized(actor, 'update_school_settings', slug)
                return jsonify({ 'msg': '無權限：僅能更新自己學校設定' }), 403
        row = s.query(SchoolSetting).filter(SchoolSetting.school_id == sch.id).first()
        if not row:
            row = SchoolSetting(school_id=sch.id, data=payload)
            s.add(row)
        else:
            row.data = payload
        s.commit()
        try:
            uid = get_jwt_identity()
            actor = None
            if uid:
                from models import User
                u = s.get(User, int(uid))
                actor = u.username if u else None
            log_system_event(
                event_type='system_settings_changed',
                title='學校設定變更',
                description=f'slug={slug}',
                severity='medium',
                metadata={'actor': actor} if actor else None,
            )
        except Exception:
            pass
        return jsonify({ 'ok': True })


@bp.get("")
def list_schools():
    with get_session() as s:  # type: Session
        rows = s.query(School).order_by(School.slug.asc()).all()
        items = [{"id": x.id, "slug": x.slug, "name": x.name, "logo_path": x.logo_path} for x in rows]
        return jsonify({"items": items})


@bp.post("")
@jwt_required()
@require_role("dev_admin")
def create_school():
    data = request.get_json(silent=True) or {}
    slug = (data.get('slug') or '').strip().lower()
    name = (data.get('name') or '').strip() or slug
    if not slug:
        return jsonify({ 'msg': '缺少 slug' }), 400
    if not all(ch.isalnum() or ch in '-_' for ch in slug):
        return jsonify({ 'msg': 'slug 僅能包含英數與 - _' }), 400
    with get_session() as s:  # type: Session
        if s.query(School).filter(School.slug==slug).first():
            return jsonify({ 'msg': 'slug 已存在' }), 409
        sch = School(slug=slug, name=name or slug)
        s.add(sch); s.commit(); s.refresh(sch)
        return jsonify({ 'ok': True, 'item': { 'id': sch.id, 'slug': sch.slug, 'name': sch.name } })


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
            return jsonify({ 'msg': 'slug 僅能包含英數與 - _' }), 400
    with get_session() as s:  # type: Session
        sch = s.get(School, sid)
        if not sch:
            return jsonify({ 'msg': 'not found' }), 404
        # 權限：campus_admin 僅能修改自己學校
        from flask_jwt_extended import get_jwt_identity
        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or int(actor.school_id) != int(sid):
                _log_unauthorized(actor, 'update_school', sid)
                return jsonify({ 'msg': '僅能修改所屬學校' }), 403
        # 名稱更新
        if name:
            sch.name = name
        # 代碼(slug)更新：需唯一
        if new_slug and new_slug != sch.slug:
            exists = s.query(School).filter(School.slug == new_slug).first()
            if exists:
                return jsonify({ 'msg': 'slug 已存在' }), 409
            sch.slug = new_slug
        s.commit()
        return jsonify({ 'ok': True, 'item': { 'id': sch.id, 'slug': sch.slug, 'name': sch.name } })


@bp.delete("/<int:sid>")
@jwt_required()
@require_role("dev_admin")
def delete_school(sid: int):
    """刪除學校：預設需無關聯。若 ?force=1，會清除關聯貼文/媒體/留言，並將使用者 school_id 置空。"""
    with get_session() as s:  # type: Session
        sch = s.get(School, sid)
        if not sch:
            return jsonify({ 'msg': 'not found' }), 404
        # 檢查關聯
        has_user = s.query(User).filter(User.school_id==sid).first() is not None
        has_post = s.query(Post).filter(Post.school_id==sid).first() is not None
        has_media = s.query(Media).filter(Media.school_id==sid).first() is not None
        force = (request.args.get('force') or '').strip() in {'1','true','yes','on'}
        if (has_user or has_post or has_media) and not force:
            return jsonify({ 'msg': '存在關聯資料，無法刪除（可加 ?force=1 強制）' }), 409
        if force:
            # 1) 先清除與該校相關的貼文/媒體/留言
            try:
                from models import Comment
                post_ids = [pid for (pid,) in s.query(Post.id).filter(Post.school_id==sid).all()]
                if post_ids:
                    s.query(Media).filter(Media.post_id.in_(post_ids)).delete(synchronize_session=False)
                    s.query(Comment).filter(Comment.post_id.in_(post_ids)).delete(synchronize_session=False)
                    s.query(Post).filter(Post.id.in_(post_ids)).delete(synchronize_session=False)
            except Exception:
                pass
            # 2) 使用者 school 綁定解除
            try:
                s.query(User).filter(User.school_id==sid).update({ User.school_id: None })
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
        return jsonify({ 'ok': True })


@bp.post("/<int:sid>/logo")
@jwt_required()
@require_role("dev_admin", "campus_admin")
def upload_school_logo(sid: int):
    """上傳校徽（webp），存至 uploads/public/schools/{sid}/logo.webp，更新 logo_path。"""
    fs = request.files.get('file')
    if not fs or not fs.filename:
        return jsonify({ 'msg': '缺少檔案' }), 400
    try:
        im = Image.open(fs.stream)
        im = im.convert("RGB")
        # 基本縮放：最大寬高 512，保留比例
        im.thumbnail((512, 512))
        root = os.getenv("UPLOAD_ROOT", "uploads")
        dirp = os.path.join(root, "public", "schools", str(sid))
        os.makedirs(dirp, exist_ok=True)
        out_path = os.path.join(dirp, "logo.webp")
        im.save(out_path, format="WEBP", quality=90, method=6)
        rel = os.path.relpath(out_path, start=root).replace("\\", "/")  # e.g. public/schools/1/logo.webp
    except Exception as e:
        return jsonify({ 'msg': f'處理圖片失敗: {e}' }), 400

    with get_session() as s:  # type: Session
        sch = s.get(School, sid)
        if not sch:
            return jsonify({ 'msg': 'not found' }), 404
        # 僅允許 dev_admin 或本校 campus_admin 上傳校徽
        try:
            from flask_jwt_extended import get_jwt_identity
            uid = get_jwt_identity()
            actor = s.get(User, int(uid)) if uid is not None else None
            if actor and actor.role == 'campus_admin':
                if not actor.school_id or int(actor.school_id) != int(sid):
                    _log_unauthorized(actor, 'upload_school_logo', sid)
                    return jsonify({ 'msg': '僅能修改所屬學校的校徽' }), 403
        except Exception:
            # 若無法驗證則拒絕（保守）
            return jsonify({ 'msg': 'permission denied' }), 403
def _log_unauthorized(actor: User | None, action: str, slug_or_id: str | int | None = None):
    try:
        name = getattr(actor, 'username', None) or 'unknown'
        role = getattr(actor, 'role', None) or 'guest'
        desc = f"actor={name} role={role} path={request.path} method={request.method} action={action} target={slug_or_id}"
        log_system_event(
            event_type='suspicious_activity',
            title='未授權學校管理嘗試',
            description=desc,
            severity='high',
            metadata={'ip': request.headers.get('X-Forwarded-For') or request.remote_addr}
        )
    except Exception:
        pass

        sch.logo_path = rel
        s.commit()
    return jsonify({ 'ok': True, 'path': rel })


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
                items.append({ 'id': sch.id, 'slug': sch.slug, 'name': sch.name, 'logo_path': sch.logo_path })
            return jsonify({ 'items': items })
        rows = s.query(School).order_by(School.slug.asc()).all()
        items = [{ 'id': x.id, 'slug': x.slug, 'name': x.name, 'logo_path': x.logo_path } for x in rows]
        return jsonify({ 'items': items })


@bp.get('/<string:slug>/admin_overview')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def admin_overview(slug: str):
    """學校管理總覽（統計＋偵測回饋）"""
    from sqlalchemy import func
    from models import Post, Media, Comment
    from utils.oauth_google import derive_school_slug_from_domain, check_school_domain
    with get_session() as s:  # type: Session
        sch = s.query(School).filter(School.slug == slug).first()
        if not sch:
            return jsonify({ 'msg': 'not found' }), 404
        uid = get_jwt_identity()
        actor = s.get(User, int(uid)) if uid is not None else None
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or actor.school_id != sch.id:
                _log_unauthorized(actor, 'admin_overview', slug)
                return jsonify({ 'msg': '僅能檢視自己學校' }), 403

        # 統計
        users_total = s.query(func.count(User.id)).filter(User.school_id == sch.id).scalar() or 0
        posts_total = s.query(func.count(Post.id)).filter(Post.school_id == sch.id).scalar() or 0
        comments_total = s.query(func.count(Comment.id)).join(Post, Comment.post_id == Post.id).filter(Post.school_id == sch.id).scalar() or 0
        media_total = s.query(func.count(Media.id)).join(Post, Media.post_id == Post.id).filter(Post.school_id == sch.id).scalar() or 0

        # 期間統計（今日/本週/本月）
        from datetime import datetime, timezone, timedelta
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
                return s.query(func.count(Comment.id)).join(Post, Comment.post_id == Post.id).filter(Post.school_id == sch.id, Comment.created_at >= ts).scalar() or 0
            except Exception:
                return 0
        def _cnt_media_since(ts):
            try:
                return s.query(func.count(Media.id)).join(Post, Media.post_id == Post.id).filter(Post.school_id == sch.id, Media.created_at >= ts).scalar() or 0
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
        domain_counts: dict[str,int] = {}
        top_domains: list[tuple[str,int]] = []
        try:
            rows = s.query(User.email).filter(User.school_id == sch.id, User.email.isnot(None)).all()
            for (em,) in rows:
                try:
                    eml = (em or '').lower().strip()
                    if '@' in eml:
                        dom = eml.split('@',1)[1]
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
            'school': { 'id': sch.id, 'slug': sch.slug, 'name': sch.name, 'logo_path': sch.logo_path, 'created_at': sch.created_at.isoformat() if sch.created_at else None },
            'stats': {
                'users_total': users_total,
                'posts_total': posts_total,
                'comments_total': comments_total,
                'media_total': media_total,
                'periods': periods,
                'cross_split': { 'campus_posts': campus_posts, 'cross_posts': cross_posts },
                'top_email_domains': [{ 'domain': d, 'count': c } for d,c in top_domains],
                'gmail_count': gmail_count,
                'edu_email_count': edu_count,
            },
            'email_detection': {
                'suggested_slug_from_dominant_domain': suggested_from_domain,
                'note': 'gmail.com 不允許作為校園登入網域; 允許 .edu 類網域',
            }
        })
