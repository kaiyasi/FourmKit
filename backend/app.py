# backend/app.py
from __future__ import annotations
import os, uuid, json, ssl, re
from datetime import datetime, timezone
from typing import Any, Tuple, cast
from urllib import request as urlrequest
from urllib.error import URLError, HTTPError

import eventlet  # type: ignore

eventlet.monkey_patch()  # type: ignore

from flask import Flask, Response, g, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit  # type: ignore[import]

from utils.config_handler import load_config, set_mode

APP_BUILD_VERSION = os.getenv("APP_BUILD_VERSION", "forumkit-d4")

# SocketIO will be initialized inside create_app()
socketio = None

# -------- Discord Webhook 發送工具（加強版） --------
def _hex_to_int(color_hex: str) -> int:
    try:
        h = color_hex.strip().lstrip('#')
        return int(h[:6], 16)
    except Exception:
        return 0x2B3137

def _post_discord(webhook_url: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not webhook_url:
        return {"ok": False, "status": 0, "error": "missing webhook url"}
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urlrequest.Request(
            webhook_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                # 一些 WAF 對 UA 很敏感，帶一個正常的 UA 較不易被擋
                "User-Agent": "ForumKit/1.0 (+https://example.invalid)"
            },
            method="POST",
        )
        # 使用系統 CA（Dockerfile 已安裝 ca-certificates）
        ctx = ssl.create_default_context()
        with urlrequest.urlopen(req, timeout=10, context=ctx) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return {"ok": 200 <= resp.status < 300, "status": resp.status, "body": body}
    except HTTPError as he:  # noqa: PERF203
        detail = ""
        try:
            detail = he.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        return {"ok": False, "status": he.code, "error": f"HTTPError {he.code}: {he.reason}", "detail": detail}
    except URLError as ue:
        return {"ok": False, "status": 0, "error": f"URLError {ue.reason}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "status": 0, "error": str(e)}

# -------- 讀取 changelog 產出 /api/progress（原有邏輯保留） --------
def _parse_changelog() -> dict[str, Any]:
    # 嘗試多個路徑（優先順序：app目錄 > 根目錄 > 相對路徑）
    paths = ["/app/CHANGELOG.txt", "/CHANGELOG.txt", "CHANGELOG.txt"]
    path = None
    for p in paths:
        if os.path.exists(p):
            try:
                # 測試檔案是否可讀
                with open(p, "r", encoding="utf-8"):
                    pass
            path = p
            break
            except PermissionError:
                continue
    
    if not path:
        # 檔案不存在或無法存取時，回傳預設資料而非錯誤
        return {
            "progress_items": [
                {"name": "前端基礎架構", "status": "completed", "description": "React + TypeScript + Tailwind CSS + Vite"},
                {"name": "響應式主題系統", "status": "completed", "description": "5種預設主題 + 深淺模式自動切換"},
                {"name": "後端 API 框架", "status": "completed", "description": "Flask + Socket.IO + 事件驅動架構"},
                {"name": "容器化部署", "status": "completed", "description": "Docker Compose + Nginx 反向代理 + 健康檢查"},
                {"name": "Discord 整合", "status": "completed", "description": "Webhook 通知 + 主題建議 + 問題回報"},
                {"name": "安全性強化", "status": "completed", "description": "CORS限制 + CSP設定 + 輸入驗證 + 速率限制"},
                {"name": "Socket.IO 即時通訊", "status": "completed", "description": "WebSocket 連線 + 事件廣播 + 斷線重連"},
                {"name": "開發者工具", "status": "completed", "description": "顏色搭配器 + 進度追蹤 + 模式切換面板"},
                {"name": "用戶認證系統", "status": "in_progress", "description": "JWT + 角色權限 + Session 管理"},
                {"name": "討論區功能", "status": "planned", "description": "匿名發文 + 即時回覆 + 投票系統"},
                {"name": "內容管理", "status": "planned", "description": "文章審核 + 垃圾訊息過濾 + 備份機制"},
                {"name": "管理後台", "status": "planned", "description": "用戶管理 + 統計分析 + 系統監控"},
            ],
            "recent_updates": [
                "2025-08-14-完成全面安全性檢查與強化",
                "2025-08-14-實施 CORS 來源限制與環境變數控制",
                "2025-08-14-加入 CSP、速率限制與安全標頭",
                "2025-08-14-優化 Docker 容器安全性（最小權限原則）",
                "2025-08-14-修復 Socket.IO 連線問題（改用 npm 套件)"
            ][:5],
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "source": "fallback_data"
        }
    
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        progress_items: list[dict[str, Any]] = []
        recent_updates: list[str] = []
        lines, section = content.splitlines(), None
        for line in lines:
            t = line.strip()
            if t == "#開發進度":
                section = "progress"; continue
            if t == "#開發紀錄":
                section = "records"; continue
            if section == "progress" and t and not t.startswith("#"):
                if "-" in t:
                    parts = t.split("-", 2)
                    if len(parts) >= 2:
                        status_map = {"完成": "completed", "開發中": "in_progress", "計畫": "planned"}
                        status = status_map.get(parts[0].strip(), "planned")
                        name = parts[1].strip()
                        desc = parts[2].strip() if len(parts) > 2 else ""
                        progress_items.append({"name": name, "status": status, "description": desc})
            if section == "records" and t.startswith("-") and len(t) > 1:
                recent_updates.append(t[1:].strip())
        if not progress_items:
            progress_items = [
                {"name": "前端介面", "status": "completed", "description": "React + TypeScript + Tailwind"},
                {"name": "主題系統", "status": "completed", "description": "5 種預設主題 + 動態切換"},
                {"name": "後端 API", "status": "completed", "description": "Flask + Discord Webhook"},
            ]
        if not recent_updates:
            recent_updates = ["2025-08-13-完成開發模式介面設計", "2025-08-13-優化主題切換體驗"]
        return {"progress_items": progress_items, "recent_updates": recent_updates[:5], "last_updated": datetime.now(timezone.utc).isoformat(), "source": "changelog_file"}
    except Exception as e:  # noqa: BLE001
        # 解析失敗時也回傳預設資料，避免前端錯誤
        return {
            "progress_items": [
                {"name": "前端基礎架構", "status": "completed", "description": "React + TypeScript + Tailwind CSS + Vite"},
                {"name": "響應式主題系統", "status": "completed", "description": "5種預設主題 + 深淺模式自動切換"},
                {"name": "後端 API 框架", "status": "completed", "description": "Flask + Socket.IO + 事件驅動架構"},
                {"name": "安全性強化", "status": "completed", "description": "CORS限制 + CSP設定 + 輸入驗證 + 速率限制"},
                {"name": "用戶認證系統", "status": "in_progress", "description": "JWT + 角色權限 + Session 管理"},
                {"name": "討論區功能", "status": "planned", "description": "匿名發文 + 即時回覆 + 投票系統"},
            ],
            "recent_updates": [
                "2025-08-14-完成全面安全性檢查與強化",
                "2025-08-14-修復檔案權限問題",
                "2025-08-14-優化 Docker 容器安全性"
            ],
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "source": "fallback_data",
            "error": f"解析 CHANGELOG.txt 失敗: {str(e)}"
        }

# -------- Flask 應用 --------
def create_app() -> Flask:
    app = Flask(__name__)
    # 強制設定強密鑰，生產環境不使用預設值
    secret_key = os.getenv("SECRET_KEY")
    if not secret_key or secret_key == "dev":
        if os.getenv("FLASK_ENV") == "production":
            raise ValueError("生產環境必須設定 SECRET_KEY 環境變數")
        secret_key = "dev-only-key-not-for-production"
    app.config["SECRET_KEY"] = secret_key
    
    # 限制 CORS 來源，不允許 "*"
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",") if os.getenv("ALLOWED_ORIGINS") else ["http://localhost:3000"]
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    global socketio
    # Socket.IO 也要限制來源
    socketio_origins = os.getenv("SOCKETIO_ORIGINS", "").split(",") if os.getenv("SOCKETIO_ORIGINS") else allowed_origins
    socketio = SocketIO(
        app,
        cors_allowed_origins=socketio_origins,
        async_mode="eventlet",
        logger=False,
        engineio_logger=False,
        ping_interval=25,
        ping_timeout=60,
    )

    def _ctx() -> Any:
        # 確保每個請求都有 request_id 和 request_ts
        g.request_id = str(uuid.uuid4())
        g.request_ts = datetime.now(timezone.utc).isoformat()
        
        cfg = load_config() or {}
        # 維護模式下仍允許存取所有 API 和管理頁面
        is_maintenance = cfg.get("mode") == "maintenance"
        is_api_or_mode = request.path.startswith("/api/") or request.path == "/mode"
        if is_maintenance and not is_api_or_mode:
            return jsonify({
                "success": False,
                "error": {
                    "code": "FK-MAINT-001",
                    "message": cfg.get("maintenance_message") or "系統維護中",
                    "hint": cfg.get("maintenance_until"),
                    "details": None
                },
                "trace": {"request_id": g.request_id, "ts": g.request_ts},
                "mode": cfg,
            }), 503
        return None
    app.before_request(_ctx)

    def _headers(resp: Response) -> Response:
        resp.headers["X-Request-ID"] = g.request_id
        resp.headers["X-ForumKit-App"] = "backend"
        resp.headers["X-ForumKit-Build"] = APP_BUILD_VERSION
        return resp
    app.after_request(_headers)

    # SocketIO event handlers will be registered after app creation

    # ---- REST ----
    @app.route("/api/healthz")
    def healthz() -> Response:  # noqa: F401
        # Flask route handler; function is used by Flask via decorator.
        # g.request_id and g.request_ts are already set in before_request
        return jsonify({"ok": True, "ts": g.request_ts, "request_id": g.request_id})

    @app.route("/api/mode", methods=["GET"])
    def get_mode() -> Response:  # noqa: F401
        try:
            return jsonify(load_config() or {})
        except Exception as e:  # noqa: BLE001
            return error("FK-MODE-READ", 500, "讀取模式失敗", hint=f"{e.__class__.__name__}: {e}")[0]

    @app.route("/api/mode", methods=["POST"])
    def update_mode() -> Response:
        data_raw: Any = request.get_json(force=True, silent=True) or {}
        data = cast(dict[str, Any], data_raw if isinstance(data_raw, dict) else {})
        mode = data.get("mode")
        if mode not in {"normal", "maintenance", "development"}:
            return error("FK-MODE-001", 400, "mode 參數無效", hint="需為 normal / maintenance / development")[0]
        try:
            updated = set_mode(
                str(mode),
                maintenance_message=str(data.get("maintenance_message")) if data.get("maintenance_message") is not None else None,
                maintenance_until=str(data.get("maintenance_until")) if data.get("maintenance_until") is not None else None,
            )
            return jsonify(updated)
        except Exception as e:  # noqa: BLE001
            return error("FK-MODE-WRITE", 500, "更新模式失敗", hint=str(e))[0]

    @app.route("/api/color_vote", methods=["POST"])
    def color_vote() -> Response:
        """顏色搭配器 API：支援簡單票選與完整主題提案；若 Discord 失敗，回 local_only。"""
        try:
            payload_raw: Any = request.get_json(force=True, silent=True) or {}
            payload = cast(dict[str, Any], payload_raw if isinstance(payload_raw, dict) else {})

            # v1：簡單票選
            if "choice" in payload:
                choice = str(payload.get("choice") or "").strip()
                if not choice:
                    return error("FK-COLOR-001", 400, "顏色選擇不能為空")[0]
                theme_url = os.getenv("DISCORD_THEME_WEBHOOK", "")
                if not theme_url:
                    return jsonify({"ok": True, "type": "simple_choice", "delivery": "local_only", "status": "no_webhook"})
                res = _post_discord(theme_url, {"content": f"[顏色投票] 選擇：{choice} | ts={g.get('request_ts')}"})
                return jsonify({"ok": True, "type": "simple_choice", "delivery": "discord" if res.get("ok") else "local_only", "status": res.get("status")})

            # v2：完整主題提案 - 加強輸入驗證
            theme_name = str(payload.get("name") or "").strip()
            description = str(payload.get("description") or "").strip()
            colors_raw: Any = payload.get("colors") or {}
            colors: dict[str, str] = cast(dict[str, str], colors_raw if isinstance(colors_raw, dict) else {})
            
            # 輸入長度限制
            if not theme_name:
                return error("FK-COLOR-002", 400, "主題名稱不能為空")[0]
            if len(theme_name) > 50:
                return error("FK-COLOR-004", 400, "主題名稱過長（最多50字元）")[0]
            if len(description) > 500:
                return error("FK-COLOR-005", 400, "描述過長（最多500字元）")[0]
            if not colors:
                return error("FK-COLOR-003", 400, "顏色配置不能為空")[0]
            
            # 驗證顏色格式
            hex_pattern = re.compile(r'^#[0-9A-Fa-f]{6}$')
            for color_key, color_value in colors.items():
                if not isinstance(color_value, str) or not hex_pattern.match(color_value):
                    return error("FK-COLOR-006", 400, f"顏色格式無效：{color_key}")[0]

            # Example usage of _hex_to_int for primary color
            primary_color_hex = colors.get("primary", "#3B82F6")
            primary_color_int = _hex_to_int(primary_color_hex)

            webhook_url = os.getenv("DISCORD_THEME_WEBHOOK", "")
            embed: dict[str, Any] = {
                "title": f"主題提案：{theme_name}",
                "description": description,
                "color": primary_color_int,
                "fields": [
                    {"name": "主色", "value": colors.get("primary", ""), "inline": True},
                    {"name": "輔助色", "value": colors.get("secondary", ""), "inline": True},
                ],
                "footer": {"text": f"提案時間: {g.get('request_ts')}"},
            }
            res = _post_discord(webhook_url, {"content": None, "embeds": [embed]})

            if not res.get("ok"):
                fallback = {
                    "content": f"【主題建議】{theme_name}\n主色: {colors.get('primary')}, 輔助: {colors.get('secondary')} | {g.get('request_ts')}"
                }
                res2 = _post_discord(webhook_url, fallback)
                return jsonify({"ok": True, "type": "theme_proposal", "delivery": "discord" if res2.get("ok") else "local_only", "status": res2.get("status")})

            return jsonify({"ok": True, "type": "theme_proposal", "delivery": "discord", "status": res.get("status")})
        except Exception as e:  # noqa: BLE001
            return error("FK-COLOR-EX", 500, "顏色投票處理失敗", hint=str(e))[0]

    @app.route("/api/report", methods=["POST"])
    def report_issue() -> Response:
        """問題回報：送 Discord；若 webhook 未設置則回 local_only。"""
        try:
            payload_raw: Any = request.get_json(force=True, silent=True) or {}
            payload = cast(dict[str, Any], payload_raw if isinstance(payload_raw, dict) else {})

            message = str(payload.get("message") or "").strip()
            contact = str(payload.get("contact") or payload.get("email") or "").strip()
            category = str(payload.get("category") or "一般回報").strip()

            if len(message) < 5:
                return error("FK-REPORT-001", 400, "回報內容太短，請補充細節", hint="message >= 5 chars")[0]

            try:
                load_config()
            except Exception:
                pass

            ip = request.headers.get("X-Forwarded-For") or request.remote_addr

            webhook_url = os.getenv("DISCORD_REPORT_WEBHOOK", "")
            if not webhook_url:
                return jsonify({"ok": True, "delivery": "local_only", "status": "no_webhook"})

            embed: dict[str, Any] = {
                "title": f"問題回報：{category}",
                "description": message,
                "color": 0x3B82F6,
                "author": {"name": contact or "匿名"},
                "footer": {"text": f"IP: {ip}"},
            }
            res = _post_discord(webhook_url, {"content": None, "embeds": [embed]})

            if not res.get("ok"):
                res2 = _post_discord(webhook_url, {"content": f"【回報】{category}\n{message}\n聯絡: {contact or '(未填)'} | {g.get('request_ts')}"})
                return jsonify({"ok": True, "delivery": "discord" if res2.get("ok") else "local_only", "status": res2.get("status")})
            return jsonify({"ok": True, "delivery": "discord", "status": res.get("status")})
        except Exception as e:  # noqa: BLE001
            return error("FK-REPORT-EX", 500, "回報寄送失敗", hint=str(e))[0]

    @app.route("/api/progress", methods=["GET"])
    def get_progress() -> Response:
        data = _parse_changelog()
        if "error" in data:
            return jsonify({"progress_items": [], "recent_updates": [], "last_updated": datetime.now(timezone.utc).isoformat(), "error": data["error"]})
        return jsonify(data)

    @app.errorhandler(Exception)
    def _err(e: Exception):
        if os.getenv("FORUMKIT_DEBUG") == "1":
            return error("FK-SYS-000", 500, f"系統忙碌: {e.__class__.__name__}: {e}")
        return error("FK-SYS-000", 500, "系統忙碌，請稍後再試")

    try:
        routes_after = sorted(str(r) for r in app.url_map.iter_rules())  # type: ignore[attr-defined]
        print(f"[ForumKit][routes] {routes_after}")
    except Exception as ie:  # noqa: BLE001
        print(f"[ForumKit][routes] FAIL: {ie}")

    socketio.init_app(app)
    register_socketio_events(socketio)
    return app

def error(code: str, http: int, message: str, hint: str | None = None) -> Tuple[Response, int]:
    return jsonify({
        "success": False,
        "error": {"code": code, "message": message, "hint": hint, "details": None},
        "trace": {"request_id": g.get("request_id"), "ts": g.get("request_ts")}
    }), http

def register_socketio_events(socketio: SocketIO):
    @socketio.on("connect")
    def on_connect():
        # Flask's 'g' is not available in SocketIO event context, so generate request_id and ts manually
        request_id = str(uuid.uuid4())
        request_ts = datetime.now(timezone.utc).isoformat()
        emit("hello", {"message": "connected", "request_id": request_id, "ts": request_ts})

    @socketio.on("ping")
    def on_ping(data: Any):  # noqa: F401
        emit("pong", {"echo": data, "ts": datetime.now(timezone.utc).isoformat()})

app = create_app()

if __name__ == "__main__":
    if socketio is not None:
        socketio.run(app, host="0.0.0.0", port=8000)
    else:
        raise RuntimeError("SocketIO is not initialized. Please check create_app().")
