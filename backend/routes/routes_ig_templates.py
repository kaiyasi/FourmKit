"""
Instagram 模板管理 API
支援模板 CRUD、預覽、複製
"""

from flask import Blueprint, request, jsonify, g
from werkzeug.utils import secure_filename
import os
import time
from sqlalchemy import and_
from datetime import datetime
from models import IGTemplate, TemplateType, Post
from utils.db import get_session
from utils.ig_permissions import require_ig_permission
from services.ig_renderer import IGRenderer
from services.ig_caption_generator import IGCaptionGenerator


bp = Blueprint('ig_templates', __name__, url_prefix='/api/admin/ig/templates')


@bp.route('', methods=['GET'])
@require_ig_permission("template", action="view")
def list_templates():
    """
    列出模板

    Query Parameters:
        - school_id: 學校 ID（僅 super_admin 可用）
        - template_type: 模板類型（announcement/general）
        - is_active: 是否啟用
        - include_global: 是否包含全域模板（預設 true）
    """
    with get_session() as db:
        try:
            print(f"[Template List] Starting list_templates", flush=True)
            query = db.query(IGTemplate)

            if g.user.role == 'campus_admin':
                include_global = request.args.get('include_global', 'true').lower() == 'true'
                if include_global:
                    query = query.filter(
                        (IGTemplate.school_id == g.user.school_id) | (IGTemplate.school_id.is_(None))
                    )
                else:
                    query = query.filter(IGTemplate.school_id == g.user.school_id)
            else:
                school_id = request.args.get('school_id')
                if school_id is not None:
                    if school_id == 'global':
                        query = query.filter(IGTemplate.school_id.is_(None))
                    else:
                        query = query.filter(IGTemplate.school_id == int(school_id))

            template_type = request.args.get('template_type')
            if template_type:
                try:
                    query = query.filter(IGTemplate.template_type == TemplateType(template_type.lower()))
                except ValueError:
                    return jsonify({'error': 'Bad request', 'message': '無效的模板類型'}), 400

            is_active = request.args.get('is_active')
            if is_active is not None:
                query = query.filter(IGTemplate.is_active == (is_active.lower() == 'true'))

            templates = query.order_by(IGTemplate.created_at.desc()).all()

            result = []
            for tpl in templates:
                result.append({
                    'id': tpl.id,
                    'name': tpl.name,
                    'description': tpl.description,
                    'school_id': tpl.school_id,
                    'school_name': tpl.school.name if tpl.school else '全域模板',
                    'template_type': tpl.template_type.value,
                    'is_active': tpl.is_active,
                    'usage_count': tpl.usage_count,
                    'last_used_at': tpl.last_used_at.isoformat() if tpl.last_used_at else None,
                    'created_at': tpl.created_at.isoformat(),
                    'canvas_config': tpl.canvas_config,
                    'text_with_attachment': tpl.text_with_attachment,
                    'text_without_attachment': tpl.text_without_attachment,
                    'attachment_config': tpl.attachment_config,
                    'logo_config': tpl.logo_config,
                    'watermark_config': tpl.watermark_config,
                    'caption_template': tpl.caption_template
                })

            return jsonify({'templates': result}), 200

        except Exception as e:
            print(f"[Template List] Exception: {type(e).__name__}: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>', methods=['GET'])
@require_ig_permission("template", action="view", get_resource_id_from="path")
def get_template(id):
    """查看模板詳情（包含完整配置）"""
    with get_session() as db:
        try:
            template = db.query(IGTemplate).filter_by(id=id).first()

            if not template:
                return jsonify({'error': 'Not found', 'message': '模板不存在'}), 404

            def _reply_from(ct: dict) -> dict:
                if not isinstance(ct, dict):
                    return {}
                r = ct.get('reply') or {}
                return r if isinstance(r, dict) else {}

            return jsonify({
                'id': template.id,
                'name': template.name,
                'description': template.description,
                'school_id': template.school_id,
                'school_name': template.school.name if template.school else '全域模板',
                'template_type': template.template_type.value,
                'canvas_config': template.canvas_config,
                'text_with_attachment': template.text_with_attachment,
                'text_without_attachment': template.text_without_attachment,
                'attachment_config': template.attachment_config,
                'logo_config': template.logo_config,
                'watermark_config': template.watermark_config,
                'caption_template': template.caption_template,
                'reply_format': _reply_from(template.caption_template),
                'is_active': template.is_active,
                'usage_count': template.usage_count,
                'last_used_at': template.last_used_at.isoformat() if template.last_used_at else None,
                'created_at': template.created_at.isoformat(),
                'updated_at': template.updated_at.isoformat()
            }), 200

        except Exception as e:
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('', methods=['POST'])
@require_ig_permission("template", action="create")
def create_template():
    """
    創建模板

    Request Body:
        {
            "name": str,
            "description": str (可選),
            "school_id": int (可選，super_admin 專用),
            "template_type": "announcement" | "general",
            "canvas_config": {...},
            "text_with_attachment": {...},
            "text_without_attachment": {...},
            "attachment_config": {...},
            "logo_config": {...},
            "watermark_config": {...},
            "caption_template": {...}
        }
    """
    with get_session() as db:
        try:
            data = request.get_json()
            print(f"[Template Create] Received data keys: {list(data.keys())}", flush=True)

            required_fields = ['name', 'template_type', 'canvas_config']
            for field in required_fields:
                if field not in data:
                    print(f"[Template Create] Missing required field: {field}", flush=True)
                    return jsonify({'error': 'Bad request', 'message': f'缺少必填欄位：{field}'}), 400

            if 'caption_template' not in data:
                data['caption_template'] = {"template": "{title}\n\n{content}", "hashtags": []}

            if 'text_config' in data and 'text_with_attachment' not in data:
                data['text_with_attachment'] = data['text_config']
                data['text_without_attachment'] = data['text_config']
                print(f"[Template Create] Converted text_config to text_with/without_attachment", flush=True)

            try:
                print(f"[Template Create] template_type value: {data['template_type']}", flush=True)
                template_type = TemplateType(data['template_type'].lower())
                print(f"[Template Create] Parsed template_type: {template_type}", flush=True)
            except ValueError as e:
                print(f"[Template Create] Invalid template_type: {e}", flush=True)
                return jsonify({'error': 'Bad request', 'message': '無效的模板類型'}), 400

            school_id = data.get('school_id')
            if g.user.role == 'campus_admin':
                school_id = g.user.school_id
            elif school_id is None and g.user.role == 'super_admin':
                pass

            duplicate_query = db.query(IGTemplate).filter(
                IGTemplate.name == data['name'],
                IGTemplate.template_type == template_type,
            )
            if school_id is None:
                duplicate_query = duplicate_query.filter(IGTemplate.school_id.is_(None))
            else:
                duplicate_query = duplicate_query.filter(IGTemplate.school_id == school_id)

            existing_template = duplicate_query.first()
            if existing_template:
                return jsonify({
                    'error': 'Conflict',
                    'message': '同名稱的模板已存在',
                    'template_id': existing_template.id,
                }), 409

            template = IGTemplate(
                name=data['name'],
                description=data.get('description'),
                school_id=school_id,
                template_type=template_type,
                canvas_config=data['canvas_config'],
                text_with_attachment=data.get('text_with_attachment'),
                text_without_attachment=data.get('text_without_attachment'),
                attachment_config=data.get('attachment_config'),
                logo_config=data.get('logo_config'),
                watermark_config=data.get('watermark_config'),
                caption_template=data['caption_template'],
                is_active=True
            )

            db.add(template)
            db.commit()

            return jsonify({
                'message': '模板已創建',
                'template_id': template.id
            }), 201

        except Exception as e:
            db.rollback()
            print(f"[Template Create] Exception: {type(e).__name__}: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>', methods=['PATCH'])
@require_ig_permission("template", action="update", get_resource_id_from="path")
def update_template(id):
    """
    更新模板

    Request Body:
        所有欄位皆為可選，只更新提供的欄位
    """
    with get_session() as db:
        try:
            template = db.query(IGTemplate).filter_by(id=id).first()

            if not template:
                return jsonify({'error': 'Not found', 'message': '模板不存在'}), 404

            data = request.get_json()

            if 'name' in data:
                template.name = data['name']
            if 'description' in data:
                template.description = data['description']

            if 'template_type' in data:
                try:
                    template.template_type = TemplateType(data['template_type'].lower())
                except ValueError:
                    return jsonify({'error': 'Bad request', 'message': '無效的模板類型'}), 400

            config_fields = [
                'canvas_config', 'text_with_attachment', 'text_without_attachment',
                'attachment_config', 'logo_config', 'watermark_config', 'caption_template'
            ]
            for field in config_fields:
                if field in data:
                    if field in ['text_without_attachment', 'watermark_config']:
                        print(f"[Template Update] {field}: {data[field]}", flush=True)
                    setattr(template, field, data[field])

            if 'reply_format' in data:
                rf = data.get('reply_format') or {}
                ct = template.caption_template or {}
                if not isinstance(ct, dict):
                    ct = {}
                ct['reply'] = rf
                template.caption_template = ct

            if 'is_active' in data:
                template.is_active = data['is_active']

            db.commit()

            return jsonify({'message': '模板已更新'}), 200

        except Exception as e:
            db.rollback()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>', methods=['DELETE'])
@require_ig_permission("template", action="delete", get_resource_id_from="path")
def delete_template(id):
    """刪除模板（軟刪除：設為 is_active = false）"""
    with get_session() as db:
        try:
            template = db.query(IGTemplate).filter_by(id=id).first()

            if not template:
                return jsonify({'error': 'Not found', 'message': '模板不存在'}), 404

            from models import InstagramAccount
            using_accounts = db.query(InstagramAccount).filter(
                (InstagramAccount.announcement_template_id == id) |
                (InstagramAccount.general_template_id == id)
            ).count()

            if using_accounts > 0:
                return jsonify({
                    'error': 'Conflict',
                    'message': f'無法刪除：有 {using_accounts} 個帳號正在使用此模板'
                }), 409

            db.delete(template)
            db.commit()

            return jsonify({'message': '模板已刪除'}), 200

        except Exception as e:
            db.rollback()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>/duplicate', methods=['POST'])
def duplicate_template_route(id):
    """路由入口點 - 無需權限檢查的日誌"""
    print(f"[Template Duplicate ROUTE] Request received for id={id}", flush=True)
    return _duplicate_template(id)

@require_ig_permission("template", action="create")
def _duplicate_template(id):
    """
    複製模板

    Request Body:
        {
            "new_name": str (可選，預設為 "原名稱 (副本)")
        }
    """
    with get_session() as db:
        try:
            print(f"[Template Duplicate] Duplicating template id={id}", flush=True)
            original = db.query(IGTemplate).filter_by(id=id).first()

            if not original:
                return jsonify({'error': 'Not found', 'message': '模板不存在'}), 404

            data = request.get_json() or {}
            new_name = data.get('new_name', f"{original.name} (副本)")
            print(f"[Template Duplicate] New name: {new_name}", flush=True)

            duplicate = IGTemplate(
                name=new_name,
                description=original.description,
                school_id=original.school_id if g.user.role == 'campus_admin' else original.school_id,
                template_type=original.template_type,
                canvas_config=original.canvas_config,
                text_with_attachment=original.text_with_attachment,
                text_without_attachment=original.text_without_attachment,
                attachment_config=original.attachment_config,
                logo_config=original.logo_config,
                watermark_config=original.watermark_config,
                caption_template=original.caption_template,
                is_active=True
            )

            db.add(duplicate)
            db.commit()

            return jsonify({
                'message': '模板已複製',
                'template_id': duplicate.id
            }), 201

        except Exception as e:
            db.rollback()
            print(f"[Template Duplicate] Exception: {type(e).__name__}: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/logo/upload', methods=['POST'])
@require_ig_permission("template", action="update")
def upload_logo():
    """上傳自訂 Logo，回傳可用的檔案路徑"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'Bad request', 'message': '缺少檔案欄位 file'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Bad request', 'message': '未選擇檔案'}), 400

        filename = secure_filename(file.filename)
        name, ext = os.path.splitext(filename)
        if ext.lower() not in ['.png', '.jpg', '.jpeg', '.svg', '.webp']:
            return jsonify({'error': 'Bad request', 'message': '僅支援 PNG/JPG/SVG/WEBP'}), 400

        upload_dir = os.path.join('uploads', 'public', 'ig', 'logos')
        os.makedirs(upload_dir, exist_ok=True)
        ts = int(time.time() * 1000)
        final_name = f"logo_{ts}{ext.lower()}"
        file_path = os.path.join(upload_dir, final_name)

        file.save(file_path)

        public_path = f"/uploads/public/ig/logos/{final_name}"
        return jsonify({'message': '上傳成功', 'path': public_path}), 201

    except Exception as e:
        print(f"[Template Logo Upload] Exception: {type(e).__name__}: {e}", flush=True)
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>/preview', methods=['POST'])
@require_ig_permission("template", action="view", get_resource_id_from="path")
def preview_template(id):
    """
    預覽模板（使用測試資料渲染）

    Request Body:
        {
            "test_content": str,
            "test_media": [str] (CDN 路徑)
        }
    """
    with get_session() as db:
        try:
            template = db.query(IGTemplate).filter_by(id=id).first()

            if not template:
                return jsonify({'error': 'Not found', 'message': '模板不存在'}), 404

            data = request.get_json() or {}
            test_content = data.get('test_content', '這是測試內容')
            test_media = data.get('test_media', [])


            preview_url = None

            return jsonify({
                'preview_url': preview_url,
                'message': '預覽功能開發中'
            }), 200

        except Exception as e:
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/preview', methods=['POST'])
@require_ig_permission("template", action="view")
def preview_template_config():
    """以傳入的模板配置即時渲染預覽（無需先儲存）"""
    import uuid
    from datetime import datetime
    import os

    try:
        data = request.get_json() or {}
        template_config = data.get('template_config') or {}
        post_id = data.get('post_id')
        test_media = data.get('test_media') or []

        print(f"[Preview API] 收到請求: post_id={post_id}, test_media={test_media}")
        print(f"[Preview API] template_config keys: {list(template_config.keys())}")
        if 'text_without_attachment' in template_config:
            print(f"[Preview API] text_without_attachment: {template_config['text_without_attachment']}")
        if 'watermark_config' in template_config:
            print(f"[Preview API] watermark_config: {template_config['watermark_config']}")

        class TempTemplate:
            def __init__(self, config):
                self.canvas_config = config.get('canvas_config')
                self.text_with_attachment = config.get('text_with_attachment')
                self.text_without_attachment = config.get('text_without_attachment')
                self.attachment_config = config.get('attachment_config')
                self.logo_config = config.get('logo_config')
                self.watermark_config = config.get('watermark_config')
                self.caption_template = config.get('caption_template')

        template = TempTemplate(template_config)

        class TempPost:
            def __init__(self):
                self.id = 0
                self.content = '這是一段用於預覽的測試內容。'
                self.school = None
                self.announcement_type = None
                self.created_at = datetime.utcnow()

        real_post = None
        with get_session() as db:
            if post_id:
                real_post = db.query(Post).filter_by(id=post_id).first()
                if not real_post:
                    return jsonify({'error': 'Bad request', 'message': f'找不到貼文 ID: {post_id}'}), 400
            else:
                excluded_ids = [1, 2, 3, 4]
                real_post = db.query(Post).filter(
                    Post.is_advertisement == False,
                    Post.status == 'approved',
                    Post.id.notin_(excluded_ids)
                ).order_by(Post.created_at.desc()).first()

        if real_post:
            forum_post = TempPost()
            forum_post.id = real_post.id

            import re
            content = real_post.content
            content = re.sub(r'\*\*(.+?)\*\*', r'\1', content)
            content = re.sub(r'\*(.+?)\*', r'\1', content)
            content = re.sub(r'__(.+?)__', r'\1', content)
            content = re.sub(r'_(.+?)_', r'\1', content)
            content = re.sub(r'~~(.+?)~~', r'\1', content)
            content = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', content)
            content = re.sub(r'`(.+?)`', r'\1', content)
            content = re.sub(r'^#+\s+', '', content, flags=re.MULTILINE)
            forum_post.content = content

            forum_post.school = None
            forum_post.announcement_type = getattr(real_post, 'announcement_type', None)
            forum_post.created_at = real_post.created_at

            if not test_media and hasattr(real_post, 'media') and real_post.media:
                test_media = [media.path for media in real_post.media if hasattr(media, 'path')]
                print(f"[Preview API] 從貼文讀取媒體: {test_media}")
        else:
            forum_post = TempPost()

        media_list = []
        cdn_base_url = os.getenv("CDN_PUBLIC_BASE_URL", "https://cdn.serelix.xyz").rstrip("/")
        for media_path in test_media:
            if media_path.startswith('http://') or media_path.startswith('https://'):
                media_list.append(media_path)
            elif not media_path.startswith('/'):
                media_list.append(f"{cdn_base_url}/{media_path}")
            else:
                media_list.append(media_path)

        start_time = datetime.utcnow()
        renderer = IGRenderer(cdn_base_path="/app/uploads/public/ig/previews")
        print(f"[Preview] 開始渲染, cdn_base_path={renderer.cdn_base_path}")

        show_guides = bool((data or {}).get('show_guides') or (data or {}).get('guides'))
        try:
            setattr(renderer, 'show_guides', show_guides)
        except Exception:
            pass

        cdn_path = renderer.render_post(forum_post, template, media_list)

        print(f"[Preview] 渲染完成, cdn_path={cdn_path}")

        if cdn_path and not (str(cdn_path).startswith('http://') or str(cdn_path).startswith('https://')):
            full_path = os.path.join("/app/uploads", cdn_path)
            exists = os.path.exists(full_path)
            print(f"[Preview] 檔案檢查: {full_path} exists={exists}")

        if isinstance(cdn_path, str) and (cdn_path.startswith('http://') or cdn_path.startswith('https://')):
            preview_url = cdn_path
        else:
            preview_url = f"{cdn_base_url}/{str(cdn_path).lstrip('/')}"
        duration = (datetime.utcnow() - start_time).total_seconds()

        print(f"[Preview] 預覽回應: preview_url={preview_url}, duration={duration}")

        return jsonify({'preview_url': preview_url, 'duration': duration}), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Bad request', 'message': f'渲染失敗：{str(e)}'}), 400


@bp.route('/preview/caption', methods=['POST'])
@require_ig_permission("template", action="view")
def preview_caption():
    """生成 Caption 預覽（支援單篇和輪播）"""
    data = request.get_json() or {}
    template_config = data.get('template_config') or {}
    post_id = data.get('post_id')
    post_ids = data.get('post_ids')
    is_carousel = data.get('carousel', False)

    from utils.db import get_session
    from models import Post
    import logging

    logger = logging.getLogger(__name__)

    if is_carousel and post_ids:
        try:
            with get_session() as db:
                posts = db.query(Post).filter(Post.id.in_(post_ids)).all()
                if not posts:
                    return jsonify({'error': 'Not found', 'message': '找不到指定的貼文'}), 404

                from services.ig_caption_generator import IGCaptionGenerator
                caption_template = template_config.get('caption_template', {})

                if not caption_template:
                    return jsonify({'caption': ''}), 200

                class SimpleTemplate:
                    def __init__(self, caption_template):
                        self.caption_template = caption_template

                class SimpleAccount:
                    def __init__(self):
                        self.username = 'preview_account'

                generator = IGCaptionGenerator()
                template = SimpleTemplate(caption_template)
                account = SimpleAccount()

                caption = generator.generate_carousel_caption(posts, template, account)

                return jsonify({'caption': caption}), 200

        except Exception as e:
            logger.error(f"輪播 Caption 生成失敗: {e}", exc_info=True)
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500

    if not post_id:
        return jsonify({'error': 'Bad request', 'message': '缺少 post_id 或 post_ids'}), 400

    try:
        with get_session() as db:
            post = db.query(Post).filter_by(id=post_id).first()
            if not post:
                return jsonify({'error': 'Not found', 'message': f'找不到貼文 ID: {post_id}'}), 404

            from services.ig_caption_generator import IGCaptionGenerator
            caption_template = template_config.get('caption_template', {})

            if not caption_template:
                return jsonify({'caption': ''}), 200

            class SimpleTemplate:
                def __init__(self, caption_template):
                    self.caption_template = caption_template

            class SimpleAccount:
                def __init__(self):
                    self.username = 'preview_account'

            template = SimpleTemplate(caption_template)
            account = SimpleAccount()

            generator = IGCaptionGenerator()
            caption = generator.generate_single_caption(post, template, account)

            return jsonify({'caption': caption}), 200

    except Exception as e:
        logger.error(f"生成 Caption 預覽失敗: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500
@bp.route('/<int:id>/reply-format', methods=['GET'])
@require_ig_permission("template", action="view", get_resource_id_from="path")
def get_reply_format(id):
    with get_session() as db:
        tpl = db.query(IGTemplate).filter_by(id=id).first()
        if not tpl:
            return jsonify({'error': 'Not found', 'message': '模板不存在'}), 404
        rf = {}
        if isinstance(tpl.caption_template, dict):
            rf = tpl.caption_template.get('reply') or {}
        return jsonify({'reply_format': rf}), 200


@bp.route('/<int:id>/reply-format', methods=['PATCH'])
@require_ig_permission("template", action="update", get_resource_id_from="path")
def update_reply_format(id):
    with get_session() as db:
        tpl = db.query(IGTemplate).filter_by(id=id).first()
        if not tpl:
            return jsonify({'error': 'Not found', 'message': '模板不存在'}), 404
        data = request.get_json() or {}
        rf = data.get('reply_format') or {}
        ct = tpl.caption_template or {}
        if not isinstance(ct, dict):
            ct = {}
        if not isinstance(rf, dict):
            return jsonify({'error': 'Bad request', 'message': 'reply_format 必須是物件'}), 400
        ct['reply'] = rf
        tpl.caption_template = ct
        db.commit()
        return jsonify({'message': '回覆格式已更新'}), 200


@bp.route('/ui', methods=['GET'])
@require_ig_permission("template", action="view")
def reply_format_ui():
    """極簡前端：IG 模板『回覆格式』設定頁（無需前端打包即可使用）。

    使用方式：
      1) 取得 JWT（登入後從現有後台複製）
      2) 打開本頁 /api/admin/ig/templates/ui
      3) 貼上 JWT，載入模板，調整回覆格式並儲存
    """
    html = r"""
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>IG 模板回覆格式設定</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans TC', Arial; margin: 24px; }
    label { display: inline-block; min-width: 120px; }
    input[type=text], textarea, select { width: 420px; max-width: 100%; padding: 6px; }
    fieldset { margin: 16px 0; }
    .row { margin: 8px 0; }
    .muted { color: #666; font-size: 12px; }
    .ok { color: #06a14b; }
    .err { color: #c0392b; white-space: pre-wrap; }
    button { padding: 6px 12px; }
  </style>
</head>
<body>
  <h2>IG 模板回覆格式設定</h2>
  <div class="row">
    <label>JWT</label>
    <input type="text" id="jwt" placeholder="貼上 Bearer Token" />
    <button id="btnLoad">載入模板</button>
  </div>
  <div class="row">
    <label>選擇模板</label>
    <select id="tpl"></select>
    <button id="btnFetch">讀取設定</button>
  </div>

  <fieldset>
    <legend>通用回覆設定（未分開時圖片與 Caption 共用）</legend>
    <div class="row"><label>啟用</label><input type="checkbox" id="g_enabled" checked /></div>
    <div class="row"><label>前綴文字</label><input type="text" id="g_label" value="回覆貼文"/></div>
    <div class="row"><label>樣式</label>
      <select id="g_style"><option value="hashtag">hashtag</option><option value="plain">plain</option></select>
    </div>
    <div class="row"><label>ID 模板</label><input type="text" id="g_template" placeholder="例如：#{school_short_name}_{post_type}_{post_id}"/></div>
    <div class="muted">未提供 template 時，沿用 post_id_format；都沒有則 fallback 為 #&lt;reply_id&gt;</div>
  </fieldset>

  <fieldset>
    <legend>圖片專屬設定（可選）</legend>
    <div class="row"><label>啟用</label><input type="checkbox" id="img_enabled"/></div>
    <div class="row"><label>前綴文字</label><input type="text" id="img_label"/></div>
    <div class="row"><label>樣式</label>
      <select id="img_style"><option value="hashtag">hashtag</option><option value="plain">plain</option></select>
    </div>
    <div class="row"><label>ID 模板</label><input type="text" id="img_template"/></div>
  </fieldset>

  <fieldset>
    <legend>Caption 專屬設定（可選）</legend>
    <div class="row"><label>啟用</label><input type="checkbox" id="cap_enabled"/></div>
    <div class="row"><label>前綴文字</label><input type="text" id="cap_label"/></div>
    <div class="row"><label>樣式</label>
      <select id="cap_style"><option value="hashtag">hashtag</option><option value="plain">plain</option></select>
    </div>
    <div class="row"><label>ID 模板</label><input type="text" id="cap_template"/></div>
  </fieldset>

  <div class="row">
    <button id="btnSave">儲存回覆設定</button>
    <span id="msg" class="muted"></span>
  </div>

<script>
const $ = (id) => document.getElementById(id);
const api = (path, opt={}) => fetch(path, opt).then(r => r.json());

function currentTpl() { return $("tpl").value; }
function authHeaders() {
  const t = $("jwt").value.trim();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
}

$("btnLoad").onclick = async () => {
  $("msg").textContent = "載入中...";
  try {
    const r = await fetch('/api/admin/ig/templates?is_active=true', { headers: authHeaders() });
    const data = await r.json();
    const sel = $("tpl"); sel.innerHTML='';
    (data.templates || []).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = `${t.id} • ${t.name}`;
      sel.appendChild(opt);
    });
    $("msg").textContent = `載入完成，共 ${ (data.templates||[]).length } 筆`;
  } catch(e) {
    $("msg").textContent = '載入失敗';
  }
};

$("btnFetch").onclick = async () => {
  const id = currentTpl(); if(!id){ return; }
  $("msg").textContent = "讀取設定...";
  try {
    const r = await fetch(`/api/admin/ig/templates/${id}/reply-format`, { headers: authHeaders() });
    const data = await r.json();
    const rf = data.reply_format || {};
    // 通用
    $("g_enabled").checked = rf.enabled !== false;
    $("g_label").value = rf.label || '回覆貼文';
    $("g_style").value = rf.style || 'hashtag';
    $("g_template").value = rf.template || '';
    // image
    const img = rf.image || {};
    $("img_enabled").checked = img.enabled || false;
    $("img_label").value = img.label || '';
    $("img_style").value = img.style || 'hashtag';
    $("img_template").value = img.template || '';
    // caption
    const cap = rf.caption || {};
    $("cap_enabled").checked = cap.enabled || false;
    $("cap_label").value = cap.label || '';
    $("cap_style").value = cap.style || 'hashtag';
    $("cap_template").value = cap.template || '';
    $("msg").textContent = "設定已讀取";
  } catch(e) { $("msg").textContent = '讀取失敗'; }
};

$("btnSave").onclick = async () => {
  const id = currentTpl(); if(!id){ return; }
  const rf = {
    enabled: $("g_enabled").checked,
    label: $("g_label").value.trim(),
    style: $("g_style").value,
    template: $("g_template").value.trim()
  };
  const img = { enabled: $("img_enabled").checked, label: $("img_label").value.trim(), style: $("img_style").value, template: $("img_template").value.trim() };
  const cap = { enabled: $("cap_enabled").checked, label: $("cap_label").value.trim(), style: $("cap_style").value, template: $("cap_template").value.trim() };
  if (img.enabled || img.label || img.template) rf.image = img;
  if (cap.enabled || cap.label || cap.template) rf.caption = cap;

  $("msg").textContent = "儲存中...";
  try {
    const r = await fetch(`/api/admin/ig/templates/${id}/reply-format`, {
      method: 'PATCH',
      headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
      body: JSON.stringify({ reply_format: rf })
    });
    const data = await r.json();
    if (r.ok) { $("msg").textContent = '儲存成功'; $("msg").className='ok'; }
    else { $("msg").textContent = (data && data.message) || '儲存失敗'; $("msg").className='err'; }
  } catch(e) {
    $("msg").textContent = '儲存失敗'; $("msg").className='err';
  }
};
</script>
</body>
</html>
"""
    return html, 200, { 'Content-Type': 'text/html; charset=utf-8' }
