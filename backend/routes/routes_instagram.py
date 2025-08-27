"""
Instagram 整合 API 路由
管理 IG 帳號、模板、排程和發送
"""
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from utils.db import get_session
from utils.auth import get_effective_user_id
from utils.authz import require_role
from utils.ig_generator import InstagramCardGenerator
from models import (InstagramAccount, InstagramTemplate, InstagramPost, 
                   InstagramScheduler, InstagramQueue, Post, School, User)
from datetime import datetime, timedelta
import json
import os
from io import BytesIO
import uuid
import base64

bp = Blueprint("instagram", __name__, url_prefix="/api/instagram")

def _wrap_ok(data, http: int = 200):
    return jsonify({"ok": True, "data": data}), http

def _wrap_err(code: str, message: str, http: int = 400):
    return jsonify({"ok": False, "error": {"code": code, "message": message}}), http


# ===============================================================================
# Instagram 帳號管理
# ===============================================================================

@bp.route("/accounts", methods=["GET"])
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_accounts():
    """獲取 Instagram 帳號列表"""
    with get_session() as session:
        user_id = get_effective_user_id()
        user = session.get(User, user_id)
        
        query = session.query(InstagramAccount)
        
        # 權限過濾
        if user.role == 'campus_admin':
            query = query.filter(
                or_(InstagramAccount.school_id == user.school_id, 
                    InstagramAccount.school_id.is_(None))
            )
        elif user.role == 'cross_admin':
            query = query.filter(InstagramAccount.school_id.is_(None))
        
        accounts = query.all()
        
        result = []
        for account in accounts:
            result.append({
                'id': account.id,
                'account_name': account.account_name,
                'username': account.username,
                'is_active': account.is_active,
                'school_id': account.school_id,
                'school_name': account.school.name if account.school else '跨校通用',
                'created_at': account.created_at.isoformat(),
                'has_token': bool(account.access_token)
            })
        
        return _wrap_ok(result)


@bp.route("/accounts", methods=["POST"])
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def create_account():
    """建立新的 Instagram 帳號"""
    try:
        data = request.get_json()
        
        with get_session() as session:
            user_id = get_effective_user_id()
            user = session.get(User, user_id)
            
            # 權限檢查
            school_id = data.get('school_id')
            if user.role == 'campus_admin' and school_id != user.school_id:
                return _wrap_err('PERMISSION_DENIED', '只能為自己的學校建立帳號', 403)
            
            # 檢查用戶名是否已存在
            existing = session.query(InstagramAccount).filter_by(
                username=data['username']
            ).first()
            
            if existing:
                return _wrap_err('USERNAME_EXISTS', 'Instagram 用戶名已存在')
            
            account = InstagramAccount(
                account_name=data['account_name'],
                username=data['username'],
                school_id=school_id,
                access_token=data.get('access_token'),
                account_id=data.get('account_id')
            )
            
            session.add(account)
            session.commit()
            
            return _wrap_ok({
                'id': account.id,
                'message': 'Instagram 帳號建立成功'
            })
            
    except Exception as e:
        return _wrap_err('CREATE_FAILED', f'建立失敗: {str(e)}', 500)


@bp.route("/accounts/<int:aid>", methods=["DELETE"])
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def delete_account(aid: int):
    with get_session() as s:
        acc = s.get(InstagramAccount, aid)
        if not acc:
            return _wrap_err('NOT_FOUND', '帳號不存在', 404)
        uid = get_effective_user_id()
        user = s.get(User, uid)
        # 權限：dev_admin 可刪任何；campus_admin 僅可刪本校帳號
        if user.role == 'campus_admin' and acc.school_id != user.school_id:
            return _wrap_err('PERMISSION_DENIED', '僅能刪除所屬學校帳號', 403)
        try:
            s.delete(acc)
            s.commit()
            return _wrap_ok({'ok': True})
        except Exception as e:
            return _wrap_err('DELETE_FAILED', f'刪除失敗: {e}', 500)


# ===============================================================================
# Instagram 模板管理
# ===============================================================================

