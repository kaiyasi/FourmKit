"""
貼文圖片生成 API - 統一的預覽和生成接口
確保預覽和實際生成完全一致
"""
from flask import Blueprint, request, jsonify, send_file, render_template
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_session
from utils.authz import require_role
from models.base import Post as ForumPost, User
from models.school import School
from services.unified_post_renderer import get_renderer
import os
import time
import tempfile
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('post_images', __name__, url_prefix='/api/post-images')


@bp.route('/preview', methods=['POST'])
@jwt_required()
def preview_post():
    """
    預覽貼文圖片 - 返回 HTML 和元數據
    這個預覽和實際生成使用完全相同的渲染邏輯
    """
    try:
        data = request.get_json() or {}
        
        # 內容數據
        content = {
            "title": data.get("title", ""),
            "text": data.get("text", ""),
            "author": data.get("author", ""),
            "created_at": data.get("created_at"),
            "school_name": data.get("school_name", ""),
            "id": data.get("id", "")
        }
        
        # 配置選項
        size = data.get("size", "square")
        template = data.get("template", "modern")
        config = data.get("config", {})
        logo_url = data.get("logo_url")
        
        # 使用統一渲染器
        renderer = get_renderer()
        preview_data = renderer.get_preview_data(
            content=content,
            size=size,
            template=template,
            config=config,
            logo_url=logo_url
        )
        
        return jsonify({
            "success": True,
            "data": preview_data
        })
        
    except Exception as e:
        logger.error(f"預覽失敗: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route('/generate', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def generate_image():
    """
    生成貼文圖片 - 使用和預覽完全相同的邏輯
    """
    try:
        data = request.get_json() or {}
        
        # 內容數據
        content = {
            "title": data.get("title", ""),
            "text": data.get("text", ""),
            "author": data.get("author", ""),
            "created_at": data.get("created_at"),
            "school_name": data.get("school_name", ""),
            "id": data.get("id", "")
        }
        
        # 配置選項
        size = data.get("size", "square")
        template = data.get("template", "modern")
        config = data.get("config", {})
        logo_url = data.get("logo_url")
        quality = data.get("quality", 95)
        
        # 使用統一渲染器（和預覽完全相同）
        renderer = get_renderer()
        image_data = renderer.render_to_image(
            content=content,
            size=size,
            template=template,
            config=config,
            logo_url=logo_url,
            quality=quality
        )
        
        # 儲存圖片
        timestamp = int(time.time() * 1000)
        filename = f"post_image_{timestamp}.jpg"
        
        upload_root = os.getenv('UPLOAD_ROOT', 'uploads')
        output_dir = os.path.join(upload_root, 'public', 'post-images')
        os.makedirs(output_dir, exist_ok=True)
        
        file_path = os.path.join(output_dir, filename)
        with open(file_path, 'wb') as f:
            f.write(image_data.getvalue())
        
        # 生成 URL
        base_url = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
        if base_url:
            image_url = f"{base_url}/uploads/public/post-images/{filename}"
        else:
            image_url = f"/uploads/public/post-images/{filename}"
        
        return jsonify({
            "success": True,
            "data": {
                "image_url": image_url,
                "filename": filename,
                "size": size,
                "template": template,
                "dimensions": renderer.SIZES.get(size, {})
            }
        })
        
    except Exception as e:
        logger.error(f"生成圖片失敗: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route('/from-post/<int:post_id>', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def generate_from_forum_post(post_id: int):
    """
    從論壇貼文生成圖片
    """
    try:
        data = request.get_json() or {}
        
        with get_session() as db:
            # 獲取論壇貼文
            post = db.query(ForumPost).filter(
                ForumPost.id == post_id,
                ForumPost.status == 'approved'
            ).first()
            
            if not post:
                return jsonify({
                    "success": False,
                    "error": "貼文不存在或未審核"
                }), 404
            
            # 獲取作者信息
            author = db.get(User, post.author_id) if post.author_id else None
            author_name = author.username if author else "匿名"
            
            # 獲取學校信息
            school = db.get(School, post.school_id) if post.school_id else None
            school_name = school.name if school else ""
            
            # 準備內容
            content = {
                "title": getattr(post, 'title', '') or '',
                "text": post.content or '',
                "author": author_name,
                "created_at": post.created_at.isoformat() if post.created_at else None,
                "school_name": school_name,
                "id": post.id
            }
            
            # 配置選項
            size = data.get("size", "square")
            template = data.get("template", "modern")
            config = data.get("config", {})
            
            # 獲取 Logo
            logo_url = None
            if school and hasattr(school, 'logo_path') and school.logo_path:
                base_url = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
                if base_url:
                    logo_url = f"{base_url}/uploads/{school.logo_path}"
                else:
                    logo_url = f"/uploads/{school.logo_path}"
            
            # 生成圖片
            renderer = get_renderer()
            image_data = renderer.render_to_image(
                content=content,
                size=size,
                template=template,
                config=config,
                logo_url=logo_url
            )
            
            # 儲存圖片
            timestamp = int(time.time() * 1000)
            filename = f"post_{post_id}_{timestamp}.jpg"
            
            upload_root = os.getenv('UPLOAD_ROOT', 'uploads')
            output_dir = os.path.join(upload_root, 'public', 'post-images')
            os.makedirs(output_dir, exist_ok=True)
            
            file_path = os.path.join(output_dir, filename)
            with open(file_path, 'wb') as f:
                f.write(image_data.getvalue())
            
            # 生成 URL
            base_url = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
            if base_url:
                image_url = f"{base_url}/uploads/public/post-images/{filename}"
            else:
                image_url = f"/uploads/public/post-images/{filename}"
            
            return jsonify({
                "success": True,
                "data": {
                    "post_id": post_id,
                    "image_url": image_url,
                    "filename": filename,
                    "size": size,
                    "template": template,
                    "content": content,
                    "dimensions": renderer.SIZES.get(size, {})
                }
            })
            
    except Exception as e:
        logger.error(f"從貼文生成圖片失敗: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route('/config', methods=['GET'])
@jwt_required()
def get_config():
    """
    獲取配置信息 - 可用尺寸、模板等
    """
    try:
        renderer = get_renderer()
        
        return jsonify({
            "success": True,
            "data": {
                "sizes": renderer.list_available_sizes(),
                "templates": renderer.list_available_templates(),
                "default_config": renderer.default_config
            }
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route('/preview-html', methods=['POST'])
@jwt_required()
def preview_html_only():
    """
    只返回 HTML（用於前端即時預覽）
    """
    try:
        data = request.get_json() or {}
        
        content = {
            "title": data.get("title", ""),
            "text": data.get("text", ""),
            "author": data.get("author", ""),
            "created_at": data.get("created_at"),
            "school_name": data.get("school_name", ""),
            "id": data.get("id", "")
        }
        
        size = data.get("size", "square")
        template = data.get("template", "modern")
        config = data.get("config", {})
        logo_url = data.get("logo_url")
        
        renderer = get_renderer()
        html = renderer.render_html(
            content=content,
            size=size,
            template=template,
            config=config,
            logo_url=logo_url
        )
        
        dimensions = renderer.SIZES.get(size, {})
        
        return jsonify({
            "success": True,
            "html": html,
            "width": dimensions.get("width", 1080),
            "height": dimensions.get("height", 1080)
        })
        
    except Exception as e:
        logger.error(f"HTML 預覽失敗: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route('/preview-image', methods=['POST'])
@jwt_required()
def preview_actual_image():
    """
    生成實際的預覽圖片（不推送到 Instagram）
    用於本地檢查最終效果，避免觸及 API 限制
    """
    try:
        data = request.get_json() or {}

        # 內容數據
        content = {
            "title": data.get("title", ""),
            "text": data.get("text", ""),
            "author": data.get("author", ""),
            "created_at": data.get("created_at"),
            "school_name": data.get("school_name", ""),
            "id": data.get("id", "")
        }

        # 配置選項
        size = data.get("size", "square")
        template = data.get("template", "modern")
        config = data.get("config", {})
        logo_url = data.get("logo_url")
        quality = data.get("quality", 95)

        # 調試日誌
        print(f"[預覽圖片] 接收到的配置: {config}")
        print(f"[預覽圖片] Logo URL: {logo_url}")
        print(f"[預覽圖片] 內容數據: {content}")
        
        # 生成預覽圖片
        renderer = get_renderer()
        
        try:
            image_data = renderer.render_to_image(
                content=content,
                size=size,
                template=template,
                config=config,
                logo_url=logo_url,
                quality=quality
            )
            
            # 儲存到預覽目錄
            timestamp = int(time.time() * 1000)
            filename = f"preview_{timestamp}.jpg"
            
            upload_root = os.getenv('UPLOAD_ROOT', 'uploads')
            preview_dir = os.path.join(upload_root, 'public', 'previews')
            os.makedirs(preview_dir, exist_ok=True)
            
            file_path = os.path.join(preview_dir, filename)
            with open(file_path, 'wb') as f:
                f.write(image_data.getvalue())
            
            # 生成 URL
            base_url = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
            if base_url:
                image_url = f"{base_url}/uploads/public/previews/{filename}"
            else:
                image_url = f"/uploads/public/previews/{filename}"
            
            # 獲取圖片資訊
            dimensions = renderer.SIZES.get(size, {})
            file_size = len(image_data.getvalue())
            
            return jsonify({
                "success": True,
                "data": {
                    "image_url": image_url,
                    "filename": filename,
                    "file_path": file_path,
                    "size": size,
                    "template": template,
                    "dimensions": dimensions,
                    "file_size": file_size,
                    "quality": quality,
                    "has_logo": bool(logo_url),
                    "created_at": timestamp
                },
                "message": "預覽圖片生成成功"
            })
            
        except Exception as render_error:
            # 如果 Pillow 渲染失敗，嘗試回退到 HTML 預覽
            try:
                html = renderer.render_html(
                    content=content,
                    size=size,
                    template=template,
                    config=config,
                    logo_url=logo_url
                )
                
                dimensions = renderer.SIZES.get(size, {})
                
                return jsonify({
                    "success": False,
                    "error": f"圖片生成失敗: {str(render_error)}",
                    "fallback": {
                        "html": html,
                        "width": dimensions.get("width", 1080),
                        "height": dimensions.get("height", 1080),
                        "message": "已回退到 HTML 預覽模式"
                    }
                }), 202  # 202 Accepted (部分成功)
            except Exception:
                # 如果連 HTML 預覽都失敗了
                raise render_error
        
    except Exception as e:
        logger.error(f"預覽圖片生成失敗: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route('/test', methods=['GET', 'POST'])
def test_system():
    """
    測試系統是否正常運作
    """
    try:
        # 測試內容
        test_content = {
            "title": "系統測試",
            "text": "這是一個測試貼文，用來檢查圖片生成系統是否正常運作。",
            "author": "系統",
            "created_at": "2025-01-15T10:30:00"
        }
        
        renderer = get_renderer()
        
        # 測試預覽
        preview_data = renderer.get_preview_data(test_content)
        
        # 測試可用配置
        config = {
            "sizes": renderer.list_available_sizes(),
            "templates": renderer.list_available_templates()
        }
        
        return jsonify({
            "success": True,
            "message": "系統運作正常",
            "test_preview": {
                "width": preview_data["width"],
                "height": preview_data["height"],
                "template": preview_data["template"]
            },
            "config": config
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "message": "系統測試失敗"
        }), 500


@bp.route('/preview-images', methods=['GET'])
@jwt_required()
def list_preview_images():
    """
    列出最近的預覽圖片
    """
    try:
        upload_root = os.getenv('UPLOAD_ROOT', 'uploads')
        preview_dir = os.path.join(upload_root, 'public', 'previews')
        
        if not os.path.exists(preview_dir):
            return jsonify({
                "success": True,
                "data": [],
                "message": "暫無預覽圖片"
            })
        
        # 獲取所有預覽圖片
        preview_files = []
        base_url = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
        
        for filename in os.listdir(preview_dir):
            if filename.startswith('preview_') and filename.endswith('.jpg'):
                file_path = os.path.join(preview_dir, filename)
                file_stat = os.stat(file_path)
                
                if base_url:
                    image_url = f"{base_url}/uploads/public/previews/{filename}"
                else:
                    image_url = f"/uploads/public/previews/{filename}"
                
                preview_files.append({
                    "filename": filename,
                    "image_url": image_url,
                    "file_size": file_stat.st_size,
                    "created_at": int(file_stat.st_mtime * 1000),
                    "created_ago": time.time() - file_stat.st_mtime
                })
        
        # 按建立時間倒序排列
        preview_files.sort(key=lambda x: x["created_at"], reverse=True)
        
        # 限制數量（最新20個）
        preview_files = preview_files[:20]
        
        return jsonify({
            "success": True,
            "data": preview_files,
            "total": len(preview_files)
        })
        
    except Exception as e:
        logger.error(f"列出預覽圖片失敗: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route('/preview-images/cleanup', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def cleanup_preview_images():
    """
    清理舊的預覽圖片（保留最近24小時的）
    """
    try:
        data = request.get_json() or {}
        keep_hours = data.get("keep_hours", 24)  # 預設保留24小時
        
        upload_root = os.getenv('UPLOAD_ROOT', 'uploads')
        preview_dir = os.path.join(upload_root, 'public', 'previews')
        
        if not os.path.exists(preview_dir):
            return jsonify({
                "success": True,
                "message": "預覽目錄不存在",
                "deleted": 0
            })
        
        # 計算截止時間
        cutoff_time = time.time() - (keep_hours * 3600)
        deleted_count = 0
        total_size_deleted = 0
        
        for filename in os.listdir(preview_dir):
            if filename.startswith('preview_') and filename.endswith('.jpg'):
                file_path = os.path.join(preview_dir, filename)
                file_stat = os.stat(file_path)
                
                # 如果檔案太舊，刪除它
                if file_stat.st_mtime < cutoff_time:
                    total_size_deleted += file_stat.st_size
                    os.remove(file_path)
                    deleted_count += 1
        
        return jsonify({
            "success": True,
            "message": f"清理完成，刪除了 {deleted_count} 個舊預覽圖片",
            "deleted": deleted_count,
            "size_freed": total_size_deleted,
            "kept_hours": keep_hours
        })
        
    except Exception as e:
        logger.error(f"清理預覽圖片失敗: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route('/preview-ui', methods=['GET'])
def preview_interface():
    """
    預覽界面 - 提供圖形化的預覽工具
    """
    try:
        return render_template('preview_interface.html')
    except Exception as e:
        return f"""
        <html>
        <body>
            <h1>預覽界面載入失敗</h1>
            <p>錯誤: {e}</p>
            <p>請確保 templates/preview_interface.html 檔案存在。</p>
        </body>
        </html>
        """, 500