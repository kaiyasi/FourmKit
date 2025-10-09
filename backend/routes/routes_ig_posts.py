"""
Instagram 發布管理 API
支援發布記錄查詢、重試、統計
"""

from flask import Blueprint, request, jsonify, g
from sqlalchemy import func, and_
from datetime import datetime, timedelta, timezone
from models import InstagramPost, PostStatus, PublishMode, InstagramAccount
from utils.db import get_session
from utils.ig_permissions import require_ig_permission


bp = Blueprint('ig_posts', __name__, url_prefix='/api/admin/ig/posts')


@bp.route('', methods=['GET'])
@require_ig_permission("post", action="view")
def list_posts():
    """
    列出發布記錄

    Query Parameters:
        - account_id: 帳號 ID
        - status: 發布狀態（pending/rendering/ready/publishing/published/failed/cancelled）
        - publish_mode: 發布模式（instant/batch/scheduled）
        - carousel_group_id: 輪播組 ID
        - start_date: 開始日期（YYYY-MM-DD）
        - end_date: 結束日期（YYYY-MM-DD）
        - page: 頁碼
        - per_page: 每頁數量
    """
    with get_session() as db:
        try:
            query = db.query(InstagramPost).join(InstagramAccount)

            # 權限過濾：只能查看自己學校的貼文
            if g.user.role == 'campus_admin':
                query = query.filter(InstagramAccount.school_id == g.user.school_id)

            # 篩選條件
            account_id = request.args.get('account_id', type=int)
            if account_id:
                query = query.filter(InstagramPost.ig_account_id == account_id)

            status = request.args.get('status')
            if status:
                try:
                    query = query.filter(InstagramPost.status == PostStatus(status.lower()))
                except ValueError:
                    return jsonify({'error': 'Bad request', 'message': f'無效的狀態: {status}'}), 400

            publish_mode = request.args.get('publish_mode')
            if publish_mode:
                try:
                    query = query.filter(InstagramPost.publish_mode == PublishMode(publish_mode.lower()))
                except ValueError:
                    return jsonify({'error': 'Bad request', 'message': f'無效的發布模式: {publish_mode}'}), 400

            carousel_group_id = request.args.get('carousel_group_id')
            if carousel_group_id:
                query = query.filter(InstagramPost.carousel_group_id == carousel_group_id)

            # 日期範圍篩選
            start_date = request.args.get('start_date')
            if start_date:
                try:
                    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                    query = query.filter(InstagramPost.created_at >= start_dt)
                except ValueError:
                    return jsonify({'error': 'Bad request', 'message': '無效的開始日期格式'}), 400

            end_date = request.args.get('end_date')
            if end_date:
                try:
                    end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
                    query = query.filter(InstagramPost.created_at < end_dt)
                except ValueError:
                    return jsonify({'error': 'Bad request', 'message': '無效的結束日期格式'}), 400

            # 分頁
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 20, type=int)

            total = query.count()
            posts = query.order_by(InstagramPost.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

            # 序列化
            result = []
            for post in posts:
                # 為沒有時區的 datetime 加上 UTC 標記
                def add_tz(dt):
                    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt

                result.append({
                    'id': post.id,
                    'public_id': post.public_id,
                    'forum_post_id': post.forum_post_id,
                    'account_id': post.ig_account_id,
                    'account_username': post.account.username,
                    'username': post.account.username,  # 前端相容字段
                    'template_id': post.template_id,
                    'template_name': post.template.name if post.template else None,
                    'status': post.status.value,
                    'publish_mode': post.publish_mode.value,
                    'carousel_group_id': post.carousel_group_id,
                    'carousel_position': post.carousel_position,
                    'carousel_total': post.carousel_total,
                    'ig_media_id': post.ig_media_id,
                    'ig_permalink': post.ig_permalink,
                    'rendered_image_cdn_path': post.rendered_image_cdn_path,
                    'rendered_caption': post.rendered_caption,
                    'scheduled_at': add_tz(post.scheduled_at).isoformat() if post.scheduled_at else None,
                    'published_at': add_tz(post.published_at).isoformat() if post.published_at else None,
                    'error_message': post.error_message,
                    'error_code': post.error_code,
                    'retry_count': post.retry_count,
                    'max_retries': post.max_retries,
                    'created_at': add_tz(post.created_at).isoformat()
                })

            return jsonify({
                'posts': result,
                'total': total,
                'page': page,
                'per_page': per_page
            }), 200

        except Exception as e:
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>', methods=['GET'])
@require_ig_permission("post", action="view", get_resource_id_from="path")
def get_post(id):
    """查看發布詳情"""
    with get_session() as db:
        try:
            post = db.query(InstagramPost).filter_by(id=id).first()

            if not post:
                return jsonify({'error': 'Not found', 'message': '發布記錄不存在'}), 404

            # 為沒有時區的 datetime 加上 UTC 標記
            def add_tz(dt):
                return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt

            return jsonify({
                'id': post.id,
                'public_id': post.public_id,
                'forum_post_id': post.forum_post_id,
                'forum_post_title': post.forum_post.title if post.forum_post else None,
                'forum_post_content': post.forum_post.content if post.forum_post else None,
                'account_id': post.ig_account_id,
                'account_username': post.account.username,
                'school_id': post.account.school_id,
                'school_name': post.account.school.school_name if post.account.school else '跨校',
                'template_id': post.template_id,
                'template_name': post.template.name if post.template else None,
                'status': post.status.value,
                'publish_mode': post.publish_mode.value,
                'carousel_group_id': post.carousel_group_id,
                'carousel_position': post.carousel_position,
                'carousel_total': post.carousel_total,
                'ig_media_id': post.ig_media_id,
                'ig_container_id': post.ig_container_id,
                'ig_permalink': post.ig_permalink,
                'rendered_image_cdn_path': post.rendered_image_cdn_path,
                'rendered_caption': post.rendered_caption,
                'scheduled_at': add_tz(post.scheduled_at).isoformat() if post.scheduled_at else None,
                'published_at': add_tz(post.published_at).isoformat() if post.published_at else None,
                'error_message': post.error_message,
                'error_code': post.error_code,
                'retry_count': post.retry_count,
                'max_retries': post.max_retries,
                'last_retry_at': add_tz(post.last_retry_at).isoformat() if post.last_retry_at else None,
                'created_at': add_tz(post.created_at).isoformat(),
                'updated_at': add_tz(post.updated_at).isoformat()
            }), 200

        except Exception as e:
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>/retry', methods=['POST'])
@require_ig_permission("post", action="update", get_resource_id_from="path")
def retry_post(id):
    """
    重試失敗的發布

    Request Body:
        {
            "reset_retry_count": bool (可選，預設 false)
        }
    """
    with get_session() as db:
        try:
            post = db.query(InstagramPost).filter_by(id=id).first()

            if not post:
                return jsonify({'error': 'Not found', 'message': '發布記錄不存在'}), 404

            if post.status != PostStatus.FAILED:
                return jsonify({'error': 'Bad request', 'message': '只能重試失敗的貼文'}), 400

            if post.retry_count >= post.max_retries:
                return jsonify({'error': 'Bad request', 'message': '已達到最大重試次數'}), 400

            data = request.get_json() or {}
            reset_retry_count = data.get('reset_retry_count', False)

            # 重置狀態
            post.status = PostStatus.PENDING
            post.error_message = None
            post.error_code = None

            if reset_retry_count:
                post.retry_count = 0

            db.commit()

            return jsonify({'message': '已將貼文重新加入發布佇列'}), 200

        except Exception as e:
            db.rollback()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/stats', methods=['GET'])
@require_ig_permission("post", action="view")
def get_stats():
    """
    獲取發布統計資訊

    Query Parameters:
        - account_id: 帳號 ID（可選）
        - days: 統計天數（預設 7）
    """
    with get_session() as db:
        try:
            days = request.args.get('days', 7, type=int)
            start_date = datetime.utcnow() - timedelta(days=days)

            # 基礎查詢
            query = db.query(InstagramPost).join(InstagramAccount)

            # 權限過濾
            if g.user.role == 'campus_admin':
                query = query.filter(InstagramAccount.school_id == g.user.school_id)

            # 帳號篩選
            account_id = request.args.get('account_id', type=int)
            if account_id:
                query = query.filter(InstagramPost.ig_account_id == account_id)

            # 日期篩選
            query = query.filter(InstagramPost.created_at >= start_date)

            # 統計各狀態數量
            status_stats = {}
            for status in PostStatus:
                count = query.filter(InstagramPost.status == status).count()
                status_stats[status.value] = count

            # 今日發布數量
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            today_published = query.filter(
                InstagramPost.status == PostStatus.PUBLISHED,
                InstagramPost.published_at >= today_start
            ).count()

            # 成功率
            total_attempts = query.filter(
                InstagramPost.status.in_([PostStatus.PUBLISHED, PostStatus.FAILED])
            ).count()
            success_count = status_stats.get(PostStatus.PUBLISHED.value, 0)
            success_rate = (success_count / total_attempts * 100) if total_attempts > 0 else 0

            # 狀態分類統計（提供給前端儀表）
            total_ready = status_stats.get(PostStatus.READY.value, 0)
            total_pending = (
                status_stats.get(PostStatus.PENDING.value, 0)
                + status_stats.get(PostStatus.RENDERING.value, 0)
                + status_stats.get(PostStatus.PUBLISHING.value, 0)
            )
            total_failed = status_stats.get(PostStatus.FAILED.value, 0)

            # 保留舊欄位以向下相容
            pending_count = total_pending + total_ready
            failed_count = total_failed

            return jsonify({
                'period_days': days,
                'today_published': today_published,
                'total_ready': total_ready,
                'total_pending': total_pending,
                'total_failed': total_failed,
                'pending_count': pending_count,
                'failed_count': failed_count,
                'success_rate': round(success_rate, 2),
                'status_breakdown': status_stats,
                'total_in_period': sum(status_stats.values())
            }), 200

        except Exception as e:
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/publish/carousel', methods=['POST'])
@require_ig_permission("post", action="create")
def publish_carousel():
    """
    使用平台內 IG 帳號，將指定論壇貼文生出 IG 圖與文案並發布為輪播。

    Request Body:
        {
          "forum_post_ids": [104,105],       # 必填，2-10 筆
          "account_id": int (可選),          # 不提供時，若平台僅有一個啟用帳號則自動選用
          "render": true/false (可選, 預設 true)  # 是否先渲染
        }

    Returns:
        200 OK: {
          "ok": true,
          "account_id": 1,
          "ig_post_ids": [123,124],
          "published": true,
          "message": "..."
        }
    """
    from utils.db import get_session
    from services.ig_queue_manager import IGQueueManager
    from services.ig_publisher import IGPublisher
    from models import InstagramAccount, InstagramPost, PublishMode, PostStatus, Post

    data = request.get_json(silent=True) or {}
    forum_post_ids = data.get('forum_post_ids') or []
    render = bool(data.get('render', True))
    account_id = data.get('account_id')

    if not isinstance(forum_post_ids, list) or len(forum_post_ids) < 2:
        return jsonify({'error': 'Bad request', 'message': '需要提供至少 2 個論壇貼文 ID'}), 400
    if len(forum_post_ids) > 10:
        return jsonify({'error': 'Bad request', 'message': '最多 10 張輪播'}), 400

    with get_session() as db:
        try:
            # 自動選帳號：若未指定，且僅有一個啟用帳號則選之
            if not account_id:
                accounts = db.query(InstagramAccount).filter_by(is_active=True).all()
                if len(accounts) == 0:
                    return jsonify({'error': 'Bad request', 'message': '沒有啟用的 IG 帳號'}), 400
                if len(accounts) > 1:
                    return jsonify({'error': 'Bad request', 'message': '有多個 IG 帳號，請明確指定 account_id'}), 400
                account_id = accounts[0].id

            account = db.query(InstagramAccount).filter_by(id=account_id, is_active=True).first()
            if not account:
                return jsonify({'error': 'Bad request', 'message': f'IG 帳號 {account_id} 不存在或未啟用'}), 400

            # 檢查論壇貼文存在
            posts = db.query(Post).filter(Post.id.in_(forum_post_ids)).all()
            if len(posts) != len(set(forum_post_ids)):
                return jsonify({'error': 'Bad request', 'message': '部分論壇貼文不存在'}), 400

            queue = IGQueueManager(db)
            publisher = IGPublisher(db)

            ig_post_ids = []
            # 先確保每篇加入佇列（BATCH）
            for pid in forum_post_ids:
                ig_id = queue.add_to_queue(pid, account_id, publish_mode=PublishMode.BATCH)
                if not ig_id:
                    return jsonify({'error': 'Internal error', 'message': f'加入佇列失敗: forum_post_id={pid}'}), 500
                ig_post_ids.append(ig_id)

            # 渲染
            if render:
                for ig_id in ig_post_ids:
                    ok = queue.render_post(ig_id)
                    if not ok:
                        return jsonify({'error': 'Internal error', 'message': f'渲染失敗: ig_post_id={ig_id}'}), 500

            # 發布輪播
            ok = publisher.publish_carousel(account_id, ig_post_ids)
            return jsonify({
                'ok': bool(ok),
                'account_id': account_id,
                'ig_post_ids': ig_post_ids,
                'published': bool(ok),
                'message': '輪播發布成功' if ok else '輪播發布失敗'
            }), 200 if ok else 500

        except Exception as e:
            db.rollback()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500
