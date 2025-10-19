"""
Module: backend/routes/routes_comments.py
Unified comment style: module docstring + minimal inline notes.
"""
from __future__ import annotations
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import Session
from sqlalchemy import func
from utils.db import get_session
from utils.ratelimit import get_client_ip
from utils.auth import get_effective_user_id
from models import Post, Comment, PostReaction, CommentReaction, User
from utils.school_permissions import can_comment_on_post
from utils.notify import send_admin_event as admin_notify
from services.notification_service import NotificationService

bp = Blueprint("comments", __name__, url_prefix="/api")


def _author_label(u: User | None, client_id: str = None) -> str:
    """根據用戶狀態返回適當的顯示名稱"""
    try:
        if not u:
            return "未知"
        
        username = u.username or ""
        
        if username.startswith("demo_") or username.startswith("system_"):
            return "系統展示"
        
        if username.startswith("anon_"):
            if client_id:
                try:
                    import hashlib
                    hash_obj = hashlib.md5(client_id.encode())
                    hash_hex = hash_obj.hexdigest()[:6].upper()
                    return hash_hex
                except Exception:
                    return "匿名"
            return "匿名"
        
        return username if username else "用戶"
        
    except Exception:
        return "未知"


@bp.get("/posts/<int:pid>/comments")
def list_comments(pid: int):
    try:
        page = max(int(request.args.get("page", 1) or 1), 1)
        limit = min(max(int(request.args.get("limit", 20) or 20), 1), 100)
        
        with get_session() as s:  # type: Session
            post = s.query(Post).filter(Post.id==pid, Post.status=="approved").first()
            if not post:
                return jsonify({"ok": False, "error": "NOT_FOUND"}), 404
            
            base = s.query(Comment).filter(Comment.post_id==pid, Comment.is_deleted==False, Comment.status != 'rejected')
            total = base.count()
            rows = (
                base.order_by(Comment.created_at.desc(), Comment.id.desc())
                    .offset((page-1)*limit).limit(limit).all()
            )
            
            items = []
            uid: int | None = None
            try:
                ident = get_jwt_identity()
                if ident is not None:
                    uid = int(ident)
            except Exception:
                uid = None
            
            user_reactions: dict[int, str] = {}
            if uid and rows:
                try:
                    ids = [c.id for c in rows]
                    for cr in s.query(CommentReaction).filter(CommentReaction.user_id==uid, CommentReaction.comment_id.in_(ids)).all():
                        user_reactions[cr.comment_id] = cr.reaction_type
                except Exception as e:
                    print(f"Error loading user reactions: {e}")
                    user_reactions = {}
            
            for c in rows:
                try:
                    likes = s.query(func.count(CommentReaction.id)).filter(CommentReaction.comment_id==c.id, CommentReaction.reaction_type=="like").scalar() or 0
                    dislikes = s.query(func.count(CommentReaction.id)).filter(CommentReaction.comment_id==c.id, CommentReaction.reaction_type=="dislike").scalar() or 0
                    
                    author_user = s.get(User, c.author_id)
                    author_label = "未知"
                    try:
                        author_label = _author_label(author_user, request.headers.get("X-Client-Id", "").strip())
                    except Exception as e:
                        print(f"Error getting author label: {e}")
                        author_label = "用戶"
                    
                    created_at = None
                    try:
                        if hasattr(c, "created_at") and c.created_at:
                            created_at = c.created_at.isoformat()
                    except Exception as e:
                        print(f"Error formatting created_at: {e}")
                    
                    items.append({
                        "id": c.id,
                        "content": c.content or "",
                        "author_id": c.author_id,
                        "author_label": author_label,
                        "created_at": created_at,
                        "stats": {"likes": int(likes), "dislikes": int(dislikes)},
                        "user_reaction": user_reactions.get(c.id),
                    })
                except Exception as e:
                    print(f"Error processing comment {c.id}: {e}")
                    continue
            
            has_next = (page*limit) < total
            return jsonify({
                "ok": True,
                "comments": items,
                "pagination": {"page": page, "limit": limit, "total": int(total), "has_next": has_next}
            })
            
    except Exception as e:
        print(f"Error in list_comments: {e}")
        return jsonify({"ok": False, "error": "INTERNAL_ERROR", "message": "載入留言失敗"}), 500


