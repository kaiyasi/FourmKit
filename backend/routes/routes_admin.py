# 先 import 所有依賴
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.authz import require_role
from utils.notify import send_admin_event as notify_send_event
from sqlalchemy.orm import Session
from utils.db import get_session
from models import User, UserRole, School, DeleteRequest, Post, Comment
from werkzeug.security import generate_password_hash
from sqlalchemy import func, and_, or_, desc
from datetime import datetime, timezone, timedelta

bp = Blueprint("admin", __name__, url_prefix="/api/admin")

def _can_moderate_comment(moderator: User, comment: Comment, session) -> bool:
    """檢查用戶是否有權限審核特定留言"""
    from utils.school_permissions import can_moderate_content
    
    # 獲取留言相關信息
    post = comment.post
    
    # 使用統一的權限檢查函數
    return can_moderate_content(moderator, post.school_id)

# 留言監控 API
@bp.get('/comments/monitor')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator')
def monitor_comments():
    """獲取留言監控數據"""
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(100, max(1, int(request.args.get('per_page', 50))))
        status = request.args.get('status', '').strip() or None
        post_id = request.args.get('post_id', '').strip() or None
        keyword = request.args.get('keyword', '').strip() or None
        school_slug = request.args.get('school', '').strip() or None
        
        with get_session() as s:
            # 獲取當前用戶信息
            user_id = get_jwt_identity()
            if not user_id:
                return jsonify({'error': 'unauthorized'}), 401
            
            current_user = s.query(User).filter(User.id == user_id).first()
            if not current_user:
                return jsonify({'error': 'user not found'}), 404
            
            # 構建查詢
            query = s.query(Comment).join(Post)
            
            # 根據用戶權限過濾內容
            if current_user.role == 'campus_moderator':
                # 校內審核：只能看到自己學校的留言
                if current_user.school_id:
                    query = query.filter(Post.school_id == current_user.school_id)
                else:
                    return jsonify({'error': 'campus moderator must have school_id'}), 403
                    
            elif current_user.role == 'cross_moderator':
                # 跨校審核：只能看到跨校留言
                query = query.join(User, Comment.author_id == User.id)
                query = query.filter(User.school_id != Post.school_id)  # 作者和貼文不同學校
                if current_user.school_id:
                    # 排除自己學校的跨校留言（避免利益衝突）
                    query = query.filter(User.school_id != current_user.school_id)
                    
            elif current_user.role == 'campus_admin':
                # 校內管理員：可以處理自己學校的所有內容
                if current_user.school_id:
                    query = query.filter(Post.school_id == current_user.school_id)
                else:
                    return jsonify({'error': 'campus admin must have school_id'}), 403
                    
            elif current_user.role == 'cross_admin':
                # 跨校管理員：可以處理跨校內容
                query = query.join(User, Comment.author_id == User.id)
                query = query.filter(User.school_id != Post.school_id)  # 作者和貼文不同學校
                
            # dev_admin 可以看所有內容，不需要額外過濾
            
            # 狀態過濾
            if status:
                if status == 'pending':
                    query = query.filter(Comment.status == 'pending')
                elif status == 'approved':
                    query = query.filter(Comment.status == 'approved')
                elif status == 'rejected':
                    query = query.filter(Comment.status == 'rejected')
                elif status == 'deleted':
                    query = query.filter(Comment.is_deleted == True)
            
            # 貼文ID過濾
            if post_id:
                try:
                    post_id_int = int(post_id)
                    query = query.filter(Comment.post_id == post_id_int)
                except ValueError:
                    pass
            
            # 關鍵字搜尋
            if keyword:
                query = query.filter(Comment.content.ilike(f'%{keyword}%'))
            
            # 學校過濾
            if school_slug:
                school = s.query(School).filter(School.slug == school_slug).first()
                if school:
                    query = query.filter(Post.school_id == school.id)
            
            # 計算總數
            total = query.count()
            
            # 分頁
            offset = (page - 1) * per_page
            comments = query.order_by(desc(Comment.created_at)).offset(offset).limit(per_page).all()
            
            # 構建返回數據
            items = []
            for comment in comments:
                # 獲取相關信息
                post = comment.post
                author = s.query(User).filter(User.id == comment.author_id).first()
                post_school = s.query(School).filter(School.id == post.school_id).first() if post.school_id else None
                author_school = s.query(School).filter(School.id == author.school_id).first() if author and author.school_id else None
                
                # 判斷是否為跨校留言
                is_cross_school = False
                if author and author.school_id and post.school_id:
                    is_cross_school = author.school_id != post.school_id
                
                # 生成學校標籤：跨校不顯示，校內顯示 #XXXX(學校名稱)
                school_tag = None
                if not is_cross_school and author_school:
                    school_tag = f"#{author_school.code}({author_school.name})" if author_school.code else author_school.name
                
                items.append({
                    'id': comment.id,
                    'content': comment.content,
                    'status': 'deleted' if comment.is_deleted else comment.status,
                    'is_deleted': comment.is_deleted,
                    'created_at': comment.created_at.isoformat() if comment.created_at else None,
                    'updated_at': comment.updated_at.isoformat() if comment.updated_at else None,
                    'deleted_at': comment.deleted_at.isoformat() if comment.deleted_at else None,
                    'deleted_by': comment.deleted_by,
                    'post': {
                        'id': post.id,
                        'content': post.content,  # 完整內容
                        'status': post.status,
                        'school_name': post_school.name if post_school else None
                    },
                    'author': {
                        'id': author.id if author else None,
                        'username': author.username if author else '匿名',
                        'role': author.role if author else None,
                        'school_name': school_tag
                    },
                    'stats': {
                        'like_count': 0,  # 可以後續添加按讚功能
                        'reply_count': 0  # 可以後續添加回覆功能
                    }
                })
            
            return jsonify({
                'ok': True,
                'items': items,
                'total': total,
                'page': page,
                'per_page': per_page,
                'total_pages': (total + per_page - 1) // per_page
            })
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@bp.get('/comments/stats')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator')
def comment_stats():
    """獲取留言統計數據"""
    try:
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({'error': 'unauthorized'}), 401
        
        with get_session() as s:
            # 獲取當前用戶信息
            current_user = s.query(User).filter(User.id == user_id).first()
            if not current_user:
                return jsonify({'error': 'user not found'}), 404
            
            # 根據用戶權限構建基礎查詢
            base_query = s.query(Comment).join(Post)
            
            # 根據用戶權限過濾內容
            if current_user.role == 'campus_moderator':
                # 校內審核：只能看到自己學校的留言
                if current_user.school_id:
                    base_query = base_query.filter(Post.school_id == current_user.school_id)
                else:
                    return jsonify({'error': 'campus moderator must have school_id'}), 403
                    
            elif current_user.role == 'cross_moderator':
                # 跨校審核：只能看到跨校留言
                base_query = base_query.join(User, Comment.author_id == User.id)
                base_query = base_query.filter(User.school_id != Post.school_id)  # 作者和貼文不同學校
                if current_user.school_id:
                    # 排除自己學校的跨校留言（避免利益衝突）
                    base_query = base_query.filter(User.school_id != current_user.school_id)
                    
            elif current_user.role == 'campus_admin':
                # 校內管理員：可以處理自己學校的所有內容
                if current_user.school_id:
                    base_query = base_query.filter(Post.school_id == current_user.school_id)
                else:
                    return jsonify({'error': 'campus admin must have school_id'}), 403
                    
            elif current_user.role == 'cross_admin':
                # 跨校管理員：可以處理跨校內容
                base_query = base_query.join(User, Comment.author_id == User.id)
                base_query = base_query.filter(User.school_id != Post.school_id)  # 作者和貼文不同學校
                
            # dev_admin 可以看所有內容，不需要額外過濾
            # 總留言數
            total_comments = base_query.count()
            
            # 各狀態留言數
            pending_comments = base_query.filter(Comment.status == 'pending', Comment.is_deleted == False).count()
            approved_comments = base_query.filter(Comment.status == 'approved', Comment.is_deleted == False).count()
            rejected_comments = base_query.filter(Comment.status == 'rejected', Comment.is_deleted == False).count()
            deleted_comments = base_query.filter(Comment.is_deleted == True).count()
            
            # 今日新增留言數
            from datetime import datetime, timezone, timedelta
            today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            today_comments = base_query.filter(Comment.created_at >= today_start).count()
            
            # 本週新增留言數
            week_start = today_start - timedelta(days=today_start.weekday())
            week_comments = base_query.filter(Comment.created_at >= week_start).count()
            
            # 本月新增留言數
            month_start = today_start.replace(day=1)
            month_comments = base_query.filter(Comment.created_at >= month_start).count()
            
            return jsonify({
                'ok': True,
                'stats': {
                    'total': total_comments,
                    'pending': pending_comments,
                    'approved': approved_comments,
                    'rejected': rejected_comments,
                    'deleted': deleted_comments,
                    'today': today_comments,
                    'week': week_comments,
                    'month': month_comments
                }
            })
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@bp.post('/comments/<int:comment_id>/approve')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator')
def approve_comment(comment_id: int):
    """批准留言"""
    try:
        moderator_id = get_jwt_identity()
        if not moderator_id:
            return jsonify({'error': 'unauthorized'}), 401
        
        with get_session() as s:
            # 獲取當前用戶信息
            current_user = s.query(User).filter(User.id == moderator_id).first()
            if not current_user:
                return jsonify({'error': 'user not found'}), 404
            
            # 獲取留言信息
            comment = s.query(Comment).filter(Comment.id == comment_id).first()
            if not comment:
                return jsonify({'error': 'comment not found'}), 404
            
            # 檢查權限
            if not _can_moderate_comment(current_user, comment, s):
                return jsonify({'error': 'insufficient permissions'}), 403
            comment = s.query(Comment).filter(Comment.id == comment_id).first()
            if not comment:
                return jsonify({'error': 'comment not found'}), 404
            
            if comment.status == 'approved':
                return jsonify({'error': 'comment already approved'}), 400
            
            # 更新狀態
            comment.status = 'approved'
            comment.updated_at = datetime.now(timezone.utc)
            
            # 寫入審核日誌
            try:
                s.execute(
                    "INSERT INTO moderation_logs (target_type, target_id, action, old_status, new_status, reason, moderator_id) VALUES (:tt, :ti, :ac, :os, :ns, :rs, :mi)",
                    {
                        "tt": "comment", 
                        "ti": comment.id, 
                        "ac": "approve", 
                        "os": comment.status, 
                        "ns": "approved", 
                        "rs": "管理員標記正常", 
                        "mi": moderator_id
                    }
                )
            except Exception:
                pass
            
            s.commit()
            
            # 記錄管理員事件
            try:
                from utils.admin_events import log_content_moderation
                moderator_name = current_user.username if current_user else f"管理員({moderator_id})"
                
                log_content_moderation(
                    event_type="comment_approved",
                    moderator_id=moderator_id,
                    moderator_name=moderator_name,
                    content_type="留言",
                    content_id=comment_id,
                    action="核准",
                    session=s
                )
            except Exception:
                pass  # 事件記錄失敗不影響主要功能
            
            return jsonify({'ok': True, 'message': '留言已標記為正常'})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.post('/comments/<int:comment_id>/reject')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator')
