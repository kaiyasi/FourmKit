"""
Instagram 整合 API 路由
"""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timezone
from typing import Dict, Any
from sqlalchemy import and_

from utils.db import get_session
from utils.auth import require_role, get_role
from models import User, School, InstagramAccount, InstagramSetting, InstagramTemplate, InstagramPost
from services.instagram_service import InstagramService

bp = Blueprint('instagram', __name__, url_prefix='/api/ig')


@bp.get('/settings')
@jwt_required()
def get_ig_settings():
    """獲取 Instagram 設定"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 根據角色獲取不同的設定
            if role == 'dev_admin':
                # dev_admin 可以看到所有帳號
                accounts = s.query(InstagramAccount).filter(
                    InstagramAccount.is_active == True
                ).all()
            elif role == 'campus_admin':
                # campus_admin 只能看到自己學校的帳號
                if not user.school_id:
                    return jsonify({"error": "campus_admin 必須屬於某個學校"}), 403
                
                accounts = s.query(InstagramAccount).filter(
                    and_(
                        InstagramAccount.school_id == user.school_id,
                        InstagramAccount.is_active == True
                    )
                ).all()
            else:
                return jsonify({"error": "權限不足"}), 403
            
            result = []
            for account in accounts:
                settings = s.query(InstagramSetting).filter(
                    InstagramSetting.account_id == account.id
                ).first()
                
                result.append({
                    "account_id": account.id,
                    "account_name": account.account_name,
                    "school_name": account.school.name if account.school else "總平台",
                    "enabled": settings.enabled if settings else False,
                    "post_interval_count": settings.post_interval_count if settings else 10,
                    "post_interval_hours": settings.post_interval_hours if settings else 6,
                    "daily_limit": settings.daily_limit if settings else 50,
                    "token_expires_at": account.expires_at.isoformat(),
                    "is_token_valid": account.expires_at > datetime.now(timezone.utc)
                })
            
            return jsonify({
                "ok": True,
                "data": result
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/settings')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def update_ig_settings():
    """更新 Instagram 設定"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        data = request.get_json()
        
        account_id = data.get('account_id')
        enabled = data.get('enabled')
        post_interval_count = data.get('post_interval_count')
        post_interval_hours = data.get('post_interval_hours')
        daily_limit = data.get('daily_limit')
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查權限
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能修改自己學校的設定"}), 403
            
            # 檢查設定值
            if post_interval_count and post_interval_count < 1:
                return jsonify({"error": "貼文間隔數量必須大於0"}), 400
            
            if post_interval_hours and post_interval_hours < 1:
                return jsonify({"error": "時間間隔必須大於0小時"}), 400
            
            if daily_limit and daily_limit > 50:
                return jsonify({"error": "每日發布限制不能超過50篇"}), 400
            
            # 更新設定
            settings = s.query(InstagramSetting).filter(
                InstagramSetting.account_id == account_id
            ).first()
            
            if not settings:
                settings = InstagramSetting(account_id=account_id)
                s.add(settings)
            
            if enabled is not None:
                settings.enabled = enabled
            if post_interval_count is not None:
                settings.post_interval_count = post_interval_count
            if post_interval_hours is not None:
                settings.post_interval_hours = post_interval_hours
            if daily_limit is not None:
                settings.daily_limit = daily_limit
            
            settings.updated_at = datetime.now(timezone.utc)
            s.commit()
            
            return jsonify({
                "ok": True,
                "message": "設定更新成功"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/templates')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def create_or_update_template():
    """創建或更新模板"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        data = request.get_json()
        
        account_id = data.get('account_id')
        template_id = data.get('template_id')  # 如果提供則更新，否則創建
        name = data.get('name')
        is_default = data.get('is_default', False)
        
        # 模板設定
        layout = data.get('layout', {})
        text_font = data.get('text_font', 'Arial')
        text_size = data.get('text_size', 24)
        text_color = data.get('text_color', '#000000')
        text_position = data.get('text_position', 'center')
        
        logo_enabled = data.get('logo_enabled', True)
        logo_position = data.get('logo_position', 'top-right')
        logo_size = data.get('logo_size', 100)
        
        background_type = data.get('background_type', 'color')
        background_color = data.get('background_color', '#FFFFFF')
        background_image = data.get('background_image')
        overlay_enabled = data.get('overlay_enabled', True)
        overlay_color = data.get('overlay_color', '#FFFFFF')
        overlay_opacity = data.get('overlay_opacity', 80)
        overlay_size = data.get('overlay_size', {"width": 0.8, "height": 0.6})
        overlay_radius = data.get('overlay_radius', 20)
        
        timestamp_enabled = data.get('timestamp_enabled', True)
        timestamp_format = data.get('timestamp_format', 'YYYY/MM/DD HH:mm')
        timestamp_position = data.get('timestamp_position', 'bottom-left')
        timestamp_size = data.get('timestamp_size', 16)
        timestamp_color = data.get('timestamp_color', '#666666')
        
        caption_template = data.get('caption_template', '📚 {school_name}\n\n{post_title}\n\n👤 作者：{author_name}\n📅 發布時間：{post_time}\n\n#校園生活 #學生分享')
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查權限
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能修改自己學校的模板"}), 403
            
            if template_id:
                # 更新現有模板
                template = s.query(InstagramTemplate).filter(
                    and_(
                        InstagramTemplate.id == template_id,
                        InstagramTemplate.account_id == account_id
                    )
                ).first()
                
                if not template:
                    return jsonify({"error": "模板不存在"}), 404
            else:
                # 創建新模板
                template = InstagramTemplate(account_id=account_id)
                s.add(template)
            
            # 更新模板資料
            template.name = name
            template.is_default = is_default
            template.layout = layout
            template.text_font = text_font
            template.text_size = text_size
            template.text_color = text_color
            template.text_position = text_position
            template.logo_enabled = logo_enabled
            template.logo_position = logo_position
            template.logo_size = logo_size
            template.background_type = background_type
            template.background_color = background_color
            template.background_image = background_image
            template.overlay_enabled = overlay_enabled
            template.overlay_color = overlay_color
            template.overlay_opacity = overlay_opacity
            template.overlay_size = overlay_size
            template.overlay_radius = overlay_radius
            template.timestamp_enabled = timestamp_enabled
            template.timestamp_format = timestamp_format
            template.timestamp_position = timestamp_position
            template.timestamp_size = timestamp_size
            template.timestamp_color = timestamp_color
            template.caption_template = caption_template
            template.updated_at = datetime.now(timezone.utc)
            
            # 如果設為預設模板，取消其他模板的預設狀態
            if is_default:
                s.query(InstagramTemplate).filter(
                    and_(
                        InstagramTemplate.account_id == account_id,
                        InstagramTemplate.id != template.id
                    )
                ).update({"is_default": False})
            
            s.commit()
            
            return jsonify({
                "ok": True,
                "template_id": template.id,
                "message": "模板保存成功"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get('/templates/<int:account_id>')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def get_templates(account_id: int):
    """獲取帳號的模板列表"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查權限
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能查看自己學校的模板"}), 403
            
            templates = s.query(InstagramTemplate).filter(
                InstagramTemplate.account_id == account_id
            ).all()
            
            result = []
            for template in templates:
                result.append({
                    "id": template.id,
                    "name": template.name,
                    "is_default": template.is_default,
                    "layout": template.layout,
                    "text_font": template.text_font,
                    "text_size": template.text_size,
                    "text_color": template.text_color,
                    "text_position": template.text_position,
                    "logo_enabled": template.logo_enabled,
                    "logo_position": template.logo_position,
                    "logo_size": template.logo_size,
                    "background_type": template.background_type,
                    "background_color": template.background_color,
                    "background_image": template.background_image,
                    "overlay_enabled": template.overlay_enabled,
                    "overlay_color": template.overlay_color,
                    "overlay_opacity": template.overlay_opacity,
                    "overlay_size": template.overlay_size,
                    "overlay_radius": template.overlay_radius,
                    "timestamp_enabled": template.timestamp_enabled,
                    "timestamp_format": template.timestamp_format,
                    "timestamp_position": template.timestamp_position,
                    "timestamp_size": template.timestamp_size,
                    "timestamp_color": template.timestamp_color,
                    "caption_template": template.caption_template,
                    "created_at": template.created_at.isoformat(),
                    "updated_at": template.updated_at.isoformat()
                })
            
            return jsonify({
                "ok": True,
                "data": result
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get('/posts/<int:account_id>')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def get_ig_posts(account_id: int):
    """獲取 Instagram 發布記錄"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        limit = min(int(request.args.get('limit', 50)), 100)
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查權限
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能查看自己學校的發布記錄"}), 403
            
            posts = InstagramService.get_posts_by_account(s, account_id, limit)
            
            return jsonify({
                "ok": True,
                "data": posts
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/posts/<int:post_id>/publish')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def publish_ig_post(post_id: int):
    """手動發布 Instagram 貼文"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查權限
            ig_post = s.query(InstagramPost).get(post_id)
            if not ig_post:
                return jsonify({"error": "發布記錄不存在"}), 404
            
            account = s.query(InstagramAccount).get(ig_post.account_id)
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能發布自己學校的貼文"}), 403
            
            # 執行發布
            result = InstagramService.publish_to_instagram(s, post_id)
            
            if result["success"]:
                return jsonify({
                    "ok": True,
                    "message": result["message"],
                    "ig_post_id": result.get("ig_post_id")
                })
            else:
                return jsonify({
                    "ok": False,
                    "error": result["error"]
                }), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/posts/<int:post_id>/retry')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def retry_ig_post(post_id: int):
    """重試發布失敗的 Instagram 貼文"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查權限
            ig_post = s.query(InstagramPost).get(post_id)
            if not ig_post:
                return jsonify({"error": "發布記錄不存在"}), 404
            
            if ig_post.status != "failed":
                return jsonify({"error": "只能重試失敗的發布記錄"}), 400
            
            account = s.query(InstagramAccount).get(ig_post.account_id)
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能重試自己學校的貼文"}), 403
            
            # 重置狀態
            ig_post.status = "draft"
            ig_post.error_code = None
            ig_post.error_message = None
            ig_post.retry_count += 1
            s.commit()
            
            # 執行發布
            result = InstagramService.publish_to_instagram(s, post_id)
            
            if result["success"]:
                return jsonify({
                    "ok": True,
                    "message": "重試發布成功",
                    "ig_post_id": result.get("ig_post_id")
                })
            else:
                return jsonify({
                    "ok": False,
                    "error": result["error"]
                }), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/check-publish')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def check_publish_conditions():
    """檢查發布條件"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        data = request.get_json()
        
        account_id = data.get('account_id')
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查權限
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能檢查自己學校的發布條件"}), 403
            
            # 檢查發布條件
            result = InstagramService.check_publishing_conditions(s, account_id)
            
            return jsonify({
                "ok": True,
                "data": result
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/create-post')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def create_ig_post():
    """手動創建 Instagram 發布任務"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        data = request.get_json()
        
        account_id = data.get('account_id')
        template_id = data.get('template_id')
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查權限
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能為自己學校創建發布任務"}), 403
            
            # 檢查發布條件
            conditions = InstagramService.check_publishing_conditions(s, account_id)
            
            if not conditions["should_publish"]:
                return jsonify({
                    "ok": False,
                    "error": conditions["reason"]
                }), 400
            
            posts = conditions.get("posts", [])
            if not posts:
                return jsonify({
                    "ok": False,
                    "error": "沒有可發布的貼文"
                }), 400
            
            # 創建發布任務
            result = InstagramService.create_instagram_post(s, account_id, posts, template_id)
            
            if result["success"]:
                return jsonify({
                    "ok": True,
                    "post_id": result["post_id"],
                    "message": result["message"]
                })
            else:
                return jsonify({
                    "ok": False,
                    "error": result["error"]
                }), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/templates/<int:account_id>')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def create_template(account_id: int):
    """創建 Instagram 模板"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        data = request.get_json()
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查權限
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能為自己學校創建模板"}), 403
            
            # 創建模板
            template = InstagramTemplate(
                account_id=account_id,
                name=data.get('name', '新模板'),
                is_default=data.get('is_default', False),
                layout=data.get('layout', {}),
                text_font=data.get('text_font', 'Arial'),
                text_size=data.get('text_size', 24),
                text_color=data.get('text_color', '#000000'),
                text_position=data.get('text_position', 'center'),
                logo_enabled=data.get('logo_enabled', True),
                logo_position=data.get('logo_position', 'top-right'),
                logo_size=data.get('logo_size', 100),
                background_type=data.get('background_type', 'color'),
                background_color=data.get('background_color', '#FFFFFF'),
                background_image=data.get('background_image'),
                overlay_enabled=data.get('overlay_enabled', True),
                overlay_color=data.get('overlay_color', '#FFFFFF'),
                overlay_opacity=data.get('overlay_opacity', 80),
                overlay_size=data.get('overlay_size', {"width": 0.8, "height": 0.6}),
                overlay_radius=data.get('overlay_radius', 20),
                timestamp_enabled=data.get('timestamp_enabled', True),
                timestamp_format=data.get('timestamp_format', 'YYYY/MM/DD HH:mm'),
                timestamp_position=data.get('timestamp_position', 'bottom-left'),
                timestamp_size=data.get('timestamp_size', 16),
                timestamp_color=data.get('timestamp_color', '#666666'),
                caption_template=data.get('caption_template', '📚 {school_name}\n\n{post_title}\n\n👤 作者：{author_name}\n📅 發布時間：{post_time}\n\n#校園生活 #學生分享')
            )
            
            # 如果設為預設模板，取消其他模板的預設狀態
            if template.is_default:
                s.query(InstagramTemplate).filter(
                    InstagramTemplate.account_id == account_id,
                    InstagramTemplate.is_default == True
                ).update({"is_default": False})
            
            s.add(template)
            s.commit()
            
            return jsonify({
                "ok": True,
                "template_id": template.id,
                "message": "模板創建成功"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.put('/templates/<int:template_id>')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def update_template(template_id: int):
    """更新 Instagram 模板"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        data = request.get_json()
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查模板是否存在
            template = s.query(InstagramTemplate).get(template_id)
            if not template:
                return jsonify({"error": "模板不存在"}), 404
            
            # 檢查權限
            account = s.query(InstagramAccount).get(template.account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能編輯自己學校的模板"}), 403
            
            # 更新模板
            if 'name' in data:
                template.name = data['name']
            if 'is_default' in data:
                template.is_default = data['is_default']
                # 如果設為預設模板，取消其他模板的預設狀態
                if template.is_default:
                    s.query(InstagramTemplate).filter(
                        InstagramTemplate.account_id == template.account_id,
                        InstagramTemplate.id != template_id,
                        InstagramTemplate.is_default == True
                    ).update({"is_default": False})
            if 'layout' in data:
                template.layout = data['layout']
            if 'text_font' in data:
                template.text_font = data['text_font']
            if 'text_size' in data:
                template.text_size = data['text_size']
            if 'text_color' in data:
                template.text_color = data['text_color']
            if 'text_position' in data:
                template.text_position = data['text_position']
            if 'logo_enabled' in data:
                template.logo_enabled = data['logo_enabled']
            if 'logo_position' in data:
                template.logo_position = data['logo_position']
            if 'logo_size' in data:
                template.logo_size = data['logo_size']
            if 'background_type' in data:
                template.background_type = data['background_type']
            if 'background_color' in data:
                template.background_color = data['background_color']
            if 'background_image' in data:
                template.background_image = data['background_image']
            if 'overlay_enabled' in data:
                template.overlay_enabled = data['overlay_enabled']
            if 'overlay_color' in data:
                template.overlay_color = data['overlay_color']
            if 'overlay_opacity' in data:
                template.overlay_opacity = data['overlay_opacity']
            if 'overlay_size' in data:
                template.overlay_size = data['overlay_size']
            if 'overlay_radius' in data:
                template.overlay_radius = data['overlay_radius']
            if 'timestamp_enabled' in data:
                template.timestamp_enabled = data['timestamp_enabled']
            if 'timestamp_format' in data:
                template.timestamp_format = data['timestamp_format']
            if 'timestamp_position' in data:
                template.timestamp_position = data['timestamp_position']
            if 'timestamp_size' in data:
                template.timestamp_size = data['timestamp_size']
            if 'timestamp_color' in data:
                template.timestamp_color = data['timestamp_color']
            if 'caption_template' in data:
                template.caption_template = data['caption_template']
            
            s.commit()
            
            return jsonify({
                "ok": True,
                "message": "模板更新成功"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete('/templates/<int:template_id>')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def delete_template(template_id: int):
    """刪除 Instagram 模板"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查模板是否存在
            template = s.query(InstagramTemplate).get(template_id)
            if not template:
                return jsonify({"error": "模板不存在"}), 404
            
            # 檢查權限
            account = s.query(InstagramAccount).get(template.account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能刪除自己學校的模板"}), 403
            
            # 檢查是否為預設模板
            if template.is_default:
                return jsonify({"error": "無法刪除預設模板"}), 400
            
            # 刪除模板
            s.delete(template)
            s.commit()
            
            return jsonify({
                "ok": True,
                "message": "模板刪除成功"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/templates/<int:template_id>/set-default')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def set_default_template(template_id: int):
    """設為預設模板"""
    try:
        user_id = get_jwt_identity()
        role = get_role()
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "用戶不存在"}), 401
            
            # 檢查模板是否存在
            template = s.query(InstagramTemplate).get(template_id)
            if not template:
                return jsonify({"error": "模板不存在"}), 404
            
            # 檢查權限
            account = s.query(InstagramAccount).get(template.account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            if role == 'campus_admin':
                if not user.school_id or account.school_id != user.school_id:
                    return jsonify({"error": "只能設置自己學校的預設模板"}), 403
            
            # 取消其他模板的預設狀態
            s.query(InstagramTemplate).filter(
                InstagramTemplate.account_id == template.account_id,
                InstagramTemplate.is_default == True
            ).update({"is_default": False})
            
            # 設為預設模板
            template.is_default = True
            s.commit()
            
            return jsonify({
                "ok": True,
                "message": "預設模板設置成功"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500
