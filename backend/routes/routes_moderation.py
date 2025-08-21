from flask import Blueprint, jsonify, request, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import Session
from models import Post, Media, User, ModerationLog
from utils.db import get_session
from utils.authz import require_role
from utils.fsops import move_to_public
# SocketIO 將在審核操作時動態導入

bp = Blueprint("moderation", __name__, url_prefix="/api/moderation")

def write_log(s, ttype, tid, act, old, new, reason, mid):
    s.execute(
        "INSERT INTO moderation_logs (target_type,target_id,action,old_status,new_status,reason,moderator_id) "
        "VALUES (:tt,:ti,:ac,:os,:ns,:rs,:mi)",
        {"tt":ttype,"ti":tid,"ac":act,"os":old,"ns":new,"rs":reason,"mi":mid}
    )

@bp.get("/queue")
@jwt_required()
@require_role("admin", "dev_admin", "campus_admin", "cross_admin", "moderator", "campus_moder", "cross_moder")
def queue():
    with get_session() as s:
        posts = s.query(Post).filter(Post.status=="pending").order_by(Post.id.desc()).limit(200).all()
        media = s.query(Media).filter(Media.status=="pending").order_by(Media.id.desc()).limit(300).all()
        return jsonify({
            "posts":[{"id":p.id,"excerpt":(p.content or "")[:200],"created_at": (p.created_at.isoformat() if getattr(p,'created_at', None) else None), "client_id": getattr(p,'client_id', None), "ip": getattr(p,'ip', None)} for p in posts],
            "media":[{"id":m.id,"path":m.path, "created_at": (m.created_at.isoformat() if getattr(m,'created_at', None) else None), "client_id": getattr(m,'client_id', None), "ip": getattr(m,'ip', None)} for m in media],
        })

@bp.post("/post/<int:pid>/approve")
@jwt_required()
@require_role("admin", "dev_admin", "campus_admin", "cross_admin")
def approve_post(pid:int):
    mid = get_jwt_identity()
    with get_session() as s:
        p = s.get(Post, pid)
        if not p: abort(404)
        old = p.status
        p.status="approved"; p.rejected_reason=None
        write_log(s,"post",pid,"approve",old,p.status,None,mid)
        s.commit()
    try:
        from app import socketio
        socketio.emit("post.approved", {"id": pid})
    except ImportError:
        pass  # SocketIO 未啟用時跳過
    return jsonify({"ok":True})

@bp.get("/logs")
@jwt_required()
@require_role("admin", "dev_admin", "campus_admin", "cross_admin")
def list_logs():
    limit = max(min(int(request.args.get('limit', 200) or 200), 2000), 1)
    fmt = (request.args.get('format') or '').lower()
    with get_session() as s:
        rows = s.query(ModerationLog).order_by(ModerationLog.id.desc()).limit(limit).all()
        items = [
            {
                'id': r.id,
                'target_type': r.target_type,
                'target_id': r.target_id,
                'action': r.action,
                'old_status': r.old_status,
                'new_status': r.new_status,
                'reason': r.reason,
                'moderator_id': r.moderator_id,
                'created_at': r.created_at.isoformat() if getattr(r, 'created_at', None) else None,
            } for r in rows
        ]
    if fmt == 'csv':
        import csv, io
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=list(items[0].keys()) if items else ['id','target_type','target_id','action','old_status','new_status','reason','moderator_id','created_at'])
        w.writeheader()
        for it in items:
            w.writerow(it)
        from flask import Response
        return Response(buf.getvalue(), headers={
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="moderation_logs.csv"'
        })
    return jsonify({ 'items': items, 'total': len(items) })

@bp.post("/post/<int:pid>/reject")
@jwt_required()
@require_role("admin", "dev_admin", "campus_admin", "cross_admin")
def reject_post(pid:int):
    reason = (request.get_json() or {}).get("reason","不符合規範").strip() or "不符合規範"
    mid = get_jwt_identity()
    with get_session() as s:
        p = s.get(Post, pid)
        if not p: abort(404)
        old = p.status
        p.status="rejected"; p.rejected_reason=reason
        write_log(s,"post",pid,"reject",old,p.status,reason,mid)
        s.commit()
    try:
        from app import socketio
        socketio.emit("post.rejected", {"id": pid, "reason": reason})
    except ImportError:
        pass
    return jsonify({"ok":True, "reason":reason})

@bp.post("/media/<int:mid_>/approve")
@jwt_required()
@require_role("admin", "dev_admin", "campus_admin", "cross_admin")
def approve_media(mid_:int):
    uid = get_jwt_identity()
    with get_session() as s:
        m = s.get(Media, mid_)
        if not m: abort(404)
        if m.status=="approved": return jsonify({"ok":True,"note":"already-approved"})
        old = m.status
        # path: pending/<sub>
        rel = m.path.split("pending/",1)[-1]
        m.path = move_to_public(rel)
        m.status="approved"; m.rejected_reason=None
        write_log(s,"media",mid_,"approve",old,m.status,None,uid)
        s.commit()
    try:
        from app import socketio
        socketio.emit("media.approved", {"id": mid_})
    except ImportError:
        pass
    return jsonify({"ok":True})

@bp.post("/media/<int:mid_>/reject")
@jwt_required()
@require_role("admin", "dev_admin", "campus_admin", "cross_admin")
def reject_media(mid_:int):
    reason = (request.get_json() or {}).get("reason","不符合規範").strip() or "不符合規範"
    uid = get_jwt_identity()
    with get_session() as s:
        m = s.get(Media, mid_)
        if not m: abort(404)
        old = m.status
        m.status="rejected"; m.rejected_reason=reason
        write_log(s,"media",mid_,"reject",old,m.status,reason,uid)
        s.commit()
    try:
        from app import socketio
        socketio.emit("media.rejected", {"id": mid_, "reason": reason})
    except ImportError:
        pass
    return jsonify({"ok":True,"reason":reason})
