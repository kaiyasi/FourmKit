from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.authz import require_role
from utils.notify import send_admin_event as notify_send_event
from services.event_service import EventService
from services.platform_event_service import platform_event_service
from utils.db import get_session
from models import User, UserRole, School, Post, Comment
from models.events import SystemEvent
from werkzeug.security import generate_password_hash
from sqlalchemy import func, and_, or_, desc
from datetime import datetime, timezone
import hmac, hashlib, base64, os, uuid

# For the new unblock IP feature
from utils.ratelimit import unblock_ip, block_ip, is_ip_blocked
from utils.admin_events import log_security_event

bp = Blueprint("admin", __name__, url_prefix="/api/admin")

# 自訂聊天室管理 API（僅 dev_admin）
@bp.post('/chat-rooms/custom')
@jwt_required()
@require_role('dev_admin')
def create_custom_room():
    from app import _custom_rooms
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip() or '自訂聊天室'
    description = (data.get('description') or '').strip() or '由總管理員建立'
    rid = f"custom:{uuid.uuid4().hex[:8]}"
    owner_id = get_jwt_identity()
    
    try:
        with get_session() as s:
            # 在數據庫中創建聊天室
            from models import ChatRoom
            room = ChatRoom(
                id=rid,
                name=name,
                description=description,
                room_type="custom",
                owner_id=owner_id,
                is_active=True
            )
            s.add(room)
            s.commit()
            
            # 在內存中創建聊天室
            _custom_rooms[rid] = { 'owner_id': owner_id, 'name': name, 'description': description, 'members': set() }
            
            # 記錄創建事件
            try:
                from services.event_service import EventService
                from utils.ratelimit import get_client_ip
                current_user = s.query(User).get(owner_id)
                
                EventService.log_event(
                    session=s,
                    event_type="chat.room.created",
                    title=f"創建自定義聊天室: {name}",
                    description=f"管理員 {current_user.username if current_user else 'Unknown'} 創建了自定義聊天室",
                    severity="medium",
                    actor_id=owner_id,
                    actor_name=current_user.username if current_user else 'Unknown',
                    actor_role=current_user.role if current_user else 'unknown',
                    target_type="chat_room",
                    target_id=rid,
                    target_name=name,
                    metadata={
                        "room_id": rid,
                        "room_name": name,
                        "description": description
                    },
                    client_ip=get_client_ip(),
                    user_agent=request.headers.get('User-Agent'),
                    is_important=False,
                    send_webhook=True
                )
            except Exception as e:
                print(f"記錄創建事件失敗: {e}")
                pass  # 事件記錄失敗不影響主要功能
            
            return jsonify({ 'ok': True, 'id': rid, 'name': name })
            
    except Exception as e:
        print(f"創建聊天室失敗: {e}")
        return jsonify({ 'error': f'創建失敗: {str(e)}' }), 500

@bp.delete('/chat-rooms/custom/<string:room_id>')
@jwt_required()
@require_role('dev_admin')
def delete_custom_room(room_id: str):
    from app import _custom_rooms, _room_clients
    if not room_id or not room_id.startswith('custom:'):
        return jsonify({ 'error': 'INVALID_ROOM' }), 400
    
    try:
        with get_session() as s:
            # 檢查聊天室是否存在於數據庫
            from models import ChatRoom, ChatRoomMember
            
            # 先刪除所有成員記錄
            s.query(ChatRoomMember).filter(ChatRoomMember.room_id == room_id).delete()
            
            # 刪除聊天室記錄
            room = s.query(ChatRoom).filter(ChatRoom.id == room_id).first()
            if room:
                s.delete(room)
            
            s.commit()
            
            # 清理內存中的數據
            _custom_rooms.pop(room_id, None)
            _room_clients.pop(room_id, None)
            
            # 記錄刪除事件
            try:
                from services.event_service import EventService
                from utils.ratelimit import get_client_ip
                user_id = get_jwt_identity()
                current_user = s.query(User).get(user_id)
                
                EventService.log_event(
                    session=s,
                    event_type="chat.room.deleted",
                    title=f"刪除自定義聊天室: {room_id}",
                    description=f"管理員 {current_user.username if current_user else 'Unknown'} 刪除了自定義聊天室",
                    severity="medium",
                    actor_id=user_id,
                    actor_name=current_user.username if current_user else 'Unknown',
                    actor_role=current_user.role if current_user else 'unknown',
                    target_type="chat_room",
                    target_id=room_id,
                    target_name=room_id,
                    metadata={
                        "room_id": room_id,
                        "room_name": room.name if room else room_id
                    },
                    client_ip=get_client_ip(),
                    user_agent=request.headers.get('User-Agent'),
                    is_important=False,
                    send_webhook=True
                )
            except Exception as e:
                print(f"記錄刪除事件失敗: {e}")
                pass  # 事件記錄失敗不影響主要功能
            
    except Exception as e:
        print(f"刪除聊天室失敗: {e}")
        return jsonify({ 'error': f'刪除失敗: {str(e)}' }), 500
    
    return jsonify({ 'ok': True, 'deleted': room_id })

