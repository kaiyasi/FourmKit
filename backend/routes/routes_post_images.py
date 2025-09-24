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
import re
from typing import List
from utils.upload_utils import resolve_or_publish_public_media

logger = logging.getLogger(__name__)
bp = Blueprint('post_images', __name__, url_prefix='/api/post-images')


def _convert_to_public_urls(image_urls: List[str]) -> List[str]:
    """
    將簽名預覽URL轉換為公開CDN/本地URL，供IG模板使用

    Args:
        image_urls: 可能包含簽名URL的圖片URL列表

    Returns:
        轉換後的公開URL列表
    """
    if not image_urls:
        return []

    converted_urls = []
    for url in image_urls:
        if not url:
            continue

        # 檢查是否為簽名預覽URL格式
        # 格式: /api/moderation/media/preview?mid=1&exp=...&sig=...
        if "mid=" in url and "exp=" in url and "sig=" in url:
            try:
                # 提取media_id
                match = re.search(r'mid=(\d+)', url)
                if match:
                    media_id = int(match.group(1))

                    # 轉換為公開URL (已核准的媒體會自動上傳到CDN)
                    public_url = resolve_or_publish_public_media("", media_id, None)
                    if public_url:
                        converted_urls.append(public_url)
                        logger.info(f"轉換簽名URL為公開URL: {media_id} -> {public_url}")
                    else:
                        logger.warning(f"無法轉換媒體ID {media_id} 為公開URL")
                        # 保留原始URL作為備選
                        converted_urls.append(url)
                else:
                    # 無法解析media_id，保留原始URL
                    converted_urls.append(url)
            except Exception as e:
                logger.error(f"轉換簽名URL時發生錯誤: {e}")
                # 保留原始URL作為備選
                converted_urls.append(url)
        else:
            # 非簽名URL，直接保留
            converted_urls.append(url)

    return converted_urls


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

        # DEBUG: 詳細檢查收到的配置
        logger.info(f"[預覽API] 收到配置結構:")
        logger.info(f"[預覽API] config keys: {list(config.keys()) if config else '無配置'}")
        if "textLayout" in config:
            logger.info(f"[預覽API] textLayout: {config['textLayout']}")
        else:
            logger.info(f"[預覽API] 沒有找到 textLayout 配置")

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


