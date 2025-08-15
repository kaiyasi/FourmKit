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