@bp.post('/chat-rooms/custom/<string:room_id>/members')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def add_custom_room_member(room_id: str):
    """添加聊天室成員"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json(silent=True) or {}
        
        try:
            target_id = int(data.get('user_id'))
        except Exception:
            return jsonify({ 'error': 'USER_ID_REQUIRED' }), 400
        
        with get_session() as s:
            current_user = s.query(User).get(user_id)
            if not current_user:
                return jsonify({ 'error': 'USER_NOT_FOUND' }), 404
            
            target_user = s.query(User).get(target_id)
            if not target_user:
                return jsonify({ 'error': 'TARGET_USER_NOT_FOUND' }), 404
            
            from models import ChatRoom
            room = s.query(ChatRoom).filter(ChatRoom.id == room_id).first()
            if not room:
                return jsonify({ 'error': 'ROOM_NOT_FOUND' }), 404
            
            # 僅擁有者或 dev_admin 可添加成員
            if current_user.role != 'dev_admin' and room.owner_id != user_id:
                return jsonify({ 'error': 'PERMISSION_DENIED' }), 403
            
            # 避免重複添加成員
            from models import ChatRoomMember
            existing_member = s.query(ChatRoomMember).filter(
                ChatRoomMember.room_id == room_id,
                ChatRoomMember.user_id == target_id,
                ChatRoomMember.is_active == True
            ).first()
            
            if existing_member:
                return jsonify({ 'error': 'USER_ALREADY_MEMBER' }), 400
            
            # 添加成員
            member = ChatRoomMember(
                room_id=room_id,
                user_id=target_id,
                is_active=True
            )
            s.add(member)
            s.commit()
            
            # 記錄成員添加事件
            try:
                from services.event_service import EventService
                from utils.ratelimit import get_client_ip
                
                EventService.log_event(
                    session=s,
                    event_type="chat.room.member.added",
                    title=f"添加聊天室成員: {target_user.username}",
                    description=f"管理員 {current_user.username} 將用戶 {target_user.username} 添加到聊天室「{room.name}」",
                    severity="medium",
                    actor_id=current_user.id,
                    actor_name=current_user.username,
                    actor_role=current_user.role,
                    target_type="user",
                    target_id=str(target_id),
                    target_name=target_user.username,
                    school_id=room.school_id,
                    metadata={
                        "room_id": room_id,
                        "room_name": room.name,
                        "target_user_id": target_id,
                        "target_username": target_user.username,
                        "target_role": target_user.role
                    },
                    client_ip=get_client_ip(),
                    user_agent=request.headers.get('User-Agent'),
                    is_important=False,
                    send_webhook=True
                )
            except Exception as e:
                print(f"記錄成員添加事件失敗: {e}")
                pass  # 事件記錄失敗不影響主要功能
            
            return jsonify({ 'ok': True, 'room_id': room_id, 'user_id': target_id })
    
    except Exception as e:
        return jsonify({ 'error': f'添加成員失敗: {str(e)}' }), 500

@bp.delete('/chat-rooms/custom/<string:room_id>/members/<int:user_id>')
@jwt_required()
@require_role('dev_admin', 'campus_admin')
def remove_custom_room_member(room_id: str, user_id: int):
    """移除聊天室成員"""
    try:
        current_user_id = get_jwt_identity()
        
        with get_session() as s:
            # 獲取當前用戶信息
            current_user = s.query(User).get(current_user_id)
            if not current_user:
                return jsonify({ 'error': 'USER_NOT_FOUND' }), 404
            
            # 獲取目標用戶信息
            target_user = s.query(User).get(user_id)
            if not target_user:
                return jsonify({ 'error': 'TARGET_USER_NOT_FOUND' }), 404
            
            # 檢查聊天室是否存在
            from models import ChatRoom
            room = s.query(ChatRoom).filter(ChatRoom.id == room_id).first()
            if not room:
                return jsonify({ 'error': 'ROOM_NOT_FOUND' }), 404
            
            # 權限檢查：只有聊天室擁有者或 dev_admin 可以移除成員
            if current_user.role != 'dev_admin' and room.owner_id != current_user_id:
                return jsonify({ 'error': 'PERMISSION_DENIED' }), 403
            
            # 檢查用戶是否是成員
            from models import ChatRoomMember
            member = s.query(ChatRoomMember).filter(
                ChatRoomMember.room_id == room_id,
                ChatRoomMember.user_id == user_id,
                ChatRoomMember.is_active == True
            ).first()
            
            if not member:
                return jsonify({ 'error': 'USER_NOT_MEMBER' }), 400
            
            # 移除成員（軟刪除）
            member.is_active = False
            s.commit()
            
            # 記錄成員移除事件
            try:
                from services.event_service import EventService
                from utils.ratelimit import get_client_ip
                
                EventService.log_event(
                    session=s,
                    event_type="chat.room.member.removed",
                    title=f"移除聊天室成員: {target_user.username}",
                    description=f"管理員 {current_user.username} 將用戶 {target_user.username} 從聊天室「{room.name}」中移除",
                    severity="medium",
                    actor_id=current_user.id,
                    actor_name=current_user.username,
                    actor_role=current_user.role,
                    target_type="user",
                    target_id=str(user_id),
                    target_name=target_user.username,
                    school_id=room.school_id,
                    metadata={
                        "room_id": room_id,
                        "room_name": room.name,
                        "target_user_id": user_id,
                        "target_username": target_user.username,
                        "target_role": target_user.role
                    },
                    client_ip=get_client_ip(),
                    user_agent=request.headers.get('User-Agent'),
                    is_important=False,
                    send_webhook=True
                )
            except Exception as e:
                print(f"記錄成員移除事件失敗: {e}")
                pass  # 事件記錄失敗不影響主要功能
            
            return jsonify({ 'ok': True, 'room_id': room_id, 'user_id': user_id, 'removed': True })
    
    except Exception as e:
        return jsonify({ 'error': f'移除成員失敗: {str(e)}' }), 500


# ---------------- Delete Requests Management ----------------




def _can_moderate_comment(moderator: User, comment: Comment, session) -> bool:
    """檢查用戶是否有權限審核特定留言"""
    from utils.school_permissions import can_moderate_content
    
    # 獲取留言相關信息
    post = comment.post
    
    # 使用統一的權限檢查函數
    return can_moderate_content(moderator, post.school_id, post)

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
                # 確保作者和貼文都有學校ID，且不同學校
                query = query.filter(
                    User.school_id.isnot(None),
                    Post.school_id.isnot(None),
                    User.school_id != Post.school_id
                )
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
                # 確保作者和貼文都有學校ID，且不同學校
                query = query.filter(
                    User.school_id.isnot(None),
                    Post.school_id.isnot(None),
                    User.school_id != Post.school_id
                )
                
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
            if school_slug and school_slug != "__ALL__":
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
                
                # 生成學校標籤：跨校不顯示，校內顯示 #slug(學校名稱)
                school_tag = None
                if not is_cross_school and author_school:
                    school_tag = f"#{author_school.slug}({author_school.name})"
                
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
                        'content': post.content[:200] + "..." if len(post.content) > 200 else post.content,
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
        import traceback
        print(f"[ERROR] Comment monitor API error: {e}")
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
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
                from services.event_service import EventService
                moderator_name = current_user.username if current_user else f"管理員({moderator_id})"
                
                EventService.log_event(
                    session=s,
                    event_type="comment.approved",
                    title=f"管理員核准留言",
                    description=f"管理員 {moderator_name} 核准了留言 #{comment_id}",
                    severity="low",
                    actor_id=moderator_id,
                    actor_name=moderator_name,
                    actor_role=current_user.role if current_user else None,
                    target_type="comment",
                    target_id=comment_id,
                    school_id=current_user.school_id if current_user else None,
                    is_important=False,
                    send_webhook=True
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
    """
    拒絕留言並通知作者
    
    執行權限檢查、狀態更新、事件記錄和 Socket 通知的完整流程
    """
    try:
        moderator_id = get_jwt_identity()
        data = request.get_json(silent=True) or {}
        reason = (data.get('reason') or '').strip() or '違反社群規範'
        
        if not moderator_id:
            return jsonify({'error': 'unauthorized'}), 401
        
        with get_session() as s:
            current_user = s.query(User).filter(User.id == moderator_id).first()
            if not current_user:
                return jsonify({'error': 'user not found'}), 404
            
            comment = s.query(Comment).filter(Comment.id == comment_id).first()
            if not comment:
                return jsonify({'error': 'comment not found'}), 404
            
            if not _can_moderate_comment(current_user, comment, s):
                return jsonify({'error': 'insufficient permissions'}), 403
            
            # 避免重複拒絕
            if comment.status == 'rejected':
                return jsonify({'error': 'comment already rejected'}), 400
            
            old_status = comment.status
            comment.status = 'rejected'
            comment.updated_at = datetime.now(timezone.utc)
            
            # Socket 即時通知違規留言作者
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
                from services.event_service import EventService
                moderator_name = current_user.username if current_user else f"管理員({moderator_id})"
                
                EventService.log_event(
                    session=s,
                    event_type="comment.rejected",
                    title=f"管理員拒絕留言",
                    description=f"管理員 {moderator_name} 拒絕了留言 #{comment_id}，原因：{reason}",
                    severity="medium",
                    actor_id=moderator_id,
                    actor_name=moderator_name,
                    actor_role=current_user.role if current_user else None,
                    target_type="comment",
                    target_id=comment_id,
                    school_id=current_user.school_id if current_user else None,
                    metadata={"reason": reason, "old_status": old_status},
                    is_important=False,
                    send_webhook=True
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
                school_tag = f"#{author_school.slug}({author_school.name})"
            
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

@bp.post('/comments/<int:comment_id>/restore')
@jwt_required()
@require_role('dev_admin')  # 只有 dev_admin 可以重新上架
def restore_comment(comment_id: int):
    """重新上架留言（僅限 dev_admin）"""
    try:
        moderator_id = get_jwt_identity()
        
        if not moderator_id:
            return jsonify({'error': 'unauthorized'}), 401
        
        with get_session() as s:
            # 獲取當前用戶信息
            current_user = s.query(User).filter(User.id == moderator_id).first()
            if not current_user:
                return jsonify({'error': 'user not found'}), 404
            
            # 檢查是否為 dev_admin
            if current_user.role != 'dev_admin':
                return jsonify({'error': 'insufficient permissions'}), 403
            
            # 獲取留言信息
            comment = s.query(Comment).filter(Comment.id == comment_id).first()
            if not comment:
                return jsonify({'error': 'comment not found'}), 404
            
            if not comment.is_deleted:
                return jsonify({'error': 'comment is not deleted'}), 400
            
            # 重新上架
            comment.is_deleted = False
            comment.deleted_at = None
            comment.deleted_by = None
            comment.updated_at = datetime.now(timezone.utc)
            
            # 寫入審核日誌
            try:
                s.execute(
                    "INSERT INTO moderation_logs (target_type, target_id, action, old_status, new_status, reason, moderator_id) VALUES (:tt, :ti, :ac, :os, :ns, :rs, :mi)",
                    {
                        "tt": "comment", 
                        "ti": comment.id, 
                        "ac": "restore", 
                        "os": "deleted", 
                        "ns": comment.status, 
                        "rs": "管理員重新上架", 
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
                    kind="comment_restored",
                    title="留言已重新上架",
                    description=f"開發管理員 {moderator_name} 重新上架了留言 #{comment_id}",
                    actor=moderator_name,
                    source="/api/admin/comments/restore",
                    fields=[
                        {"name": "留言ID", "value": str(comment_id), "inline": True},
                        {"name": "操作", "value": "重新上架", "inline": True},
                        {"name": "操作者", "value": "開發管理員", "inline": True}
                    ]
                )
            except Exception:
                pass  # 通知發送失敗不影響主要功能
            
            return jsonify({'ok': True, 'message': '留言已重新上架'})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 刪文請求統計
@bp.get('/delete-requests/stats')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator')
def get_delete_request_stats():
    """獲取刪文請求統計"""
    try:
        from datetime import datetime
        from sqlalchemy import and_
        from models import DeleteRequest, Post
        
        with get_session() as s:
            user_id = get_jwt_identity()
            current_user = s.query(User).filter(User.id == user_id).first() if user_id else None
            
            # 今日統計
            today = datetime.now().date()
            today_start = datetime.combine(today, datetime.min.time())
            today_end = datetime.combine(today, datetime.max.time())
            
            # 基礎查詢
            base_query = s.query(DeleteRequest)
            
            # 根據用戶權限過濾
            if current_user and current_user.role in ('campus_moderator',):
                if not current_user.school_id:
                    return jsonify({'error': 'campus moderator must have school_id'}), 403
                base_query = base_query.join(Post).filter(Post.school_id == current_user.school_id)
            
            # 待審數量
            pending_count = base_query.filter(DeleteRequest.status == 'pending').count()
            
            # 今日處理數量
            today_processed = base_query.filter(
                and_(
                    DeleteRequest.reviewed_at >= today_start,
                    DeleteRequest.reviewed_at <= today_end
                )
            ).count()
            
            # 今日核准數量
            today_approved = base_query.filter(
                and_(
                    DeleteRequest.status == 'approved',
                    DeleteRequest.reviewed_at >= today_start,
                    DeleteRequest.reviewed_at <= today_end
                )
            ).count()
            
            # 今日拒絕數量
            today_rejected = base_query.filter(
                and_(
                    DeleteRequest.status == 'rejected',
                    DeleteRequest.reviewed_at >= today_start,
                    DeleteRequest.reviewed_at <= today_end
                )
            ).count()
            
            return jsonify({
                'ok': True,
                'data': {
                    'pending': pending_count,
                    'today_processed': today_processed,
                    'today_approved': today_approved,
                    'today_rejected': today_rejected
                }
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 刪文請求查詢
@bp.get('/delete-requests')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator')
def list_delete_requests():
    from services.delete_service import DeleteService
    
    status = request.args.get('status', '').strip() or None
    limit = min(int(request.args.get('limit', 100)), 500)
    
    with get_session() as s:
        user_id = get_jwt_identity()
        current_user = s.query(User).filter(User.id == user_id).first() if user_id else None
        # 只允許審文組查詢自己學校的刪文請求
        if current_user and current_user.role in ('campus_moderator',):
            if not current_user.school_id:
                return jsonify({'error': 'campus moderator must have school_id'}), 403
            requests = [r for r in DeleteService.get_delete_requests(s, status, limit) if r.get('post_author_id') and s.query(Post).get(r['post_id']).school_id == current_user.school_id]
        elif current_user and current_user.role in ('cross_moderator',):
            # 可根據 cross_moderator 權限範圍進一步過濾（此處暫同 admin）
            requests = DeleteService.get_delete_requests(s, status, limit)
        else:
            requests = DeleteService.get_delete_requests(s, status, limit)
        return jsonify({'items': requests, 'total': len(requests)})

# 刪文請求審核（核准）
@bp.post('/delete-requests/<int:rid>/approve')
@jwt_required()
@require_role('dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator')
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
                from services.event_service import EventService
                moderator = s.query(User).filter(User.id == moderator_id).first()
                moderator_name = moderator.username if moderator else f"管理員({moderator_id})"
                
                EventService.log_event(
                    session=s,
                    event_type="content.delete_request_approved",
                    title=f"管理員核准刪文請求",
                    description=f"管理員 {moderator_name} 核准了刪文請求 #{rid}" + (f"，備註：{note}" if note else ""),
                    severity="medium",
                    actor_id=moderator_id,
                    actor_name=moderator_name,
                    actor_role=moderator.role if moderator else None,
                    target_type="delete_request",
                    target_id=rid,
                    school_id=moderator.school_id if moderator else None,
                    metadata={"note": note} if note else None,
                    is_important=True,
                    send_webhook=True
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
@require_role('dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator')
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
                from services.event_service import EventService
                moderator = s.query(User).filter(User.id == moderator_id).first()
                moderator_name = moderator.username if moderator else f"管理員({moderator_id})"
                
                EventService.log_event(
                    session=s,
                    event_type="content.delete_request_rejected",
                    title=f"管理員拒絕刪文請求",
                    description=f"管理員 {moderator_name} 拒絕了刪文請求 #{rid}" + (f"，原因：{note}" if note else ""),
                    severity="medium",
                    actor_id=moderator_id,
                    actor_name=moderator_name,
                    actor_role=moderator.role if moderator else None,
                    target_type="delete_request",
                    target_id=rid,
                    school_id=moderator.school_id if moderator else None,
                    metadata={"reason": note} if note else None,
                    is_important=False,
                    send_webhook=True
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
@require_role("dev_admin")
def list_users():
    q = (request.args.get('query') or '').strip().lower()
    limit = max(1, min(int(request.args.get('limit') or 100), 500))
    with get_session() as s:  # type: Session
        # 取得操作者
        current_id = get_jwt_identity()
        actor = s.get(User, current_id) if current_id else None
        actor_role = getattr(actor, 'role', None)
        actor_school_id = getattr(actor, 'school_id', None)

        # 僅 dev_admin 可以管理用戶
        if actor_role != 'dev_admin':
            return jsonify({ 'msg': '僅開發人員可以管理用戶' }), 403

        qry = s.query(User)
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
            
            # 生成個人識別碼
            personal_id = None
            try:
                secret = os.getenv('SECRET_KEY', 'forumkit-dev-secret')
                digest = hmac.new(secret.encode('utf-8'), str(u.id).encode('utf-8'), hashlib.sha256).digest()
                personal_id = base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')[:12]
            except Exception:
                personal_id = f"u{u.id:08d}"
            
            # 獲取用戶統計資訊
            post_count = s.query(Post).filter(Post.author_id == u.id, Post.is_deleted == False).count()
            comment_count = s.query(Comment).filter(Comment.author_id == u.id, Comment.is_deleted == False).count()
            
            # 獲取表符互動次數（如果存在相關模型）
            emoji_reaction_count = 0
            try:
                from models import EmojiReaction
                emoji_reaction_count = s.query(EmojiReaction).filter(EmojiReaction.user_id == u.id).count()
            except ImportError:
                pass  # 如果沒有 EmojiReaction 模型，就設為 0
            
            # 獲取最近的活動資訊
            recent_events = s.query(SystemEvent).filter(
                SystemEvent.actor_id == u.id
            ).order_by(SystemEvent.created_at.desc()).limit(5).all()
            
            # 獲取最近的IP地址和Client_ID
            recent_ips = []
            client_ids = []
            if recent_events:
                for event in recent_events:
                    if event.client_ip and event.client_ip not in recent_ips:
                        recent_ips.append(event.client_ip)
                    if event.client_id and event.client_id not in client_ids:
                        client_ids.append(event.client_id)
                recent_ips = recent_ips[:5]  # 最多顯示5個不同的IP
                client_ids = client_ids[:3]  # 最多顯示3個不同的Client_ID
            
            # 獲取最後登入時間（從事件記錄中推斷）
            last_activity = None
            if recent_events:
                last_activity = recent_events[0].created_at.isoformat()
            
            # 獲取用戶狀態資訊
            is_premium = getattr(u, 'is_premium', False)
            premium_until = getattr(u, 'premium_until', None)
            premium_until_str = premium_until.isoformat() if premium_until else None
            
            items.append({
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'role': u.role,
                'school_id': getattr(u, 'school_id', None),
                'school': school_info,
                'created_at': u.created_at.isoformat() if getattr(u, 'created_at', None) else None,
                'personal_id': personal_id,
                'post_count': post_count,
                'comment_count': comment_count,
                'emoji_reaction_count': emoji_reaction_count,
                'recent_ips': recent_ips,
                'client_ids': client_ids,
                'last_activity': last_activity,
                'is_premium': is_premium,
                'premium_until': premium_until_str,
            })
        return jsonify({ 'items': items, 'total': len(items) })


@bp.get('/users/<int:uid>/activity')
@jwt_required()
@require_role("dev_admin")
def get_user_activity(uid: int):
    """獲取用戶詳細活動記錄"""
    try:
        limit = max(1, min(int(request.args.get('limit') or 50), 200))
        offset = int(request.args.get('offset') or 0)
        
        with get_session() as s:
            # 檢查用戶是否存在
            user = s.get(User, uid)
            if not user:
                return jsonify({ 'msg': '用戶不存在' }), 404
            
            # 檢查權限
            current_id = get_jwt_identity()
            actor = s.get(User, current_id) if current_id else None
            actor_role = getattr(actor, 'role', None)
            actor_school_id = getattr(actor, 'school_id', None)
            
            # 僅 dev_admin 可以查看用戶活動
            if actor_role != 'dev_admin':
                return jsonify({ 'msg': '僅開發人員可以查看用戶活動' }), 403
            
            # 獲取用戶活動記錄
            events = s.query(SystemEvent).filter(
                SystemEvent.actor_id == uid
            ).order_by(SystemEvent.created_at.desc()).offset(offset).limit(limit).all()
            
            # 格式化活動記錄
            activities = []
            for event in events:
                try:
                    activity = {
                        'id': event.id,
                        'event_type': event.event_type,
                        'title': event.title,
                        'description': event.description,
                        'severity': event.severity,
                        'client_ip': event.client_ip,
                        'user_agent': event.user_agent,
                        'created_at': event.created_at.isoformat() if event.created_at else None,
                        'metadata': event.metadata_json or {}
                    }
                    activities.append(activity)
                except Exception as e:
                    print(f"格式化活動記錄失敗: {e}")
                    continue
            
            # 獲取總數
            total_count = s.query(SystemEvent).filter(SystemEvent.actor_id == uid).count()
            
            return jsonify({
                'activities': activities,
                'pagination': {
                    'total': total_count,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total_count
                }
            })
    except Exception as e:
        print(f"獲取用戶活動記錄失敗: {e}")
        return jsonify({ 'msg': '獲取活動記錄失敗' }), 500


@bp.post('/users/<int:uid>/set_password')
@jwt_required()
@require_role("dev_admin")
def set_user_password(uid: int):
    data = request.get_json(silent=True) or {}
    pwd = (data.get('password') or '').strip()
    if len(pwd) < 8:
        return jsonify({ 'msg': '密碼至少 8 碼' }), 400
    with get_session() as s:  # type: Session
        u = s.get(User, uid)
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        # 僅 dev_admin 可以管理用戶
        actor = s.get(User, get_jwt_identity()) if get_jwt_identity() else None
        if actor and actor.role != 'dev_admin':
            return jsonify({ 'msg': '僅開發人員可以管理用戶' }), 403
        u.password_hash = generate_password_hash(pwd)
        
        # 生成個人識別碼並記錄管理員事件
        try:
            # 生成目標用戶的個人識別碼
            secret = os.getenv('SECRET_KEY', 'forumkit-dev-secret')
            digest = hmac.new(secret.encode('utf-8'), str(u.id).encode('utf-8'), hashlib.sha256).digest()
            target_personal_id = base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')[:12]
            
            # 生成操作者的個人識別碼
            actor_personal_id = None
            if actor:
                digest = hmac.new(secret.encode('utf-8'), str(actor.id).encode('utf-8'), hashlib.sha256).digest()
                actor_personal_id = base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')[:12]
            
            EventService.log_event(
                session=s,
                event_type="user.password_changed",
                title="管理員修改用戶密碼",
                description=f"管理員 {actor.username if actor else 'Unknown'} 修改了用戶 {u.username} 的密碼",
                severity="medium",
                actor_id=actor.id if actor else None,
                actor_name=actor.username if actor else None,
                actor_role=actor.role if actor else None,
                target_type="user",
                target_id=str(u.id),
                target_name=u.username,
                school_id=u.school_id,
                metadata={
                    "target_username": u.username,
                    "target_personal_id": target_personal_id,
                    "actor_personal_id": actor_personal_id,
                },
                is_important=True,
                send_webhook=True
            )
        except Exception:
            pass
        
        s.commit()
        return jsonify({ 'ok': True })


@bp.post('/users/<int:uid>/role')
@jwt_required()
@require_role("dev_admin")
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
        if actor and actor.role != 'dev_admin':
            return jsonify({ 'msg': '僅開發人員可以管理用戶' }), 403
        old_role = u.role
        u.role = role
        
        # 生成個人識別碼並記錄管理員事件
        try:
            # 生成目標用戶的個人識別碼
            secret = os.getenv('SECRET_KEY', 'forumkit-dev-secret')
            digest = hmac.new(secret.encode('utf-8'), str(u.id).encode('utf-8'), hashlib.sha256).digest()
            target_personal_id = base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')[:12]
            
            # 生成操作者的個人識別碼
            actor_personal_id = None
            if actor:
                digest = hmac.new(secret.encode('utf-8'), str(actor.id).encode('utf-8'), hashlib.sha256).digest()
                actor_personal_id = base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')[:12]
            
            log_admin_event(
                event_type="user_role_changed",
                title="管理員修改用戶角色",
                description=f"管理員 {actor.username if actor else 'Unknown'} 將用戶 {u.username} 的角色從 {old_role} 修改為 {role}",
                actor_id=actor.id if actor else None,
                actor_name=actor.username if actor else None,
                target_id=u.id,
                target_type="user",
                severity="high",
                metadata={
                    "target_username": u.username,
                    "old_role": old_role,
                    "new_role": role,
                    "target_personal_id": target_personal_id,
                    "actor_personal_id": actor_personal_id,
                },
                session=s,
            )
        except Exception:
            pass
        
        s.commit()
        return jsonify({ 'ok': True })


@bp.post('/users/<int:uid>/email')
@jwt_required()
@require_role("dev_admin")
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
        if actor and actor.role != 'dev_admin':
            return jsonify({ 'msg': '僅開發人員可以管理用戶' }), 403
        # 檢查Email是否已被其他用戶使用
        existing = s.query(User).filter(User.email == email, User.id != uid).first()
        if existing:
            return jsonify({ 'msg': '此Email已被其他用戶使用' }), 400
        u.email = email
        s.commit()
        return jsonify({ 'ok': True })


@bp.post('/users/<int:uid>/school')
@jwt_required()
@require_role("dev_admin")
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
        if actor and actor.role != 'dev_admin':
            return jsonify({ 'msg': '僅開發人員可以管理用戶' }), 403
        
        if school_slug:
            # 查找學校
            school = s.query(School).filter(School.slug == school_slug).first()
            if not school:
                return jsonify({ 'msg': '學校不存在' }), 404
            u.school_id = school.id
        else:
            u.school_id = None
        
        s.commit()
        
        # 記錄事件
        try:
            from services.event_service import EventService
            admin_id = get_jwt_identity()
            admin = s.query(User).get(admin_id) if admin_id else None
            admin_name = admin.username if admin else f"管理員({admin_id})"
            
            action = f"綁定到學校 {school_slug}" if school_slug else "解除學校綁定"
            EventService.log_event(
                session=s,
                event_type="user.school_binding_changed",
                title=f"管理員變更用戶學校綁定",
                description=f"管理員 {admin_name} 為用戶 {u.username} {action}",
                severity="medium",
                actor_id=admin_id,
                actor_name=admin_name,
                actor_role=admin.role if admin else None,
                target_type="user",
                target_id=u.id,
                school_id=admin.school_id if admin else None,
                metadata={"old_school": u.school_id, "new_school": school.id if school_slug else None},
                is_important=False,
                send_webhook=True
            )
        except Exception:
            pass
        
        return jsonify({ 'ok': True })


@bp.delete('/users/<int:uid>')
@jwt_required()
@require_role("dev_admin")
def delete_user(uid: int):
    """刪除使用者：預設僅在無關聯資料時允許刪除。加上 ?force=1 可強制刪除並清理關聯資料。"""
    from models import Post, Comment, Media
    
    # 檢查是否強制刪除
    force = request.args.get('force', '').strip().lower() in ['1', 'true', 'yes']
    
    with get_session() as s:  # type: Session
        # 權限檢查：校內管理員僅能刪除同校使用者
        actor_id = get_jwt_identity()
        actor = s.get(User, actor_id) if actor_id else None
        u = s.get(User, uid)
        if not u:
            return jsonify({ 'msg': 'not found' }), 404
        if actor and actor.role != 'dev_admin':
            return jsonify({ 'msg': '僅開發人員可以管理用戶' }), 403
        
        # 檢查關聯
        has_post = s.query(Post).filter(Post.author_id==uid).first() is not None
        has_comment = s.query(Comment).filter(Comment.author_id==uid).first() is not None
        has_media = s.query(Media).join(Post, Media.post_id==Post.id).filter(Post.author_id==uid).first() is not None
        
        # 檢查公告關聯
        from models import Announcement, AnnouncementRead
        has_announcement = s.query(Announcement).filter(Announcement.created_by==uid).first() is not None
        has_announcement_read = s.query(AnnouncementRead).filter(AnnouncementRead.user_id==uid).first() is not None
        
        # 檢查聊天記錄關聯
        from models import ChatMessage, ChatRoom
        has_chat_message = s.query(ChatMessage).filter(ChatMessage.user_id==uid).first() is not None
        has_chat_room = s.query(ChatRoom).filter(ChatRoom.owner_id==uid).first() is not None
        
        if (has_post or has_comment or has_media or has_announcement or has_announcement_read or has_chat_message or has_chat_room) and not force:
            return jsonify({ 
                'msg': '存在關聯資料，無法刪除（可加 ?force=1 強制刪除）',
                'details': {
                    'has_posts': has_post,
                    'has_comments': has_comment, 
                    'has_media': has_media,
                    'has_announcements': has_announcement,
                    'has_announcement_reads': has_announcement_read,
                    'has_chat_messages': has_chat_message,
                    'has_chat_rooms': has_chat_room
                }
            }), 409
        
        # 強制刪除：清理關聯資料
        if force and (has_post or has_comment or has_media or has_announcement or has_announcement_read or has_chat_message or has_chat_room):
            try:
                # 1. 刪除用戶的所有留言
                comments_deleted = s.query(Comment).filter(Comment.author_id == uid).count()
                s.query(Comment).filter(Comment.author_id == uid).delete(synchronize_session=False)
                
                # 2. 刪除用戶貼文的媒體檔案
                post_ids = [p.id for p in s.query(Post.id).filter(Post.author_id == uid).all()]
                media_deleted = 0
                if post_ids:
                    media_deleted = s.query(Media).filter(Media.post_id.in_(post_ids)).count()
                    s.query(Media).filter(Media.post_id.in_(post_ids)).delete(synchronize_session=False)
                
                # 3. 刪除用戶的所有貼文
                posts_deleted = s.query(Post).filter(Post.author_id == uid).count()
                s.query(Post).filter(Post.author_id == uid).delete(synchronize_session=False)
                
                # 4. 刪除用戶創建的公告
                announcements_deleted = s.query(Announcement).filter(Announcement.created_by == uid).count()
                s.query(Announcement).filter(Announcement.created_by == uid).delete(synchronize_session=False)
                
                # 5. 刪除用戶的公告閱讀記錄
                announcement_reads_deleted = s.query(AnnouncementRead).filter(AnnouncementRead.user_id == uid).count()
                s.query(AnnouncementRead).filter(AnnouncementRead.user_id == uid).delete(synchronize_session=False)
                
                # 6. 刪除用戶的聊天記錄
                chat_messages_deleted = s.query(ChatMessage).filter(ChatMessage.user_id == uid).count()
                s.query(ChatMessage).filter(ChatMessage.user_id == uid).delete(synchronize_session=False)
                
                # 7. 刪除用戶擁有的聊天室（軟刪除）
                chat_rooms_deleted = s.query(ChatRoom).filter(ChatRoom.owner_id == uid).count()
                s.query(ChatRoom).filter(ChatRoom.owner_id == uid).update({ChatRoom.is_active: False})
                
                print(f"[DEBUG] 強制刪除用戶 {uid} 的關聯資料: posts={posts_deleted}, comments={comments_deleted}, media={media_deleted}, announcements={announcements_deleted}, announcement_reads={announcement_reads_deleted}, chat_messages={chat_messages_deleted}, chat_rooms={chat_rooms_deleted}")
                
            except Exception as e:
                print(f"[ERROR] 清理用戶 {uid} 關聯資料時出錯: {e}")
                s.rollback()
                return jsonify({ 'msg': f'清理關聯資料時出錯: {str(e)}' }), 500
        
        # 生成被刪除用戶的個人識別碼
        target_personal_id = None
        try:
            secret = os.getenv('SECRET_KEY', 'forumkit-dev-secret')
            digest = hmac.new(secret.encode('utf-8'), str(u.id).encode('utf-8'), hashlib.sha256).digest()
            target_personal_id = base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')[:12]
        except Exception:
            target_personal_id = f"u{u.id:08d}"

        # 生成操作者的個人識別碼
        actor_personal_id = None
        if actor:
            try:
                secret = os.getenv('SECRET_KEY', 'forumkit-dev-secret')
                digest = hmac.new(secret.encode('utf-8'), str(actor.id).encode('utf-8'), hashlib.sha256).digest()
                actor_personal_id = base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')[:12]
            except Exception:
                actor_personal_id = f"u{actor.id:08d}"

        # 記錄管理員事件
        try:
            EventService.log_event(
                session=s,
                event_type="user.deleted",
                title=f"管理員刪除用戶",
                description=f"管理員 {actor.username if actor else 'Unknown'} 刪除了用戶 {u.username}"
                           + (f"\n強制刪除模式：清理了相關貼文和留言" if force and (has_post or has_comment or has_media) else ""),
                severity="high",
                actor_id=actor.id if actor else None,
                actor_name=actor.username if actor else None,
                actor_role=actor.role if actor else None,
                target_type="user",
                target_id=str(u.id),
                target_name=u.username,
                school_id=u.school_id,
                metadata={
                    "deleted_username": u.username,
                    "deleted_email": u.email,
                    "deleted_role": u.role,
                    "school_id": u.school_id,
                    "force_delete": force,
                    "cleaned_associations": force and (has_post or has_comment or has_media),
                    "target_personal_id": target_personal_id,
                    "actor_personal_id": actor_personal_id,
                },
                is_important=True,
                send_webhook=True
            )
        except Exception:
            pass

        # 刪除用戶
        s.delete(u)
        s.commit()
        
        return jsonify({ 
            'ok': True, 
            'forced': force,
            'cleaned_associations': force and (has_post or has_comment or has_media or has_announcement or has_announcement_read or has_chat_message or has_chat_room)
        })

@bp.post('/users')
@jwt_required()
@require_role("dev_admin")
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
        if actor and actor.role != 'dev_admin':
            return jsonify({ 'msg': '僅開發人員可以管理用戶' }), 403
        school_id = None
        if school_slug:
            sch = s.query(School).filter(School.slug == school_slug).first()
            if not sch:
                return jsonify({'msg': '學校不存在'}), 404
            school_id = sch.id

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

            # 添加自定義聊天室（從數據庫）
            try:
                from models import ChatRoom
                custom_rooms = s.query(ChatRoom).filter(
                    and_(
                        ChatRoom.room_type == "custom",
                        ChatRoom.is_active == True
                    )
                ).all()
                
                for room in custom_rooms:
                    # 檢查用戶是否有權限訪問此聊天室
                    can_access = False
                    
                    # dev_admin 可以訪問所有自定義聊天室
                    if role == "dev_admin":
                        can_access = True
                    # campus_admin 只能訪問自己學校的聊天室或自己創建的聊天室
                    elif role == "campus_admin":
                        if room.owner_id == user_id or room.school_id == school_id:
                            can_access = True
                    
                    if can_access:
                        client_ids = list(_room_clients.get(room.id, set()))
                        available_rooms.append({
                            "id": room.id,
                            "name": room.name,
                            "description": room.description or "自定義聊天室",
                            "access_roles": ["dev_admin", "campus_admin"],
                            "school_specific": room.school_id is not None,
                            "school_id": room.school_id,
                            "online_count": len(client_ids),
                            "custom": True,
                            "owner_id": room.owner_id
                        })
            except Exception as e:
                print(f"載入自定義聊天室失敗: {e}")
                pass
            
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
            target_school_id = None
            if room_id.startswith("admin_campus:"):
                # campus room 判斷作為條件分支使用
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
                    # 自訂聊天室：僅 dev_admin 可存取
                    from app import _custom_rooms
                    # 檢查內存中的自定義聊天室
                    if room_id not in _custom_rooms:
                        # 如果內存中沒有，檢查數據庫中是否存在
                        from models import ChatRoom
                        db_room = s.query(ChatRoom).filter(
                            and_(
                                ChatRoom.id == room_id,
                                ChatRoom.room_type == "custom",
                                ChatRoom.is_active == True
                            )
                        ).first()
                        if not db_room:
                            return jsonify({"error": "ROOM_NOT_FOUND"}), 404
                        # 如果數據庫中存在，重新初始化內存中的聊天室
                        _custom_rooms[room_id] = {
                            'owner_id': db_room.owner_id,
                            'name': db_room.name,
                            'description': db_room.description,
                            'members': set()
                        }
                    if role != "dev_admin":
                        return jsonify({"error": "ACCESS_DENIED"}), 403
                else:
                    if role != "dev_admin" and role not in fixed_rooms[room_id]:
                        return jsonify({"error": "ACCESS_DENIED"}), 403
            
            # 從 WebSocket 狀態獲取線上用戶
            from app import _room_clients
            try:
                from app import _client_user
            except ImportError:
                _client_user = {}
            
            # 獲取聊天室中的 client_id 列表
            client_ids = list(_room_clients.get(room_id, set()))
            
            # 獲取用戶詳細資訊
            online_users = []
            for client_id in client_ids:
                try:
                    # 從 _client_user 映射中獲取用戶信息
                    user_info = _client_user.get(client_id)
                    if not user_info or not user_info.get("user_id"):
                        # 後備：無法解析身份時，仍回傳匿名客戶端資訊，避免前端顯示為空
                        online_users.append({
                            "id": None,
                            "username": client_id[:8] if client_id else "匿名",
                            "role": "guest",
                            "school_id": None,
                            "client_id": client_id
                        })
                        continue
                    
                    user_id_from_client = user_info["user_id"]
                    
                    # 排除自己（前端清單只顯示其他用戶）
                    if int(user_id_from_client) == int(user_id):
                        continue
                    
                    # 驗證用戶是否仍存在於數據庫中
                    db_user = s.query(User).get(int(user_id_from_client))
                    if db_user:
                        online_users.append({
                            "id": db_user.id,
                            "username": db_user.username,
                            "role": db_user.role,
                            "school_id": db_user.school_id,
                            "client_id": client_id
                        })
                    else:
                        # 後備：找不到資料庫用戶時，維持基本資訊
                        online_users.append({
                            "id": None,
                            "username": user_info.get("username") or (client_id[:8] if client_id else "匿名"),
                            "role": user_info.get("role") or "guest",
                            "school_id": user_info.get("school_id"),
                            "client_id": client_id
                        })
                except (ValueError, TypeError, KeyError):
                    # 如果無法解析用戶信息，跳過
                    online_users.append({
                        "id": None,
                        "username": client_id[:8] if client_id else "匿名",
                        "role": "guest",
                        "school_id": None,
                        "client_id": client_id
                    })
            
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
    """獲取管理員事件記錄（重定向到新的事件API）"""
    try:
        from services.event_service import EventService
        from utils.db import get_session
        from models import User
        
        # 獲取查詢參數
        limit = min(200, max(1, int(request.args.get('limit', 50))))
        event_type = request.args.get('type', '').strip() or None
        category = request.args.get('category', '').strip() or None
        severity = request.args.get('severity', '').strip() or None
        include_stats = request.args.get('stats', 'false').lower() == 'true'
        
        # 權限檢查
        current_user_id = get_jwt_identity()
        with get_session() as s:
            current_user = s.get(User, current_user_id)
            if not current_user:
                return jsonify({"error": "用戶不存在"}), 404
            
            # 校內管理員權限限制
            school_id = None
            if current_user.role in ["campus_admin", "campus_moderator"] and current_user.school_id:
                school_id = current_user.school_id
            
            # 獲取事件記錄
            events = EventService.get_events(
                session=s,
                limit=limit,
                category=category,
                event_type=event_type,
                severity=severity,
                school_id=school_id
            )
            
            # 轉換為字典格式並處理敏感信息
            events_data = []
            for event in events:
                event_dict = event.to_dict()
                # 格式化時間顯示
                try:
                    ts = event.created_at
                    event_dict["time_display"] = ts.strftime("%Y-%m-%d %H:%M:%S")
                    event_dict["time_ago"] = _format_time_ago(ts)
                except Exception:
                    event_dict["time_display"] = str(event.created_at)
                    event_dict["time_ago"] = "未知"
                
                # 非dev_admin用戶隱藏敏感信息
                if current_user.role != "dev_admin":
                    event_dict["client_ip"] = None
                    event_dict["user_agent"] = None
                    if event_dict.get("metadata"):
                        sensitive_keys = ["ip", "user_agent", "password", "token"]
                        for key in sensitive_keys:
                            event_dict["metadata"].pop(key, None)
                
                events_data.append(event_dict)
        
            result = {
                "events": events_data,
                "total": len(events_data)
            }
            
            # 包含統計資料
            if include_stats:
                stats = EventService.get_event_statistics(
                    session=s,
                    days=7,
                    school_id=school_id
                )
                # 轉換為前端預期鍵名
                try:
                    today_key = datetime.now(timezone.utc).date().isoformat()
                except Exception:
                    today_key = ""
                severity_distribution = stats.get("severity_stats", {}) if isinstance(stats, dict) else {}
                type_distribution = stats.get("category_stats", {}) if isinstance(stats, dict) else {}
                daily_stats = stats.get("daily_stats", {}) if isinstance(stats, dict) else {}
                result["statistics"] = {
                    "total_events": int(stats.get("total_events", 0)) if isinstance(stats, dict) else 0,
                    "events_24h": int(daily_stats.get(today_key, 0)) if isinstance(daily_stats, dict) else 0,
                    "type_distribution": type_distribution,
                    "severity_distribution": severity_distribution,
                    "recent_events": [],
                }
            
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


@bp.post('/notify-new-domain')
def notify_new_domain():
    """用戶請求添加新域名到系統的通知端點"""
    data = request.get_json(silent=True) or {}
    domain = (data.get('domain') or '').strip()
    email = (data.get('email') or '').strip() 
    message = (data.get('message') or '').strip()
    
    if not domain:
        return jsonify({"msg": "缺少域名參數"}), 400
    
    try:
        # 記錄到管理員事件日誌
        from services.event_service import EventService
        with get_session() as s:
            EventService.log_event(
                session=s,
                event_type="system.domain_request",
                title=f"用戶請求添加域名",
                description=f"用戶請求添加域名: {domain}" + (f"，聯絡信箱：{email}" if email else "") + (f"，訊息：{message}" if message else ""),
                severity="medium",
                target_type="domain",
                target_id=None,
                metadata={
                    "domain": domain,
                    "user_email": email,
                    "message": message,
                    "client_ip": request.headers.get("CF-Connecting-IP") or request.remote_addr,
                    "user_agent": request.headers.get("User-Agent")
                },
                is_important=True,
                send_webhook=True
            )
        
        # 發送 Discord 通知（如果配置了）
        try:
            from app import _admin_webhook_url, _admin_notify_embed, _post_discord
            hook = _admin_webhook_url()
            if hook:
                embed = _admin_notify_embed(
                    kind="domain_request",
                    title="新域名加入請求",
                    description=f"用戶請求添加域名到系統\n\n**域名:** {domain}\n**用戶:** {email}\n**訊息:** {message}",
                    color=0x3B82F6,  # 藍色
                    author=f"系統通知",
                    footer=f"請管理員在後台添加此域名"
                )
                _post_discord(hook, {"content": None, "embeds": [embed]})
        except Exception as e:
            print(f"發送Discord通知失敗: {e}")
        
        return jsonify({"ok": True, "message": "已通知管理員"})
    
    except Exception as e:
        print(f"處理域名請求通知時出錯: {e}")
        return jsonify({"msg": "通知失敗"}), 500


@bp.post("/chat-rooms/create")
@jwt_required()
@require_role("dev_admin", "campus_admin")
def create_chat_room():
    """創建新的聊天室"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        
        name = data.get("name", "").strip()
        description = data.get("description", "").strip()
        room_type = data.get("room_type", "public")
        invite_targets = data.get("invite_targets", [])
        
        if not name:
            return jsonify({"ok": False, "error": "聊天室名稱不能為空"}), 400
        
        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 404
            
            # 生成唯一的房間ID
            import uuid
            room_id = f"custom:{uuid.uuid4().hex[:8]}"
            
            # 創建聊天室記錄
            from models import ChatRoom
            room = ChatRoom(
                id=room_id,
                name=name,
                description=description or None,
                room_type="custom",
                owner_id=user_id,
                school_id=user.school_id if user.role == "campus_admin" else None,
                is_active=True
            )
            
            s.add(room)
            s.flush()
            
            # 處理邀請目標
            invited_users = set()
            
            for target in invite_targets:
                target_type = target.get("type")
                target_id = target.get("id")
                
                if target_type == "role":
                    # 邀請特定角色的所有用戶
                    role_users = s.query(User).filter(User.role == target_id).all()
                    for u in role_users:
                        invited_users.add(u.id)
                
                elif target_type == "user":
                    # 邀請特定用戶
                    try:
                        user_id_int = int(target_id)
                        invited_users.add(user_id_int)
                    except (ValueError, TypeError):
                        continue
                
                elif target_type == "school":
                    # 邀請特定學校的管理員和版主
                    try:
                        school_id_int = int(target_id)
                        school_users = s.query(User).filter(
                            and_(
                                User.school_id == school_id_int,
                                User.role.in_(["campus_admin", "campus_moderator"])
                            )
                        ).all()
                        for u in school_users:
                            invited_users.add(u.id)
                    except (ValueError, TypeError):
                        continue
            
            # 創建聊天室成員記錄
            from models import ChatRoomMember
            
            # 添加創建者為成員
            creator_member = ChatRoomMember(
                room_id=room_id,
                user_id=user_id,
                is_active=True
            )
            s.add(creator_member)
            
            # 添加邀請的用戶為成員
            for user_id_int in invited_users:
                if user_id_int != user_id:  # 避免重複添加創建者
                    member = ChatRoomMember(
                        room_id=room_id,
                        user_id=user_id_int,
                        is_active=True
                    )
                    s.add(member)
            
            s.commit()
            
            # 記錄聊天室創建事件
            try:
                from services.event_service import EventService
                from utils.ratelimit import get_client_ip
                
                # 準備邀請目標信息
                invite_info = []
                for target in invite_targets:
                    target_type = target.get("type")
                    target_name = target.get("name", "")
                    if target_type == "role":
                        invite_info.append(f"角色組: {target_name}")
                    elif target_type == "user":
                        invite_info.append(f"用戶: {target_name}")
                    elif target_type == "school":
                        invite_info.append(f"學校: {target_name}")
                
                EventService.log_event(
                    session=s,
                    event_type="chat.room.created",
                    title=f"創建聊天室: {name}",
                    description=f"管理員 {user.username} 創建了聊天室「{name}」\n" 
                               f"描述: {description or '無'}\n"
                               f"類型: {room_type}\n"
                               f"邀請目標: {', '.join(invite_info) if invite_info else '無'}",
                    severity="medium",
                    actor_id=user.id,
                    actor_name=user.username,
                    actor_role=user.role,
                    target_type="chat_room",
                    target_id=room_id,
                    target_name=name,
                    school_id=user.school_id,
                    metadata={
                        "room_id": room_id,
                        "room_name": name,
                        "room_description": description,
                        "room_type": room_type,
                        "invite_targets": invite_targets,
                        "invited_users": list(invited_users),
                        "invite_count": len(invited_users)
                    },
                    client_ip=get_client_ip(),
                    user_agent=request.headers.get('User-Agent'),
                    is_important=True,
                    send_webhook=True
                )
            except Exception as e:
                print(f"記錄聊天室創建事件失敗: {e}")
                pass  # 事件記錄失敗不影響主要功能
            
            return jsonify({
                "ok": True,
                "room": {
                    "id": room.id,
                    "name": room.name,
                    "description": room.description,
                    "room_type": room.room_type,
                    "owner_id": room.owner_id,
                    "school_id": room.school_id,
                    "invited_users": list(invited_users)
                }
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"創建聊天室失敗: {str(e)}"}), 500