@bp.route('/publish-image', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def generate_publish_image():
    """
    生成發布圖片 - 儲存到 /uploads/public/post/instagram/
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
        size = data.get("size", "instagram_square")
        template = data.get("template", "modern")
        config = data.get("config", {})
        logo_url = data.get("logo_url")
        quality = data.get("quality", 95)  # 發布用高品質
        custom_filename = data.get("custom_filename")  # 可自訂檔名

        # 使用統一渲染器生成並保存發布圖片
        renderer = get_renderer()
        result = renderer.save_image(
            content=content,
            size=size,
            template=template,
            config=config,
            logo_url=logo_url,
            quality=quality,
            purpose="publish",
            custom_filename=custom_filename
        )

        return jsonify({
            "success": True,
            "data": {
                "image_url": result["full_url"],
                "filename": result["filename"],
                "file_path": result["url_path"],
                "dimensions": result["dimensions"],
                "file_size": result["file_size"],
                "purpose": "publish"
            }
        })

    except Exception as e:
        logger.error(f"生成發布圖片失敗: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# 移除 HTML 預覽端點，所有預覽都使用真實圖片
# 原因：上傳到 Instagram 需要真實的圖片檔案，HTML 無法使用
# @bp.route('/preview-html', methods=['POST']) - 已移除


@bp.route('/preview-image', methods=['POST'])
@jwt_required()
def preview_actual_image():
    """
    生成實際的預覽圖片 - 使用統一渲染器並上傳到 CDN
    """
    try:
        # 設定 CDN 環境變數
        os.environ.setdefault('PUBLIC_CDN_URL', 'https://cdn.serelix.xyz')

        data = request.get_json() or {}

        # 內容數據
        content = {
            "title": data.get("title", ""),
            "text": data.get("text", ""),
            "author": data.get("author", ""),
            "created_at": data.get("created_at"),
            "school_name": data.get("school_name", ""),
            "id": data.get("id", ""),
            # **修復**: 轉換簽名URL為CDN/公開URL，避免過期問題
            "image_urls": _convert_to_public_urls(data.get("config", {}).get("image_urls", []))
        }

        # 配置選項
        size = data.get("size", "instagram_square")
        template = data.get("template", "modern")
        config = data.get("config", {})
        logo_url = data.get("logo_url")
        quality = data.get("quality", 90)  # 預覽用稍低品質

        # DEBUG: 詳細檢查收到的配置
        logger.info(f"[preview-image] 收到配置結構:")
        logger.info(f"[preview-image] config keys: {list(config.keys()) if config else '無配置'}")
        if "textLayout" in config:
            logger.info(f"[preview-image] textLayout: {config['textLayout']}")
        else:
            logger.info(f"[preview-image] 沒有找到 textLayout 配置")
        logger.info(f"[preview-image] image_urls: {config.get('image_urls', [])}")

        # **重要修復**: 檢查並補充必要的模板配置參數
        # 如果前端配置不完整，提供預覽用的最小配置
        required_keys = [
            'width', 'height', 'background_color', 'padding', 'font_size_content',
            'primary_color', 'line_spacing', 'text_align', 'vertical_align', 'max_lines',
            'timestamp_enabled', 'timestamp_position', 'timestamp_size', 'timestamp_color',
            'timestamp_format', 'timestamp_font', 'post_id_enabled', 'post_id_position',
            'post_id_size', 'post_id_color', 'post_id_format', 'post_id_font',
            'logo_enabled', 'logo_url', 'logo_size', 'logo_opacity', 'logo_position'
        ]

        # 為手機預覽提供最小可用配置
        preview_defaults = {
            'width': 1080,
            'height': 1080,
            'background_color': '#f8f9fa',
            'padding': 60,
            'font_family': '',
            'font_size_content': 32,
            'primary_color': '#2c3e50',
            'text_color': '#2c3e50',
            'line_spacing': 12,
            'text_align': 'center',
            'vertical_align': 'middle',
            'max_lines': 15,
            'timestamp_enabled': True,
            'timestamp_position': 'bottom-right',
            'timestamp_size': 18,
            'timestamp_color': '#7f8c8d',
            'timestamp_format': 'relative',  # 使用相對時間格式（如"5分鐘前"）
            'timestamp_font': '',
            'post_id_enabled': True,
            'post_id_position': 'top-left',
            'post_id_size': 20,
            'post_id_color': '#3498db',
            'post_id_format': '#{id}',
            'post_id_font': '',
            'logo_enabled': False,
            'logo_url': '',
            'logo_size': 80,
            'logo_opacity': 0.85,
            'logo_position': 'bottom-right'
        }

        # 合併配置：前端配置優先，缺少的使用預設值
        for key, default_value in preview_defaults.items():
            if key not in config or config[key] is None:
                config[key] = default_value

        # **重要**: 處理 textLayout 配置，這些不應該被預設值覆蓋
        if "textLayout" in config:
            text_layout = config["textLayout"]
            logger.info(f"[preview-image] 處理 textLayout: {text_layout}")

            # 檢查是否有圖片來決定使用哪套排版設定
            has_images = bool(config.get("image_urls", []))

            if has_images and "withPhoto" in text_layout:
                # 有照片時使用 withPhoto 設定
                with_photo = text_layout["withPhoto"]
                if "maxCharsPerLine" in with_photo:
                    config["max_chars_per_line"] = with_photo["maxCharsPerLine"]
                if "maxLines" in with_photo:
                    config["max_lines"] = with_photo["maxLines"]
                logger.info(f"[preview-image] 使用有照片排版: 每行{config.get('max_chars_per_line')}字，最多{config.get('max_lines')}行")
            elif "textOnly" in text_layout:
                # 純文字時使用 textOnly 設定
                text_only = text_layout["textOnly"]
                if "maxCharsPerLine" in text_only:
                    config["max_chars_per_line"] = text_only["maxCharsPerLine"]
                if "maxLines" in text_only:
                    config["max_lines"] = text_only["maxLines"]
                logger.info(f"[preview-image] 使用純文字排版: 每行{config.get('max_chars_per_line')}字，最多{config.get('max_lines')}行")

        logger.info(f"[預覽API] 已補充配置，共 {len(config)} 個參數")

        # 對於嵌套配置，也採用相同邏輯
        if "image" in config and "cards" in config["image"]:
            if "text" in config["image"]["cards"] and "font" in config["image"]["cards"]["text"]:
                if not config["image"]["cards"]["text"]["font"].strip():
                    config["image"]["cards"]["text"]["font"] = ""
            if "timestamp" in config["image"]["cards"] and "font" in config["image"]["cards"]["timestamp"]:
                if not config["image"]["cards"]["timestamp"]["font"].strip():
                    config["image"]["cards"]["timestamp"]["font"] = ""
            if "postId" in config["image"]["cards"] and "font" in config["image"]["cards"]["postId"]:
                if not config["image"]["cards"]["postId"]["font"].strip():
                    config["image"]["cards"]["postId"]["font"] = ""

        logger.info(f"[預覽圖片] 內容: {content.get('text', '')[:50]}...")
        logger.info(f"[預覽圖片] 配置: {config}")

        # **DEBUG**: 詳細檢查貼文ID配置
        print(f"[DEBUG preview-image] 收到的貼文ID配置:")
        print(f"[DEBUG preview-image] post_id_enabled: {config.get('post_id_enabled')}")
        print(f"[DEBUG preview-image] post_id_format: {config.get('post_id_format')}")
        print(f"[DEBUG preview-image] post_id_position: {config.get('post_id_position')}")
        print(f"[DEBUG preview-image] post_id_size: {config.get('post_id_size')}")
        print(f"[DEBUG preview-image] post_id_color: {config.get('post_id_color')}")
        print(f"[DEBUG preview-image] 內容ID: {content.get('id')}")
        print(f"[DEBUG preview-image] 完整config keys: {list(config.keys())}")

        # 使用統一渲染器生成並保存圖片
        renderer = get_renderer()
        result = renderer.save_image(
            content=content,
            size=size,
            template=template,
            config=config,
            logo_url=logo_url,
            quality=quality,
            purpose="preview"
        )

        if result["success"]:
            return jsonify({
                "success": True,
                "data": {
                    "image_url": result["full_url"],
                    "filename": result["filename"],
                    "file_path": result["url_path"],
                    "dimensions": result["dimensions"],
                    "file_size": result["file_size"],
                    "purpose": "preview",
                    "size": size,
                    "template": template,
                    "quality": quality,
                    "has_logo": bool(logo_url),
                    "created_at": int(time.time() * 1000)
                },
                "message": "預覽圖片生成成功"
            })
        else:
            raise Exception("統一渲染器保存失敗")

    except Exception as e:
        logger.error(f"預覽圖片生成失敗: {e}", exc_info=True)
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