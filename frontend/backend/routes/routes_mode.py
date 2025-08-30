from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from utils.authz import require_role
from utils.config_handler import load_config, set_mode, save_config
from utils.admin_events import log_system_event
from flask_jwt_extended import get_jwt_identity
from utils.db import get_session
from models import User

bp = Blueprint("mode", __name__, url_prefix="/api/mode")

# 讀取模式：任何人可讀
@bp.get("")
def get_mode():
    try:
        config = load_config() or {}
        return jsonify({
            "mode": str(config.get("mode", "normal") or "normal"),
            "maintenance_message": config.get("maintenance_message"),
            "maintenance_until": config.get("maintenance_until"),
            # 登入模式設定
            "login_mode": str(config.get("login_mode", "admin_only") or "admin_only"),
            # 內容規則（提供給後台設定使用）
            "enforce_min_post_chars": bool(config.get("enforce_min_post_chars", True)),
            "min_post_chars": int(config.get("min_post_chars", 15)),
            # 手機版設定
            "mobile_maintenance": bool(config.get("mobile_maintenance", False)),
            "mobile_maintenance_message": config.get("mobile_maintenance_message", "手機版目前正在優化中，建議使用桌面版瀏覽器獲得完整體驗。"),
        })
    except Exception as e:
        return jsonify({"msg": f"讀取模式失敗: {str(e)}"}), 500

# 切換模式：僅限 dev_admin 權限
@bp.post("")
@require_role("dev_admin")
def set_mode_endpoint():
    data = request.get_json(silent=True) or {}
    mode = data.get("mode")
    login_mode = data.get("login_mode")
    mobile_maintenance = data.get("mobile_maintenance")
    mobile_message = data.get("mobile_maintenance_message")
    
    if mode and mode not in ("normal", "test", "maintenance", "development"):
        return jsonify({"msg": "無效的模式參數"}), 400
    
    if login_mode and login_mode not in ("single", "admin_only", "open"):
        return jsonify({"msg": "無效的登入模式參數"}), 400
    
    if mobile_maintenance is not None and not isinstance(mobile_maintenance, bool):
        return jsonify({"msg": "手機版維護模式必須為布林值"}), 400
    
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
        
        # 載入當前配置
        updated = load_config() or {}
        
        # 更新系統模式
        if mode:
            updated = set_mode(
                str(mode),
                maintenance_message=notice,
                maintenance_until=eta,
            )
        elif notice is not None or eta is not None:
            # 如果沒有更新 mode 但有更新維護訊息或時間
            if notice is not None:
                updated["maintenance_message"] = notice
            if eta is not None:
                updated["maintenance_until"] = eta
            save_config(updated)
        
        # 更新登入模式
        if login_mode:
            updated["login_mode"] = login_mode
            save_config(updated)
            
        # 更新手機版維護設定
        if mobile_maintenance is not None:
            updated["mobile_maintenance"] = mobile_maintenance
            save_config(updated)
            
        if mobile_message is not None:
            mobile_message = str(mobile_message).strip()
            updated["mobile_maintenance_message"] = mobile_message if mobile_message else "手機版目前正在優化中，建議使用桌面版瀏覽器獲得完整體驗。"
            save_config(updated)
            
        # 允許同時更新內容規則
        if "enforce_min_post_chars" in data or "min_post_chars" in data:
            try:
                if "enforce_min_post_chars" in data:
                    updated["enforce_min_post_chars"] = bool(data.get("enforce_min_post_chars"))
                if "min_post_chars" in data:
                    try:
                        updated["min_post_chars"] = max(0, int(data.get("min_post_chars") or 0))
                    except Exception:
                        pass
                save_config(updated)
            except Exception:
                pass
                
        # 通知（dev_admin 監看）：模式/登入模式/內容規則變更
        try:
            uid = get_jwt_identity()
            actor = None
            if uid is not None:
                with get_session() as s:
                    u = s.get(User, int(uid))
                    actor = u.username if u else None
            desc_parts = []
            if mode:
                desc_parts.append(f"mode={mode}")
            if login_mode:
                desc_parts.append(f"login_mode={login_mode}")
            if mobile_maintenance is not None:
                desc_parts.append(f"mobile_maintenance={mobile_maintenance}")
            if mobile_message is not None:
                desc_parts.append(f"mobile_message_updated=True")
            if "enforce_min_post_chars" in data or "min_post_chars" in data:
                desc_parts.append(f"content_rules={{enforce_min_post_chars={updated.get('enforce_min_post_chars')}, min_post_chars={updated.get('min_post_chars')}}}")
            log_system_event(
                event_type="system_mode_changed",
                title="系統模式設定變更",
                description=", ".join(desc_parts) or "設定更新",
                severity="high" if mode or login_mode else "medium",
                metadata={"actor": actor} if actor else None,
            )
        except Exception:
            pass

        return jsonify({"ok": True, "mode": updated.get("mode"), "config": updated})
    except Exception as e:
        return jsonify({"msg": f"更新模式失敗: {str(e)}"}), 500