# 平台事件管理 API
@bp.post('/platform/restart')
@jwt_required()
@require_role('dev_admin')
def record_platform_restart():
    """記錄平台重啟事件（僅 dev_admin）"""
    try:
        data = request.get_json(silent=True) or {}
        reason = data.get('reason', '管理員手動重啟')
        
        platform_event_service.record_platform_restarted(reason)
        
        return jsonify({
            "ok": True,
            "message": "平台重啟事件已記錄",
            "reason": reason
        })
        
    except Exception as e:
        return jsonify({
            "ok": False,
            "error": f"記錄平台重啟事件失敗: {str(e)}"
        }), 500


@bp.post('/platform/stop')
@jwt_required()
@require_role('dev_admin')
def record_platform_stop():
    """記錄平台關閉事件（僅 dev_admin）"""
    try:
        data = request.get_json(silent=True) or {}
        reason = data.get('reason', '管理員手動關閉')
        
        platform_event_service.record_platform_stopped(reason)
        
        return jsonify({
            "ok": True,
            "message": "平台關閉事件已記錄",
            "reason": reason
        })
        
    except Exception as e:
        return jsonify({
            "ok": False,
            "error": f"記錄平台關閉事件失敗: {str(e)}"
        }), 500


@bp.get('/platform/status')
@jwt_required()
@require_role('dev_admin')
def get_platform_status():
    """獲取平台狀態信息（僅 dev_admin）"""
    try:
        import os
        import psutil
        from datetime import datetime, timezone
        import pytz
        
        process = psutil.Process()
        
        # 設定台北時區
        taipei_tz = pytz.timezone('Asia/Taipei')
        
        # 獲取系統啟動時間
        system_boot_time = datetime.fromtimestamp(psutil.boot_time(), tz=taipei_tz)
        current_time = datetime.now(taipei_tz)
        system_uptime_seconds = int((current_time - system_boot_time).total_seconds())
        
        # 獲取應用程序啟動時間
        app_start_time = platform_event_service._start_time if hasattr(platform_event_service, '_start_time') else None
        app_uptime_seconds = platform_event_service._get_uptime_seconds()
        
        status = {
            "process_id": os.getpid(),
            "system_start_time": system_boot_time.isoformat(),
            "system_uptime_seconds": system_uptime_seconds,
            "app_start_time": app_start_time.isoformat() if app_start_time else None,
            "app_uptime_seconds": app_uptime_seconds,
            "memory_usage_mb": round(process.memory_info().rss / 1024 / 1024, 2),
            "cpu_percent": process.cpu_percent(),
            "python_version": f"{os.sys.version_info.major}.{os.sys.version_info.minor}.{os.sys.version_info.micro}",
            "platform": os.name,
            "current_time": current_time.isoformat()
        }
        
        return jsonify({
            "ok": True,
            "status": status
        })
        
    except Exception as e:
        return jsonify({
            "ok": False,
            "error": f"獲取平台狀態失敗: {str(e)}"
        }), 500


