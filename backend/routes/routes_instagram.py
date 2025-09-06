# backend/routes/routes_instagram.py
"""
Instagram 整合系統的 API 路由
提供帳號管理、模板設定、發文管理等功能
"""
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
import json
import traceback

from utils.db import get_session
from utils.authz import require_role
from models.instagram import (
    IGAccount, IGTemplate, IGPost, SchoolLogo, IGSettings,
    IGAccountStatus, PublishMode, PostStatus
)
from models.base import User, Post as ForumPost
from models.school import School
from services.instagram_api_service import InstagramAPIService, InstagramAPIError
from services.instagram_tasks import process_post_for_instagram, sync_approved_posts
from services.instagram_tasks import publish_carousel_for_account
from services.maintenance_tasks import retry_failed_posts
try:
    from services.html_renderer import HtmlRenderer, HtmlRenderError
    from services.html_builder import build_post_html
except Exception:
    HtmlRenderer = None  # type: ignore
    HtmlRenderError = Exception  # type: ignore
    build_post_html = None  # type: ignore

bp = Blueprint('instagram', __name__, url_prefix='/api/instagram')

# 健康檢查（方便前端/人類排查是否已掛載）
@bp.route('/_health', methods=['GET'])
def instagram_health():
    try:
        return jsonify({"success": True, "message": "instagram routes mounted"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ================================
# 帳號管理 API
# ================================

@bp.route('/validate-token', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def validate_token():
    """驗證 Facebook Access Token 並獲取可用的 Instagram 帳號"""
    try:
        data = request.get_json()
        access_token = data.get('access_token')
        
        if not access_token:
            return jsonify({
                "success": False,
                "error": "缺少 Access Token"
            }), 400
        
        # 使用 Instagram API 服務驗證 token
        ig_api = InstagramAPIService()
        try:
            validation_result = ig_api.validate_token(access_token)
            
            if not validation_result['valid']:
                return jsonify({
                    "success": False,
                    "error": "Access Token 無效"
                }), 400
            
            # 取得 Instagram 帳號列表
            ig_accounts = validation_result.get('ig_accounts', [])
            
            # 格式化帳號資訊供前端使用
            formatted_accounts = []
            for page in ig_accounts:
                ig_account = page.get('instagram_business_account')
                if ig_account:
                    formatted_accounts.append({
                        'id': ig_account['id'],
                        'username': ig_account['username'],
                        'name': page['name'],
                        'profile_picture_url': ig_account.get('profile_picture_url', ''),
                        'media_count': ig_account.get('media_count', 0),
                        'page_id': page['id'],
                        'page_name': page['name']
                    })
            
            return jsonify({
                "success": True,
                "ig_accounts": formatted_accounts,
                "token_info": {
                    "expires_at": validation_result.get('token_expires_at')
                }
            })
            
        except InstagramAPIError as e:
            return jsonify({
                "success": False,
                "error": f"Instagram API 錯誤: {e.message}"
            }), 400
        
    except Exception as e:
        print(f"Validate token error: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "伺服器錯誤，請稍後再試"
        }), 500

@bp.route('/accounts', methods=['GET'])
@jwt_required()
@require_role("admin", "dev_admin")
def list_accounts():
    """獲取 Instagram 帳號列表"""
    try:
        with get_session() as db:
            query = db.query(IGAccount).join(User, IGAccount.created_by == User.id)
            
            # 篩選條件
            school_id = request.args.get('school_id', type=int)
            status = request.args.get('status')
            
            if school_id:
                query = query.filter(IGAccount.school_id == school_id)
            
            if status:
                query = query.filter(IGAccount.status == status)
            
            accounts = query.all()
            
            result = []
            for account in accounts:
                result.append({
                    "id": account.id,
                    "ig_username": account.ig_username,
                    "display_name": account.display_name,
                    "status": account.status,
                    "publish_mode": account.publish_mode,
                    "school_id": account.school_id,
                    "school_name": account.school.name if account.school else None,
                    "total_posts": account.total_posts,
                    "last_post_at": account.last_post_at.isoformat() if account.last_post_at else None,
                    "created_at": account.created_at.isoformat(),
                    "creator_name": account.creator.username
                })
            
            return jsonify({
                "success": True,
                "data": result,
                "total": len(result)
            })
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@bp.route('/accounts', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def create_account():
    """創建新的 Instagram 帳號"""
    try:
        data = request.get_json()
        current_user_id = get_jwt_identity()
        
        # 驗證必要欄位
        required_fields = ['access_token', 'ig_account_id', 'display_name']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    "success": False,
                    "error": f"缺少必要欄位: {field}"
                }), 400
        
        with get_session() as db:
            # 檢查帳號是否已存在
            existing_account = db.query(IGAccount).filter(
                IGAccount.ig_user_id == data['ig_account_id']
            ).first()
            
            if existing_account:
                return jsonify({
                    "success": False,
                    "error": f"Instagram 帳號 ID {data['ig_account_id']} 已經存在"
                }), 400
            
            # 創建帳號記錄（簡化版：只記錄核心欄位）
            new_account = IGAccount(
                ig_user_id=data['ig_account_id'],
                display_name=data['display_name'],
                page_token=data['access_token'],
                # 設定必要的預設值
                ig_username=f"user_{data['ig_account_id'][-8:]}",
                page_id=data['ig_account_id'],  
                page_name=f"Page_{data['ig_account_id'][-8:]}",
                status=IGAccountStatus.active,
                description=data.get('description', ''),
                publish_mode=PublishMode.immediate,
                created_by=current_user_id
            )
            
            db.add(new_account)
            db.commit()
            db.refresh(new_account)
            
            # 創建預設模板
            default_template = IGTemplate(
                account_id=new_account.id,
                name="預設模板",
                description="系統預設的貼文模板",
                template_data={
                        "renderer": "html",
                        "background": {
                            "type": "color",
                            "color": "#FFFFFF"
                        },
                        "content_block": {
                            "enabled": True,
                            "font_family": "chinese",
                            "font_size": 28,
                            "color": "#000000",
                            "align": "left",
                            "max_lines": 15,
                            "font_css_url": "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap"
                        },
                        "logo": {
                            "enabled": True,
                            "size": 80,
                            "shape": "circle",
                            "position": {
                                "x": 0.9,
                                "y": 0.1
                            }
                        },
                        "timestamp": {
                            "enabled": True,
                            "format": "%Y-%m-%d %H:%M",
                            "font_size": 16,
                            "color": "#666666",
                            "position": {
                                "x": 0.1,
                                "y": 0.9
                            }
                        }
                    },
                    is_active=True,
                    is_default=True,
                    created_by=current_user_id
            )
            
            db.add(default_template)
            db.commit()
            
            return jsonify({
                "success": True,
                "data": {
                    "id": new_account.id,
                    "ig_username": new_account.ig_username,
                    "display_name": new_account.display_name,
                    "status": new_account.status,
                    "template_id": default_template.id
                }
            }), 201
                
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/accounts/<int:account_id>/publish-carousel', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def publish_carousel(account_id: int):
    """
    將多則待發貼文合併為一則輪播發布。
    body: { max_items?:int(<=10), caption_mode?: 'first_title'|'join_titles'|'custom', custom_caption?: str, dry_run?: bool, async?: bool }
    """
    try:
        data = request.get_json() or {}
        max_items = int(data.get('max_items', 5))
        caption_mode = data.get('caption_mode', 'first_title')
        custom_caption = data.get('custom_caption')
        dry_run = bool(data.get('dry_run', False))
        use_async = bool(data.get('async', not dry_run))

        # 確認帳號存在與狀態
        with get_session() as db:
            acc = db.query(IGAccount).filter(IGAccount.id == account_id).first()
            if not acc:
                return jsonify({"success": False, "error": "帳號不存在"}), 404
            if acc.status != 'active':
                return jsonify({"success": False, "error": f"帳號狀態異常: {acc.status}"}), 400

        if dry_run or not use_async:
            # 同步執行（不經 broker）
            res = publish_carousel_for_account.apply(args=[account_id, max_items, caption_mode, custom_caption, dry_run]).get()
            http_status = 200 if res.get('success') else 400
            return jsonify(res), http_status
        else:
            # 非阻塞排程
            task = publish_carousel_for_account.delay(account_id, max_items, caption_mode, custom_caption, False)
            return jsonify({
                "success": True,
                "message": "已提交輪播發布任務",
                "task_id": getattr(task, 'id', None),
                "account_id": account_id,
                "max_items": max_items,
                "caption_mode": caption_mode
            }), 202

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

# ================================
# 預覽 API（所見即所發）
# ================================

@bp.route('/preview', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def preview_generate():
    try:
        data = request.get_json() or {}
        template_id = data.get('template_id')
        template_data = data.get('template_data') or None
        forum_post_id = data.get('forum_post_id')
        content = data.get('content')

        with get_session() as db:
            tmpl = None
            account = None
            effective_logo_path = None
            if template_id:
                tmpl = db.query(IGTemplate).filter(IGTemplate.id == int(template_id)).first()
                if not tmpl:
                    return jsonify({"success": False, "error": "模板不存在"}), 404
                template_data = template_data or tmpl.template_data
                # 嘗試找出帳號與校徽
                try:
                    account = db.query(IGAccount).filter(IGAccount.id == tmpl.account_id).first()
                    # 模板內的 logo 優先
                    try:
                        tmpl_logo = (template_data or {}).get('logo', {})
                        effective_logo_path = tmpl_logo.get('image_url') or None
                    except Exception:
                        effective_logo_path = None
                    if not effective_logo_path and account and account.school_id is not None:
                        school_logo = db.query(SchoolLogo).filter(
                            SchoolLogo.school_id == account.school_id,
                            SchoolLogo.is_active == True,
                            SchoolLogo.logo_type == 'primary'
                        ).first()
                        if school_logo:
                            effective_logo_path = school_logo.logo_url
                except Exception:
                    pass

            if not isinstance(template_data, dict):
                return jsonify({"success": False, "error": "缺少 template_data"}), 400

            # 準備內容：優先使用指定 forum_post_id；否則自動抓一篇核准貼文以即時預覽
            fp = None
            if forum_post_id:
                fp = db.query(ForumPost).filter(ForumPost.id == int(forum_post_id)).first()
                if not fp:
                    return jsonify({"success": False, "error": "論壇貼文不存在"}), 404
            elif not content:
                q = db.query(ForumPost).filter(ForumPost.status == 'approved', ForumPost.is_deleted == False)
                # 依帳號校別限制
                if account and account.school_id is not None:
                    q = q.filter(ForumPost.school_id == account.school_id)
                # 可選擇從請求帶入 school_id 限制
                req_school_id = request.args.get('school_id', type=int) or (request.get_json() or {}).get('school_id')
                if req_school_id is not None:
                    try:
                        q = q.filter(ForumPost.school_id == int(req_school_id))
                    except Exception:
                        pass
                fp = q.order_by(ForumPost.id.desc()).first()

            if fp:
                post_content = {
                    'id': fp.id,
                    'title': getattr(fp, 'title', ''),
                    'content': fp.content or content or '',
                    'school_name': getattr(fp, 'school_name', ''),
                    'created_at': fp.created_at,
                }
            else:
                from datetime import datetime, timezone
                post_content = {
                    'id': 0,
                    'title': '',
                    'content': content or '（預覽內容）這是一段示例文字，用於檢查字體與換行效果。',
                    'school_name': None,
                    'created_at': datetime.now(timezone.utc),
                }

            # 用 HTML 組版 + Playwright 產 JPEG
            if not (HtmlRenderer and build_post_html):
                return jsonify({"success": False, "error": "HTML 渲染器未就緒"}), 500
            html = build_post_html(template_data, post_content, effective_logo_path)

            # 取畫布尺寸（優先 IG_CANVAS_SIZE，預設 800x800）
            import os
            env_sz = os.getenv('IG_CANVAS_SIZE', '800x800').lower().strip()
            def _parse_sz(env_sz: str):
                try:
                    if 'x' in env_sz:
                        w, h = env_sz.split('x', 1)
                        return max(1, int(w)), max(1, int(h))
                    val = int(env_sz)
                    return val, val
                except Exception:
                    return None
            parsed = _parse_sz(env_sz)
            if parsed:
                W, H = parsed
            else:
                W, H = 800, 800

            renderer = HtmlRenderer(viewport_width=W, viewport_height=H)
            buf = renderer.render_html_to_image(html, width=W, height=H, image_type='jpeg', quality=92)

            # 儲存到公開目錄
            import os, time
            root_dir = os.getenv('UPLOAD_ROOT', 'uploads')
            out_dir = os.path.join(root_dir, 'public', 'instagram')
            os.makedirs(out_dir, exist_ok=True)
            filename = f"preview_{int(time.time()*1000)}.jpg"
            out_path = os.path.join(out_dir, filename)
            with open(out_path, 'wb') as f:
                f.write(buf.getvalue())

            # 對外 URL
            cdn_base = (os.getenv('PUBLIC_CDN_URL') or '').rstrip('/')
            base = (os.getenv('PUBLIC_BASE_URL') or '').rstrip('/')
            if cdn_base:
                image_url = f"{cdn_base}/instagram/{filename}"
            elif base:
                image_url = f"{base}/uploads/public/instagram/{filename}"
            else:
                image_url = f"/uploads/public/instagram/{filename}"

            return jsonify({
                'success': True,
                'image_url': image_url,
                'width': W,
                'height': H,
            })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@bp.route('/accounts/<int:account_id>', methods=['GET'])
@jwt_required()
@require_role("admin", "dev_admin")
def get_account(account_id: int):
    """獲取單一 Instagram 帳號詳情"""
    try:
        with get_session() as db:
            account = db.query(IGAccount).filter(IGAccount.id == account_id).first()
            
            if not account:
                return jsonify({
                    "success": False,
                    "error": "帳號不存在"
                }), 404
            
            # 獲取統計數據
            total_templates = db.query(IGTemplate).filter(IGTemplate.account_id == account_id).count()
            
            recent_posts = db.query(IGPost).filter(
                IGPost.account_id == account_id
            ).order_by(IGPost.created_at.desc()).limit(5).all()
            
            # 檢查帳號健康狀態
            try:
                ig_api = InstagramAPIService()
                health_check = ig_api.check_account_health(account.ig_user_id, account.page_token)
            except:
                health_check = {"status": "unknown", "error": "無法檢查狀態"}
            
            result = {
                "id": account.id,
                "ig_user_id": account.ig_user_id,
                "ig_username": account.ig_username,
                "page_id": account.page_id,
                "page_name": account.page_name,
                "display_name": account.display_name,
                "description": account.description,
                "profile_picture": account.profile_picture,
                "status": account.status,
                "publish_mode": account.publish_mode,
                "batch_threshold": account.batch_threshold,
                "auto_hashtags": account.auto_hashtags,
                "school_id": account.school_id,
                "school_name": account.school.name if account.school else None,
                "total_posts": account.total_posts,
                "total_templates": total_templates,
                "last_post_at": account.last_post_at.isoformat() if account.last_post_at else None,
                "created_at": account.created_at.isoformat(),
                "creator_name": account.creator.username,
                "health_status": health_check,
                "recent_posts": [
                    {
                        "id": post.id,
                        "status": post.status,
                        "created_at": post.created_at.isoformat(),
                        "published_at": post.published_at.isoformat() if post.published_at else None,
                        "ig_post_url": post.ig_post_url
                    } for post in recent_posts
                ]
            }
            
            return jsonify({
                "success": True,
                "data": result
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/accounts/<int:account_id>', methods=['PUT'])
@jwt_required()
@require_role("admin", "dev_admin")
def update_account(account_id: int):
    """更新 Instagram 帳號設定"""
    try:
        data = request.get_json()
        
        with get_session() as db:
            account = db.query(IGAccount).filter(IGAccount.id == account_id).first()
            
            if not account:
                return jsonify({
                    "success": False,
                    "error": "帳號不存在"
                }), 404
            
            # 更新允許的欄位
            updatable_fields = [
                'display_name', 'description', 'publish_mode', 
                'batch_threshold', 'auto_hashtags', 'school_id'
            ]
            
            for field in updatable_fields:
                if field in data:
                    setattr(account, field, data[field])
            
            account.updated_at = datetime.now(timezone.utc)
            
            db.commit()
            
            return jsonify({
                "success": True,
                "message": "帳號設定已更新"
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ================================
# 模板管理 API
# ================================

@bp.route('/accounts/<int:account_id>/templates', methods=['GET'])
@jwt_required()
@require_role("admin", "dev_admin")
def list_templates(account_id: int):
    """獲取帳號的模板列表"""
    try:
        with get_session() as db:
            q = db.query(IGTemplate).filter(
                IGTemplate.account_id == account_id
            )
            # 可選：status 過濾（active/disabled/all），預設 all
            status = (request.args.get('status') or 'all').lower()
            if status == 'active':
                q = q.filter(IGTemplate.is_active == True)
            elif status == 'disabled':
                q = q.filter(IGTemplate.is_active == False)

            templates = q.order_by(IGTemplate.is_default.desc(), IGTemplate.created_at.desc()).all()
            
            result = []
            for template in templates:
                result.append({
                    "id": template.id,
                    "name": template.name,
                    "description": template.description,
                    "is_active": template.is_active,
                    "is_default": template.is_default,
                    "usage_count": template.usage_count,
                    "created_at": template.created_at.isoformat(),
                    "creator_name": template.creator.username
                })
            
            return jsonify({
                "success": True,
                "data": result
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/templates/<int:template_id>', methods=['GET'])
@jwt_required()
@require_role("admin", "dev_admin")
def get_template(template_id: int):
    """獲取模板詳情"""
    try:
        with get_session() as db:
            template = db.query(IGTemplate).filter(IGTemplate.id == template_id).first()
            
            if not template:
                return jsonify({
                    "success": False,
                    "error": "模板不存在"
                }), 404
            
            result = {
                "id": template.id,
                "account_id": template.account_id,
                "name": template.name,
                "description": template.description,
                "template_data": template.template_data,
                "is_active": template.is_active,
                "is_default": template.is_default,
                "usage_count": template.usage_count,
                "created_at": template.created_at.isoformat(),
                "updated_at": template.updated_at.isoformat() if template.updated_at else None,
                "creator_name": template.creator.username
            }
            
            return jsonify({
                "success": True,
                "data": result
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/templates', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def create_template():
    """創建新模板"""
    try:
        data = request.get_json()
        current_user_id = get_jwt_identity()
        
        # 驗證必要欄位
        required_fields = ['account_id', 'name', 'template_data']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    "success": False,
                    "error": f"缺少必要欄位: {field}"
                }), 400
        
        with get_session() as db:
            # 驗證帳號是否存在
            account = db.query(IGAccount).filter(IGAccount.id == data['account_id']).first()
            if not account:
                return jsonify({
                    "success": False,
                    "error": "Instagram 帳號不存在"
                }), 404
            
            # 創建模板
            template = IGTemplate(
                account_id=data['account_id'],
                name=data['name'],
                description=data.get('description', ''),
                template_data=data['template_data'],
                is_active=data.get('is_active', True),
                is_default=data.get('is_default', False),
                created_by=current_user_id
            )
            
            # 如果設為預設模板，取消其他預設模板
            if template.is_default:
                db.query(IGTemplate).filter(
                    IGTemplate.account_id == data['account_id'],
                    IGTemplate.is_default == True
                ).update({"is_default": False})
            
            db.add(template)
            db.commit()
            db.refresh(template)
            
            return jsonify({
                "success": True,
                "data": {
                    "id": template.id,
                    "name": template.name,
                    "is_default": template.is_default
                },
                "message": "模板創建成功"
            }), 201
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/templates/<int:template_id>', methods=['PUT'])
@jwt_required()
@require_role("admin", "dev_admin")
def update_template(template_id: int):
    """更新模板"""
    try:
        data = request.get_json()
        
        with get_session() as db:
            template = db.query(IGTemplate).filter(IGTemplate.id == template_id).first()
            
            if not template:
                return jsonify({
                    "success": False,
                    "error": "模板不存在"
                }), 404
            
            # 更新允許的欄位
            updatable_fields = ['name', 'description', 'template_data', 'is_active', 'is_default']
            
            for field in updatable_fields:
                if field in data:
                    setattr(template, field, data[field])
            
            # 如果設為預設模板，取消其他預設模板
            if data.get('is_default', False):
                db.query(IGTemplate).filter(
                    IGTemplate.account_id == template.account_id,
                    IGTemplate.id != template_id,
                    IGTemplate.is_default == True
                ).update({"is_default": False})
            
            template.updated_at = datetime.now(timezone.utc)
            
            db.commit()
            
            return jsonify({
                "success": True,
                "message": "模板更新成功"
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/templates/<int:template_id>', methods=['DELETE'])
@jwt_required()
@require_role("admin", "dev_admin")
def delete_template(template_id: int):
    """刪除模板"""
    try:
        with get_session() as db:
            template = db.query(IGTemplate).filter(IGTemplate.id == template_id).first()
            
            if not template:
                return jsonify({
                    "success": False,
                    "error": "模板不存在"
                }), 404
            
            if template.is_default:
                return jsonify({
                    "success": False,
                    "error": "不能刪除預設模板"
                }), 400
            
            # 檢查是否有正在使用的發文
            active_posts = db.query(IGPost).filter(
                IGPost.template_id == template_id,
                IGPost.status.in_(['pending', 'processing', 'queued'])
            ).count()
            
            if active_posts > 0:
                return jsonify({
                    "success": False,
                    "error": f"模板正被 {active_posts} 個發文任務使用，無法刪除"
                }), 400
            
            db.delete(template)
            db.commit()
            
            return jsonify({
                "success": True,
                "message": "模板刪除成功"
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ================================
# 發文管理 API
# ================================

@bp.route('/posts', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def create_ig_post():
    """創建 Instagram 發文任務"""
    try:
        data = request.get_json()
        current_user_id = get_jwt_identity()
        
        # 驗證必要欄位
        required_fields = ['forum_post_id', 'account_id', 'template_id']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    "success": False,
                    "error": f"缺少必要欄位: {field}"
                }), 400
        
        with get_session() as db:
            # 驗證相關資源是否存在
            forum_post = db.query(ForumPost).filter(ForumPost.id == data['forum_post_id']).first()
            account = db.query(IGAccount).filter(IGAccount.id == data['account_id']).first()
            template = db.query(IGTemplate).filter(IGTemplate.id == data['template_id']).first()
            
            if not forum_post:
                return jsonify({
                    "success": False,
                    "error": "論壇貼文不存在"
                }), 404
            
            if not account:
                return jsonify({
                    "success": False,
                    "error": "Instagram 帳號不存在"
                }), 404
            
            if not template:
                return jsonify({
                    "success": False,
                    "error": "模板不存在"
                }), 404
            
            if account.status != IGAccountStatus.active:
                return jsonify({
                    "success": False,
                    "error": f"Instagram 帳號狀態異常: {account.status}"
                }), 400
            
            # 檢查是否已經為此論壇貼文創建過 IG 發文
            existing_post = db.query(IGPost).filter(
                IGPost.forum_post_id == data['forum_post_id'],
                IGPost.account_id == data['account_id']
            ).first()
            
            if existing_post:
                return jsonify({
                    "success": False,
                    "error": "此貼文已經創建過 Instagram 發文任務"
                }), 400
            
            # 處理定時發布時間
            scheduled_at = None
            if data.get('scheduled_at'):
                try:
                    scheduled_at = datetime.fromisoformat(data['scheduled_at'].replace('Z', '+00:00'))
                except:
                    return jsonify({
                        "success": False,
                        "error": "定時發布時間格式錯誤"
                    }), 400
            
            client_image_url = str(data.get('client_generated_image_url') or '').strip()
            html_content = data.get('html_content')  # 新增：接收 HTML 內容

            # 創建 IG 發文記錄
            ig_post = IGPost(
                account_id=data['account_id'],
                forum_post_id=data['forum_post_id'],
                template_id=data['template_id'],
                custom_caption=data.get('custom_caption'),
                hashtags=data.get('hashtags', []),
                status=(PostStatus.queued if (client_image_url or html_content) else PostStatus.pending),
                scheduled_at=scheduled_at,
                generated_image=(client_image_url or None)
            )
            
            db.add(ig_post)
            db.commit()
            db.refresh(ig_post)
            
            # 觸發背景任務處理
            if client_image_url:
                # 若前端已生成好圖片，直接進入發布階段
                from services.instagram_tasks import publish_to_instagram
                task = publish_to_instagram.delay(ig_post.id)
            elif html_content:
                # 使用 Playwright 將 HTML 轉圖片
                from services.instagram_tasks import process_html_to_image
                task = process_html_to_image.delay(ig_post.id, html_content)
            else:
                # 使用傳統圖片生成方法
                task = process_post_for_instagram.delay(ig_post.id)
            
            return jsonify({
                "success": True,
                "data": {
                    "id": ig_post.id,
                    "status": ig_post.status,
                    "task_id": task.id
                },
                "message": "Instagram 發文任務已創建並開始處理"
            }), 201
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/posts', methods=['GET'])
@jwt_required()
@require_role("admin", "dev_admin")
def list_ig_posts():
    """獲取 Instagram 發文列表"""
    try:
        with get_session() as db:
            query = db.query(IGPost).join(IGAccount).join(ForumPost)
            
            # 篩選條件
            account_id = request.args.get('account_id', type=int)
            status = request.args.get('status')
            limit = min(request.args.get('limit', 50, type=int), 100)
            offset = request.args.get('offset', 0, type=int)
            
            if account_id:
                query = query.filter(IGPost.account_id == account_id)
            
            if status:
                query = query.filter(IGPost.status == status)
            
            # 排序和分頁
            posts = query.order_by(IGPost.created_at.desc()).offset(offset).limit(limit).all()
            total = query.count()
            
            result = []
            for post in posts:
                result.append({
                    "id": post.id,
                    "account_id": post.account_id,
                    "account_name": post.account.display_name,
                    "ig_username": post.account.ig_username,
                    "forum_post_id": post.forum_post_id,
                    "forum_post_content": post.forum_post.content[:100] + "..." if len(post.forum_post.content) > 100 else post.forum_post.content,
                    "template_name": post.template.name,
                    "status": post.status,
                    "custom_caption": post.custom_caption,
                    "hashtags": post.hashtags,
                    "generated_image": post.generated_image,
                    "ig_post_url": post.ig_post_url,
                    "scheduled_at": post.scheduled_at.isoformat() if post.scheduled_at else None,
                    "created_at": post.created_at.isoformat(),
                    "published_at": post.published_at.isoformat() if post.published_at else None,
                    "error_message": post.error_message,
                    "retry_count": post.retry_count
                })
            
            return jsonify({
                "success": True,
                "data": result,
                "pagination": {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "has_more": offset + limit < total
                }
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/sync/approved', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def sync_approved():
    """手動觸發：同步最近核准的論壇貼文，為符合條件帳號建立 IG 發文任務。"""
    try:
        task = sync_approved_posts.delay()
        return jsonify({"success": True, "task_id": task.id, "message": "已觸發同步任務"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ================================
# 系統管理 API
# ================================

@bp.route('/admin/retry-failed', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def retry_failed():
    """重試失敗的發文"""
    try:
        data = request.get_json() or {}
        account_id = data.get('account_id')
        
        # 觸發重試任務
        task = retry_failed_posts.delay(account_id)
        
        return jsonify({
            "success": True,
            "message": "重試任務已啟動",
            "task_id": task.id
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/accounts/<int:account_id>/refresh-token', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def refresh_account_token(account_id: int):
    """刷新 Instagram 帳號的 access token"""
    try:
        with get_session() as db:
            account = db.query(IGAccount).filter(IGAccount.id == account_id).first()
            
            if not account:
                return jsonify({
                    "success": False,
                    "error": "帳號不存在"
                }), 404
            
            # 使用 Instagram API 服務刷新 token
            ig_api = InstagramAPIService()
            
            # 嘗試刷新 token
            refresh_result = ig_api.refresh_token_if_needed(
                account.page_token, 
                account.token_expires_at
            )
            
            # 如果 token 被更新，保存到資料庫
            if refresh_result.get('refreshed'):
                account.page_token = refresh_result['token']
                
                # 更新過期時間
                if refresh_result.get('expires_in'):
                    expires_in_seconds = refresh_result['expires_in']
                    account.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)
                
                account.updated_at = datetime.now(timezone.utc)
                db.commit()
                
                return jsonify({
                    "success": True,
                    "message": refresh_result.get('message', 'Token 已更新'),
                    "token_refreshed": True,
                    "expires_at": account.token_expires_at.isoformat() if account.token_expires_at else None
                })
            else:
                # Token 沒有更新，但檢查結果可能包含錯誤資訊
                if 'error' in refresh_result:
                    return jsonify({
                        "success": False,
                        "error": refresh_result['error'],
                        "message": refresh_result.get('message', 'Token 更新失敗'),
                        "token_refreshed": False
                    }), 400
                else:
                    return jsonify({
                        "success": True,
                        "message": refresh_result.get('message', 'Token 仍然有效'),
                        "token_refreshed": False
                    })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/accounts/check-token-health', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin") 
def check_all_tokens_health():
    """檢查所有 Instagram 帳號的 token 健康狀態"""
    try:
        with get_session() as db:
            accounts = db.query(IGAccount).filter(IGAccount.status == IGAccountStatus.active).all()
            
            results = []
            ig_api = InstagramAPIService()
            
            for account in accounts:
                try:
                    # 檢查 token 狀態
                    refresh_result = ig_api.refresh_token_if_needed(
                        account.page_token,
                        account.token_expires_at
                    )
                    
                    # 計算過期時間
                    expires_in_days = None
                    if account.token_expires_at:
                        time_until_expiry = account.token_expires_at - datetime.now(timezone.utc)
                        expires_in_days = time_until_expiry.days
                    
                    account_status = {
                        "account_id": account.id,
                        "ig_username": account.ig_username,
                        "display_name": account.display_name,
                        "token_status": "healthy" if not refresh_result.get('error') else "expired",
                        "expires_at": account.token_expires_at.isoformat() if account.token_expires_at else None,
                        "expires_in_days": expires_in_days,
                        "needs_refresh": refresh_result.get('refreshed', False) or 'error' in refresh_result,
                        "message": refresh_result.get('message', ''),
                        "error": refresh_result.get('error')
                    }
                    
                    # 如果 token 被自動更新，保存到資料庫
                    if refresh_result.get('refreshed'):
                        account.page_token = refresh_result['token']
                        if refresh_result.get('expires_in'):
                            expires_in_seconds = refresh_result['expires_in']
                            account.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)
                        account.updated_at = datetime.now(timezone.utc)
                        db.commit()
                        account_status["auto_refreshed"] = True
                    
                    results.append(account_status)
                    
                except Exception as e:
                    results.append({
                        "account_id": account.id,
                        "ig_username": account.ig_username,
                        "display_name": account.display_name,
                        "token_status": "error",
                        "error": str(e),
                        "needs_refresh": True
                    })
            
            # 統計結果
            healthy_count = sum(1 for r in results if r.get('token_status') == 'healthy')
            expired_count = sum(1 for r in results if r.get('token_status') == 'expired')
            error_count = sum(1 for r in results if r.get('token_status') == 'error')
            
            return jsonify({
                "success": True,
                "data": results,
                "summary": {
                    "total_accounts": len(results),
                    "healthy": healthy_count,
                    "expired": expired_count,
                    "error": error_count
                }
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ================================
# 儀表板統計 API
# ================================

@bp.route('/stats/dashboard', methods=['GET'])
@jwt_required()
@require_role("admin", "dev_admin")
def dashboard_stats():
    """回傳 IG 整合儀表板統計資料"""
    try:
        with get_session() as db:
            total_accounts = db.query(IGAccount).count()
            active_accounts = db.query(IGAccount).filter(IGAccount.status == 'active').count()
            inactive_accounts = db.query(IGAccount).filter(IGAccount.status != 'active').count()

            total_posts = db.query(IGPost).count()
            published_posts = db.query(IGPost).filter(IGPost.status == 'published').count()
            pending_posts = db.query(IGPost).filter(IGPost.status.in_(['pending','processing','queued'])).count()
            failed_posts = db.query(IGPost).filter(IGPost.status == 'failed').count()

            success_rate = 0.0
            if total_posts > 0:
                success_rate = round(published_posts / max(total_posts, 1) * 100.0, 2)

            seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
            published_last_7_days = db.query(IGPost).filter(
                IGPost.status == 'published',
                IGPost.published_at != None,
                IGPost.published_at >= seven_days_ago
            ).count()

            return jsonify({
                "success": True,
                "data": {
                    "accounts": {
                        "total": total_accounts,
                        "active": active_accounts,
                        "inactive": inactive_accounts,
                    },
                    "posts": {
                        "total": total_posts,
                        "published": published_posts,
                        "pending": pending_posts,
                        "failed": failed_posts,
                        "success_rate": success_rate,
                    },
                    "recent": {
                        "published_last_7_days": published_last_7_days
                    }
                }
            })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@bp.route('/accounts/<int:account_id>/status', methods=['PATCH', 'PUT'])
@jwt_required()
@require_role("admin", "dev_admin")
def update_account_status(account_id: int):
    """切換或設定 Instagram 帳號狀態 (active/disabled/error/pending)"""
    try:
        data = request.get_json() or {}
        new_status = data.get('status')
        if new_status not in ['active', 'disabled', 'error', 'pending']:
            return jsonify({"success": False, "error": "不支援的狀態值"}), 400

        with get_session() as db:
            account = db.query(IGAccount).filter(IGAccount.id == account_id).first()
            if not account:
                return jsonify({"success": False, "error": "帳號不存在"}), 404

            account.status = new_status
            account.updated_at = datetime.now(timezone.utc)
            db.commit()

            return jsonify({"success": True, "message": "狀態已更新", "status": new_status})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
@bp.route('/preview/html', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def preview_html_to_image():
    """預覽：將 HTML 轉為圖片並回傳 URL（走與正式流程相同的儲存路徑）。"""
    try:
        data = request.get_json() or {}
        html = data.get('html') or data.get('html_content')
        if not html:
            return jsonify({"success": False, "error": "缺少 html 或 html_content"}), 400

        from services.instagram_tasks import process_html_to_image

        # 建立一筆臨時 IGPost 以重用同樣的路徑邏輯
        with get_session() as db:
            # 找一個帳號/模板
            account = db.query(IGAccount).first()
            template = db.query(IGTemplate).first()
            forum_post = db.query(ForumPost).first()
            if not (account and template and forum_post):
                return jsonify({"success": False, "error": "缺少帳號/模板/論壇貼文以供預覽上下文"}), 400

            from models.instagram import IGPost, PostStatus
            ig_post = IGPost(
                account_id=account.id,
                forum_post_id=forum_post.id,
                template_id=template.id,
                status=PostStatus.pending,
            )
            db.add(ig_post); db.commit(); db.refresh(ig_post)

        # 直接在同請求內渲染（非 celery）
        from services.html_renderer import HtmlRenderer, HtmlRenderError
        renderer = HtmlRenderer()
        jpeg_buf = renderer.render_html_to_image(html, image_type='jpeg', quality=92)

        import os, time
        root_dir = os.getenv('UPLOAD_ROOT', 'uploads')
        out_dir = os.path.join(root_dir, 'public', 'instagram'); os.makedirs(out_dir, exist_ok=True)
        filename = f"preview_html_{int(time.time()*1000)}.jpg"
        out_path = os.path.join(out_dir, filename)
        with open(out_path, 'wb') as f:
            f.write(jpeg_buf.getvalue())

        cdn_base = (os.getenv('PUBLIC_CDN_URL') or '').rstrip('/')
        base = (os.getenv('PUBLIC_BASE_URL') or '').rstrip('/')
        if cdn_base:
            url = f"{cdn_base}/instagram/{filename}"
        elif base:
            url = f"{base}/uploads/public/instagram/{filename}"
        else:
            url = f"/uploads/public/instagram/{filename}"

        return jsonify({"success": True, "image_url": url})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