@bp.route("/templates", methods=["GET"])
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_templates():
    """獲取模板列表"""
    with get_session() as session:
        user_id = get_effective_user_id()
        user = session.get(User, user_id)
        
        query = session.query(InstagramTemplate).filter_by(is_active=True)
        
        # 權限過濾
        if user.role == 'campus_admin':
            query = query.filter(
                or_(InstagramTemplate.school_id == user.school_id,
                    InstagramTemplate.school_id.is_(None))
            )
        elif user.role == 'cross_admin':
            query = query.filter(InstagramTemplate.school_id.is_(None))
        
        templates = query.all()
        
        result = []
        for template in templates:
            result.append({
                'id': template.id,
                'name': template.name,
                'description': template.description,
                'background_color': template.background_color,
                'text_color': template.text_color,
                'accent_color': template.accent_color,
                'title_font': template.title_font,
                'content_font': template.content_font,
                'title_size': template.title_size,
                'content_size': template.content_size,
                'is_default': template.is_default,
                'school_id': template.school_id,
                'school_name': template.school.name if template.school else '通用模板'
            })
        
        return _wrap_ok(result)


@bp.route("/templates", methods=["POST"])
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def create_template():
    """建立新模板"""
    try:
        data = request.get_json()
        
        with get_session() as session:
            user_id = get_effective_user_id()
            user = session.get(User, user_id)
            
            # 權限檢查
            school_id = data.get('school_id')
            if user.role == 'campus_admin' and school_id != user.school_id:
                return _wrap_err('PERMISSION_DENIED', '只能為自己的學校建立模板', 403)
            
            template = InstagramTemplate(
                name=data['name'],
                description=data.get('description', ''),
                background_color=data.get('background_color', '#ffffff'),
                text_color=data.get('text_color', '#333333'),
                accent_color=data.get('accent_color', '#3b82f6'),
                title_font=data.get('title_font', 'Noto Sans TC'),
                content_font=data.get('content_font', 'Noto Sans TC'),
                title_size=data.get('title_size', 24),
                content_size=data.get('content_size', 16),
                layout_config=data.get('layout_config', {}),
                show_logo=data.get('show_logo', True),
                logo_position=data.get('logo_position', 'bottom-right'),
                watermark_text=data.get('watermark_text', 'ForumKit by Serelix Studio'),
                school_id=school_id
            )
            
            session.add(template)
            session.commit()
            
            return _wrap_ok({
                'id': template.id,
                'message': '模板建立成功'
            })
            
    except Exception as e:
        return _wrap_err('CREATE_FAILED', f'建立失敗: {str(e)}', 500)


@bp.route('/templates/<int:tid>', methods=['GET'])
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_template(tid: int):
    with get_session() as s:
        tpl = s.get(InstagramTemplate, tid)
        if not tpl:
            return _wrap_err('NOT_FOUND', '模板不存在', 404)
        return _wrap_ok({
            'id': tpl.id,
            'name': tpl.name,
            'description': tpl.description,
            'background_color': tpl.background_color,
            'text_color': tpl.text_color,
            'accent_color': tpl.accent_color,
            'title_font': tpl.title_font,
            'content_font': tpl.content_font,
            'title_size': tpl.title_size,
            'content_size': tpl.content_size,
            'layout_config': tpl.layout_config,
            'show_logo': tpl.show_logo,
            'logo_position': tpl.logo_position,
            'watermark_text': tpl.watermark_text,
            'is_active': tpl.is_active,
            'is_default': tpl.is_default,
            'school_id': tpl.school_id,
        })


@bp.route('/templates/<int:tid>', methods=['PUT'])
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def update_template(tid: int):
    data = request.get_json(silent=True) or {}
    with get_session() as s:
        tpl = s.get(InstagramTemplate, tid)
        if not tpl:
            return _wrap_err('NOT_FOUND', '模板不存在', 404)
        uid = get_effective_user_id()
        user = s.get(User, uid)
        # 權限：campus_admin 只能編輯本校模板；cross_admin 只能編輯跨校模板
        if user.role == 'campus_admin' and tpl.school_id != user.school_id:
            return _wrap_err('PERMISSION_DENIED', '僅能編輯所屬學校模板', 403)
        if user.role == 'cross_admin' and tpl.school_id is not None:
            return _wrap_err('PERMISSION_DENIED', '僅能編輯跨校模板', 403)

        # 更新欄位（安全白名單）
        fields = ['name','description','background_color','text_color','accent_color','title_font','content_font','title_size','content_size','layout_config','show_logo','logo_position','watermark_text','is_active','is_default']
        for f in fields:
            if f in data:
                setattr(tpl, f, data[f])
        s.commit()
        return _wrap_ok({'ok': True})


