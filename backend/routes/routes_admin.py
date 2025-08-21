from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from utils.authz import require_role

bp = Blueprint("admin", __name__, url_prefix="/api/admin")

@bp.get("/ping")
@jwt_required() 
@require_role("admin", "moderator", "dev_admin", "campus_admin", "cross_admin", "campus_moder", "cross_moder")
def admin_ping():
    return jsonify({"ok": True, "message": "Admin API is working"})