def reject_comment(comment_id: int):
    """拒絕留言"""
    try:
        moderator_id = get_jwt_identity()
        data = request.get_json(silent=True) or {}
        reason = (data.get('reason') or '').strip() or '違反社群規範'
        
        if not moderator_id:
            return jsonify({'error': 'unauthorized'}), 401
        
        with get_session() as s:
            # 獲取當前用戶信息
            current_user = s.query(User).filter(User.id == moderator_id).first()
            if not current_user:
                return jsonify({'error': 'user not found'}), 404
            
            # 獲取留言信息
            comment = s.query(Comment).filter(Comment.id == comment_id).first()
            if not comment:
                return jsonify({'error': 'comment not found'}), 404
            
            # 檢查權限
            if not _can_moderate_comment(current_user, comment, s):
                return jsonify({'error': 'insufficient permissions'}), 403
            comment = s.query(Comment).filter(Comment.id == comment_id).first()
            if not comment:
                return jsonify({'error': 'comment not found'}), 404
            
            if comment.status == 'rejected':
                return jsonify({'error': 'comment already rejected'}), 400
            
            # 更新狀態
            old_status = comment.status
            comment.status = 'rejected'
            comment.updated_at = datetime.now(timezone.utc)
            
            # 發送通知給留言作者
            try:
                from socket_events import socketio
                socketio.emit('comment_violation', {
                    'comment_id': comment.id,
                    'reason': reason,
                    'post_id': comment.post_id,
                    'message': f'您的留言因"{reason}"被標記為違規，已自動下架。您可以修改後重新提交。'
                }, room=f'user_{comment.author_id}')
            except Exception:
                pass  # 通知發送失敗不影響主要功能
            
            # 寫入審核日誌
            try:
                s.execute(
                    "INSERT INTO moderation_logs (target_type, target_id, action, old_status, new_status, reason, moderator_id) VALUES (:tt, :ti, :ac, :os, :ns, :rs, :mi)",
                    {
                        "tt": "comment", 
                        "ti": comment.id, 
                        "ac": "reject", 
                        "os": old_status, 
                        "ns": "rejected", 
                        "rs": reason, 
                        "mi": moderator_id
                    }
                )
            except Exception:
                pass
            
            s.commit()
            
            # 記錄管理員事件
            try:
                from utils.admin_events import log_content_moderation
                moderator_name = current_user.username if current_user else f"管理員({moderator_id})"
                
                log_content_moderation(
                    event_type="comment_rejected",
                    moderator_id=moderator_id,
                    moderator_name=moderator_name,
                    content_type="留言",
                    content_id=comment_id,
                    action="拒絕",
                    reason=reason,
                    session=s
                )
            except Exception:
                pass  # 事件記錄失敗不影響主要功能
            
            return jsonify({'ok': True, 'message': '留言已標記為違規並下架'})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.get('/comments/my-violations')