@bp.route('/templates/<int:tid>', methods=['DELETE'])
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def delete_template(tid: int):
    with get_session() as s:
        tpl = s.get(InstagramTemplate, tid)
        if not tpl:
            return _wrap_err('NOT_FOUND', '模板不存在', 404)
        uid = get_effective_user_id()
        user = s.get(User, uid)
        # 權限：campus_admin 只能刪本校；cross_admin 只能刪跨校；dev_admin 任意
        if user.role == 'campus_admin' and tpl.school_id != user.school_id:
            return _wrap_err('PERMISSION_DENIED', '僅能刪除所屬學校模板', 403)
        if user.role == 'cross_admin' and tpl.school_id is not None:
            return _wrap_err('PERMISSION_DENIED', '僅能刪除跨校模板', 403)
        try:
            s.delete(tpl)
            s.commit()
            return _wrap_ok({'ok': True})
        except Exception as e:
            return _wrap_err('DELETE_FAILED', f'刪除失敗: {e}', 500)


@bp.route('/templates/<int:tid>/preview', methods=['POST'])
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def preview_template(tid: int):
    """以模板產生預覽 PNG 的 base64。可選 { post_id } 取樣內容，否則用範例字串。"""
    body = request.get_json(silent=True) or {}
    sample_post_id = body.get('post_id')
    with get_session() as s:
        tpl = s.get(InstagramTemplate, tid)
        if not tpl:
            return _wrap_err('NOT_FOUND', '模板不存在', 404)
        uid = get_effective_user_id()
        user = s.get(User, uid)
        if user.role == 'campus_admin' and tpl.school_id != user.school_id:
            return _wrap_err('PERMISSION_DENIED', '僅能預覽所屬學校模板', 403)
        if user.role == 'cross_admin' and tpl.school_id is not None:
            return _wrap_err('PERMISSION_DENIED', '僅能預覽跨校模板', 403)

        content = '<p>這是一個預覽貼文內容，將依模板渲染。</p>'
        school_name = ''
        school_logo_path = ''
        if sample_post_id:
            p = s.get(Post, int(sample_post_id))
            if p:
                content = p.content
                if p.school_id:
                    sch = s.get(School, p.school_id)
                    school_name = sch.name if sch else ''
                    # 嘗試取學校 logo 路徑
                    if sch and getattr(sch, 'logo_path', None):
                        school_logo_path = sch.logo_path
                # 取第一張媒體可另作延伸

        gen = InstagramCardGenerator()
        cfg = {
            'background_color': tpl.background_color,
            'text_color': tpl.text_color,
            'accent_color': tpl.accent_color,
            'title_font': tpl.title_font,
            'content_font': tpl.content_font,
            'title_size': int(tpl.title_size or 28),
            'content_size': int(tpl.content_size or 18),
            'watermark_text': tpl.watermark_text or 'ForumKit',
            'logo_position': tpl.logo_position or 'bottom-right',
            'layout_config': tpl.layout_config or {},
        }
        img_bytes = gen.generate_card(content=content, template_config=cfg, school_name=school_name, school_logo_path=school_logo_path, post_id=sample_post_id)
        b64 = base64.b64encode(img_bytes).decode('ascii')
        return _wrap_ok({ 'image_base64': f'data:image/png;base64,{b64}' })


# ===============================================================================
# Scheduler 與統計（精簡版，供卡片與頁面使用）
# ===============================================================================

@bp.route('/schedulers', methods=['GET'])
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def list_schedulers():
    with get_session() as s:
        uid = get_effective_user_id()
        user = s.get(User, uid)
        q = s.query(InstagramScheduler)
        if user.role == 'campus_admin':
            q = q.filter(InstagramScheduler.school_id == user.school_id)
        elif user.role == 'cross_admin':
            q = q.filter(InstagramScheduler.school_id.is_(None))
        rows = q.order_by(InstagramScheduler.id.desc()).all()
        items = []
        for r in rows:
            items.append({
                'id': r.id,
                'name': r.name,
                'trigger_type': r.trigger_type,
                'trigger_count': r.trigger_count,
                'trigger_time': r.trigger_time,
                'is_active': r.is_active,
                'school_name': (s.get(School, r.school_id).name if r.school_id else '跨校'),
                'account_name': (s.get(InstagramAccount, r.account_id).account_name if r.account_id else '-'),
                'template_name': (s.get(InstagramTemplate, r.template_id).name if r.template_id else '-')
            })
        return _wrap_ok(items)


