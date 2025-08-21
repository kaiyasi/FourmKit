from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from utils.auth import role_required
from models import UserRole
from utils.config_handler import load_config, set_mode

bp = Blueprint("mode", __name__, url_prefix="/api/mode")

# 讀取模式：任何人可讀
@bp.get("")
def get_mode():
    try:
        config = load_config() or {}
        return jsonify({
            "mode": str(config.get("mode", "normal") or "normal"),
            "maintenance_message": config.get("maintenance_message"),
            "maintenance_until": config.get("maintenance_until")
        })
    except Exception as e:
        return jsonify({"msg": f"讀取模式失敗: {str(e)}"}), 500

# 切換模式：需要管理員權限
@bp.post("")
@role_required([UserRole.dev_admin, UserRole.campus_admin, UserRole.cross_admin])
def set_mode_endpoint():
    data = request.get_json(silent=True) or {}
    mode = data.get("mode")
    
    if mode not in ("normal", "test", "maintenance", "development"):
        return jsonify({"msg": "無效的模式參數"}), 400
    
    try:
        # 處理維護訊息和時間，空白字串視為未設定
        notice = data.get("notice")
        eta = data.get("eta")
        
        # 空白字串或只有空格的字串視為 None
        if notice is not None:
            notice = str(notice).strip()
            if not notice:
                notice = None
                
        if eta is not None:
            eta = str(eta).strip()
            if not eta:
                eta = None
        
        updated = set_mode(
            str(mode),
            maintenance_message=notice,
            maintenance_until=eta,
        )
        return jsonify({"ok": True, "mode": updated.get("mode"), "config": updated})
    except Exception as e:
        return jsonify({"msg": f"更新模式失敗: {str(e)}"}), 500