@bp.get("/posts")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def get_admin_posts():
    """管理員專用：獲取所有貼文（包括廣告、不同狀態）"""
    try:
        current_user_id = get_jwt_identity()
        limit = min(100, max(1, int(request.args.get('limit', 50))))
        
        with get_session() as s:
            current_user = s.get(User, current_user_id)
            if not current_user:
                return jsonify({"error": "用戶不存在"}), 404
            
            # 基礎查詢 - 管理員可以看到所有狀態的貼文
            query = s.query(Post).filter(Post.is_deleted == False)
            
            # 根據角色過濾權限
            if current_user.role == "campus_admin" and current_user.school_id:
                # 校園管理員只能看到自己學校的貼文和廣告
                query = query.filter(
                    or_(
                        Post.school_id == current_user.school_id,
                        Post.is_advertisement == True,
                        and_(Post.is_announcement == True, Post.school_id.is_(None))
                    )
                )
            elif current_user.role == "cross_admin":
                # 跨校管理員只能看到跨校貼文和廣告
                query = query.filter(
                    or_(
                        Post.school_id.is_(None),
                        Post.is_advertisement == True
                    )
                )
            # dev_admin 可以看到所有貼文，不需要額外過濾
            
            # 按時間倒序，先置頂後普通
            posts = query.order_by(Post.is_pinned.desc(), Post.id.desc()).limit(limit).all()
            
            # 轉換為響應格式
            posts_data = []
            for post in posts:
                # 計算評論數量
                comment_count = s.query(Comment).filter(
                    Comment.post_id == post.id,
                    Comment.is_deleted == False
                ).count()
                
                # 計算點讚數量
                try:
                    from models import PostReaction
                    like_count = s.query(PostReaction).filter(
                        PostReaction.post_id == post.id,
                        PostReaction.reaction_type == 'like'
                    ).count()
                except:
                    like_count = 0
                
                post_data = {
                    "id": post.id,
                    "content": post.content[:200] + "..." if len(post.content) > 200 else post.content,
                    "status": post.status,
                    "is_announcement": bool(post.is_announcement),
                    "is_advertisement": bool(post.is_advertisement),
                    "created_at": post.created_at.isoformat(),
                    "author": {
                        "id": post.author.id if post.author else 0,
                        "username": post.author.username if post.author else "未知用戶"
                    },
                    "school": {
                        "name": post.school.name if post.school else "跨校"
                    } if post.school_id else None,
                    "comment_count": comment_count,
                    "like_count": like_count,
                    "excerpt": post.content[:100] + "..." if len(post.content) > 100 else post.content
                }
                posts_data.append(post_data)
            
            return jsonify({
                "ok": True,
                "posts": posts_data,
                "total": len(posts_data)
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route('/posts/recent', methods=['GET'])
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def get_recent_posts():
    """獲取最近的貼文用於模板預覽"""
    try:
        current_user_id = get_jwt_identity()
        limit = min(20, max(1, int(request.args.get('limit', 5))))
        
        with get_session() as s:
            current_user = s.get(User, current_user_id)
            if not current_user:
                return jsonify({"success": False, "error": "用戶不存在"}), 404
            
            # 基礎查詢 - 只獲取已發布的正常貼文
            query = s.query(Post).filter(
                Post.is_deleted == False,
                Post.status == 'published'  # 只要已發布的
            )
            
            # 根據管理員角色過濾權限
            if current_user.role == "campus_admin" and current_user.school_id:
                # 校園管理員只能看到自己學校的貼文
                query = query.filter(Post.school_id == current_user.school_id)
            elif current_user.role == "cross_admin":
                # 跨校管理員看到所有學校的貼文
                pass
            # dev_admin 可以看到所有貼文
            
            # 按時間倒序獲取最近的貼文
            posts = query.order_by(Post.created_at.desc()).limit(limit).all()
            
            # 轉換為響應格式
            posts_data = []
            for post in posts:
                post_data = {
                    "id": post.id,
                    "title": getattr(post, 'title', '') or f"貼文 #{post.id}",
                    "content": post.content or '',
                    "created_at": post.created_at.isoformat(),
                    "author": {
                        "id": post.author.id if post.author else 0,
                        "username": post.author.username if post.author else "匿名用戶"
                    },
                    "school": {
                        "name": post.school.name if post.school else "跨校"
                    } if post.school_id else None
                }
                posts_data.append(post_data)
            
            return jsonify({
                "success": True,
                "posts": posts_data,
                "total": len(posts_data)
            })
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@bp.get('/schools')
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def get_schools_for_admin():
    """獲取學校清單供管理員使用"""
    try:
        with get_session() as session:
            schools = session.query(School).order_by(School.name.asc()).all()
            schools_data = [
                {
                    "id": school.id,
                    "name": school.name,
                    "display_name": school.name,
                    "slug": school.slug
                }
                for school in schools
            ]
            
            return jsonify({
                "success": True,
                "schools": schools_data
            })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@bp.post('/users/unblock-ip')
@jwt_required()
@require_role("dev_admin")
def unblock_user_ip():
    """解除使用者的 IP 封鎖"""
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')

    if not user_id:
        return jsonify({'ok': False, 'error': 'user_id is required'}), 400

    with get_session() as s:
        # 獲取操作者資訊
        actor_id = get_jwt_identity()
        actor = s.get(User, actor_id) if actor_id else None
        if not actor:
            return jsonify({'ok': False, 'error': 'Actor not found'}), 401

        # 禁止對特例帳號操作
        tuser = s.get(User, int(user_id))
        if tuser and (tuser.username == 'Kaiyasi'):
            return jsonify({'ok': False, 'error': 'FORBIDDEN_FOR_SPECIAL_ACCOUNT'}), 403

        # 找到該使用者最近一次活動的 IP
        latest_event = s.query(SystemEvent).filter(
            SystemEvent.actor_id == user_id
        ).order_by(SystemEvent.created_at.desc()).first()

        if not latest_event or not latest_event.client_ip:
            return jsonify({'ok': False, 'error': 'No recent IP address found for this user.'}), 404

        ip_to_unblock = latest_event.client_ip

        try:
            # 解除 IP 封鎖
            unblock_ip(ip_to_unblock)

            # 記錄安全事件
            log_security_event(
                event_type="ip_unblocked",
                description=f"管理員 {actor.username} 解除了使用者 ID {user_id} 的 IP({ip_to_unblock}) 封鎖。",
                severity="medium",
                actor_id=actor.id,
                actor_name=actor.username,
                metadata={"unblocked_ip": ip_to_unblock, "target_user_id": user_id}
            )
            s.commit()
            return jsonify({'ok': True, 'message': f'IP {ip_to_unblock} has been unblocked for user {user_id}.'})

        except Exception as e:
            s.rollback()
            return jsonify({'ok': False, 'error': str(e)}), 500

@bp.post('/users/block-ip')
@jwt_required()
@require_role("dev_admin")
def block_user_ip():
    """封鎖使用者的最近活動 IP"""
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    block_all = bool(data.get('all', False))
    if not user_id:
        return jsonify({'ok': False, 'error': 'user_id is required'}), 400

    with get_session() as s:
        actor_id = get_jwt_identity()
        actor = s.get(User, actor_id) if actor_id else None
        if not actor:
            return jsonify({'ok': False, 'error': 'Actor not found'}), 401
        # 禁止對特例帳號操作
        tuser = s.get(User, int(user_id))
        if tuser and (tuser.username == 'Kaiyasi'):
            return jsonify({'ok': False, 'error': 'FORBIDDEN_FOR_SPECIAL_ACCOUNT'}), 403

        # 收集要封鎖的 IP
        ips: list[str] = []
        if block_all:
            rows = (
                s.query(SystemEvent.client_ip)
                .filter(SystemEvent.actor_id == user_id, SystemEvent.client_ip.isnot(None))
                .distinct()
                .all()
            )
            ips = [row[0] for row in rows if row[0]]
            if not ips:
                return jsonify({'ok': False, 'error': 'No IP addresses found for this user.'}), 404
        else:
            latest_event = s.query(SystemEvent).filter(
                SystemEvent.actor_id == user_id
            ).order_by(SystemEvent.created_at.desc()).first()
            if not latest_event or not latest_event.client_ip:
                return jsonify({'ok': False, 'error': 'No recent IP address found for this user.'}), 404
            ips = [latest_event.client_ip]
        try:
            for ip in ips:
                try:
                    block_ip(ip)
                except Exception:
                    pass
            log_security_event(
                event_type="ip_blocked",
                description=f"管理員 {actor.username} 封鎖了使用者 ID {user_id} 的 IPs({', '.join(ips)})。",
                severity="high",
                actor_id=actor.id,
                actor_name=actor.username,
                metadata={"blocked_ips": ips, "target_user_id": user_id}
            )
            s.commit()
            return jsonify({'ok': True, 'message': f'Blocked {len(ips)} IP(s) for user {user_id}.', 'count': len(ips), 'ips': ips})
        except Exception as e:
            s.rollback()
            return jsonify({'ok': False, 'error': str(e)}), 500

@bp.get('/users/ip-status')
@jwt_required()
@require_role("dev_admin")
def user_ip_status():
    """查詢使用者最近活動 IP 是否被封鎖"""
    user_id = request.args.get('user_id', type=int)
    if not user_id:
        return jsonify({'ok': False, 'error': 'user_id is required'}), 400
    with get_session() as s:
        latest_event = s.query(SystemEvent).filter(SystemEvent.actor_id == user_id).order_by(SystemEvent.created_at.desc()).first()
        if not latest_event or not latest_event.client_ip:
            return jsonify({'ok': True, 'blocked': False, 'ip': None})
        ip = latest_event.client_ip
        try:
            blocked = is_ip_blocked(ip)
        except Exception:
            blocked = False
        return jsonify({'ok': True, 'blocked': bool(blocked), 'ip': ip})

@bp.post('/users/suspend')
@jwt_required()
@require_role("dev_admin")
def suspend_user():
    """註銷帳號：加入停權名單 + 封鎖最近IP + 封鎖 Email 註冊"""
    from utils.config_handler import load_config, save_config
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'error': 'user_id is required'}), 400
    with get_session() as s:
        u = s.get(User, int(user_id))
        if not u:
            return jsonify({'ok': False, 'error': 'user not found'}), 404
        if u.username == 'Kaiyasi':
            return jsonify({'ok': False, 'error': 'FORBIDDEN_FOR_SPECIAL_ACCOUNT'}), 403
        # 禁止對特例帳號操作
        if u.username == 'Kaiyasi':
            return jsonify({'ok': False, 'error': 'FORBIDDEN_FOR_SPECIAL_ACCOUNT'}), 403
        cfg = load_config() or {}
        sus = set(cfg.get('suspended_users') or [])
        sus.add(int(user_id))
        cfg['suspended_users'] = list(sus)
        # 封鎖 Email
        if u.email:
            bl = set(cfg.get('email_blacklist') or [])
            bl.add(u.email.lower())
            cfg['email_blacklist'] = list(bl)
        save_config(cfg)
        # 封鎖最近 IP
        latest_event = s.query(SystemEvent).filter(SystemEvent.actor_id == user_id).order_by(SystemEvent.created_at.desc()).first()
        if latest_event and latest_event.client_ip:
            try:
                block_ip(latest_event.client_ip)
            except Exception:
                pass
        # 記錄事件
        try:
            actor_id = get_jwt_identity()
            actor = s.get(User, actor_id) if actor_id else None
            log_security_event(
                event_type="user_suspended",
                description=f"管理員 {actor.username if actor else ''} 註銷帳號 {u.username}(id={u.id})",
                severity="high",
                actor_id=(actor.id if actor else None),
                actor_name=(actor.username if actor else None),
                metadata={"user_id": u.id, "email": u.email}
            )
        except Exception:
            pass
        return jsonify({'ok': True, 'message': '使用者已註銷'})

