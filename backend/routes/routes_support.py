from __future__ import annotations
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.ratelimit import rate_limit, get_client_ip
from utils.notify import send_admin_event
from utils.admin_events import log_admin_event
from utils.db import get_session
from models import User
from typing import Dict, Any

bp = Blueprint("support", __name__, url_prefix="/api/support")


def _safe_str(v: Any, max_len: int = 2000) -> str:
    try:
        s = str(v or "").strip()
        if len(s) > max_len:
            s = s[:max_len]
        return s
    except Exception:
        return ""


@bp.post("/report")
@rate_limit(calls=3, per_seconds=300, by='client')
def submit_report():
    """使用者或訪客提交狀況回報／留言給管理員。
    接收: { category?, subject?, message, email? }
    - 會投遞到管理員 Webhook（若配置）
    - 若為已登入使用者，額外寫入 moderation_logs（動作：issue_report）
    """
    data = request.get_json(silent=True) or {}
    category = _safe_str(data.get("category"), 64) or "general"
    subject = _safe_str(data.get("subject"), 140) or "使用者回報"
    message = _safe_str(data.get("message"), 4000)
    email = _safe_str(data.get("email"), 255)
    if not message:
        return jsonify({"ok": False, "msg": "請輸入訊息"}), 400

    # 基礎中繼資料
    meta: Dict[str, Any] = {
        "category": category,
        "email": email or None,
        "ip": get_client_ip(),
        "ua": request.headers.get("User-Agent"),
        "client_id": request.headers.get("X-Client-Id"),
        "path": request.headers.get("Referer") or None,
    }

    # 使用者資訊（若登入）
    user_id = None
    user_name = None
    try:
        user_id_raw = get_jwt_identity()
        if user_id_raw is not None:
            user_id = int(user_id_raw)
            with get_session() as s:
                u = s.get(User, user_id)
                if u:
                    user_name = u.username
    except Exception:
        pass

    # 1) Webhook 通知（Morandi embed）
    title = f"{subject}"
    desc = message
    try:
        fields = []
        if category:
            fields.append({"name": "Category", "value": category, "inline": True})
        if email:
            fields.append({"name": "Email", "value": email, "inline": True})
        if meta.get("ip"):
            fields.append({"name": "IP", "value": meta["ip"], "inline": True})
        if meta.get("client_id"):
            fields.append({"name": "Client", "value": meta["client_id"], "inline": True})
        send_admin_event(
            kind="issue_report",
            title=title,
            description=desc,
            actor=user_name,
            source="/api/support/report",
            fields=fields,
        )
    except Exception:
        pass

    # 2) 寫入審核日誌（僅登入者；避免 moderator_id 為空）
    if user_id is not None:
        try:
            with get_session() as s:
                log_admin_event(
                    event_type="issue_report",
                    title=title,
                    description=f"{message}"
                               + (f"\n\n[category]={category}" if category else "")
                               + (f"\n[email]={email}" if email else ""),
                    actor_id=user_id,
                    actor_name=user_name,
                    target_id=None,
                    target_type="support",
                    severity="medium",
                    metadata=meta,
                    session=s,
                )
        except Exception:
            pass

    return jsonify({"ok": True})


@bp.get("/recent")
@jwt_required()
def recent_reports():
    """管理員查詢最近的回報（從快取中取得）。"""
    try:
        from models import User
        with get_session() as s:
            uid = get_jwt_identity()
            u = s.get(User, int(uid)) if uid is not None else None
            if not u or u.role not in {"dev_admin", "campus_admin", "cross_admin"}:
                return jsonify({"msg": "forbidden"}), 403
    except Exception:
        return jsonify({"msg": "forbidden"}), 403

    try:
        from utils.admin_events import get_recent_events
        events = [e for e in (get_recent_events(limit=100) or []) if e.get("event_type") in {"issue_report", "support_message"}]
        return jsonify({"items": events[:50]})
    except Exception as e:
        return jsonify({"items": [], "error": str(e)})