@bp.route('/stats', methods=['GET'])
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def stats():
    with get_session() as s:
        uid = get_effective_user_id()
        user = s.get(User, uid)

        def scoped(q, col_school_id=None):
            if user.role == 'campus_admin':
                if col_school_id is not None:
                    return q.filter(col_school_id == user.school_id)
            elif user.role == 'cross_admin':
                if col_school_id is not None:
                    return q.filter(col_school_id.is_(None))
            return q

        # accounts
        q_acc = s.query(InstagramAccount)
        q_acc = scoped(q_acc, InstagramAccount.school_id)
        acc_total = q_acc.count()
        acc_active = q_acc.filter(InstagramAccount.is_active == True).count()

        # templates
        q_tpl = s.query(InstagramTemplate).filter(InstagramTemplate.is_active == True)
        q_tpl = scoped(q_tpl, InstagramTemplate.school_id)
        tpl_total = q_tpl.count()

        # posts
        q_ip = s.query(InstagramPost)
        if user.role == 'campus_admin':
            # 透過 account 的 school_id 限制
            q_ip = q_ip.join(InstagramAccount, InstagramPost.account_id == InstagramAccount.id).filter(InstagramAccount.school_id == user.school_id)
        elif user.role == 'cross_admin':
            q_ip = q_ip.join(InstagramAccount, InstagramPost.account_id == InstagramAccount.id).filter(InstagramAccount.school_id.is_(None))
        total_published = q_ip.filter(InstagramPost.status == 'published').count()
        pending = q_ip.filter(InstagramPost.status.in_(['pending','generated'])).count()
        failed = q_ip.filter(InstagramPost.status == 'failed').count()
        from datetime import datetime, timedelta
        recent_7days = q_ip.filter(InstagramPost.published_at != None, InstagramPost.published_at >= datetime.utcnow() - timedelta(days=7)).count()

        # queue
        q_q = s.query(InstagramQueue)
        if user.role == 'campus_admin':
            q_q = q_q.join(InstagramScheduler, InstagramQueue.scheduler_id == InstagramScheduler.id).filter(InstagramScheduler.school_id == user.school_id)
        elif user.role == 'cross_admin':
            q_q = q_q.join(InstagramScheduler, InstagramQueue.scheduler_id == InstagramScheduler.id).filter(InstagramScheduler.school_id.is_(None))
        q_pending = q_q.filter(InstagramQueue.status == 'queued').count()

        return _wrap_ok({
            'accounts': { 'total': acc_total, 'active': acc_active },
            'templates': { 'total': tpl_total },
            'posts': { 'total_published': total_published, 'pending': pending, 'failed': failed, 'recent_7days': recent_7days },
            'queue': { 'pending': q_pending }
        })


# ===============================================================================
# Instagram 排程管理（移除重複定義）
# ===============================================================================


@bp.route("/schedulers", methods=["POST"])
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def create_scheduler():
    """建立新排程"""
    try:
        data = request.get_json()
        
        with get_session() as session:
            user_id = get_effective_user_id()
            user = session.get(User, user_id)
            
            # 權限檢查
            school_id = data.get('school_id')
            if user.role == 'campus_admin' and school_id != user.school_id:
                return _wrap_err('PERMISSION_DENIED', '只能為自己的學校建立排程', 403)
            
            scheduler = InstagramScheduler(
                name=data['name'],
                school_id=school_id,
                account_id=data['account_id'],
                trigger_type=data['trigger_type'],  # count, time, manual
                trigger_count=data.get('trigger_count'),
                trigger_time=data.get('trigger_time'),
                filter_school_only=data.get('filter_school_only', False),
                filter_min_length=data.get('filter_min_length', 10),
                filter_exclude_media=data.get('filter_exclude_media', False),
                template_id=data['template_id']
            )
            
            session.add(scheduler)
            session.commit()
            
            return _wrap_ok({
                'id': scheduler.id,
                'message': '排程建立成功'
            })
            
    except Exception as e:
        return _wrap_err('CREATE_FAILED', f'建立失敗: {str(e)}', 500)


