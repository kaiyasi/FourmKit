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

bp = Blueprint("comments", __name__, url_prefix="/api")


def _author_label(u: User | None, client_id: str = None) -> str:
    """根據用戶狀態返回適當的顯示名稱"""
    try:
        if not u:
            return "未知"
        
        username = u.username or ""
        
        # 如果是系統展示帳號
        if username.startswith("demo_") or username.startswith("system_"):
            return "系統展示"
        
        # 如果是匿名帳號
        if username.startswith("anon_"):
            # 生成6碼唯一碼
            if client_id:
                import hashlib
                hash_obj = hashlib.md5(client_id.encode())
                hash_hex = hash_obj.hexdigest()[:6].upper()
                # 轉換為字母數字組合
                chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
                result = ''
                for i in range(6):
                    char_code = int(hash_hex[i*2:i*2+2], 16)
                    result += chars[char_code % len(chars)]
                return result
            return "匿名"
        
        # 如果是正常登入帳號
        return "帳號"
        
    except Exception:
        return "未知"


@bp.get("/posts/<int:pid>/comments")
def list_comments(pid: int):
    page = max(int(request.args.get("page", 1) or 1), 1)
    limit = min(max(int(request.args.get("limit", 20) or 20), 1), 100)
    with get_session() as s:  # type: Session
        if not s.query(Post).filter(Post.id==pid, Post.status=="approved").first():
            return jsonify({"error": "NOT_FOUND"}), 404
        base = s.query(Comment).filter(Comment.post_id==pid, Comment.is_deleted==False, Comment.status != 'rejected')
        total = base.count()
        rows = (
            base.order_by(Comment.created_at.desc(), Comment.id.desc())
                .offset((page-1)*limit).limit(limit).all()
        )
        items = []
        # User id for reactions
        uid: int | None = None
        try:
            ident = get_jwt_identity()
            if ident is not None:
                uid = int(ident)
        except Exception:
            uid = None
        # Preload user reactions for this page if logged in
        user_reactions: dict[int, str] = {}
        if uid and rows:
            ids = [c.id for c in rows]
            for cr in s.query(CommentReaction).filter(CommentReaction.user_id==uid, CommentReaction.comment_id.in_(ids)).all():
                user_reactions[cr.comment_id] = cr.reaction_type
        for c in rows:
            # stats
            likes = s.query(func.count(CommentReaction.id)).filter(CommentReaction.comment_id==c.id, CommentReaction.reaction_type=="like").scalar() or 0
            dislikes = s.query(func.count(CommentReaction.id)).filter(CommentReaction.comment_id==c.id, CommentReaction.reaction_type=="dislike").scalar() or 0
            items.append({
                "id": c.id,
                "content": c.content,
                "author_label": _author_label(s.get(User, c.author_id), request.headers.get("X-Client-Id", "").strip()),
                "created_at": c.created_at.isoformat() if getattr(c, "created_at", None) else None,
                "stats": {"likes": int(likes), "dislikes": int(dislikes)},
                "user_reaction": user_reactions.get(c.id),
            })
        has_next = (page*limit) < total
        return jsonify({
            "comments": items,
            "pagination": {"page": page, "limit": limit, "total": int(total), "has_next": has_next}
        })


@bp.post("/posts/<int:pid>/comments")
@jwt_required(optional=True)
def create_comment(pid: int):
    uid = get_effective_user_id()
    if uid is None:
        return jsonify({"error": "UNAUTHORIZED", "message": "缺少授權資訊"}), 401
    
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "CONTENT_REQUIRED"}), 400
    
    with get_session() as s:  # type: Session
        # 獲取貼文信息
        p = s.get(Post, pid)
        if not p or p.status != "approved":
            return jsonify({"error": "NOT_FOUND"}), 404
        
        # 獲取用戶信息
        user = s.get(User, uid)
        if not user:
            return jsonify({"error": "USER_NOT_FOUND"}), 404
        
        # 檢查用戶是否有權限在該貼文留言
        if not can_comment_on_post(user, p):
            return jsonify({"error": "PERMISSION_DENIED", "message": "您沒有權限在該貼文留言"}), 403
        
        c = Comment(post_id=pid, author_id=uid, content=content)
        try:
            c.ip = get_client_ip()
        except Exception:
            pass
        s.add(c)
        s.commit()
        s.refresh(c)
        
        # 記錄留言發布事件
        try:
            from utils.admin_events import log_user_action
            log_user_action(
                event_type="comment_created",
                actor_id=uid,
                actor_name=u.username if u else f"用戶({uid})",
                action="發布留言",
                target_id=c.id,
                target_type="留言"
            )
        except Exception:
            pass  # 事件記錄失敗不影響留言發布
        
        u = s.get(User, uid)
        return jsonify({
            "id": c.id,
            "content": c.content,
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
    with get_session() as s:  # type: Session
        if not s.query(Post).filter(Post.id==pid, Post.status=="approved").first():
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
        return jsonify({"error": "INVALID_REACTION"}), 400
    ident = get_jwt_identity()
    uid = int(ident) if ident is not None else None
    with get_session() as s:  # type: Session
        if not s.query(Post).filter(Post.id==pid, Post.status=="approved").first():
            return jsonify({"error": "NOT_FOUND"}), 404
        
        # 查找用戶對該貼文的特定反應
        cur = s.query(PostReaction).filter(
            PostReaction.post_id==pid, 
            PostReaction.user_id==uid,
            PostReaction.reaction_type==rtype
        ).first()
        
        if cur:
            # 如果已存在該反應，則刪除（取消反應）
            s.delete(cur)
            s.commit()
        else:
            # 如果不存在，則添加新反應
            s.add(PostReaction(post_id=pid, user_id=uid, reaction_type=rtype))
            s.commit()
        
        # 返回更新後的統計和用戶反應列表
        return jsonify({ 
            "user_reactions": _get_user_reactions(s, pid, uid), 
            "stats": _post_reaction_stats(s, pid) 
        })


@bp.post("/api/comments/<int:cid>/reactions")
@jwt_required()
def toggle_comment_reaction(cid: int):
    data = request.get_json(silent=True) or {}
    rtype = (data.get("reaction_type") or "").strip()
    if rtype not in {"like","dislike"}:
        return jsonify({"error": "INVALID_REACTION"}), 400
    ident = get_jwt_identity()
    uid = int(ident) if ident is not None else None
    with get_session() as s:  # type: Session
        c = s.get(Comment, cid)
        if not c:
            return jsonify({"error": "NOT_FOUND"}), 404
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


@bp.delete("/api/comments/<int:cid>")
@jwt_required()
def delete_comment(cid: int):
    """軟刪除留言（作者本人或管理員可刪）。"""
    ident = get_jwt_identity()
    uid = int(ident) if ident is not None else None
    if uid is None:
        return jsonify({"error": "UNAUTHORIZED"}), 401
    with get_session() as s:  # type: Session
        c = s.get(Comment, cid)
        if not c or c.is_deleted:
            return jsonify({"error": "NOT_FOUND"}), 404
        # 權限：作者本人或管理員（各類 admin）
        role = None
        try:
            u = s.get(User, uid)
            role = getattr(u, 'role', None)
        except Exception:
            role = None
        is_admin = role in {"dev_admin", "campus_admin", "cross_admin"}
        if not (is_admin or c.author_id == uid):
            return jsonify({"error": "FORBIDDEN"}), 403
        c.is_deleted = True
        s.commit()
        return jsonify({"ok": True})