@bp.post("/posts/<int:pid>/comments")
@jwt_required(optional=True)
def create_comment(pid: int):
    uid = get_effective_user_id()
    if uid is None:
        return jsonify({"ok": False, "error": "UNAUTHORIZED", "message": "缺少授權資訊"}), 401
    
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"ok": False, "error": "CONTENT_REQUIRED"}), 400
    
    with get_session() as s:  # type: Session
        p = s.get(Post, pid)
        if not p or p.status != "approved":
            return jsonify({"ok": False, "error": "NOT_FOUND"}), 404
        
        user = s.get(User, uid)
        if not user:
            return jsonify({"ok": False, "error": "USER_NOT_FOUND"}), 404
        
        if not can_comment_on_post(user, p):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED", "message": "您沒有權限在該貼文留言"}), 403
        
        c = Comment(post_id=pid, author_id=uid, content=content, status="approved")
        try:
            c.ip = get_client_ip()
        except Exception:
            pass
        s.add(c)
        s.commit()
        s.refresh(c)
        
        try:
            actor_name = getattr(user, 'username', None) or f"user:{uid}"
            snippet = (c.content or '')
            if len(snippet) > 120:
                snippet = snippet[:120] + '…'
            fields = [{"name": "Post", "value": f"#{pid}", "inline": True}]
            if snippet:
                fields.append({"name": "Snippet", "value": snippet})
            admin_notify(
                kind='comment',
                title='新留言',
                description=f'{actor_name} 在貼文 #{pid} 新增留言',
                actor=actor_name,
                source='/api/posts/{pid}/comments',
                fields=fields,
            )
        except Exception:
            pass  # 事件記錄失敗不影響留言發布

        try:
            mentioned_user_ids = NotificationService._extract_mentions(c.content or '', s)  # type: ignore[attr-defined]
            if mentioned_user_ids:
                author_label = _author_label(user, request.headers.get("X-Client-Id", "").strip())
                snippet = (c.content or '')
                if len(snippet) > 120:
                    snippet = snippet[:120] + '…'
                for target_uid in mentioned_user_ids:
                    try:
                        NotificationService.create_notification(
                            user_id=int(target_uid),
                            notification_type='mention',
                            title=f'{author_label} 在留言中提及了您',
                            content=snippet,
                            room_id=None,
                            message_id=None,
                            from_user_id=int(uid),
                            session=s,
                        )
                        try:
                            from services.socket_chat_service import SocketChatService
                            SocketChatService.notify_user(int(target_uid), 'mention', {
                                'source': 'comment',
                                'post_id': int(pid),
                                'comment_id': int(c.id),
                                'by': author_label,
                                'snippet': snippet,
                            })
                        except Exception:
                            pass
                    except Exception:
                        continue
                try:
                    from services.event_service import EventService
                    fields = [
                        { 'name': 'Post', 'value': f'#{int(pid)}', 'inline': True },
                        { 'name': 'Comment', 'value': f'#{int(c.id)}', 'inline': True },
                        { 'name': 'Mentions', 'value': ', '.join(str(x) for x in mentioned_user_ids) },
                    ]
                    EventService.log_event(
                        session=s,
                        event_type='notification.user.mentioned',
                        title='用戶被提及（留言）',
                        description=f'{author_label} 在貼文 #{int(pid)} 的留言中提及了 {len(mentioned_user_ids)} 位用戶',
                        severity='low',
                        actor_id=int(uid),
                        actor_name=getattr(user, 'username', None),
                        actor_role=getattr(user, 'role', None),
                        target_type='comment',
                        target_id=str(int(c.id)),
                        school_id=getattr(p, 'school_id', None) if p else None,
                        metadata={ 'post_id': int(pid), 'comment_id': int(c.id), 'mentioned_user_ids': [int(x) for x in mentioned_user_ids] },
                        is_important=False,
                        send_webhook=True,
                    )
                except Exception:
                    pass
        except Exception:
            pass

        try:
            from app import socketio
            school_slug = None
            try:
                sch = None
                if getattr(p, 'school_id', None):
                    from models import School
                    sch = s.get(School, int(p.school_id))
                school_slug = getattr(sch, 'slug', None) if sch else None
            except Exception:
                school_slug = None
            socketio.emit('comment.created', {
                'id': c.id,
                'post_id': pid,
                'content': c.content,
                'author_id': uid,
                'school_slug': school_slug,
                'post': { 'id': pid, 'school_slug': school_slug },
            })
        except Exception:
            pass
        
        u = s.get(User, uid)
        return jsonify({
            "id": c.id,
            "content": c.content,
            "author_id": c.author_id,  # 添加作者 ID 給前端判斷權限
            "author_label": _author_label(u, request.headers.get("X-Client-Id", "").strip()),
            "created_at": c.created_at.isoformat() if getattr(c, "created_at", None) else None,
            "stats": {"likes": 0, "dislikes": 0},
            "user_reaction": None,
        }), 201


