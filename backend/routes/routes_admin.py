from flask import Blueprint, jsonify
from utils.auth import platform_role_required
from models import UserRole

bp = Blueprint("admin", __name__, url_prefix="/api/admin")

@bp.get("/campus/ping")
@platform_role_required("campus", [UserRole.dev_admin, UserRole.campus_admin, UserRole.campus_moder])
def campus_ping():
    return jsonify({"ok": True, "scope": "campus"})

@bp.get("/cross/ping")
@platform_role_required("cross", [UserRole.dev_admin, UserRole.cross_admin, UserRole.cross_moder])
def cross_ping():
    return jsonify({"ok": True, "scope": "cross"})
