"""
貼文圖片生成 API - 功能已完全移除
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_session
from utils.authz import require_role
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('post_images', __name__, url_prefix='/api/post-images')

@bp.route('/generate/<int:post_id>', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def generate_post_image(post_id: int):
    """圖片生成功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "圖片生成功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410

@bp.route('/preview/<int:post_id>', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def preview_post_image(post_id: int):
    """圖片預覽功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "圖片預覽功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410




@bp.route('/preview', methods=['POST'])
@jwt_required()
def preview_post():
    """圖片預覽功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "圖片預覽功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410


@bp.route('/generate', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def generate_image():
    """圖片生成功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "圖片生成功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410


@bp.route('/from-post/<int:post_id>', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def generate_from_forum_post(post_id: int):
    """圖片生成功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "圖片生成功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410


@bp.route('/config', methods=['GET'])
@jwt_required()
def get_config():
    """配置功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "配置功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410


@bp.route('/publish-image', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def generate_publish_image():
    """圖片發布功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "圖片發布功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410


# 移除 HTML 預覽端點，所有預覽都使用真實圖片
# 原因：上傳到 Instagram 需要真實的圖片檔案，HTML 無法使用
# @bp.route('/preview-html', methods=['POST']) - 已移除


@bp.route('/preview-image', methods=['POST'])
@jwt_required()
def preview_actual_image():
    """圖片預覽功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "圖片預覽功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410


@bp.route('/test', methods=['GET', 'POST'])
def test_system():
    """系統測試功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "系統測試功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410


@bp.route('/preview-images', methods=['GET'])
@jwt_required()
def list_preview_images():
    """預覽圖片清單功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "預覽圖片清單功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410

@bp.route('/preview-images/cleanup', methods=['POST'])
@jwt_required()
@require_role("admin", "dev_admin")
def cleanup_preview_images():
    """預覽圖片清理功能已完全移除"""
    return jsonify({
        "success": False,
        "error": "預覽圖片清理功能已完全移除",
        "error_code": "FEATURE_REMOVED"
    }), 410

@bp.route('/preview-ui', methods=['GET'])
def preview_interface():
    """預覽介面已完全移除"""
    return """
    <html>
    <body>
        <h1>預覽介面已完全移除</h1>
        <p>圖片生成功能已完全移除，預覽介面不再可用。</p>
    </body>
    </html>
    """, 410