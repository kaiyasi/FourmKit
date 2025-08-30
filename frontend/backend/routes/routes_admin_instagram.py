"""
管理後台 Instagram 整合 API 路由
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from datetime import datetime, timezone, timedelta
from sqlalchemy import and_

from utils.db import get_session
from utils.auth import require_role
from models import School, InstagramAccount, InstagramSetting, InstagramPost, InstagramTemplate
from services.instagram_service import InstagramService

bp = Blueprint('admin_instagram', __name__, url_prefix='/api/admin/instagram')


@bp.get('/accounts')
@jwt_required()
@require_role('dev_admin')
def get_instagram_accounts():
    """獲取所有 Instagram 帳號（僅 dev_admin）"""
    try:
        with get_session() as s:
            accounts = s.query(InstagramAccount).filter(
                InstagramAccount.is_active == True
            ).all()
            
            result = []
            for account in accounts:
                settings = s.query(InstagramSetting).filter(
                    InstagramSetting.account_id == account.id
                ).first()
                
                # 統計今日發布數量
                today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
                today_posts = s.query(InstagramPost).filter(
                    and_(
                        InstagramPost.account_id == account.id,
                        InstagramPost.created_at >= today_start,
                        InstagramPost.status == "published"
                    )
                ).count()
                
                result.append({
                    "id": account.id,
                    "account_name": account.account_name,
                    "school_name": account.school.name if account.school else "跨校",
                    "school_id": account.school_id,
                    "ig_user_id": account.ig_user_id,
                    "page_id": account.page_id,
                    "enabled": settings.enabled if settings else False,
                    "post_interval_count": settings.post_interval_count if settings else 10,
                    "post_interval_hours": settings.post_interval_hours if settings else 6,
                    "daily_limit": settings.daily_limit if settings else 50,
                    "today_posts": today_posts,
                    "token_expires_at": account.expires_at.isoformat(),
                    "is_token_valid": account.expires_at > datetime.now(timezone.utc),
                    "created_at": account.created_at.isoformat()
                })
            
            return jsonify({
                "ok": True,
                "data": result
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/accounts')
@jwt_required()
@require_role('dev_admin')
def create_instagram_account():
    """創建 Instagram 帳號（僅 dev_admin）"""
    try:
        data = request.get_json()
        
        school_id_raw = data.get('school_id')  # null 表示總平台帳號
        school_id = None if school_id_raw == '0' or school_id_raw == 0 else school_id_raw
        ig_user_id = data.get('ig_user_id')
        account_name = data.get('account_name')
        access_token = data.get('access_token')
        
        if not all([ig_user_id, account_name, access_token]):
            return jsonify({"error": "缺少必要參數"}), 400
        
        with get_session() as s:
            # 檢查學校是否存在
            if school_id:
                school = s.query(School).get(school_id)
                if not school:
                    return jsonify({"error": "學校不存在"}), 404
            
            # 創建帳號
            result = InstagramService.create_account(
                session=s,
                school_id=school_id,
                ig_user_id=ig_user_id,
                account_name=account_name,
                access_token=access_token
            )
            
            if result["success"]:
                return jsonify({
                    "ok": True,
                    "account_id": result["account_id"],
                    "message": result["message"]
                })
            else:
                return jsonify({
                    "ok": False,
                    "error": result["error"]
                }), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.patch('/accounts/<int:account_id>')
@jwt_required()
@require_role('dev_admin')
def update_instagram_account(account_id: int):
    """更新 Instagram 帳號（僅 dev_admin）"""
    try:
        data = request.get_json()
        
        with get_session() as s:
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            # 更新欄位
            if 'account_name' in data:
                account.account_name = data['account_name']
            if 'ig_user_id' in data:
                account.ig_user_id = data['ig_user_id']
            if 'school_id' in data:
                school_id_raw = data['school_id']
                account.school_id = None if school_id_raw == '0' or school_id_raw == 0 else school_id_raw
            if 'is_active' in data:
                account.is_active = data['is_active']
            if 'access_token' in data:
                from utils.crypto import encrypt_data
                account.token_encrypted = encrypt_data(data['access_token'])
                account.expires_at = datetime.now(timezone.utc) + timedelta(days=60)
            
            account.updated_at = datetime.now(timezone.utc)
            s.commit()
            
            return jsonify({
                "ok": True,
                "message": "帳號更新成功"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/accounts/<int:account_id>/refresh-token')
@jwt_required()
@require_role('dev_admin')
def refresh_instagram_token(account_id: int):
    """刷新 Instagram 存取權杖（僅 dev_admin）"""
    try:
        with get_session() as s:
            # 檢查帳號是否存在
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            # 檢查權杖是否已過期
            if account.expires_at <= datetime.now(timezone.utc):
                return jsonify({"error": "權杖已過期，無法刷新"}), 400
            
            success = InstagramService.refresh_token(s, account_id)
            
            if success:
                return jsonify({
                    "ok": True,
                    "message": "權杖刷新成功"
                })
            else:
                return jsonify({
                    "ok": False,
                    "error": "權杖刷新失敗，請檢查 Facebook App 設定或權杖是否有效"
                }), 400
            
    except Exception as e:
        return jsonify({"error": f"權杖刷新失敗: {str(e)}"}), 500


@bp.delete('/accounts/<int:account_id>')
@jwt_required()
@require_role('dev_admin')
def delete_instagram_account(account_id: int):
    """刪除 Instagram 帳號（僅 dev_admin）"""
    try:
        with get_session() as s:
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            # 檢查是否有相關的發布記錄
            posts_count = s.query(InstagramPost).filter(
                InstagramPost.account_id == account_id
            ).count()
            
            if posts_count > 0:
                return jsonify({
                    "error": f"無法刪除：此帳號有 {posts_count} 筆發布記錄，請先清理相關記錄"
                }), 400
            
            # 刪除帳號（會自動刪除相關的設定和模板）
            s.delete(account)
            s.commit()
            
            return jsonify({
                "ok": True,
                "message": "帳號刪除成功"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get('/posts')
@jwt_required()
@require_role('dev_admin')
def get_all_ig_posts():
    """獲取所有 Instagram 發布記錄（僅 dev_admin）"""
    try:
        limit = min(int(request.args.get('limit', 50)), 100)
        account_id = request.args.get('account_id')
        status = request.args.get('status')
        
        with get_session() as s:
            query = s.query(InstagramPost)
            
            if account_id:
                query = query.filter(InstagramPost.account_id == account_id)
            
            if status:
                query = query.filter(InstagramPost.status == status)
            
            posts = query.order_by(InstagramPost.created_at.desc()).limit(limit).all()
            
            result = []
            for post in posts:
                account = s.query(InstagramAccount).get(post.account_id)
                result.append({
                    "id": post.id,
                    "account_name": account.account_name if account else "未知帳號",
                    "school_name": account.school.name if account and account.school else "跨校",
                    "status": post.status,
                    "caption": post.caption,
                    "image_path": post.image_path,
                    "ig_post_id": post.ig_post_id,
                    "error_message": post.error_message,
                    "retry_count": post.retry_count,
                    "published_at": post.published_at.isoformat() if post.published_at else None,
                    "created_at": post.created_at.isoformat(),
                    "forum_posts_count": len(post.forum_post_ids)
                })
            
            return jsonify({
                "ok": True,
                "data": result
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get('/stats')
@jwt_required()
@require_role('dev_admin')
def get_instagram_stats():
    """獲取 Instagram 統計資料（僅 dev_admin）"""
    try:
        with get_session() as s:
            # 總帳號數
            total_accounts = s.query(InstagramAccount).filter(
                InstagramAccount.is_active == True
            ).count()
            
            # 今日發布總數
            today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            today_posts = s.query(InstagramPost).filter(
                and_(
                    InstagramPost.created_at >= today_start,
                    InstagramPost.status == "published"
                )
            ).count()
            
            # 本月發布總數
            month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            month_posts = s.query(InstagramPost).filter(
                and_(
                    InstagramPost.created_at >= month_start,
                    InstagramPost.status == "published"
                )
            ).count()
            
            # 失敗發布數
            failed_posts = s.query(InstagramPost).filter(
                InstagramPost.status == "failed"
            ).count()
            
            # 各狀態統計
            status_stats = {}
            for status in ['draft', 'queued', 'publishing', 'published', 'failed']:
                count = s.query(InstagramPost).filter(
                    InstagramPost.status == status
                ).count()
                status_stats[status] = count
            
            return jsonify({
                "ok": True,
                "data": {
                    "total_accounts": total_accounts,
                    "today_posts": today_posts,
                    "month_posts": month_posts,
                    "failed_posts": failed_posts,
                    "status_stats": status_stats
                }
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/posts/<int:post_id>/force-publish')
@jwt_required()
@require_role('dev_admin')
def force_publish_ig_post(post_id: int):
    """強制發布 Instagram 貼文（僅 dev_admin）"""
    try:
        with get_session() as s:
            ig_post = s.query(InstagramPost).get(post_id)
            if not ig_post:
                return jsonify({"error": "發布記錄不存在"}), 404
            
            # 強制重置狀態
            ig_post.status = "draft"
            ig_post.error_code = None
            ig_post.error_message = None
            s.commit()
            
            # 執行發布
            result = InstagramService.publish_to_instagram(s, post_id)
            
            if result["success"]:
                return jsonify({
                    "ok": True,
                    "message": "強制發布成功",
                    "ig_post_id": result.get("ig_post_id")
                })
            else:
                return jsonify({
                    "ok": False,
                    "error": result["error"]
                }), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete('/posts/<int:post_id>')
@jwt_required()
@require_role('dev_admin')
def delete_ig_post(post_id: int):
    """刪除 Instagram 發布記錄（僅 dev_admin）"""
    try:
        with get_session() as s:
            ig_post = s.query(InstagramPost).get(post_id)
            if not ig_post:
                return jsonify({"error": "發布記錄不存在"}), 404
            
            # 刪除相關圖片檔案
            if ig_post.image_path:
                import os
                from utils.fsops import UPLOAD_ROOT
                image_path = os.path.join(UPLOAD_ROOT, ig_post.image_path)
                if os.path.exists(image_path):
                    os.remove(image_path)
            
            # 刪除記錄
            s.delete(ig_post)
            s.commit()
            
            return jsonify({
                "ok": True,
                "message": "發布記錄刪除成功"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post('/auto-publish')
@jwt_required()
@require_role('dev_admin')
def trigger_auto_publish():
    """觸發自動發布檢查（僅 dev_admin）"""
    try:
        data = request.get_json()
        account_id = data.get('account_id')
        
        with get_session() as s:
            if account_id:
                # 檢查特定帳號
                conditions = InstagramService.check_publishing_conditions(s, account_id)
                
                if conditions["should_publish"]:
                    posts = conditions.get("posts", [])
                    result = InstagramService.create_instagram_post(s, account_id, posts)
                    
                    if result["success"]:
                        # 立即發布
                        publish_result = InstagramService.publish_to_instagram(s, result["post_id"])
                        
                        if publish_result["success"]:
                            return jsonify({
                                "ok": True,
                                "message": "自動發布成功",
                                "ig_post_id": publish_result.get("ig_post_id")
                            })
                        else:
                            return jsonify({
                                "ok": False,
                                "error": f"發布失敗: {publish_result['error']}"
                            }), 400
                    else:
                        return jsonify({
                            "ok": False,
                            "error": f"創建發布任務失敗: {result['error']}"
                        }), 400
                else:
                    return jsonify({
                        "ok": False,
                        "error": conditions["reason"]
                    }), 400
            else:
                # 檢查所有帳號
                accounts = s.query(InstagramAccount).filter(
                    InstagramAccount.is_active == True
                ).all()
                
                published_count = 0
                errors = []
                
                for account in accounts:
                    try:
                        conditions = InstagramService.check_publishing_conditions(s, account.id)
                        
                        if conditions["should_publish"]:
                            posts = conditions.get("posts", [])
                            result = InstagramService.create_instagram_post(s, account.id, posts)
                            
                            if result["success"]:
                                publish_result = InstagramService.publish_to_instagram(s, result["post_id"])
                                
                                if publish_result["success"]:
                                    published_count += 1
                                else:
                                    errors.append(f"帳號 {account.account_name}: {publish_result['error']}")
                            else:
                                errors.append(f"帳號 {account.account_name}: {result['error']}")
                    except Exception as e:
                        errors.append(f"帳號 {account.account_name}: {str(e)}")
                
                return jsonify({
                    "ok": True,
                    "message": f"自動發布完成，成功發布 {published_count} 篇",
                    "published_count": published_count,
                    "errors": errors
                })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ===================
# 模板管理 API
# ===================

@bp.get('/templates/<int:account_id>')
@jwt_required()
@require_role('dev_admin')
def get_templates(account_id: int):
    """獲取指定帳號的模板列表"""
    try:
        with get_session() as s:
            # 檢查帳號是否存在
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            templates = s.query(InstagramTemplate).filter(
                InstagramTemplate.account_id == account_id
            ).order_by(InstagramTemplate.is_default.desc(), InstagramTemplate.created_at.desc()).all()
            
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


@bp.post('/templates/<int:account_id>')
@jwt_required()
@require_role('dev_admin')
def create_template(account_id: int):
    """創建模板"""
    try:
        data = request.get_json()
        
        with get_session() as s:
            # 檢查帳號是否存在
            account = s.query(InstagramAccount).get(account_id)
            if not account:
                return jsonify({"error": "帳號不存在"}), 404
            
            # 如果設為預設，先取消其他模板的預設狀態
            if data.get('is_default', False):
                s.query(InstagramTemplate).filter(
                    InstagramTemplate.account_id == account_id,
                    InstagramTemplate.is_default == True
                ).update({"is_default": False})
            
            # 處理新的模板結構
            template_data = _process_template_data(data)
            
            # 創建模板
            template = InstagramTemplate(
                account_id=account_id,
                name=template_data['name'],
                is_default=template_data.get('is_default', False),
                layout=template_data['layout'],
                # 向下相容的欄位（從新結構提取）
                text_font=template_data['layout']['content_block']['google_font'],
                text_size=template_data['layout']['content_block']['font_size'],
                text_color=template_data['layout']['content_block']['color'],
                text_position=template_data['layout']['content_block']['align_horizontal'],
                logo_enabled=template_data['layout']['logo']['enabled'],
                logo_position=f"{template_data['layout']['logo']['align_vertical']}-{template_data['layout']['logo']['align_horizontal']}",
                logo_size=template_data['layout']['logo']['size'],
                background_type=template_data['background']['type'],
                background_color=template_data['background']['color'],
                background_image=template_data['background'].get('image', ''),
                overlay_enabled=template_data['background']['overlay_enabled'],
                overlay_color=template_data['background']['overlay_color'],
                overlay_opacity=template_data['background']['overlay_opacity'],
                overlay_size=template_data['background']['overlay_size'],
                overlay_radius=template_data['background']['overlay_radius'],
                timestamp_enabled=template_data['layout']['timestamp']['enabled'],
                timestamp_format=template_data['layout']['timestamp']['format'],
                timestamp_position=f"{template_data['layout']['timestamp']['align_vertical']}-{template_data['layout']['timestamp']['align_horizontal']}",
                timestamp_size=template_data['layout']['timestamp']['font_size'],
                timestamp_color=template_data['layout']['timestamp']['color'],
                caption_template=template_data['caption_template']
            )
            
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
@require_role('dev_admin')
def update_template(template_id: int):
    """更新模板"""
    try:
        data = request.get_json()
        
        with get_session() as s:
            template = s.query(InstagramTemplate).get(template_id)
            if not template:
                return jsonify({"error": "模板不存在"}), 404
            
            # 如果設為預設，先取消其他模板的預設狀態
            if data.get('is_default', False) and not template.is_default:
                s.query(InstagramTemplate).filter(
                    InstagramTemplate.account_id == template.account_id,
                    InstagramTemplate.is_default == True
                ).update({"is_default": False})
            
            # 處理新的模板結構
            template_data = _process_template_data(data)
            
            # 更新模板
            template.name = template_data['name']
            template.is_default = template_data.get('is_default', False)
            template.layout = template_data['layout']
            # 更新向下相容的欄位
            template.text_font = template_data['layout']['content_block']['google_font']
            template.text_size = template_data['layout']['content_block']['font_size']
            template.text_color = template_data['layout']['content_block']['color']
            template.text_position = template_data['layout']['content_block']['align_horizontal']
            template.logo_enabled = template_data['layout']['logo']['enabled']
            template.logo_position = f"{template_data['layout']['logo']['align_vertical']}-{template_data['layout']['logo']['align_horizontal']}"
            template.logo_size = template_data['layout']['logo']['size']
            template.background_type = template_data['background']['type']
            template.background_color = template_data['background']['color']
            template.background_image = template_data['background'].get('image', '')
            template.overlay_enabled = template_data['background']['overlay_enabled']
            template.overlay_color = template_data['background']['overlay_color']
            template.overlay_opacity = template_data['background']['overlay_opacity']
            template.overlay_size = template_data['background']['overlay_size']
            template.overlay_radius = template_data['background']['overlay_radius']
            template.timestamp_enabled = template_data['layout']['timestamp']['enabled']
            template.timestamp_format = template_data['layout']['timestamp']['format']
            template.timestamp_position = f"{template_data['layout']['timestamp']['align_vertical']}-{template_data['layout']['timestamp']['align_horizontal']}"
            template.timestamp_size = template_data['layout']['timestamp']['font_size']
            template.timestamp_color = template_data['layout']['timestamp']['color']
            template.caption_template = template_data['caption_template']
            template.updated_at = datetime.now(timezone.utc)
            
            s.commit()
            
            return jsonify({
                "ok": True,
                "message": "模板更新成功"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete('/templates/<int:template_id>')
@jwt_required()
@require_role('dev_admin')
def delete_template(template_id: int):
    """刪除模板"""
    try:
        with get_session() as s:
            template = s.query(InstagramTemplate).get(template_id)
            if not template:
                return jsonify({"error": "模板不存在"}), 404
            
            if template.is_default:
                return jsonify({"error": "無法刪除預設模板"}), 400
            
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
@require_role('dev_admin')
def set_default_template(template_id: int):
    """設為預設模板"""
    try:
        with get_session() as s:
            template = s.query(InstagramTemplate).get(template_id)
            if not template:
                return jsonify({"error": "模板不存在"}), 404
            
            # 取消其他模板的預設狀態
            s.query(InstagramTemplate).filter(
                InstagramTemplate.account_id == template.account_id,
                InstagramTemplate.is_default == True
            ).update({"is_default": False})
            
            # 設為預設
            template.is_default = True
            template.updated_at = datetime.now(timezone.utc)
            s.commit()
            
            return jsonify({
                "ok": True,
                "message": "已設為預設模板"
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _process_template_data(data):
    """處理模板資料，轉換前端格式到後端格式"""
    # 處理新的結構化資料
    layout = {
        'article_number': data.get('article_number', {
            'enabled': True,
            'x': 0.05,
            'y': 0.1,
            'align_horizontal': 'left',
            'align_vertical': 'top',
            'font_size': 24,
            'font_weight': '600',
            'color': '#333333',
            'google_font': 'Noto Sans TC'
        }),
        'content_block': data.get('content_block', {
            'x': 0.5,
            'y': 0.5,
            'align_horizontal': 'center',
            'align_vertical': 'middle',
            'font_size': 28,
            'font_weight': '400',
            'color': '#000000',
            'google_font': 'Noto Sans TC',
            'max_lines': 4
        }),
        'timestamp': data.get('timestamp', {
            'enabled': True,
            'x': 0.05,
            'y': 0.95,
            'align_horizontal': 'left',
            'align_vertical': 'bottom',
            'font_size': 16,
            'font_weight': '300',
            'color': '#666666',
            'google_font': 'Noto Sans TC',
            'format': 'YYYY/MM/DD HH:mm'
        }),
        'logo': data.get('logo', {
            'enabled': True,
            'x': 0.9,
            'y': 0.1,
            'align_horizontal': 'right',
            'align_vertical': 'top',
            'size': 100,
            'opacity': 0.9
        })
    }
    
    background = data.get('background', {
        'type': 'color',
        'color': '#FFFFFF',
        'image': '',
        'overlay_enabled': True,
        'overlay_color': '#FFFFFF',
        'overlay_opacity': 80,
        'overlay_size': {'width': 0.8, 'height': 0.6},
        'overlay_radius': 20
    })
    
    return {
        'name': data.get('name', ''),
        'is_default': data.get('is_default', False),
        'layout': layout,
        'background': background,
        'caption_template': data.get('caption_template', '📚 {school_name}\n\n{post_title}\n\n👤 作者：{author_name}\n📅 發布時間：{post_time}\n\n#校園生活 #學生分享')
    }