@jwt_required()
def get_my_violations():
    """獲取當前用戶的違規留言"""
    try:
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({'error': 'unauthorized'}), 401
        
        with get_session() as s:
            violations = s.query(Comment).filter(
                Comment.author_id == user_id,
                Comment.status == 'rejected',
                Comment.is_deleted == False
            ).order_by(Comment.updated_at.desc()).all()
            
            items = []
            for comment in violations:
                post = comment.post
                items.append({
                    'id': comment.id,
                    'content': comment.content,
                    'created_at': comment.created_at.isoformat() if comment.created_at else None,
                    'updated_at': comment.updated_at.isoformat() if comment.updated_at else None,
                    'post': {
                        'id': post.id,
                        'content': post.content[:100] + '...' if len(post.content or '') > 100 else post.content
                    }
                })
            
            return jsonify({'ok': True, 'items': items})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.get('/comments/<int:comment_id>/detail')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator')
def get_comment_detail(comment_id: int):
    """獲取留言詳細信息"""
    try:
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({'error': 'unauthorized'}), 401
        
        with get_session() as s:
            # 獲取當前用戶信息
            current_user = s.query(User).filter(User.id == user_id).first()
            if not current_user:
                return jsonify({'error': 'user not found'}), 404
            
            # 獲取留言信息
            comment = s.query(Comment).filter(Comment.id == comment_id).first()
            if not comment:
                return jsonify({'error': 'comment not found'}), 404
            
            # 檢查權限
            if not _can_moderate_comment(current_user, comment, s):
                return jsonify({'error': 'insufficient permissions'}), 403
            
            # 獲取相關信息
            post = comment.post
            author = s.query(User).filter(User.id == comment.author_id).first()
            post_school = s.query(School).filter(School.id == post.school_id).first() if post.school_id else None
            author_school = s.query(School).filter(School.id == author.school_id).first() if author and author.school_id else None
            
            # 判斷是否為跨校留言
            is_cross_school = False
            if author and author.school_id and post.school_id:
                is_cross_school = author.school_id != post.school_id
            
            # 生成學校標籤
            school_tag = None
            if not is_cross_school and author_school:
                school_tag = f"#{author_school.code}({author_school.name})" if author_school.code else author_school.name
            
            return jsonify({
                'ok': True,
                'comment': {
                    'id': comment.id,
                    'content': comment.content,  # 完整內容
                    'status': 'deleted' if comment.is_deleted else comment.status,
                    'is_deleted': comment.is_deleted,
                    'created_at': comment.created_at.isoformat() if comment.created_at else None,
                    'updated_at': comment.updated_at.isoformat() if comment.updated_at else None,
                    'deleted_at': comment.deleted_at.isoformat() if comment.deleted_at else None,
                    'deleted_by': comment.deleted_by,
                    'post': {
                        'id': post.id,
                        'content': post.content,  # 完整內容
                        'status': post.status,
                        'school_name': post_school.name if post_school else None
                    },
                    'author': {
                        'id': author.id if author else None,
                        'username': author.username if author else '匿名',
                        'role': author.role if author else None,
                        'school_name': school_tag
                    }
                }
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.post('/comments/<int:comment_id>/resubmit')
@jwt_required()
def resubmit_comment(comment_id: int):
    """重新提交修改後的留言"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json(silent=True) or {}
        new_content = (data.get('content') or '').strip()
        
        if not user_id:
            return jsonify({'error': 'unauthorized'}), 401
        
        if not new_content:
            return jsonify({'error': 'content required'}), 400
        
        with get_session() as s:
            comment = s.query(Comment).filter(
                Comment.id == comment_id,
                Comment.author_id == user_id,
                Comment.status == 'rejected',
                Comment.is_deleted == False
            ).first()
            
            if not comment:
                return jsonify({'error': 'comment not found or not accessible'}), 404
            
            # 更新留言內容和狀態
            comment.content = new_content
            comment.status = 'pending'  # 重新進入待審核狀態
            comment.updated_at = datetime.now(timezone.utc)
            
            s.commit()
            
            return jsonify({'ok': True, 'message': '留言已重新提交，等待審核'})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.post('/comments/<int:comment_id>/delete')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator')
def delete_comment(comment_id: int):
    """刪除留言（軟刪除）"""
    try:
        moderator_id = get_jwt_identity()
        data = request.get_json(silent=True) or {}
        reason = (data.get('reason') or '').strip() or '管理員刪除'
        
        if not moderator_id:
            return jsonify({'error': 'unauthorized'}), 401
        
        with get_session() as s:
            # 獲取當前用戶信息
            current_user = s.query(User).filter(User.id == moderator_id).first()
            if not current_user:
                return jsonify({'error': 'user not found'}), 404
            
            # 獲取留言信息
            comment = s.query(Comment).filter(Comment.id == comment_id).first()
            if not comment:
                return jsonify({'error': 'comment not found'}), 404
            
            # 檢查權限
            if not _can_moderate_comment(current_user, comment, s):
                return jsonify({'error': 'insufficient permissions'}), 403
            comment = s.query(Comment).filter(Comment.id == comment_id).first()
            if not comment:
                return jsonify({'error': 'comment not found'}), 404
            
            if comment.is_deleted:
                return jsonify({'error': 'comment already deleted'}), 400
            
            # 軟刪除
            comment.is_deleted = True
            comment.deleted_at = datetime.now(timezone.utc)
            comment.deleted_by = moderator_id
            comment.updated_at = datetime.now(timezone.utc)
            
            # 寫入審核日誌
            try:
                s.execute(
                    "INSERT INTO moderation_logs (target_type, target_id, action, old_status, new_status, reason, moderator_id) VALUES (:tt, :ti, :ac, :os, :ns, :rs, :mi)",
                    {
                        "tt": "comment", 
                        "ti": comment.id, 
                        "ac": "delete", 
                        "os": comment.status, 
                        "ns": "deleted", 
                        "rs": reason, 
                        "mi": moderator_id
                    }
                )
            except Exception:
                pass
            
            s.commit()
            
            # 發送管理員事件通知
            try:
                from utils.notify import send_admin_event
                moderator_name = current_user.username if current_user else f"管理員({moderator_id})"
                
                send_admin_event(
                    kind="comment_deleted",
                    title="留言已刪除",
                    description=f"管理員 {moderator_name} 刪除了留言 #{comment_id}",
                    actor=moderator_name,
                    source="/api/admin/comments/delete",
                    fields=[
                        {"name": "留言ID", "value": str(comment_id), "inline": True},
                        {"name": "操作", "value": "刪除", "inline": True},
                        {"name": "原因", "value": reason, "inline": True}
                    ]
                )
            except Exception:
                pass  # 通知發送失敗不影響主要功能
            
            return jsonify({'ok': True, 'message': '留言已刪除'})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 刪文請求查詢
@bp.get('/delete-requests')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def list_delete_requests():
    from services.delete_service import DeleteService
    
    status = request.args.get('status', '').strip() or None
    limit = min(int(request.args.get('limit', 100)), 500)
    
    with get_session() as s:
        requests = DeleteService.get_delete_requests(s, status, limit)
        return jsonify({'items': requests, 'total': len(requests)})

# 刪文請求審核（核准）
@bp.post('/delete-requests/<int:rid>/approve')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def approve_delete_request(rid: int):
    from services.delete_service import DeleteService
    
    data = request.get_json(silent=True) or {}
    note = (data.get('note') or '').strip() or None
    moderator_id = get_jwt_identity()
    
    if not moderator_id:
        return jsonify({'error': 'unauthorized'}), 401
    
    with get_session() as s:
        result = DeleteService.approve_delete_request(s, rid, int(moderator_id), note)
        
        if result["success"]:
            # 記錄管理員事件
            try:
                from utils.admin_events import log_content_moderation
                moderator = s.query(User).filter(User.id == moderator_id).first()
                moderator_name = moderator.username if moderator else f"管理員({moderator_id})"
                
                log_content_moderation(
                    event_type="delete_request_approved",
                    moderator_id=moderator_id,
                    moderator_name=moderator_name,
                    content_type="刪文請求",
                    content_id=rid,
                    action="核准",
                    session=s
                )
            except Exception:
                pass  # 事件記錄失敗不影響主要功能
            
            # 發送SocketIO通知
            try:
                from app import socketio
                socketio.emit("delete_request.approved", {
                    "request_id": rid,
                    "post_id": result.get("deleted_post_id"),
                    "message": result["message"]
                })
            except ImportError:
                pass
            
            return jsonify({'ok': True, 'message': result["message"]})
        else:
            return jsonify({'error': result["error"]}), 400

# 刪文請求審核（拒絕）
@bp.post('/delete-requests/<int:rid>/reject')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def reject_delete_request(rid: int):
    from services.delete_service import DeleteService
    
    data = request.get_json(silent=True) or {}
    note = (data.get('note') or '').strip() or None
    moderator_id = get_jwt_identity()
    
    if not moderator_id:
        return jsonify({'error': 'unauthorized'}), 401
    
    with get_session() as s:
        result = DeleteService.reject_delete_request(s, rid, int(moderator_id), note)
        
        if result["success"]:
            # 記錄管理員事件
            try:
                from utils.admin_events import log_content_moderation
                moderator = s.query(User).filter(User.id == moderator_id).first()
                moderator_name = moderator.username if moderator else f"管理員({moderator_id})"
                
                log_content_moderation(
                    event_type="delete_request_rejected",
                    moderator_id=moderator_id,
                    moderator_name=moderator_name,
                    content_type="刪文請求",
                    content_id=rid,
                    action="拒絕",
                    reason=note,
                    session=s
                )
            except Exception:
                pass  # 事件記錄失敗不影響主要功能
            
            # 發送SocketIO通知
            try:
                from app import socketio
                socketio.emit("delete_request.rejected", {
                    "request_id": rid,
                    "message": result["message"]
                })
            except ImportError:
                pass
            
            return jsonify({'ok': True, 'message': result["message"]})
        else:
            return jsonify({'error': result["error"]}), 400


@bp.get("/ping")
@jwt_required() 
@require_role("admin", "moderator", "dev_admin", "campus_admin", "cross_admin", "campus_moder", "cross_moder")
def admin_ping():
    return jsonify({"ok": True, "message": "Admin API is working"})


@bp.post("/webhook/test")
@jwt_required()
@require_role("admin", "dev_admin")
def admin_webhook_test():
    """發送 Morandi 版系統測試訊息到 ADMIN_NOTIFY_WEBHOOK。"""
    data = request.get_json(silent=True) or {}
    title = str(data.get("title") or "Webhook 測試").strip()
    desc = str(data.get("description") or "這是一則測試訊息").strip()
    res = notify_send_event(
        kind="system",
        title=title,
        description=desc,
        source="/api/admin/webhook/test",
    )
    return jsonify({"ok": bool(res.get("ok")), "status": res.get("status"), "delivery": ("discord" if res.get("ok") else "local_only")})


# ---- Users management ----
@bp.get('/users')
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def list_users():
    q = (request.args.get('query') or '').strip().lower()
    limit = max(1, min(int(request.args.get('limit') or 100), 500))
    with get_session() as s:  # type: Session
        # 取得操作者
        current_id = get_jwt_identity()
        actor = s.get(User, current_id) if current_id else None
        actor_role = getattr(actor, 'role', None)
        actor_school_id = getattr(actor, 'school_id', None)

        # 跨校管理員不可管理用戶
        if actor_role == 'cross_admin':
            return jsonify({ 'msg': '跨校管理員不可管理用戶' }), 403

        qry = s.query(User)
        # 校內管理員：僅可檢視同校使用者
        if actor_role == 'campus_admin' and actor_school_id:
            qry = qry.filter(User.school_id == actor_school_id)
        if q:
            from sqlalchemy import or_, func
            qry = qry.filter(or_(func.lower(User.username).like(f"%{q}%"), func.lower(User.email).like(f"%{q}%")))
        rows = qry.order_by(User.id.desc()).limit(limit).all()
        items = []
        for u in rows:
            # 獲取學校資訊
            school_info = None
            if u.school_id:
                school = s.query(School).get(u.school_id)
                if school:
                    school_info = {
                        'id': school.id,
                        'slug': school.slug,
                        'name': school.name
                    }
            
            items.append({
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'role': u.role,
                'school_id': getattr(u, 'school_id', None),
                'school': school_info,
                'created_at': u.created_at.isoformat() if getattr(u, 'created_at', None) else None,
            })
        return jsonify({ 'items': items, 'total': len(items) })


@bp.post('/users/<int:uid>/set_password')
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def set_user_password(uid: int):
    data = request.get_json(silent=True) or {}
    pwd = (data.get('password') or '').strip()
    if len(pwd) < 8:
        return jsonify({ 'msg': '密碼至少 8 碼' }), 400
    with get_session() as s:  # type: Session
        u = s.get(User, uid)
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        # 跨校管理員不可管理用戶
        actor = s.get(User, get_jwt_identity()) if get_jwt_identity() else None
        if actor and actor.role == 'cross_admin':
            return jsonify({ 'msg': '跨校管理員不可管理用戶' }), 403
        u.password_hash = generate_password_hash(pwd)
        s.commit()
        return jsonify({ 'ok': True })


@bp.post('/users/<int:uid>/role')
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def set_user_role(uid: int):
    data = request.get_json(silent=True) or {}
    role = (data.get('role') or '').strip()
    allowed = { r.value if hasattr(r, 'value') else r for r in getattr(UserRole, '__members__', {}).values() } or { 'user','campus_moderator','cross_moderator','campus_admin','cross_admin','dev_admin' }
    if role not in allowed:
        return jsonify({ 'msg': '無效角色' }), 400
    with get_session() as s:  # type: Session
        # 權限檢查：校內管理員僅能調整同校使用者
        actor_id = get_jwt_identity()
        actor = s.get(User, actor_id) if actor_id else None
        u = s.get(User, uid)
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        if actor and actor.role == 'cross_admin':
            return jsonify({ 'msg': '跨校管理員不可管理用戶' }), 403
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or u.school_id != actor.school_id:
                return jsonify({ 'msg': '無權限：僅能變更同校使用者' }), 403
        u.role = role
        s.commit()
        return jsonify({ 'ok': True })


@bp.post('/users/<int:uid>/email')
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def set_user_email(uid: int):
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email:
        return jsonify({ 'msg': '無效的Email格式' }), 400
    with get_session() as s:  # type: Session
        # 權限檢查：校內管理員僅能變更同校使用者
        actor_id = get_jwt_identity()
        actor = s.get(User, actor_id) if actor_id else None
        u = s.get(User, uid)
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        if actor and actor.role == 'cross_admin':
            return jsonify({ 'msg': '跨校管理員不可管理用戶' }), 403
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or u.school_id != actor.school_id:
                return jsonify({ 'msg': '無權限：僅能變更同校使用者' }), 403
        # 檢查Email是否已被其他用戶使用
        existing = s.query(User).filter(User.email == email, User.id != uid).first()
        if existing:
            return jsonify({ 'msg': '此Email已被其他用戶使用' }), 400
        u.email = email
        s.commit()
        return jsonify({ 'ok': True })


@bp.post('/users/<int:uid>/school')
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def set_user_school(uid: int):
    """設定用戶的學校綁定"""
    data = request.get_json(silent=True) or {}
    school_slug = (data.get('school_slug') or '').strip()
    
    with get_session() as s:  # type: Session
        # 取得操作者
        actor_id = get_jwt_identity()
        actor = s.get(User, actor_id) if actor_id else None
        u = s.get(User, uid)
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        # 跨校管理員不可管理用戶
        if actor and actor.role == 'cross_admin':
            return jsonify({ 'msg': '跨校管理員不可管理用戶' }), 403
        
        if school_slug:
            # 查找學校
            school = s.query(School).filter(School.slug == school_slug).first()
            if not school:
                return jsonify({ 'msg': '學校不存在' }), 404
            # 權限：
            # - dev_admin 可任意綁定
            # - campus_admin 只能綁到自己的學校，且僅能操作同校或未綁定的帳號
            if actor and actor.role == 'campus_admin':
                if not actor.school_id or school.id != actor.school_id:
                    return jsonify({ 'msg': '無權限：只能綁定到自己學校' }), 403
                if u.school_id and u.school_id != actor.school_id:
                    return jsonify({ 'msg': '無權限：不可變更其他學校帳號' }), 403
            u.school_id = school.id
        else:
            # 解除學校綁定
            # - campus_admin 不可解除其他學校使用者的綁定
            if actor and actor.role == 'campus_admin':
                if not actor.school_id or u.school_id != actor.school_id:
                    return jsonify({ 'msg': '無權限：不可解除其他學校帳號' }), 403
            u.school_id = None
        
        s.commit()
        
        # 記錄事件
        try:
            from utils.admin_events import log_user_action
            admin_id = get_jwt_identity()
            admin = s.query(User).get(admin_id) if admin_id else None
            admin_name = admin.username if admin else f"管理員({admin_id})"
            
            action = f"綁定到學校 {school_slug}" if school_slug else "解除學校綁定"
            log_user_action(
                event_type="user_role_changed",
                actor_id=admin_id,
                actor_name=admin_name,
                action=f"為用戶 {u.username} {action}",
                target_id=u.id,
                target_type="用戶"
            )
        except Exception:
            pass
        
        return jsonify({ 'ok': True })


@bp.delete('/users/<int:uid>')
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def delete_user(uid: int):
    """刪除使用者：僅在無關聯貼文/留言/媒體時允許刪除，避免破壞外鍵。"""
    from models import Post, Comment, Media
    with get_session() as s:  # type: Session
        # 權限檢查：校內管理員僅能刪除同校使用者
        actor_id = get_jwt_identity()
        actor = s.get(User, actor_id) if actor_id else None
        u = s.get(User, uid)
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        if actor and actor.role == 'cross_admin':
            return jsonify({ 'msg': '跨校管理員不可管理用戶' }), 403
        if actor and actor.role == 'campus_admin':
            if not actor.school_id or u.school_id != actor.school_id:
                return jsonify({ 'msg': '無權限：僅能刪除同校使用者' }), 403
        # 檢查關聯
        has_post = s.query(Post).filter(Post.author_id==uid).first() is not None
        has_comment = s.query(Comment).filter(Comment.author_id==uid).first() is not None
        has_media = s.query(Media).join(Post, Media.post_id==Post.id).filter(Post.author_id==uid).first() is not None
        if has_post or has_comment or has_media:
            return jsonify({ 'msg': '存在關聯資料，無法刪除' }), 409
        s.delete(u); s.commit()
        return jsonify({ 'ok': True })

@bp.post('/users')
@jwt_required()
@require_role("dev_admin", "campus_admin")
def create_user():
    """建立新使用者。
    - dev_admin：可建立任一學校或跨校（未綁定）帳號
    - campus_admin：僅可建立自己學校的帳號
    """
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()
    role = (data.get('role') or 'user').strip()
    school_slug = (data.get('school_slug') or '').strip()

    if not username or not email or not password:
        return jsonify({'msg': '缺少必要欄位'}), 400
    if '@' not in email:
        return jsonify({'msg': 'Email 格式不正確'}), 400

    with get_session() as s:
        # 權限與學校判定
        actor_id = get_jwt_identity()
        actor = s.get(User, actor_id) if actor_id else None
        if actor and actor.role == 'cross_admin':
            return jsonify({ 'msg': '跨校管理員不可管理用戶' }), 403
        school_id = None
        if school_slug:
            sch = s.query(School).filter(School.slug == school_slug).first()
            if not sch:
                return jsonify({'msg': '學校不存在'}), 404
            school_id = sch.id

        if actor and actor.role == 'campus_admin':
            # 必須建立在自己學校
            if not actor.school_id:
                return jsonify({'msg': '校內管理員未綁定學校，無法建立帳號'}), 403
            if school_id is None or school_id != actor.school_id:
                return jsonify({'msg': '無權限：僅能建立自己學校的帳號'}), 403

        # 檢查重複
        if s.query(User).filter(func.lower(User.username) == username.lower()).first():
            return jsonify({'msg': '使用者名稱已存在'}), 409
        if s.query(User).filter(func.lower(User.email) == email.lower()).first():
            return jsonify({'msg': 'Email 已存在'}), 409

        # 建立
        u = User(username=username, email=email, role=role or 'user')
        u.password_hash = generate_password_hash(password)
        u.school_id = school_id
        s.add(u)
        s.commit()

        return jsonify({'ok': True, 'id': u.id})


@bp.get("/chat-rooms")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_chat_rooms():
    """獲取用戶可訪問的聊天室列表"""
    try:
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({"error": "UNAUTHORIZED"}), 401
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "USER_NOT_FOUND"}), 404
            
            role = user.role
            school_id = user.school_id
            
            # 基礎聊天室（非校別）
            chat_rooms = [
                {
                    "id": "admin_global",
                    "name": "全管理員聊天室",
                    "description": "所有管理員都可以使用的全域聊天室",
                    "access_roles": ["dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator"],
                    "school_specific": False
                },
                {
                    "id": "admin_cross",
                    "name": "跨校管理員聊天室",
                    "description": "跨校管理員和版主專用",
                    "access_roles": ["cross_admin", "cross_moderator"],
                    "school_specific": False
                },
                {
                    "id": "admin_dev",
                    "name": "開發人員聊天室",
                    "description": "開發人員專用聊天室",
                    "access_roles": ["dev_admin"],
                    "school_specific": False
                }
            ]

            # 依現有學校動態建立「校內管理員聊天室」
            schools = s.query(School).order_by(School.id.asc()).all()
            for sch in schools:
                chat_rooms.append({
                    "id": f"admin_campus:{sch.slug}",
                    "name": f"{sch.name} 管理員聊天室",
                    "description": f"{sch.name} 校內管理員與審核專用",
                    "access_roles": ["campus_admin", "campus_moderator", "dev_admin"],
                    "school_specific": True,
                    "school_id": sch.id,
                    "school_slug": sch.slug,
                })
            
            # 根據用戶角色和學校過濾可用的聊天室
            available_rooms = []
            for room in chat_rooms:
                # 總管理員（dev_admin）可以看到所有聊天室
                if role == "dev_admin":
                    available_rooms.append(room)
                    continue

                # 檢查角色權限
                if role not in room["access_roles"]:
                    continue

                # 校別聊天室：僅允許同校或符合條件的角色
                if room.get("school_specific"):
                    if not school_id:
                        continue
                    # 若提供了 room 的 school_id，需與使用者一致
                    if room.get("school_id") and room["school_id"] != school_id:
                        continue

                available_rooms.append(room)
            
            # 為每個聊天室添加線上用戶數量
            from app import _room_clients
            for room in available_rooms:
                client_ids = list(_room_clients.get(room["id"], set()))
                room["online_count"] = len(client_ids)
            
            return jsonify({
                "rooms": available_rooms,
                "user_role": role,
                "user_school_id": school_id
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.get("/chat-rooms/<string:room_id>/users")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_chat_room_users(room_id: str):
    """獲取聊天室的線上用戶列表"""
    try:
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({"error": "UNAUTHORIZED"}), 401
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"error": "USER_NOT_FOUND"}), 404
            
            # 檢查用戶是否有權限訪問此聊天室
            role = user.role
            school_id = user.school_id
            
            # 聊天室權限檢查（支援動態校別聊天室）
            is_campus_room = False
            target_school_id = None
            if room_id.startswith("admin_campus:"):
                is_campus_room = True
                slug = room_id.split(":", 1)[1]
                sch = s.query(School).filter(School.slug == slug).first()
                if not sch:
                    return jsonify({"error": "ROOM_NOT_FOUND"}), 404
                target_school_id = sch.id

                # dev_admin 以外需要符合角色且學校一致
                if role != "dev_admin":
                    if role not in ["campus_admin", "campus_moderator"]:
                        return jsonify({"error": "ACCESS_DENIED"}), 403
                    if not school_id or school_id != target_school_id:
                        return jsonify({"error": "ACCESS_DENIED"}), 403
            else:
                # 非校別固定聊天室的權限
                fixed_rooms = {
                    "admin_global": ["dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator"],
                    "admin_cross": ["cross_admin", "cross_moderator", "dev_admin"],
                    "admin_dev": ["dev_admin"],
                }
                if room_id not in fixed_rooms:
                    return jsonify({"error": "ROOM_NOT_FOUND"}), 404
                if role != "dev_admin" and role not in fixed_rooms[room_id]:
                    return jsonify({"error": "ACCESS_DENIED"}), 403
            
            # 從 WebSocket 狀態獲取線上用戶
            from app import _room_clients, _sid_client
            
            # 獲取聊天室中的用戶ID列表
            client_ids = list(_room_clients.get(room_id, set()))
            
            # 獲取用戶詳細資訊
            online_users = []
            for client_id in client_ids:
                # 嘗試從 client_id 中提取用戶ID
                # 這裡假設 client_id 格式為 "user:123" 或直接是用戶ID
                try:
                    user_id_from_client = None
                    if isinstance(client_id, str) and client_id.startswith("user:"):
                        user_id_from_client = int(client_id.split(":")[1])
                    else:
                        # 嘗試解析為整數 user_id
                        try:
                            user_id_from_client = int(client_id)
                        except Exception:
                            # 可能是 socket SID，改用 _sid_client 反查
                            try:
                                info = _sid_client.get(client_id) or {}
                                # 常見鍵名：user_id / uid / id
                                for k in ("user_id", "uid", "id"):
                                    if k in info and info[k]:
                                        user_id_from_client = int(info[k])
                                        break
                            except Exception:
                                user_id_from_client = None
                    
                    if not user_id_from_client:
                        continue

                    # 排除自己（前端清單只顯示其他用戶）
                    if int(user_id_from_client) == int(user_id):
                        continue

                    user_info = s.query(User).get(int(user_id_from_client))
                    if user_info:
                        online_users.append({
                            "id": user_info.id,
                            "username": user_info.username,
                            "role": user_info.role,
                            "school_id": user_info.school_id,
                            "client_id": client_id
                        })
                except (ValueError, IndexError):
                    # 如果無法解析用戶ID，跳過
                    continue
            
            return jsonify({
                "room_id": room_id,
                "online_users": online_users,
                "total_online": len(online_users)
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.get("/events")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_admin_events():
    """獲取管理員事件記錄"""
    try:
        from utils.admin_events import get_recent_events, get_event_statistics
        
        # 獲取查詢參數
        limit = min(100, max(1, int(request.args.get('limit', 50))))
        event_type = request.args.get('type', '').strip() or None
        severity = request.args.get('severity', '').strip() or None
        include_stats = request.args.get('stats', 'false').lower() == 'true'
        
        # 獲取事件記錄
        events = get_recent_events(limit=limit, event_type=event_type, severity=severity)
        
        # 格式化時間顯示
        for event in events:
            try:
                ts = datetime.fromisoformat(event["timestamp"].replace('Z', '+00:00'))
                event["time_display"] = ts.strftime("%Y-%m-%d %H:%M:%S")
                event["time_ago"] = _format_time_ago(ts)
            except Exception:
                event["time_display"] = event["timestamp"]
                event["time_ago"] = "未知"
        
        result = {
            "events": events,
            "total": len(events)
        }
        
        # 包含統計資料
        if include_stats:
            stats = get_event_statistics()
            result["statistics"] = stats
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _format_time_ago(timestamp: datetime) -> str:
    """格式化時間差顯示"""
    now = datetime.now(timezone.utc)
    diff = now - timestamp
    
    if diff.days > 0:
        return f"{diff.days}天前"
    elif diff.seconds > 3600:
        hours = diff.seconds // 3600
        return f"{hours}小時前"
    elif diff.seconds > 60:
        minutes = diff.seconds // 60
        return f"{minutes}分鐘前"
    else:
        return "剛剛"
