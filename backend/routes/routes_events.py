"""
事件與通知API路由
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.authz import require_role
from utils.db import get_session
from models import SystemEvent, User
from services.event_service import EventService

bp = Blueprint("events", __name__, url_prefix="/api/events")


@bp.get("/")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_events():
    """獲取事件列表"""
    try:
        # 獲取查詢參數
        limit = min(int(request.args.get("limit", 50)), 200)
        offset = int(request.args.get("offset", 0))
        category = request.args.get("category")
        event_type = request.args.get("event_type")
        severity = request.args.get("severity")
        actor_id = request.args.get("actor_id", type=int)
        school_id = request.args.get("school_id", type=int)
        unread_only = request.args.get("unread_only", "false").lower() == "true"
        important_only = request.args.get("important_only", "false").lower() == "true"
        
        # 權限檢查 - 校內管理員只能看到自己學校的事件
        current_user_id = get_jwt_identity()
        with get_session() as s:
            current_user = s.get(User, current_user_id)
            if not current_user:
                return jsonify({"error": "用戶不存在"}), 404
            
            # 校內管理員權限限制
            if current_user.role in ["campus_admin", "campus_moderator"] and current_user.school_id:
                if school_id is None:
                    school_id = current_user.school_id
                elif school_id != current_user.school_id:
                    return jsonify({"error": "權限不足"}), 403
            
            # 獲取事件列表
            events = EventService.get_events(
                session=s,
                limit=limit,
                offset=offset,
                category=category,
                event_type=event_type,
                severity=severity,
                actor_id=actor_id,
                school_id=school_id,
                unread_only=unread_only,
                important_only=important_only
            )
            
            # 轉換為字典格式
            events_data = []
            for event in events:
                event_dict = event.to_dict()
                # 非dev_admin用戶隱藏敏感信息
                if current_user.role != "dev_admin":
                    event_dict["client_ip"] = None
                    event_dict["user_agent"] = None
                    if event_dict.get("metadata"):
                        # 移除敏感的metadata
                        sensitive_keys = ["ip", "user_agent", "password", "token"]
                        for key in sensitive_keys:
                            event_dict["metadata"].pop(key, None)
                
                events_data.append(event_dict)
            
            return jsonify({
                "ok": True,
                "events": events_data,
                "pagination": {
                    "limit": limit,
                    "offset": offset,
                    "total": len(events_data)
                }
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取事件失敗: {str(e)}"}), 500


@bp.post("/mark-read")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def mark_events_read():
    """標記事件為已讀"""
    try:
        data = request.get_json() or {}
        event_ids = data.get("event_ids", [])
        
        if not event_ids or not isinstance(event_ids, list):
            return jsonify({"ok": False, "error": "無效的事件ID列表"}), 400
        
        user_id = get_jwt_identity()
        
        with get_session() as s:
            # 權限檢查
            current_user = s.get(User, user_id)
            if not current_user:
                return jsonify({"error": "用戶不存在"}), 404
            
            # 校內管理員只能標記自己學校的事件
            if current_user.role in ["campus_admin", "campus_moderator"] and current_user.school_id:
                # 驗證事件是否屬於用戶的學校
                events = s.query(SystemEvent).filter(
                    SystemEvent.id.in_(event_ids),
                    SystemEvent.school_id == current_user.school_id
                ).all()
                
                if len(events) != len(event_ids):
                    return jsonify({"ok": False, "error": "權限不足或事件不存在"}), 403
                
                valid_event_ids = [e.id for e in events]
            else:
                valid_event_ids = event_ids
            
            # 標記為已讀
            updated_count = EventService.mark_as_read(s, valid_event_ids, user_id)
            s.commit()
            
            return jsonify({
                "ok": True,
                "updated_count": updated_count
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"標記已讀失敗: {str(e)}"}), 500


@bp.get("/statistics")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_event_statistics():
    """獲取事件統計"""
    try:
        days = min(int(request.args.get("days", 7)), 30)  # 最多30天
        school_id = request.args.get("school_id", type=int)
        
        user_id = get_jwt_identity()
        
        with get_session() as s:
            current_user = s.get(User, user_id)
            if not current_user:
                return jsonify({"error": "用戶不存在"}), 404
            
            # 權限檢查
            if current_user.role in ["campus_admin", "campus_moderator"] and current_user.school_id:
                if school_id is None:
                    school_id = current_user.school_id
                elif school_id != current_user.school_id:
                    return jsonify({"error": "權限不足"}), 403
            
            # 獲取統計數據
            stats = EventService.get_event_statistics(
                session=s,
                days=days,
                school_id=school_id
            )
            
            return jsonify({
                "ok": True,
                "statistics": stats,
                "period_days": days
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取統計失敗: {str(e)}"}), 500


@bp.get("/categories")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_event_categories():
    """獲取事件分類列表"""
    try:
        # 從EventService獲取所有事件類型
        categories = {}
        for event_type, info in EventService.EVENT_TYPES.items():
            category = info["category"]
            if category not in categories:
                categories[category] = {
                    "name": category,
                    "display_name": _get_category_display_name(category),
                    "event_types": []
                }
            
            categories[category]["event_types"].append({
                "type": event_type,
                "title": info["title"]
            })
        
        return jsonify({
            "ok": True,
            "categories": list(categories.values())
        })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取分類失敗: {str(e)}"}), 500


def _get_category_display_name(category: str) -> str:
    """獲取分類顯示名稱"""
    names = {
        "content": "內容管理",
        "user": "用戶管理", 
        "school": "學校管理",
        "system": "系統管理",
        "security": "安全事件",
        # 支援功能已移除
        "moderation": "審核管理"
    }
    return names.get(category, category.title())


# 通知中心專用API
@bp.get("/notifications")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_notifications():
    """獲取通知中心數據"""
    try:
        user_id = get_jwt_identity()
        
        with get_session() as s:
            current_user = s.get(User, user_id)
            if not current_user:
                return jsonify({"error": "用戶不存在"}), 404
            
            # 根據用戶角色設置學校過濾
            school_id = None
            if current_user.role in ["campus_admin", "campus_moderator"] and current_user.school_id:
                school_id = current_user.school_id
            
            # 獲取最近的重要事件（未讀）
            important_events = EventService.get_events(
                session=s,
                limit=10,
                school_id=school_id,
                important_only=True,
                unread_only=True,
                current_user_id=current_user.id,
                current_user_role=current_user.role
            )
            
            # 獲取最近的一般事件（未讀）
            recent_events = EventService.get_events(
                session=s,
                limit=20,
                school_id=school_id,
                unread_only=True,
                current_user_id=current_user.id,
                current_user_role=current_user.role
            )
            
            # 獲取統計數據
            stats = EventService.get_event_statistics(
                session=s,
                days=1,  # 今日統計
                school_id=school_id,
                current_user_id=current_user.id,
                current_user_role=current_user.role
            )
            
            # 處理敏感信息
            def clean_event(event):
                event_dict = event.to_dict()
                if current_user.role != "dev_admin":
                    event_dict["client_ip"] = None
                    event_dict["user_agent"] = None
                    if event_dict.get("metadata"):
                        sensitive_keys = ["ip", "user_agent", "password", "token"]
                        for key in sensitive_keys:
                            event_dict["metadata"].pop(key, None)
                return event_dict
            
            return jsonify({
                "ok": True,
                "notifications": {
                    "important_events": [clean_event(e) for e in important_events],
                    "recent_events": [clean_event(e) for e in recent_events],
                    "statistics": {
                        "unread_count": stats.get("unread_count", 0),
                        "important_count": stats.get("important_count", 0),
                        "today_total": stats.get("total_events", 0)
                    }
                }
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取通知失敗: {str(e)}"}), 500


