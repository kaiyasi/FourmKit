"""
Instagram 整合 API 路由
管理 IG 帳號、模板、排程和發送
"""
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from utils.db import get_session
from utils.auth import get_effective_user_id, require_role
from utils.ig_generator import InstagramCardGenerator
from models import (InstagramAccount, InstagramTemplate, InstagramPost, 
                   InstagramScheduler, InstagramQueue, Post, School, User)
from datetime import datetime, timedelta
import json
import os
from io import BytesIO
import uuid

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
@require_role(['dev_admin', 'campus_admin', 'cross_admin'])
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
@require_role(['dev_admin', 'campus_admin'])
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


# ===============================================================================
# Instagram 模板管理
# ===============================================================================

@bp.route("/templates", methods=["GET"])
@jwt_required()
@require_role(['dev_admin', 'campus_admin', 'cross_admin'])
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
@require_role(['dev_admin', 'campus_admin', 'cross_admin'])
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


@bp.route("/templates/<int:template_id>/preview", methods=["POST"])
@jwt_required()
@require_role(['dev_admin', 'campus_admin', 'cross_admin'])
def preview_template():
    """預覽模板效果"""
    try:
        data = request.get_json()
        
        with get_session() as session:
            template = session.get(InstagramTemplate, template_id)
            if not template:
                return _wrap_err('TEMPLATE_NOT_FOUND', '模板不存在', 404)
            
            # 建立配置
            template_config = {
                'background_color': template.background_color,
                'text_color': template.text_color,
                'accent_color': template.accent_color,
                'title_font': template.title_font,
                'content_font': template.content_font,
                'title_size': template.title_size,
                'content_size': template.content_size,
                'watermark_text': template.watermark_text
            }
            
            # 生成預覽
            generator = InstagramCardGenerator()
            preview_content = data.get('content', '<h1>預覽內容</h1><p>這是模板預覽效果。</p>')
            school_name = data.get('school_name', '示範學校')
            
            image_bytes = generator.generate_card(
                content=preview_content,
                template_config=template_config,
                school_name=school_name,
                post_id=999
            )
            
            return send_file(
                BytesIO(image_bytes),
                mimetype='image/png',
                as_attachment=False
            )
            
    except Exception as e:
        return _wrap_err('PREVIEW_FAILED', f'預覽失敗: {str(e)}', 500)


# ===============================================================================
# Instagram 排程管理
# ===============================================================================

@bp.route("/schedulers", methods=["GET"])
@jwt_required()
@require_role(['dev_admin', 'campus_admin', 'cross_admin'])
def get_schedulers():
    """獲取排程列表"""
    with get_session() as session:
        user_id = get_effective_user_id()
        user = session.get(User, user_id)
        
        query = session.query(InstagramScheduler)
        
        # 權限過濾
        if user.role == 'campus_admin':
            query = query.filter(
                or_(InstagramScheduler.school_id == user.school_id,
                    InstagramScheduler.school_id.is_(None))
            )
        elif user.role == 'cross_admin':
            query = query.filter(InstagramScheduler.school_id.is_(None))
        
        schedulers = query.all()
        
        result = []
        for scheduler in schedulers:
            result.append({
                'id': scheduler.id,
                'name': scheduler.name,
                'trigger_type': scheduler.trigger_type,
                'trigger_count': scheduler.trigger_count,
                'trigger_time': scheduler.trigger_time,
                'filter_school_only': scheduler.filter_school_only,
                'is_active': scheduler.is_active,
                'school_name': scheduler.school.name if scheduler.school else '全局',
                'account_name': scheduler.account.account_name,
                'template_name': scheduler.template.name
            })
        
        return _wrap_ok(result)


@bp.route("/schedulers", methods=["POST"])
@jwt_required()
@require_role(['dev_admin', 'campus_admin'])
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


# ===============================================================================
# Instagram 貼文管理
# ===============================================================================

@bp.route("/posts", methods=["GET"])
@jwt_required()
@require_role(['dev_admin', 'campus_admin', 'cross_admin'])
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
@require_role(['dev_admin', 'campus_admin', 'cross_admin'])
def generate_preview():
    """生成貼文預覽"""
    try:
        data = request.get_json()
        post_ids = data.get('post_ids', [])
        template_id = data.get('template_id')
        
        with get_session() as session:
            template = session.get(InstagramTemplate, template_id)
            if not template:
                return _wrap_err('TEMPLATE_NOT_FOUND', '模板不存在', 404)
            
            posts = session.query(Post).filter(Post.id.in_(post_ids)).all()
            
            # 建立模板配置
            template_config = {
                'background_color': template.background_color,
                'text_color': template.text_color,
                'accent_color': template.accent_color,
                'title_font': template.title_font,
                'content_font': template.content_font,
                'title_size': template.title_size,
                'content_size': template.content_size,
                'watermark_text': template.watermark_text
            }
            
            generator = InstagramCardGenerator()
            
            # 如果只有一篇貼文，生成單篇預覽
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
                # 多篇貼文，生成批次預覽
                posts_data = []
                for post in posts:
                    posts_data.append({
                        'id': post.id,
                        'content': post.content
                    })
                
                image_bytes = generator.generate_batch_preview(posts_data, template_config)
            
            return send_file(
                BytesIO(image_bytes),
                mimetype='image/png',
                as_attachment=False
            )
            
    except Exception as e:
        return _wrap_err('PREVIEW_FAILED', f'生成預覽失敗: {str(e)}', 500)


@bp.route("/queue-posts", methods=["POST"])
@jwt_required()
@require_role(['dev_admin', 'campus_admin'])
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
# 統計和監控
# ===============================================================================

@bp.route("/stats", methods=["GET"])
@jwt_required()
@require_role(['dev_admin', 'campus_admin', 'cross_admin'])
def get_stats():
    """獲取 Instagram 整合統計"""
    with get_session() as session:
        user_id = get_effective_user_id()
        user = session.get(User, user_id)
        
        # 基本統計
        total_accounts = session.query(InstagramAccount).count()
        active_accounts = session.query(InstagramAccount).filter_by(is_active=True).count()
        total_templates = session.query(InstagramTemplate).filter_by(is_active=True).count()
        
        # 貼文統計
        total_published = session.query(InstagramPost).filter_by(status='published').count()
        pending_posts = session.query(InstagramPost).filter_by(status='pending').count()
        failed_posts = session.query(InstagramPost).filter_by(status='failed').count()
        
        # 佇列統計
        queued_count = session.query(InstagramQueue).filter_by(status='queued').count()
        
        # 最近7天發布統計
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_published = session.query(InstagramPost).filter(
            and_(
                InstagramPost.status == 'published',
                InstagramPost.published_at >= seven_days_ago
            )
        ).count()
        
        return _wrap_ok({
            'accounts': {
                'total': total_accounts,
                'active': active_accounts
            },
            'templates': {
                'total': total_templates
            },
            'posts': {
                'total_published': total_published,
                'pending': pending_posts,
                'failed': failed_posts,
                'recent_7days': recent_published
            },
            'queue': {
                'pending': queued_count
            }
        })