def _post_reaction_stats(s: Session, pid: int) -> dict:
    types = ["like","dislike","love","laugh","angry"]
    out = {}
    for t in types:
        out[t] = int(s.query(func.count(PostReaction.id)).filter(PostReaction.post_id==pid, PostReaction.reaction_type==t).scalar() or 0)
    return out

def _get_user_reactions(s: Session, pid: int, uid: int) -> list:
    """獲取用戶對貼文的所有反應"""
    reactions = s.query(PostReaction).filter(
        PostReaction.post_id==pid, 
        PostReaction.user_id==uid
    ).all()
    return [r.reaction_type for r in reactions]


@bp.get("/posts/<int:pid>/reactions")
@jwt_required(optional=True)
def get_post_reactions(pid: int):
    with get_session() as s:
        if not s.query(Post).filter(Post.id==pid).first():
            return jsonify({"error": "NOT_FOUND"}), 404
        uid = None
        try:
            ident = get_jwt_identity()
            if ident is not None:
                uid = int(ident)
        except Exception:
            uid = None
        user_reactions = []
        if uid:
            user_reactions = _get_user_reactions(s, pid, uid)
        return jsonify({ "stats": _post_reaction_stats(s, pid), "user_reactions": user_reactions })


@bp.post("/posts/<int:pid>/reactions")
@jwt_required()
def toggle_post_reaction(pid: int):
    data = request.get_json(silent=True) or {}
    rtype = (data.get("reaction_type") or "").strip()
    if rtype not in {"like","dislike","love","laugh","angry"}:
        return jsonify({"ok": False, "error": "INVALID_REACTION"}), 400
    ident = get_jwt_identity()
    uid = int(ident) if ident is not None else None
    with get_session() as s:
        if not s.query(Post).filter(Post.id==pid, Post.status=="approved").first():
            return jsonify({"ok": False, "error": "NOT_FOUND"}), 404
        
        cur = s.query(PostReaction).filter(
            PostReaction.post_id==pid, 
            PostReaction.user_id==uid,
            PostReaction.reaction_type==rtype
        ).first()
        
        if cur:
            s.delete(cur)
            s.commit()
        else:
            s.add(PostReaction(post_id=pid, user_id=uid, reaction_type=rtype))
            s.commit()
        
        return jsonify({ 
            "user_reactions": _get_user_reactions(s, pid, uid), 
            "stats": _post_reaction_stats(s, pid) 
        })