@bp.route('/schedulers/<int:sid>', methods=['DELETE'])
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def delete_scheduler(sid: int):
    with get_session() as s:
        sch = s.get(InstagramScheduler, sid)
        if not sch:
            return _wrap_err('NOT_FOUND', '排程不存在', 404)
        uid = get_effective_user_id()
        user = s.get(User, uid)
        if user.role == 'campus_admin' and sch.school_id != user.school_id:
            return _wrap_err('PERMISSION_DENIED', '僅能刪除所屬學校排程', 403)
        try:
            # 一併清空相關 queue（最佳努力）
            s.query(InstagramQueue).filter(InstagramQueue.scheduler_id == sid).delete()
            s.delete(sch)
            s.commit()
            return _wrap_ok({'ok': True})
        except Exception as e:
            return _wrap_err('DELETE_FAILED', f'刪除失敗: {e}', 500)


# ===============================================================================
# Instagram 貼文管理
# ===============================================================================

@bp.route("/posts", methods=["GET"])
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_instagram_posts():
    """獲取 IG 貼文列表"""
    with get_session() as session:
        user_id = get_effective_user_id()
        user = session.get(User, user_id)
        
        query = session.query(InstagramPost).join(InstagramAccount)
        
        # 權限過濾
        if user.role == 'campus_admin':
            query = query.filter(
                or_(InstagramAccount.school_id == user.school_id,
                    InstagramAccount.school_id.is_(None))
            )
        elif user.role == 'cross_admin':
            query = query.filter(InstagramAccount.school_id.is_(None))
        
        posts = query.order_by(InstagramPost.created_at.desc()).limit(50).all()
        
        result = []
        for post in posts:
            result.append({
                'id': post.id,
                'post_id': post.post_id,
                'account_name': post.account.account_name,
                'template_name': post.template.name,
                'status': post.status,
                'caption': post.caption,
                'instagram_permalink': post.instagram_permalink,
                'scheduled_at': post.scheduled_at.isoformat() if post.scheduled_at else None,
                'published_at': post.published_at.isoformat() if post.published_at else None,
                'created_at': post.created_at.isoformat()
            })
        
        return _wrap_ok(result)


@bp.route("/generate-preview", methods=["POST"])
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def generate_preview():
    """生成貼文預覽"""
    try:
        data = request.get_json()
        post_ids = data.get('post_ids', [])
        template_id = data.get('template_id')
        template_override = data.get('template_config')  # 允許直接傳入模板設定（未儲存狀態下預覽）
        sample_content = data.get('sample_content')
        
        with get_session() as session:
            generator = InstagramCardGenerator()
            # 若提供 override，走即時預覽（忽略 template_id）
            if template_override and isinstance(template_override, dict):
                content = str(sample_content or '<p>這是預覽內容，調整模板以查看效果。</p>')
                # 可選學校資訊（若有指定 school_slug）
                school_name = ''
                school_logo_path = ''
                try:
                    sch_slug = (data.get('school_slug') or '').strip()
                    if sch_slug:
                        sch = session.query(School).filter(School.slug==sch_slug).first()
                        if sch:
                            school_name = sch.name or ''
                            school_logo_path = getattr(sch, 'logo_path', '') or ''
                except Exception:
                    pass
                image_bytes = generator.generate_card(
                    content=content,
                    template_config=template_override,
                    school_name=school_name,
                    school_logo_path=school_logo_path,
                )
            else:
                # 使用已存在模板 + 貼文 IDs
                template = session.get(InstagramTemplate, template_id)
                if not template:
                    return _wrap_err('TEMPLATE_NOT_FOUND', '模板不存在', 404)
                posts = session.query(Post).filter(Post.id.in_(post_ids)).all()
                template_config = {
                    'background_color': template.background_color,
                    'text_color': template.text_color,
                    'accent_color': template.accent_color,
                    'title_font': template.title_font,
                    'content_font': template.content_font,
                    'title_size': template.title_size,
                    'content_size': template.content_size,
                    'watermark_text': template.watermark_text,
                    'logo_position': template.logo_position,
                    'layout_config': template.layout_config or {},
                }
                if len(posts) == 1:
                    post = posts[0]
                    school_name = post.school.name if post.school else ""
                    school_logo_path = post.school.logo_path if post.school else ""
                    image_bytes = generator.generate_card(
                        content=post.content,
                        template_config=template_config,
                        school_name=school_name,
                        school_logo_path=school_logo_path,
                        post_id=post.id
                    )
                else:
                    posts_data = [{ 'id': p.id, 'content': p.content } for p in posts]
                    image_bytes = generator.generate_batch_preview(posts_data, template_config)
            
            return send_file(
                BytesIO(image_bytes),
                mimetype='image/png',
                as_attachment=False
            )
            
    except Exception as e:
        return _wrap_err('PREVIEW_FAILED', f'生成預覽失敗: {str(e)}', 500)


