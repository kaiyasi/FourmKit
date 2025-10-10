"""
Instagram 發布佇列管理路由
提供佇列查詢、狀態統計等功能
"""

from flask import Blueprint, jsonify, request, g
from sqlalchemy import and_, or_
from models.instagram import InstagramPost, InstagramAccount, PostStatus
from utils.ig_permissions import require_ig_permission
from utils.auth import role_required
from utils.db import get_session
from datetime import datetime, timedelta, timezone

bp = Blueprint('ig_queue', __name__, url_prefix='/api/admin/ig/queue')


@bp.route('', methods=['GET'])
@require_ig_permission("post", action="view")
def get_queue():
    """
    獲取發布佇列
    Query Parameters:
        - status: 篩選狀態 (pending/rendering/ready/publishing)
        - limit: 返回數量限制 (預設 50)
        - offset: 偏移量 (預設 0)
    """
    try:
        with get_session() as session:
            # 獲取查詢參數
            status = request.args.get('status', '')
            limit = int(request.args.get('limit', 50))
            offset = int(request.args.get('offset', 0))

            # 構建查詢
            query = session.query(InstagramPost).join(InstagramAccount)

            # 狀態篩選
            if status:
                query = query.filter(InstagramPost.status == status)
            else:
                # 預設只顯示未完成的
                query = query.filter(InstagramPost.status.in_(['pending', 'rendering', 'ready', 'publishing']))

            # 排序：優先級高的在前，然後按建立時間
            query = query.order_by(InstagramPost.created_at.asc())

            # 分頁
            total = query.count()
            posts = query.limit(limit).offset(offset).all()

            # 格式化返回
            queue_data = []
            for post in posts:
                # 為沒有時區的 datetime 加上 UTC 標記
                created_at = post.created_at.replace(tzinfo=timezone.utc) if post.created_at.tzinfo is None else post.created_at
                updated_at = post.updated_at.replace(tzinfo=timezone.utc) if post.updated_at.tzinfo is None else post.updated_at
                scheduled_at = None
                if post.scheduled_at:
                    scheduled_at = post.scheduled_at.replace(tzinfo=timezone.utc) if post.scheduled_at.tzinfo is None else post.scheduled_at

                queue_data.append({
                    'id': post.id,
                    'public_id': post.public_id,
                    'forum_post_id': post.forum_post_id,
                    'forum_post_title': post.forum_post_title or f'貼文 #{post.forum_post_id}',
                    'account_username': post.account.username if post.account else 'Unknown',
                    'status': post.status,
                    'publish_mode': post.publish_mode,
                    'carousel_group_id': post.carousel_group_id,
                    'scheduled_at': scheduled_at.isoformat() if scheduled_at else None,
                    'created_at': created_at.isoformat(),
                    'updated_at': updated_at.isoformat()
                })

            return jsonify({
                'queue': queue_data,
                'total': total,
                'limit': limit,
                'offset': offset
            }), 200

    except Exception as e:
        print(f'[IG Queue] Error fetching queue: {e}')
        return jsonify({'error': str(e)}), 500


@bp.route('/stats', methods=['GET'])
@require_ig_permission("post", action="view")
def get_queue_stats():
    """獲取佇列統計資訊"""
    try:
        with get_session() as session:
            # 統計各狀態的數量
            total_pending = session.query(InstagramPost).filter(InstagramPost.status == 'pending').count()
            total_rendering = session.query(InstagramPost).filter(InstagramPost.status == 'rendering').count()
            total_ready = session.query(InstagramPost).filter(InstagramPost.status == 'ready').count()
            total_publishing = session.query(InstagramPost).filter(InstagramPost.status == 'publishing').count()

            # 按帳號統計
            accounts_stats = []
            accounts = session.query(InstagramAccount).filter(InstagramAccount.is_active == True).all()

            for account in accounts:
                ready_count = session.query(InstagramPost).filter(
                    and_(
                        InstagramPost.ig_account_id == account.id,
                        InstagramPost.status == 'ready'
                    )
                ).count()

                # 判斷是否達到批次發布條件
                batch_ready = False
                # 使用模型欄位 batch_count（非 batch_size）
                if account.publish_mode == 'batch' and ready_count >= (getattr(account, 'batch_count', None) or 0):
                    batch_ready = True

                accounts_stats.append({
                    'account_id': account.id,
                    'username': account.username,
                    'publish_mode': account.publish_mode,
                    'ready_count': ready_count,
                    'batch_ready': batch_ready
                })

            return jsonify({
                'total_pending': total_pending,
                'total_rendering': total_rendering,
                'total_ready': total_ready,
                'total_publishing': total_publishing,
                'accounts': accounts_stats
            }), 200

    except Exception as e:
        print(f'[IG Queue] Error fetching stats: {e}')
        return jsonify({'error': str(e)}), 500


@bp.route('/cancel/<int:post_id>', methods=['POST'])
@role_required(['dev_admin'])
def cancel_post(post_id):
    """取消發布任務（僅 dev_admin）"""
    try:
        with get_session() as session:
            post = session.query(InstagramPost).filter(InstagramPost.id == post_id).first()

            if not post:
                return jsonify({'error': '貼文不存在'}), 404

            # 只能取消未發布的
            if post.status in ['published', 'failed', 'cancelled']:
                return jsonify({'error': f'無法取消狀態為 {post.status} 的貼文'}), 400

            post.status = 'cancelled'
            post.updated_at = datetime.utcnow()
            session.commit()

            return jsonify({'message': '已取消發布'}), 200

    except Exception as e:
        print(f'[IG Queue] Error cancelling post: {e}')
        return jsonify({'error': str(e)}), 500


@bp.route('/clear', methods=['POST'])
@role_required(['dev_admin'])
def clear_queue():
    """清空 IG 發布佇列。

    預設：軟清空（將 pending/rendering/ready/publishing 標記為 cancelled）。
    若帶 query `delete=true` 則硬清空（直接刪除上述狀態的貼文記錄）。
    """
    try:
        do_delete = (request.args.get('delete') or '').strip().lower() in {'1','true','yes'}
        target_status = ['pending', 'rendering', 'ready', 'publishing']

        with get_session() as session:
            if do_delete:
                # 硬刪除：直接刪掉未完成的貼文
                q = session.query(InstagramPost).filter(InstagramPost.status.in_(target_status))
                count = q.count()
                # 清除以免殘留關聯
                for p in q.all():
                    session.delete(p)
                session.commit()
                return jsonify({'ok': True, 'mode': 'hard', 'deleted': count}), 200
            else:
                # 軟清理：標記為 cancelled 並清除批次資訊
                q = session.query(InstagramPost).filter(InstagramPost.status.in_(target_status))
                count = 0
                now = datetime.utcnow().replace(tzinfo=timezone.utc)
                for p in q.all():
                    p.status = 'cancelled'
                    p.updated_at = now
                    # 解除輪播群組
                    p.carousel_group_id = None
                    p.carousel_position = None
                    p.carousel_total = None
                session.commit()
                count = q.count()  # 重新計數已不重要，但保留為 0 或使用前一個值
                return jsonify({'ok': True, 'mode': 'soft', 'affected': count}), 200
    except Exception as e:
        print(f'[IG Queue] Error clearing queue: {e}')
        return jsonify({'error': str(e)}), 500