@bp.post("/comments/<int:cid>/reactions")
@jwt_required()
def toggle_comment_reaction(cid: int):
    data = request.get_json(silent=True) or {}
    rtype = (data.get("reaction_type") or "").strip()
    if rtype not in {"like","dislike"}:
        return jsonify({"ok": False, "error": "INVALID_REACTION"}), 400
    ident = get_jwt_identity()
    uid = int(ident) if ident is not None else None
    with get_session() as s:
        c = s.get(Comment, cid)
        if not c:
            return jsonify({"ok": False, "error": "NOT_FOUND"}), 404
        cur = s.query(CommentReaction).filter(CommentReaction.comment_id==cid, CommentReaction.user_id==uid).first()
        if cur and cur.reaction_type == rtype:
            s.delete(cur); s.commit()
        elif cur:
            cur.reaction_type = rtype; s.commit()
        else:
            s.add(CommentReaction(comment_id=cid, user_id=uid, reaction_type=rtype)); s.commit()
        likes = s.query(func.count(CommentReaction.id)).filter(CommentReaction.comment_id==cid, CommentReaction.reaction_type=="like").scalar() or 0
        dislikes = s.query(func.count(CommentReaction.id)).filter(CommentReaction.comment_id==cid, CommentReaction.reaction_type=="dislike").scalar() or 0
        user_reaction = s.query(CommentReaction).filter(CommentReaction.comment_id==cid, CommentReaction.user_id==uid).first()
        return jsonify({ "user_reaction": (user_reaction.reaction_type if user_reaction else None), "stats": {"likes": int(likes), "dislikes": int(dislikes)} })


@bp.delete("/comments/<int:cid>")
@jwt_required()
def delete_comment(cid: int):
    """軟刪除留言（作者本人或管理員可刪）。"""
    ident = get_jwt_identity()
    uid = int(ident) if ident is not None else None
    if uid is None:
        return jsonify({"ok": False, "error": "UNAUTHORIZED"}), 401
    with get_session() as s:  # type: Session
        c = s.get(Comment, cid)
        if not c or c.is_deleted:
            return jsonify({"ok": False, "error": "NOT_FOUND"}), 404
        role = None
        try:
            u = s.get(User, uid)
            role = getattr(u, 'role', None)
        except Exception:
            role = None
        is_admin = role in {"dev_admin", "campus_admin", "cross_admin"}
        if not (is_admin or c.author_id == uid):
            return jsonify({"ok": False, "error": "FORBIDDEN"}), 403
        c.is_deleted = True
        s.commit()
        return jsonify({"ok": True})
@bp.get("/comments/my-violations")
@jwt_required()
def my_violations():
    """一般用戶查詢：我的違規留言清單
    與 /api/admin/comments/my-violations 對齊，但不使用 admin 前綴。
    """
    try:
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({'ok': False, 'error': 'UNAUTHORIZED'}), 401

        with get_session() as s:
            rows = (
                s.query(Comment)
                .filter(Comment.author_id == user_id, Comment.status == 'rejected', Comment.is_deleted == False)  # noqa: E712
                .order_by(Comment.updated_at.desc())
                .all()
            )

            items = []
            for c in rows:
                p = c.post
                items.append({
                    'id': c.id,
                    'content': c.content,
                    'created_at': c.created_at.isoformat() if getattr(c, 'created_at', None) else None,
                    'updated_at': c.updated_at.isoformat() if getattr(c, 'updated_at', None) else None,
                    'post': {
                        'id': p.id if p else None,
                        'content': (p.content[:100] + '...') if (p and p.content and len(p.content) > 100) else (p.content if p else None)
                    }
                })

            return jsonify({'ok': True, 'items': items})
    except Exception as e:
        return jsonify({'ok': False, 'error': 'SERVER_ERROR', 'message': str(e)}), 500