# 允許更新 Instagram 帳號（僅 dev_admin / 校內帳號之 campus_admin）
@bp.route('/accounts/<int:aid>', methods=['PUT'])
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def update_account(aid: int):
    data = request.get_json(silent=True) or {}
    with get_session() as s:
        acc = s.get(InstagramAccount, aid)
        if not acc:
            return _wrap_err('NOT_FOUND', '帳號不存在', 404)
        uid = get_effective_user_id(); user = s.get(User, uid)
        if user.role == 'campus_admin' and acc.school_id != user.school_id:
            return _wrap_err('PERMISSION_DENIED', '僅能編輯所屬學校帳號', 403)
        fields = ['account_name','username','access_token','account_id','is_active']
        for f in fields:
            if f in data: setattr(acc, f, data[f])
        # 可選調整 school_id（dev_admin 可變更；campus_admin 不允許）
        if user.role == 'dev_admin' and 'school_id' in data:
            acc.school_id = data['school_id']
        s.commit()
        return _wrap_ok({'ok': True})


# 允許更新排程（僅 dev_admin / 校內之 campus_admin）
@bp.route('/schedulers/<int:sid>', methods=['PUT'])
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def update_scheduler(sid: int):
    data = request.get_json(silent=True) or {}
    with get_session() as s:
        sch = s.get(InstagramScheduler, sid)
        if not sch:
            return _wrap_err('NOT_FOUND', '排程不存在', 404)
        uid = get_effective_user_id(); user = s.get(User, uid)
        if user.role == 'campus_admin' and sch.school_id != user.school_id:
            return _wrap_err('PERMISSION_DENIED', '僅能編輯所屬學校排程', 403)
        fields = ['name','account_id','trigger_type','trigger_count','trigger_time','filter_school_only','filter_min_length','filter_exclude_media','template_id','is_active']
        for f in fields:
            if f in data: setattr(sch, f, data[f])
        if user.role == 'dev_admin' and 'school_id' in data:
            sch.school_id = data['school_id']
        s.commit()
        return _wrap_ok({'ok': True})


@bp.route("/queue-posts", methods=["POST"])
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def queue_posts():
    """將貼文加入發送佇列"""
    try:
        data = request.get_json()
        post_ids = data.get('post_ids', [])
        scheduler_id = data.get('scheduler_id')
        
        with get_session() as session:
            scheduler = session.get(InstagramScheduler, scheduler_id)
            if not scheduler:
                return _wrap_err('SCHEDULER_NOT_FOUND', '排程不存在', 404)
            
            batch_id = str(uuid.uuid4())
            queued_count = 0
            
            for post_id in post_ids:
                # 檢查是否已在佇列中
                existing = session.query(InstagramQueue).filter_by(
                    post_id=post_id,
                    status='queued'
                ).first()
                
                if not existing:
                    queue_item = InstagramQueue(
                        post_id=post_id,
                        scheduler_id=scheduler_id,
                        batch_id=batch_id,
                        scheduled_at=datetime.utcnow()
                    )
                    session.add(queue_item)
                    queued_count += 1
            
            session.commit()
            
            return _wrap_ok({
                'batch_id': batch_id,
                'queued_count': queued_count,
                'message': f'成功將 {queued_count} 篇貼文加入佇列'
            })
            
    except Exception as e:
        return _wrap_err('QUEUE_FAILED', f'加入佇列失敗: {str(e)}', 500)


# ===============================================================================
# 統計和監控（移除重複定義，使用上面的 /stats 端點）
# ===============================================================================
