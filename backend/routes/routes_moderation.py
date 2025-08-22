from flask import Blueprint, jsonify, request, abort, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import Session
from sqlalchemy import text
from models import Post, Media, User, ModerationLog
from utils.db import get_session
from utils.authz import require_role
from utils.fsops import move_to_public, ensure_within, UPLOAD_ROOT
import mimetypes
from pathlib import Path
import os
from pathlib import Path
from utils.fsops import UPLOAD_ROOT
# SocketIO 將在審核操作時動態導入

bp = Blueprint("moderation", __name__, url_prefix="/api/moderation")

def write_log(s: Session, ttype: str, tid: int, act: str, old: str | None, new: str, reason: str | None, mid: int):
    """Insert a moderation log entry. Use SQLAlchemy text() for 2.x compatibility."""
    try:
        s.execute(
            text(
                """
                INSERT INTO moderation_logs
                    (target_type, target_id, action, old_status, new_status, reason, moderator_id)
                VALUES
                    (:tt, :ti, :ac, :os, :ns, :rs, :mi)
                """
            ),
            {"tt": ttype, "ti": tid, "ac": act, "os": old, "ns": new, "rs": reason, "mi": mid},
        )
    except Exception:
        # 如果寫入日誌失敗，不影響主流程（避免 500）
        # 讓呼叫端照常提交主要交易
        pass


@bp.get("/post/<int:pid>")
@jwt_required()
@require_role("admin", "dev_admin", "campus_admin", "cross_admin", "moderator", "campus_moder", "cross_moder")
def get_post_detail(pid: int):
    """管理端：取得單筆貼文詳情（含 pending 內容與媒體）。"""
    with get_session() as s:
        p = s.get(Post, pid)
        if not p:
            return abort(404)
        # 基本欄位
        author_label = ""
        try:
            u = s.query(User).get(p.author_id)
            if u and not (u.username or "").startswith("anon_"):
                author_label = "帳號"
        except Exception:
            pass
        media = (
            s.query(Media)
             .filter(Media.post_id == p.id)
             .order_by(Media.id.asc())
             .all()
        )
        return jsonify({
            "id": p.id,
            "content": p.content,
            "status": p.status,
            "created_at": (p.created_at.isoformat() if getattr(p, 'created_at', None) else None),
            "client_id": getattr(p, 'client_id', None),
            "ip": getattr(p, 'ip', None),
            "author_hash": author_label,
            "media": [
                {
                    "id": m.id,
                    "path": m.path,
                    "status": m.status,
                    "created_at": (m.created_at.isoformat() if getattr(m, 'created_at', None) else None),
                    "client_id": getattr(m, 'client_id', None),
                    "ip": getattr(m, 'ip', None),
                } for m in media
            ],
        })

@bp.get("/queue")
@jwt_required()
@require_role("admin", "dev_admin", "campus_admin", "cross_admin", "moderator", "campus_moder", "cross_moder")
def queue():
    # 支援依來源篩選：client_id / ip（模糊）
    client_id = (request.args.get('client_id') or '').strip()
    ip = (request.args.get('ip') or '').strip()
    with get_session() as s:
        pq = s.query(Post).filter(Post.status=="pending")
        mq = s.query(Media).filter(Media.status=="pending")
        if client_id:
            try:
                pq = pq.filter(Post.client_id.ilike(f"%{client_id}%"))
                mq = mq.filter(Media.client_id.ilike(f"%{client_id}%"))
            except Exception:
                pq = pq.filter(Post.client_id == client_id)
                mq = mq.filter(Media.client_id == client_id)
        if ip:
            try:
                pq = pq.filter(Post.ip.ilike(f"%{ip}%"))
                mq = mq.filter(Media.ip.ilike(f"%{ip}%"))
            except Exception:
                pq = pq.filter(Post.ip == ip)
                mq = mq.filter(Media.ip == ip)
        posts = pq.order_by(Post.id.desc()).limit(200).all()
        media = mq.order_by(Media.id.desc()).limit(300).all()
        return jsonify({
            "posts":[{"id":p.id,"excerpt":(p.content or "")[:200],"created_at": (p.created_at.isoformat() if getattr(p,'created_at', None) else None), "client_id": getattr(p,'client_id', None), "ip": getattr(p,'ip', None)} for p in posts],
            "media":[{"id":m.id,"post_id": m.post_id, "path":m.path, "created_at": (m.created_at.isoformat() if getattr(m,'created_at', None) else None), "client_id": getattr(m,'client_id', None), "ip": getattr(m,'ip', None)} for m in media],
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
        # 同步核准所有 pending 媒體並移至 public
        media = s.query(Media).filter(Media.post_id==pid).all()
        for m in media:
            if m.status != "approved":
                prev = m.status
                try:
                    # m.path 可能是 pending/<id>/<file> 或 public/<...>
                    rel = m.path.split('pending/',1)[-1] if m.path.startswith('pending/') else m.path.split('public/',1)[-1]
                    m.path = move_to_public(rel)
                except Exception:
                    # 移動失敗則保持原 path，但仍標記為 approved 以避免卡住；可由管理者後續處理
                    pass
                m.status = "approved"; m.rejected_reason=None
                write_log(s, "media", m.id, "approve", prev, m.status, None, mid)
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
        # 一併拒絕該貼文的媒體，避免遺留公開檔案
        media = s.query(Media).filter(Media.post_id==pid).all()
        for m in media:
            prev = m.status
            m.status = "rejected"; m.rejected_reason = reason
            try:
                # 若已是 public 路徑，嘗試移除實體檔案（冪等）
                if m.path and m.path.startswith('public/'):
                    abs_path = (Path(UPLOAD_ROOT) / m.path).resolve()
                    if str(abs_path).startswith(str(Path(UPLOAD_ROOT).resolve())) and abs_path.exists():
                        try: os.remove(abs_path)
                        except Exception: pass
            except Exception:
                pass
            write_log(s, "media", m.id, "reject", prev, m.status, reason, mid)
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


@bp.get("/media/<int:mid_>/file")
@jwt_required()
@require_role("admin", "dev_admin", "campus_admin", "cross_admin", "moderator", "campus_moder", "cross_moder")
def preview_media_file(mid_: int):
    """管理端：預覽媒體實體檔（含 pending）。
    僅供審核使用，需具備管理/審核角色。
    """
    with get_session() as s:
        m = s.get(Media, mid_)
        if not m or not m.path:
            abort(404)
        rel = m.path.lstrip('/')
        base = None
        if rel.startswith('pending/'):
            base = Path(UPLOAD_ROOT) / 'pending'
            rel2 = rel.split('pending/', 1)[-1]
        elif rel.startswith('public/'):
            base = Path(UPLOAD_ROOT) / 'public'
            rel2 = rel.split('public/', 1)[-1]
        else:
            # 不認得的路徑型別，視為 404
            abort(404)
        fpath = (base / rel2).resolve()
        try:
            ensure_within(base, fpath)
        except Exception:
            abort(404)
        if not fpath.exists():
            abort(404)
        mime, _ = mimetypes.guess_type(str(fpath))
        return send_file(str(fpath), mimetype=mime or 'application/octet-stream')