@bp.post('/users/unsuspend')
@jwt_required()
@require_role("dev_admin")
def unsuspend_user():
    """取消註銷：移除停權名單 + 解除最近IP封鎖 + 移除 Email 黑名單"""
    from utils.config_handler import load_config, save_config
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'error': 'user_id is required'}), 400
    with get_session() as s:
        u = s.get(User, int(user_id))
        if not u:
            return jsonify({'ok': False, 'error': 'user not found'}), 404
        if u.username == 'Kaiyasi':
            return jsonify({'ok': False, 'error': 'FORBIDDEN_FOR_SPECIAL_ACCOUNT'}), 403
        # 禁止對特例帳號操作
        if u.username == 'Kaiyasi':
            return jsonify({'ok': False, 'error': 'FORBIDDEN_FOR_SPECIAL_ACCOUNT'}), 403
        cfg = load_config() or {}
        # 移除 suspended_users
        sus = set(cfg.get('suspended_users') or [])
        if int(user_id) in sus:
            sus.remove(int(user_id))
            cfg['suspended_users'] = list(sus)
        # 移除 Email 黑名單
        if u.email:
            bl = set(cfg.get('email_blacklist') or [])
            if u.email.lower() in bl:
                bl.remove(u.email.lower())
                cfg['email_blacklist'] = list(bl)
        save_config(cfg)
        # 解除最近 IP 封鎖
        latest_event = s.query(SystemEvent).filter(SystemEvent.actor_id == user_id).order_by(SystemEvent.created_at.desc()).first()
        if latest_event and latest_event.client_ip:
            try:
                # 即使沒被封鎖也不報錯
                unblock_ip(latest_event.client_ip)
            except Exception:
                pass
        # 記錄事件
        try:
            actor_id = get_jwt_identity()
            actor = s.get(User, actor_id) if actor_id else None
            log_security_event(
                event_type="user_unsuspended",
                description=f"管理員 {actor.username if actor else ''} 取消註銷 {u.username}(id={u.id})",
                severity="medium",
                actor_id=(actor.id if actor else None),
                actor_name=(actor.username if actor else None),
                metadata={"user_id": u.id, "email": u.email}
            )
        except Exception:
            pass
        return jsonify({'ok': True, 'message': '使用者已恢復'})

