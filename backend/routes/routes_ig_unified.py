# backend/routes/routes_ig_unified.py
"""
Instagram 統一整合系統的 API 路由
完全重構的 API 端點，提供統一的預覽和發布功能
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timezone
from typing import Dict, List, Optional
import traceback

from utils.db import get_session
from utils.authz import require_role
from services.ig_unified_system import IGUnifiedSystem, IGSystemError, TemplateConfig, ContentData
from models.instagram import IGAccount, IGTemplate, IGPost, PostStatus
from models.base import Post as ForumPost

bp = Blueprint('ig_unified', __name__, url_prefix='/api/ig')

# ================================
# 核心系統 API
# ================================

@bp.route('/health', methods=['GET'])
def health_check():
    """健康檢查"""
    return jsonify({
        "success": True,
        "message": "IG 統一系統運行正常",
        "system": "ig_unified",
        "version": "2.0.0"
    })

@bp.route('/preview', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def unified_preview():
    """統一預覽 API - 支持 HTML 和圖片預覽"""
    try:
        data = request.get_json() or {}
        
        # 驗證必要參數
        account_id = data.get('account_id')
        template_id = data.get('template_id')
        
        if not account_id or not template_id:
            return jsonify({
                "success": False,
                "error": "缺少必要參數: account_id 和 template_id"
            }), 400
        
        # 可選參數
        forum_post_id = data.get('forum_post_id')
        content = data.get('content')
        custom_caption = data.get('custom_caption')
        hashtags = data.get('hashtags', [])
        preview_type = data.get('type', 'image')  # 'html' 或 'image'
        
        # 初始化系統
        ig_system = IGUnifiedSystem()
        
        if preview_type == 'html':
            # HTML 預覽
            template_config = ig_system.get_template_config(template_id)
            
            if forum_post_id:
                content_data = ig_system.get_content_data(forum_post_id, custom_caption, hashtags)
            else:
                content_data = ContentData(
                    title="預覽標題",
                    content=content or "這是預覽內容，用於測試模板效果。",
                    author="預覽作者",
                    school_name="預覽學校",
                    created_at=datetime.now(timezone.utc)
                )
            
            logo_url = ig_system.get_logo_url(account_id, template_config)
            html = ig_system.template_engine.render_to_html(template_config, content_data, logo_url)
            
            return jsonify({
                "success": True,
                "type": "html",
                "html": html,
                "width": template_config.width,
                "height": template_config.height
            })
        
        else:
            # 圖片預覽
            result = ig_system.preview_post(
                account_id=account_id,
                template_id=template_id,
                forum_post_id=forum_post_id,
                content=content,
                custom_caption=custom_caption,
                hashtags=hashtags
            )
            
            if not result.success:
                return jsonify({
                    "success": False,
                    "error": result.error_message,
                    "error_code": result.error_code
                }), 500
            
            return jsonify({
                "success": True,
                "type": "image",
                "data": {
                    "image_url": result.image_url,
                    "width": result.width,
                    "height": result.height,
                    "file_size": result.file_size,
                    "html": result.html_content
                }
            })
        
    except IGSystemError as e:
        return jsonify({
            "success": False,
            "error": e.message,
            "error_code": e.error_code,
            "details": e.details
        }), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"系統錯誤: {str(e)}",
            "error_code": "SYSTEM_ERROR"
        }), 500

@bp.route('/posts', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def create_post():
    """創建 Instagram 發文任務"""
    try:
        data = request.get_json() or {}
        current_user_id = get_jwt_identity()
        
        # 驗證必要參數
        required_fields = ['account_id', 'template_id', 'forum_post_id']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    "success": False,
                    "error": f"缺少必要參數: {field}"
                }), 400
        
        with get_session() as db:
            # 驗證資源存在性
            account = db.query(IGAccount).filter(IGAccount.id == data['account_id']).first()
            template = db.query(IGTemplate).filter(IGTemplate.id == data['template_id']).first()
            forum_post = db.query(ForumPost).filter(ForumPost.id == data['forum_post_id']).first()
            
            if not account:
                return jsonify({"success": False, "error": "Instagram 帳號不存在"}), 404
            if not template:
                return jsonify({"success": False, "error": "模板不存在"}), 404
            if not forum_post:
                return jsonify({"success": False, "error": "論壇貼文不存在"}), 404
            
            if account.status != 'active':
                return jsonify({"success": False, "error": "Instagram 帳號未啟用"}), 400
            
            # 檢查重複發文
            existing = db.query(IGPost).filter(
                IGPost.account_id == data['account_id'],
                IGPost.forum_post_id == data['forum_post_id']
            ).first()
            
            if existing:
                return jsonify({
                    "success": False,
                    "error": "該貼文已經創建過 Instagram 發文任務"
                }), 400
            
            # 處理定時發布
            scheduled_at = None
            if data.get('scheduled_at'):
                try:
                    scheduled_at = datetime.fromisoformat(data['scheduled_at'].replace('Z', '+00:00'))
                except:
                    return jsonify({
                        "success": False,
                        "error": "定時發布時間格式錯誤"
                    }), 400
            
            # 創建發文記錄
            ig_post = IGPost(
                account_id=data['account_id'],
                template_id=data['template_id'],
                forum_post_id=data['forum_post_id'],
                custom_caption=data.get('custom_caption'),
                hashtags=data.get('hashtags', []),
                status=PostStatus.pending,
                scheduled_at=scheduled_at
            )
            
            db.add(ig_post)
            db.commit()
            db.refresh(ig_post)
            
            # 如果是立即發布，則觸發處理
            publish_now = data.get('publish_now', False)
            task_id = None
            
            if publish_now and not scheduled_at:
                try:
                    # 使用統一系統發布
                    ig_system = IGUnifiedSystem()
                    result = ig_system.publish_post(ig_post.id)
                    
                    return jsonify({
                        "success": True,
                        "data": {
                            "id": ig_post.id,
                            "status": ig_post.status,
                            "published": result.get('success', False),
                            "ig_post_url": result.get('post_url'),
                            "error_message": result.get('error_message')
                        },
                        "message": "發文任務已創建並" + ("發布成功" if result.get('success') else "發布失敗")
                    })
                except Exception as e:
                    # 發布失敗，但任務已創建
                    return jsonify({
                        "success": True,
                        "data": {
                            "id": ig_post.id,
                            "status": PostStatus.failed,
                            "published": False,
                            "error_message": str(e)
                        },
                        "message": "發文任務已創建，但發布失敗",
                        "warning": str(e)
                    })
            else:
                # 排隊等待處理
                ig_post.status = PostStatus.queued
                db.commit()
                
                return jsonify({
                    "success": True,
                    "data": {
                        "id": ig_post.id,
                        "status": ig_post.status,
                        "scheduled_at": ig_post.scheduled_at.isoformat() if ig_post.scheduled_at else None
                    },
                    "message": "發文任務已創建並排隊處理"
                })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"創建發文任務失敗: {str(e)}"
        }), 500

@bp.route('/posts/<int:post_id>/publish', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def publish_post_now(post_id: int):
    """立即發布指定的 Instagram 貼文"""
    try:
        with get_session() as db:
            ig_post = db.query(IGPost).filter(IGPost.id == post_id).first()
            
            if not ig_post:
                return jsonify({"success": False, "error": "發文不存在"}), 404
            
            if ig_post.status == PostStatus.published:
                return jsonify({
                    "success": True,
                    "message": "該貼文已經發布過了",
                    "ig_post_url": ig_post.ig_post_url
                })
            
            # 使用統一系統發布
            ig_system = IGUnifiedSystem()
            result = ig_system.publish_post(post_id)
            
            if result.get('success'):
                return jsonify({
                    "success": True,
                    "data": {
                        "id": post_id,
                        "media_id": result.get('media_id'),
                        "post_url": result.get('post_url')
                    },
                    "message": "發布成功"
                })
            else:
                return jsonify({
                    "success": False,
                    "error": result.get('error_message', '發布失敗'),
                    "error_code": "PUBLISH_FAILED"
                }), 500
        
    except IGSystemError as e:
        return jsonify({
            "success": False,
            "error": e.message,
            "error_code": e.error_code
        }), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"發布失敗: {str(e)}"
        }), 500

# ================================
# 模板管理 API
# ================================

@bp.route('/templates/config', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def create_template_config():
    """創建新的模板配置"""
    try:
        data = request.get_json() or {}
        current_user_id = get_jwt_identity()
        
        # 驗證必要參數
        if not data.get('account_id') or not data.get('name'):
            return jsonify({
                "success": False,
                "error": "缺少必要參數: account_id 和 name"
            }), 400
        
        # 創建模板配置
        config_data = data.get('config', {})
        template_config = TemplateConfig.from_dict(config_data)
        
        with get_session() as db:
            # 驗證帳號存在
            account = db.query(IGAccount).filter(IGAccount.id == data['account_id']).first()
            if not account:
                return jsonify({"success": False, "error": "Instagram 帳號不存在"}), 404
            
            # 創建模板
            template = IGTemplate(
                account_id=data['account_id'],
                name=data['name'],
                description=data.get('description', ''),
                template_data=template_config.to_dict(),
                is_active=data.get('is_active', True),
                is_default=data.get('is_default', False),
                created_by=current_user_id
            )
            
            # 如果設為預設，取消其他預設模板
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
                    "config": template_config.to_dict(),
                    "is_default": template.is_default
                },
                "message": "模板創建成功"
            }), 201
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"創建模板失敗: {str(e)}"
        }), 500

@bp.route('/templates/<int:template_id>/config', methods=['GET'])
@jwt_required()
@require_role("admin", "dev_admin")
def get_template_config(template_id: int):
    """獲取模板配置"""
    try:
        ig_system = IGUnifiedSystem()
        config = ig_system.get_template_config(template_id)
        
        return jsonify({
            "success": True,
            "data": {
                "template_id": template_id,
                "config": config.to_dict()
            }
        })
        
    except IGSystemError as e:
        return jsonify({
            "success": False,
            "error": e.message,
            "error_code": e.error_code
        }), 404
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"獲取模板配置失敗: {str(e)}"
        }), 500

@bp.route('/templates/<int:template_id>/config', methods=['PUT'])
@jwt_required()
@require_role("admin", "dev_admin")
def update_template_config(template_id: int):
    """更新模板配置"""
    try:
        data = request.get_json() or {}
        
        with get_session() as db:
            template = db.query(IGTemplate).filter(IGTemplate.id == template_id).first()
            
            if not template:
                return jsonify({"success": False, "error": "模板不存在"}), 404
            
            # 更新配置
            if 'config' in data:
                config_data = data['config']
                print(f"[DEBUG] 收到的 config_data: {config_data}")
                print(f"[DEBUG] post_id_format 在 config_data 中: {'post_id_format' in config_data}")
                if 'post_id_format' in config_data:
                    print(f"[DEBUG] post_id_format 值: {config_data['post_id_format']}")

                template_config = TemplateConfig.from_dict(config_data)
                converted_data = template_config.to_dict()
                print(f"[DEBUG] 轉換後的 converted_data: {converted_data}")
                print(f"[DEBUG] post_id_format 在轉換後: {'post_id_format' in converted_data}")

                template.template_data = converted_data
            
            # 更新其他字段
            if 'name' in data:
                template.name = data['name']
            if 'description' in data:
                template.description = data['description']
            if 'is_active' in data:
                template.is_active = data['is_active']
            if 'is_default' in data:
                template.is_default = data['is_default']
                
                # 如果設為預設，取消其他預設模板
                if template.is_default:
                    db.query(IGTemplate).filter(
                        IGTemplate.account_id == template.account_id,
                        IGTemplate.id != template_id,
                        IGTemplate.is_default == True
                    ).update({"is_default": False})
            
            template.updated_at = datetime.now(timezone.utc)
            db.commit()
            
            return jsonify({
                "success": True,
                "message": "模板配置更新成功"
            })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"更新模板配置失敗: {str(e)}"
        }), 500

# ================================
# 統計和監控 API
# ================================

@bp.route('/stats/system', methods=['GET'])
@jwt_required()
@require_role("admin", "dev_admin")
def system_stats():
    """系統統計"""
    try:
        with get_session() as db:
            # 帳號統計
            total_accounts = db.query(IGAccount).count()
            active_accounts = db.query(IGAccount).filter(IGAccount.status == 'active').count()
            
            # 模板統計
            total_templates = db.query(IGTemplate).count()
            active_templates = db.query(IGTemplate).filter(IGTemplate.is_active == True).count()
            
            # 發文統計
            total_posts = db.query(IGPost).count()
            published_posts = db.query(IGPost).filter(IGPost.status == 'published').count()
            pending_posts = db.query(IGPost).filter(IGPost.status.in_(['pending', 'processing', 'queued'])).count()
            failed_posts = db.query(IGPost).filter(IGPost.status == 'failed').count()
            
            # 成功率
            success_rate = (published_posts / max(total_posts, 1)) * 100
            
            return jsonify({
                "success": True,
                "data": {
                    "accounts": {
                        "total": total_accounts,
                        "active": active_accounts,
                        "inactive": total_accounts - active_accounts
                    },
                    "templates": {
                        "total": total_templates,
                        "active": active_templates,
                        "inactive": total_templates - active_templates
                    },
                    "posts": {
                        "total": total_posts,
                        "published": published_posts,
                        "pending": pending_posts,
                        "failed": failed_posts,
                        "success_rate": round(success_rate, 2)
                    }
                }
            })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"獲取統計數據失敗: {str(e)}"
        }), 500

# ================================
# 批量操作 API
# ================================

@bp.route('/batch/publish', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def batch_publish():
    """智能批量發布 - 支援指定貼文或帳號批量發布"""
    try:
        data = request.get_json() or {}
        
        # 方式 1: 指定特定貼文批量發布（舊版相容）
        post_ids = data.get('post_ids', [])
        if post_ids:
            ig_system = IGUnifiedSystem()
            results = []
            
            for post_id in post_ids:
                try:
                    result = ig_system.publish_post(post_id)
                    results.append({
                        "post_id": post_id,
                        "success": result.get('success', False),
                        "post_url": result.get('post_url'),
                        "error": result.get('error_message')
                    })
                except Exception as e:
                    results.append({
                        "post_id": post_id,
                        "success": False,
                        "error": str(e)
                    })
            
            successful = sum(1 for r in results if r['success'])
            failed = len(results) - successful
            
            return jsonify({
                "success": True,
                "method": "post_ids",
                "data": {
                    "results": results,
                    "summary": {
                        "total": len(results),
                        "successful": successful,
                        "failed": failed
                    }
                },
                "message": f"指定貼文批量發布：成功 {successful} 個，失敗 {failed} 個"
            })
        
        # 方式 2: 新的智能批量發布 - 按帳號批量處理
        from services.ig_batch_publisher import get_batch_publisher
        
        batch_publisher = get_batch_publisher()
        account_id = data.get('account_id')
        batch_size = data.get('batch_size')
        
        if account_id:
            # 發布指定帳號的批量貼文
            result = batch_publisher.batch_publish_account(account_id, batch_size)
            return jsonify({
                "success": True,
                "method": "account_batch",
                "data": result.to_dict(),
                "message": f"帳號 {account_id} 批量發布完成: {result.summary}"
            })
        else:
            # 發布所有就緒帳號的批量貼文
            result = batch_publisher.batch_publish_all_ready_accounts()
            return jsonify({
                "success": result.get('success', True),
                "method": "all_accounts_batch",
                "data": result,
                "message": f"全體批量發布完成: 成功 {result.get('total_success', 0)} 個，失敗 {result.get('total_error', 0)} 個"
            })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"批量發布失敗: {str(e)}"
        }), 500

# ================================
# 預覽界面 API
# ================================

@bp.route('/preview-ui', methods=['GET'])
def preview_ui():
    """預覽界面"""
    return jsonify({
        "success": True,
        "message": "預覽界面端點，可以返回 HTML 頁面或重定向到前端應用"
    })

# 錯誤處理
@bp.errorhandler(IGSystemError)
def handle_ig_system_error(e):
    return jsonify({
        "success": False,
        "error": e.message,
        "error_code": e.error_code,
        "details": e.details
    }), 400

@bp.errorhandler(Exception)
def handle_general_error(e):
    traceback.print_exc()
    return jsonify({
        "success": False,
        "error": "系統內部錯誤",
        "error_code": "INTERNAL_ERROR"
    }), 500