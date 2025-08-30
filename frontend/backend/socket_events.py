# backend/socket_events.py
from __future__ import annotations
from typing import Any, Dict
from datetime import datetime, timezone

from flask import g
from flask_socketio import SocketIO, emit, join_room, leave_room

MAX_TITLE = 120
MAX_CONTENT = 5000

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _trim(s: Any, limit: int) -> str:
    v = (str(s or "").strip())
    return v if len(v) <= limit else v[:limit] + "…"

def init_socket_events(socketio: SocketIO) -> None:
    """集中註冊所有 Socket.IO 事件。"""

    @socketio.on("connect")
    def on_connect():
        # 預設加入 global room，方便發全域公告
        join_room("global")
        emit("hello", {
            "message": "connected",
            "request_id": g.get("request_id"),
            "ts": _now_iso(),
        })

    @socketio.on("disconnect")
    def on_disconnect():
        # 這裡若要做清理 / 記錄可擴充
        pass

    @socketio.on("join_room")
    def on_join_room(data: Dict[str, Any] | None):
        room = (data or {}).get("room")
        if not room or not isinstance(room, str):
            emit("error", {"code": "WS-ROOM-001", "message": "room 無效"})
            return
        join_room(room)
        emit("room.joined", {"room": room, "ts": _now_iso()})

    @socketio.on("leave_room")
    def on_leave_room(data: Dict[str, Any] | None):
        room = (data or {}).get("room")
        if not room or not isinstance(room, str):
            emit("error", {"code": "WS-ROOM-002", "message": "room 無效"})
            return
        leave_room(room)
        emit("room.left", {"room": room, "ts": _now_iso()})

    @socketio.on("new_post")
    def on_new_post(data: Dict[str, Any] | None):
        data = data or {}
        title = _trim(data.get("title"), MAX_TITLE)
        content = _trim(data.get("content"), MAX_CONTENT)
        author = _trim(data.get("author") or "匿名", 40)

        if not title or not content:
            emit("error", {"code": "WS-POST-001", "message": "title / content 不能為空"})
            return

        payload = {
            "title": title,
            "content": content,
            "author": author,
            "ts": _now_iso(),
        }
        # 廣播到全域與 posts 群組
        socketio.emit("post.created", payload, to="global")
        socketio.emit("post.created", payload, to="posts")

    @socketio.on("new_comment")
    def on_new_comment(data: Dict[str, Any] | None):
        data = data or {}
        post_id = _trim(data.get("post_id"), 64)
        content = _trim(data.get("content"), MAX_CONTENT)
        author = _trim(data.get("author") or "匿名", 40)

        if not post_id or not content:
            emit("error", {"code": "WS-CMT-001", "message": "post_id / content 無效"})
            return

        payload = {
            "post_id": post_id,
            "content": content,
            "author": author,
            "ts": _now_iso(),
        }
        # 廣播到該貼文專屬 room 與全域
        socketio.emit("comment.created", payload, to=f"post:{post_id}")
        socketio.emit("comment.created", payload, to="global")

    @socketio.on("announce")
    def on_announce(data: Dict[str, Any] | None):
        # 簡易示範：admin 欄位為 "admin" 時才允許（正式版請用 JWT/Session）
        data = data or {}
        role = (data.get("role") or "").strip().lower()
        msg = _trim(data.get("message"), 2000)
        if role != "admin" or not msg:
            emit("error", {"code": "WS-ANN-401", "message": "未授權或內容無效"})
            return
        socketio.emit("announce", {"message": msg, "ts": _now_iso()}, to="global")

    # ============ 支援工單系統 Socket 事件 ============

    @socketio.on("support:join_ticket")
    def on_support_join_ticket(data: Dict[str, Any] | None):
        """加入工單房間以接收即時更新"""
        data = data or {}
        public_id = (data.get("public_id") or "").strip()
        
        if not public_id:
            emit("error", {"code": "WS-SUPPORT-001", "message": "public_id 無效"})
            return
        
        # 驗證用戶是否有權限存取此工單（簡化版，實際應檢查JWT或簽章）
        ticket_room = f"support:ticket:{public_id}"
        join_room(ticket_room)
        emit("support:ticket_joined", {
            "ticket_id": public_id,
            "room": ticket_room,
            "ts": _now_iso()
        })

    @socketio.on("support:leave_ticket")
    def on_support_leave_ticket(data: Dict[str, Any] | None):
        """離開工單房間"""
        data = data or {}
        public_id = (data.get("public_id") or "").strip()
        
        if not public_id:
            emit("error", {"code": "WS-SUPPORT-002", "message": "public_id 無效"})
            return
        
        ticket_room = f"support:ticket:{public_id}"
        leave_room(ticket_room)
        emit("support:ticket_left", {
            "ticket_id": public_id,
            "room": ticket_room,
            "ts": _now_iso()
        })

    @socketio.on("support:typing")
    def on_support_typing(data: Dict[str, Any] | None):
        """工單打字指示器"""
        data = data or {}
        public_id = (data.get("public_id") or "").strip()
        user_name = _trim(data.get("user_name") or "用戶", 40)
        is_typing = bool(data.get("is_typing", False))
        
        if not public_id:
            emit("error", {"code": "WS-SUPPORT-003", "message": "public_id 無效"})
            return
        
        ticket_room = f"support:ticket:{public_id}"
        # 廣播給房間內其他用戶（不包含發送者）
        emit("support:user_typing", {
            "ticket_id": public_id,
            "user_name": user_name,
            "is_typing": is_typing,
            "ts": _now_iso()
        }, room=ticket_room, include_self=False)

    def broadcast_support_event(event_type: str, ticket_public_id: str, payload: Dict[str, Any]):
        """廣播支援系統事件到相關房間"""
        ticket_room = f"support:ticket:{ticket_public_id}"
        
        # 根據事件類型決定廣播範圍
        event_data = {
            "event_type": event_type,
            "ticket_id": ticket_public_id,
            "payload": payload,
            "ts": _now_iso()
        }
        
        # 廣播到工單房間
        socketio.emit("support:event", event_data, room=ticket_room)
        
        # 特定事件也廣播到管理員房間
        if event_type in ["ticket_created", "message_sent", "status_changed"]:
            socketio.emit("support:admin_event", event_data, room="support:admins")

    def broadcast_announcement(payload: Dict[str, Any]):
        """廣播公告事件到所有在線用戶"""
        try:
            # 廣播到全域房間
            socketio.emit("announcement", payload, to="global")
            print(f"[INFO] Announcement broadcasted to global room: {payload.get('type', 'unknown')}")
        except Exception as e:
            print(f"[WARNING] Failed to broadcast announcement: {e}")