@bp.get('/users/suspend-status')
@jwt_required()
@require_role("dev_admin")
def suspend_status():
    user_id = request.args.get('user_id', type=int)
    if not user_id:
        return jsonify({'ok': False, 'error': 'user_id is required'}), 400
    from utils.config_handler import load_config
    cfg = load_config() or {}
    sus = set(cfg.get('suspended_users') or [])
    return jsonify({'ok': True, 'suspended': (int(user_id) in sus)})

@bp.post('/users/revoke-email')
@jwt_required()
@require_role("dev_admin")
def revoke_user_email():
    """將使用者 Email 加入黑名單，禁止未來註冊"""
    from utils.config_handler import load_config, save_config
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    email = (data.get('email') or '').strip().lower()
    if not user_id and not email:
        return jsonify({'ok': False, 'error': 'user_id or email is required'}), 400
    with get_session() as s:
        if not email:
            u = s.get(User, int(user_id))
            if not u:
                return jsonify({'ok': False, 'error': 'user not found'}), 404
            email = (u.email or '').strip().lower()
        if not email:
            return jsonify({'ok': False, 'error': 'email empty'}), 400
        cfg = load_config() or {}
        blist = cfg.get('email_blacklist', [])
        if email not in blist:
            blist.append(email)
            cfg['email_blacklist'] = blist
            save_config(cfg)
        # 記錄事件
        try:
            actor_id = get_jwt_identity()
            actor = s.get(User, actor_id) if actor_id else None
            log_security_event(
                event_type="email_revoked",
                description=f"管理員 {actor.username if actor else ''} 註銷 Email {email} (禁止再註冊)",
                severity="medium",
                actor_id=(actor.id if actor else None),
                actor_name=(actor.username if actor else None),
                metadata={"email": email, "target_user_id": user_id}
            )
        except Exception:
            pass
        return jsonify({'ok': True, 'message': f'{email} 已加入黑名單，不可再註冊'})
