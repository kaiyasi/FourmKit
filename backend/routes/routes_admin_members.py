from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_session
from utils.authz import require_role
from models import User, Post, School
from datetime import datetime
from services.event_service import EventService

bp = Blueprint("admin_members", __name__, url_prefix="/api/admin")


@bp.get("/members")
@jwt_required()
@require_role("dev_admin")
def get_members():
    """獲取所有用戶列表（僅 dev_admin）"""
    ident = get_jwt_identity()
    with get_session() as s:
        _ = s.get(User, int(ident))
        
        # 獲取所有用戶
        users = s.query(User).all()
        users_data = []
        
        for user in users:
            school = s.get(School, user.school_id) if user.school_id else None
            users_data.append({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'role': user.role,
                'school': {
                    'id': school.id,
                    'name': school.name,
                    'slug': school.slug
                } if school else None,
                'is_premium': user.is_premium,
                'premium_until': user.premium_until.isoformat() if user.premium_until else None,
                'created_at': user.created_at.isoformat()
            })
        
        return jsonify({"ok": True, "users": users_data})


@bp.patch("/members/<int:user_id>/premium")
@jwt_required()
@require_role("dev_admin")
def update_member_premium_status(user_id: int):
    """更新用戶會員狀態（僅 dev_admin）"""
    ident = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    
    with get_session() as s:
        _ = s.get(User, int(ident))
        
        target_user = s.get(User, user_id)
        if not target_user:
            return jsonify({"ok": False, "error": "用戶不存在"}), 404
        
        is_premium = data.get('is_premium', False)
        premium_until = data.get('premium_until')
        
        # 更新會員狀態
        target_user.is_premium = is_premium
        if premium_until:
            try:
                target_user.premium_until = datetime.fromisoformat(premium_until.replace('Z', '+00:00'))
            except:
                target_user.premium_until = None
        else:
            target_user.premium_until = None
        
        s.commit()
        
        # 記錄事件
        try:
            EventService.log_event(
                session=s,
                event_type="member.premium_status_changed",
                title="會員狀態變更",
                description=f"用戶 {target_user.username} 的會員狀態已變更",
                actor_id=current_user.id,
                actor_name=current_user.username,
                actor_role=current_user.role,
                target_type="user",
                target_id=str(target_user.id),
                target_name=target_user.username,
                metadata={
                    "is_premium": is_premium,
                    "premium_until": premium_until,
                    "previous_status": not is_premium
                }
            )
        except Exception:
            pass
        
        return jsonify({
            "ok": True, 
            "message": f"用戶 {target_user.username} 的會員狀態已更新",
            "user": {
                'id': target_user.id,
                'username': target_user.username,
                'is_premium': target_user.is_premium,
                'premium_until': target_user.premium_until.isoformat() if target_user.premium_until else None
            }
        })


@bp.get("/advertisements")
@jwt_required()
@require_role("dev_admin")
def get_advertisement_posts():
    """獲取所有廣告貼文（僅 dev_admin）"""
    ident = get_jwt_identity()
    with get_session() as s:
        _ = s.get(User, int(ident))
        
        # 獲取所有廣告貼文
        posts = s.query(Post).filter(Post.is_advertisement == True).order_by(Post.created_at.desc()).all()
        posts_data = []
        
        for post in posts:
            author = s.get(User, post.author_id)
            posts_data.append({
                'id': post.id,
                'content': post.content,
                'status': post.status,
                'author': {
                    'id': author.id,
                    'username': author.username
                } if author else None,
                'created_at': post.created_at.isoformat(),
                'is_advertisement': post.is_advertisement
            })
        
        return jsonify({"ok": True, "posts": posts_data})


@bp.patch("/advertisements/<int:post_id>/review")
@jwt_required()
@require_role("dev_admin")
def review_advertisement_post(post_id: int):
    """審核廣告貼文（僅 dev_admin）"""
    ident = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    
    with get_session() as s:
        _ = s.get(User, int(ident))
        
        post = s.get(Post, post_id)
        if not post:
            return jsonify({"ok": False, "error": "貼文不存在"}), 404
        
        if not post.is_advertisement:
            return jsonify({"ok": False, "error": "此貼文不是廣告貼文"}), 400
        
        status = data.get('status')
        reason = data.get('reason')
        
        if status not in ['approved', 'rejected']:
            return jsonify({"ok": False, "error": "無效的狀態"}), 400
        
        # 更新貼文狀態
        post.status = status
        if status == 'rejected' and reason:
            post.rejected_reason = reason
        
        s.commit()
        
        # 記錄事件
        try:
            EventService.log_event(
                session=s,
                event_type="advertisement.reviewed",
                title="廣告貼文審核",
                description=f"廣告貼文 #{post.id} 已{status == 'approved' and '核准' or '拒絕'}",
                actor_id=current_user.id,
                actor_name=current_user.username,
                actor_role=current_user.role,
                target_type="post",
                target_id=str(post.id),
                target_name=f"廣告貼文 #{post.id}",
                metadata={
                    "status": status,
                    "reason": reason,
                    "author_id": post.author_id
                }
            )
        except Exception:
            pass
        
        return jsonify({
            "ok": True,
            "message": f"廣告貼文已{status == 'approved' and '核准' or '拒絕'}",
            "post": {
                'id': post.id,
                'status': post.status,
                'rejected_reason': post.rejected_reason
            }
        })


@bp.delete("/advertisements/<int:post_id>")
@jwt_required()
@require_role("dev_admin")
def delete_advertisement_post(post_id: int):
    """刪除廣告貼文（僅 dev_admin）"""
    ident = get_jwt_identity()
    
    with get_session() as s:
        _ = s.get(User, int(ident))
        
        post = s.get(Post, post_id)
        if not post:
            return jsonify({"ok": False, "error": "貼文不存在"}), 404
        
        if not post.is_advertisement:
            return jsonify({"ok": False, "error": "此貼文不是廣告貼文"}), 400
        
        # 記錄刪除事件
        try:
            EventService.log_event(
                session=s,
                event_type="advertisement.deleted",
                title="廣告貼文已刪除",
                description=f"管理員刪除了廣告貼文 #{post.id}",
                actor_id=current_user.id,
                actor_name=current_user.username,
                actor_role=current_user.role,
                target_type="post",
                target_id=str(post.id),
                target_name=f"廣告貼文 #{post.id}",
                metadata={
                    "author_id": post.author_id,
                    "content_preview": post.content[:100] if post.content else None
                }
            )
        except Exception:
            pass
        
        # 刪除貼文
        s.delete(post)
        s.commit()
        
        return jsonify({
            "ok": True,
            "message": "廣告貼文已刪除"
        })
