"""
公告通知 API 路由
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.authz import require_role
from utils.db import get_session
from models import Announcement, AnnouncementRead, User, School
from services.announcement_service import AnnouncementService
from datetime import datetime
from typing import Dict, Any

bp = Blueprint("announcements", __name__, url_prefix="/api/announcements")


@bp.get("/")
@jwt_required()
def get_announcements():
    """獲取公告列表"""
    try:
        limit = min(int(request.args.get("limit", 20)), 100)
        include_read = request.args.get("include_read", "false").lower() == "true"
        
        user_id = get_jwt_identity()
        
        with get_session() as s:
            # 獲取用戶信息
            user = s.get(User, user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 404
            
            # 根據角色決定要顯示的公告範圍
            if user.role in ["dev_admin", "campus_admin", "cross_admin"]:
                # 管理員：使用專門的管理員方法
                announcements = AnnouncementService.get_admin_announcements(
                    session=s,
                    user_id=user_id,
                    user_role=user.role,
                    user_school_id=user.school_id,
                    limit=limit,
                    include_read=include_read
                )
            else:
                # 一般用戶：顯示自己學校的公告和全域公告
                announcements = AnnouncementService.get_active_announcements(
                    session=s,
                    user_id=user_id,
                    school_id=user.school_id,
                    limit=limit,
                    include_read=include_read
                )
            
            return jsonify({
                "ok": True,
                "announcements": announcements,
                "total": len(announcements)
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取公告失敗: {str(e)}"}), 500


@bp.get("/unread-count")
@jwt_required()
def get_unread_count():
    """獲取未讀公告數量"""
    try:
        user_id = get_jwt_identity()
        
        with get_session() as s:
            user = s.get(User, user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 404
            
            count = AnnouncementService.get_unread_count(
                session=s,
                user_id=user_id,
                school_id=user.school_id
            )
            
            return jsonify({
                "ok": True,
                "unread_count": count
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取未讀數量失敗: {str(e)}"}), 500


@bp.post("/<int:announcement_id>/read")
@jwt_required()
def mark_announcement_read(announcement_id: int):
    """標記公告為已讀"""
    try:
        user_id = get_jwt_identity()
        
        with get_session() as s:
            success = AnnouncementService.mark_as_read(
                session=s,
                announcement_id=announcement_id,
                user_id=user_id
            )
            
            if success:
                s.commit()
                return jsonify({
                    "ok": True,
                    "message": "已標記為已讀"
                })
            else:
                return jsonify({"ok": False, "error": "標記失敗"}), 400
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"標記已讀失敗: {str(e)}"}), 500


@bp.post("/<int:announcement_id>/read-batch")
@jwt_required()
def mark_announcements_read_batch():
    """批量標記公告為已讀"""
    try:
        data = request.get_json() or {}
        announcement_ids = data.get("announcement_ids", [])
        
        if not announcement_ids:
            return jsonify({"ok": False, "error": "請提供公告ID列表"}), 400
        
        user_id = get_jwt_identity()
        
        with get_session() as s:
            success_count = 0
            for announcement_id in announcement_ids:
                try:
                    success = AnnouncementService.mark_as_read(
                        session=s,
                        announcement_id=announcement_id,
                        user_id=user_id
                    )
                    if success:
                        success_count += 1
                except Exception:
                    continue
            
            s.commit()
            
            return jsonify({
                "ok": True,
                "success_count": success_count,
                "total_count": len(announcement_ids)
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"批量標記失敗: {str(e)}"}), 500


# 管理員專用 API
@bp.post("/")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def create_announcement():
    """創建公告（僅管理員）"""
    try:
        data = request.get_json() or {}
        title = data.get("title", "").strip()
        content = data.get("content", "").strip()
        is_pinned = data.get("is_pinned", False)
        school_id = data.get("school_id")
        start_at_str = data.get("start_at")
        end_at_str = data.get("end_at")
        
        if not title or not content:
            return jsonify({"ok": False, "error": "標題和內容不能為空"}), 400
        
        user_id = get_jwt_identity()
        
        # 解析時間
        start_at = None
        end_at = None
        if start_at_str:
            try:
                start_at = datetime.fromisoformat(start_at_str.replace('Z', '+00:00'))
            except Exception:
                return jsonify({"ok": False, "error": "開始時間格式錯誤"}), 400
        
        if end_at_str:
            try:
                end_at = datetime.fromisoformat(end_at_str.replace('Z', '+00:00'))
            except Exception:
                return jsonify({"ok": False, "error": "結束時間格式錯誤"}), 400
        
        with get_session() as s:
            # 權限檢查：根據角色限制公告範圍
            user = s.get(User, user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 404
            
            # campus_admin: 只能為自己的學校創建公告
            if user.role == "campus_admin":
                if not user.school_id:
                    return jsonify({"ok": False, "error": "校內管理員必須綁定學校"}), 403
                if school_id is None:
                    school_id = user.school_id
                elif school_id != user.school_id:
                    return jsonify({"ok": False, "error": "權限不足：只能為自己的學校發布公告"}), 403
            
            # cross_admin: 只能為全平台創建公告（school_id 必須為 None）
            elif user.role == "cross_admin":
                if school_id is not None:
                    return jsonify({"ok": False, "error": "權限不足：跨校管理員只能發布全平台公告"}), 403
                school_id = None
            
            # dev_admin: 可以選擇全平台或指定學校
            elif user.role == "dev_admin":
                # school_id 可以為 None（全平台）或指定學校 ID
                pass
            
            # 創建公告
            announcement = AnnouncementService.create_announcement(
                session=s,
                title=title,
                content=content,
                is_pinned=is_pinned,
                school_id=school_id,
                start_at=start_at,
                end_at=end_at,
                created_by=user_id
            )
            
            s.commit()
            
            # 觸發通知事件（異步執行）
            try:
                import threading
                from utils.enhanced_notify import send_enhanced_webhook
                
                def send_notification_async():
                    try:
                        # 獲取學校名稱
                        school_name = None
                        if school_id:
                            school = s.get(School, school_id)
                            if school:
                                school_name = school.name
                        
                        # 發送增強版 webhook
                        webhook_result = send_enhanced_webhook(
                            webhook_type="system_event",
                            event_type="announcement.published",
                            title=f"📢 新公告發布：{title}",
                            description=f"""
