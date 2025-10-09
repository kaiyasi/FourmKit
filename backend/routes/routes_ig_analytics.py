"""
Instagram 統計分析 API
支援發布成功率、處理時間、錯誤分析
"""

from flask import Blueprint, request, jsonify, g
from sqlalchemy import func, and_, case
from datetime import datetime, timedelta
from models import InstagramPost, PostStatus, PublishMode, InstagramAccount
from utils.db import get_session
from utils.ig_permissions import require_ig_permission


bp = Blueprint('ig_analytics', __name__, url_prefix='/api/admin/ig/analytics')


@bp.route('/overview', methods=['GET'])
@require_ig_permission("post", action="view")
def get_overview():
    """獲取統計概覽"""
    with get_session() as db:
        try:
            days = request.args.get('days', 7, type=int)
            start_date = datetime.utcnow() - timedelta(days=days)
            query = db.query(InstagramPost).join(InstagramAccount)
            if g.user.role == 'campus_admin':
                query = query.filter(InstagramAccount.school_id == g.user.school_id)
            account_id = request.args.get('account_id', type=int)
            if account_id:
                query = query.filter(InstagramPost.ig_account_id == account_id)
            query = query.filter(InstagramPost.created_at >= start_date)
            total_posts = query.count()
            published_count = query.filter(InstagramPost.status == PostStatus.PUBLISHED).count()
            failed_count = query.filter(InstagramPost.status == PostStatus.FAILED).count()
            pending_count = query.filter(InstagramPost.status.in_([PostStatus.PENDING, PostStatus.RENDERING, PostStatus.READY])).count()
            completed_count = published_count + failed_count
            success_rate = (published_count / completed_count * 100) if completed_count > 0 else 0
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            today_published = query.filter(InstagramPost.status == PostStatus.PUBLISHED, InstagramPost.published_at >= today_start).count()
            return jsonify({'period_days': days, 'total_posts': total_posts, 'published_count': published_count, 'failed_count': failed_count, 'pending_count': pending_count, 'success_rate': round(success_rate, 2), 'today_published': today_published}), 200
        except Exception as e:
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500
