from __future__ import annotations
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from utils.authz import require_role
from utils.config_handler import load_config, save_config

bp = Blueprint("settings", __name__, url_prefix="/api/settings")

@bp.get("/content_rules")
def get_content_rules():
    cfg = load_config() or {}
    return jsonify({
        "enforce_min_post_chars": bool(cfg.get("enforce_min_post_chars", True)),
        "min_post_chars": int(cfg.get("min_post_chars", 15)),
    })


@bp.post("/content_rules")
@jwt_required()
@require_role("admin", "dev_admin", "campus_admin", "cross_admin")
def set_content_rules():
    data = request.get_json(silent=True) or {}
    cfg = load_config() or {}
    if "enforce_min_post_chars" in data:
        cfg["enforce_min_post_chars"] = bool(data.get("enforce_min_post_chars"))
    if "min_post_chars" in data:
        try:
            v = int(data.get("min_post_chars") or 0)
            cfg["min_post_chars"] = max(0, v)
        except Exception:
            pass
    save_config(cfg)
    return jsonify({"ok": True, "config": cfg})


# --------- Site/Home settings ---------
@bp.get("/site")
def get_site_settings():
    """公開讀取站台設定（目前提供首頁標題）。"""
    cfg = load_config() or {}
    title = (cfg.get("home_title") or "ForumKit").strip() or "ForumKit"
    return jsonify({
        "home_title": title,
    })


@bp.put("/site")
@jwt_required()
@require_role("dev_admin")
def set_site_settings():
    """僅 dev_admin 可修改站台設定。
    目前支援：home_title（首頁標題）
    """
    data = request.get_json(silent=True) or {}
    cfg = load_config() or {}

    if "home_title" in data:
        try:
            v = str(data.get("home_title") or "").strip()
            if not v:
                return jsonify({"ok": False, "msg": "home_title 不可為空"}), 400
            if len(v) > 100:
                return jsonify({"ok": False, "msg": "home_title 長度過長 (<=100)"}), 400
            cfg["home_title"] = v
        except Exception:
            return jsonify({"ok": False, "msg": "home_title 格式無效"}), 400

    save_config(cfg)
    return jsonify({"ok": True, "config": {"home_title": cfg.get("home_title")}})