🏛️ **公告標題**: {title}
📌 **置頂**: {'是' if is_pinned else '否'}
🏫 **適用範圍**: {school_name or '全平台'}
👤 **發布者**: {user.username or 'System'}

📄 **內容預覽**:
{content[:300]}{'...' if len(content) > 300 else ''}
                            """,
                            severity="high" if is_pinned else "medium",
                            actor=user.username or "System",
                            target=f"公告 #{announcement.id}",
                            announcement_id=announcement.id,
                            school_id=school_id,
                            school_name=school_name
                        )
                        print(f"[INFO] Announcement notification sent: {webhook_result}")
                    except Exception as e:
                        print(f"[WARNING] Failed to send announcement notification: {e}")
                
                # 異步執行通知
                notification_thread = threading.Thread(target=send_notification_async, daemon=True)
                notification_thread.start()
                
            except Exception as e:
                print(f"[ERROR] Failed to trigger announcement notification: {e}")
            
            return jsonify({
                "ok": True,
                "announcement": {
                    "id": announcement.id,
                    "title": announcement.title,
                    "content": announcement.content,
                    "is_pinned": announcement.is_pinned,
                    "school_id": announcement.school_id,
                    "created_at": announcement.created_at.isoformat() if announcement.created_at else None
                }
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"創建公告失敗: {str(e)}"}), 500


@bp.put("/<int:announcement_id>")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def update_announcement(announcement_id: int):
    """更新公告（僅管理員）"""
    try:
        data = request.get_json() or {}
        title = data.get("title")
        content = data.get("content")
        is_active = data.get("is_active")
        is_pinned = data.get("is_pinned")
        start_at_str = data.get("start_at")
        end_at_str = data.get("end_at")
        
        user_id = get_jwt_identity()
        
        # 解析時間
        start_at = None
        end_at = None
        if start_at_str:
            try:
                start_at = datetime.fromisoformat(start_at_str.replace('Z', '+00:00'))
            except Exception:
                return jsonify({"ok": False, "error": "開始時間格式錯誤"}), 400
        
        if end_at_str:
            try:
                end_at = datetime.fromisoformat(end_at_str.replace('Z', '+00:00'))
            except Exception:
                return jsonify({"ok": False, "error": "結束時間格式錯誤"}), 400
        
        with get_session() as s:
            # 權限檢查
            user = s.get(User, user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 404
            
            announcement = s.get(Announcement, announcement_id)
            if not announcement:
                return jsonify({"ok": False, "error": "公告不存在"}), 404
            
            # 權限檢查：根據角色限制編輯範圍
            # campus_admin: 只能編輯自己學校的公告
            if user.role == "campus_admin":
                if not user.school_id:
                    return jsonify({"ok": False, "error": "校內管理員必須綁定學校"}), 403
                if announcement.school_id != user.school_id:
                    return jsonify({"ok": False, "error": "權限不足：只能編輯自己學校的公告"}), 403
            
            # cross_admin: 只能編輯全平台公告（school_id 為 None）
            elif user.role == "cross_admin":
                if announcement.school_id is not None:
                    return jsonify({"ok": False, "error": "權限不足：跨校管理員只能編輯全平台公告"}), 403
            
            # dev_admin: 可以編輯任何公告
            elif user.role == "dev_admin":
                pass
            
            # 更新公告
            updated_announcement = AnnouncementService.update_announcement(
                session=s,
                announcement_id=announcement_id,
                title=title,
                content=content,
                is_active=is_active,
                is_pinned=is_pinned,
                start_at=start_at,
                end_at=end_at
            )
            
            if not updated_announcement:
                return jsonify({"ok": False, "error": "更新失敗"}), 400
            
            s.commit()
            
            return jsonify({
                "ok": True,
                "announcement": {
                    "id": updated_announcement.id,
                    "title": updated_announcement.title,
                    "content": updated_announcement.content,
                    "is_pinned": updated_announcement.is_pinned,
                    "school_id": updated_announcement.school_id,
                    "is_active": updated_announcement.is_active,
                    "updated_at": updated_announcement.updated_at.isoformat() if updated_announcement.updated_at else None
                }
            })
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"更新公告失敗: {str(e)}"}), 500


@bp.delete("/<int:announcement_id>")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def delete_announcement(announcement_id: int):
    """刪除公告（僅管理員）"""
    try:
        user_id = get_jwt_identity()
        
        with get_session() as s:
            # 權限檢查
            user = s.get(User, user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 404
            
            announcement = s.get(Announcement, announcement_id)
            if not announcement:
                return jsonify({"ok": False, "error": "公告不存在"}), 404
            
            # 權限檢查：根據角色限制刪除範圍
            # campus_admin: 只能刪除自己學校的公告
            if user.role == "campus_admin":
                if not user.school_id:
                    return jsonify({"ok": False, "error": "校內管理員必須綁定學校"}), 403
                if announcement.school_id != user.school_id:
                    return jsonify({"ok": False, "error": "權限不足：只能刪除自己學校的公告"}), 403
            
            # cross_admin: 只能刪除全平台公告（school_id 為 None）
            elif user.role == "cross_admin":
                if announcement.school_id is not None:
                    return jsonify({"ok": False, "error": "權限不足：跨校管理員只能刪除全平台公告"}), 403
            
            # dev_admin: 可以刪除任何公告
            elif user.role == "dev_admin":
                pass
            
            success = AnnouncementService.delete_announcement(s, announcement_id)
            
            if success:
                s.commit()
                return jsonify({
                    "ok": True,
                    "message": "公告已刪除"
                })
            else:
                return jsonify({"ok": False, "error": "刪除失敗"}), 400
    
    except Exception as e:
        return jsonify({"ok": False, "error": f"刪除公告失敗: {str(e)}"}), 500
