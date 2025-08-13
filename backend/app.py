# backend/app.py
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Tuple, cast
import json
from urllib import request as urlrequest
from urllib.error import URLError, HTTPError

from flask import Flask, Response, g, jsonify, request
from flask_cors import CORS

from utils.config_handler import load_config, set_mode
# 已移除郵件寄送，改用 Discord Webhook


def _hex_to_int(color_hex: str) -> int:
    try:
        h = color_hex.strip().lstrip('#')
        return int(h[:6], 16)
    except Exception:
        return 0x2B3137  # Discord embed 預設深灰


def _post_discord(webhook_url: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urlrequest.Request(webhook_url, data=data, headers={'Content-Type': 'application/json'})
        with urlrequest.urlopen(req, timeout=10) as resp:
            body = resp.read().decode('utf-8')
            return {"ok": True, "status": resp.status, "body": body}
    except HTTPError as he:  # noqa: PERF203
        return {"ok": False, "status": he.code, "error": f"HTTPError {he.code}"}
    except URLError as ue:
        return {"ok": False, "status": 0, "error": f"URLError {ue.reason}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "status": 0, "error": str(e)}


def _parse_changelog() -> dict[str, Any]:
    """解析 CHANGELOG.txt 檔案，提取開發進度資訊"""
    try:
        # 讀取 CHANGELOG.txt 檔案
        changelog_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'CHANGELOG.txt')
        print(f"[ForumKit] 嘗試讀取 CHANGELOG.txt: {changelog_path}")
        
        if not os.path.exists(changelog_path):
            print(f"[ForumKit] CHANGELOG.txt 檔案不存在: {changelog_path}")
            return {"error": "CHANGELOG.txt 檔案不存在"}
        
        with open(changelog_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        print(f"[ForumKit] 成功讀取 CHANGELOG.txt，內容長度: {len(content)}")
        
        # 解析進度項目
        progress_items: list[dict[str, str]] = []
        recent_updates: list[str] = []
        
        # 尋找進度相關的區塊
        lines = content.split('\n')
        current_section = None
        
        for line in lines:
            line = line.strip()
            
            # 檢查是否為區塊標題
            if line == '#開發進度':
                current_section = 'progress'
                continue
            elif line == '#開發紀錄':
                current_section = 'records'
                continue
            
            # 解析進度項目
            if current_section == 'progress':
                if line and not line.startswith('#'):
                    # 解析格式：進度- 項目名稱-說明
                    if '-' in line:
                        parts = line.split('-', 2)  # 最多分割2次，得到3個部分
                        if len(parts) >= 2:
                            status_part = parts[0].strip()
                            name_part = parts[1].strip()
                            description_part = parts[2].strip() if len(parts) > 2 else ""
                            
                            # 映射狀態
                            if status_part == '完成':
                                status = 'completed'
                            elif status_part == '開發中':
                                status = 'in_progress'
                            elif status_part == '計畫':
                                status = 'planned'
                            else:
                                status = 'planned'  # 預設為計畫
                            
                            progress_items.append({
                                "name": name_part,
                                "status": status,
                                "description": description_part
                            })
            
            # 解析開發紀錄
            elif current_section == 'records':
                if line.startswith('-') and len(line) > 1:
                    # 移除開頭的 "-" 並添加到最近更新
                    update = line[1:].strip()
                    if update:
                        recent_updates.append(update)
        
        # 如果沒有找到進度項目，使用預設資料
        if not progress_items:
            progress_items = [
                {"name": "前端介面", "status": "completed", "description": "React + TypeScript + Tailwind CSS"},
                {"name": "主題系統", "status": "completed", "description": "5 種預設主題 + 動態切換"},
                {"name": "後端 API", "status": "completed", "description": "Flask + Discord Webhook"},
                {"name": "Docker 部署", "status": "completed", "description": "容器化部署 + Nginx 反向代理"},
                {"name": "用戶系統", "status": "in_progress", "description": "註冊、登入、權限管理"},
                {"name": "討論功能", "status": "planned", "description": "發文、回覆、投票系統"},
                {"name": "管理後台", "status": "planned", "description": "內容管理、用戶管理"}
            ]
        
        # 如果沒有找到最近更新，使用預設資料
        if not recent_updates:
            recent_updates = [
                "2024-08-13-完成開發模式介面設計",
                "2024-08-13-實現顏色搭配器功能", 
                "2024-08-13-修復 Docker 權限問題",
                "2024-08-13-優化主題切換體驗"
            ]
        
        result = {
            "progress_items": progress_items,
            "recent_updates": recent_updates[:5],  # 只取前5個
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        
        print(f"[ForumKit] 返回開發進度資料: {result}")
        return result
        
    except Exception as e:  # noqa: BLE001
        print(f"[ForumKit] 解析 CHANGELOG.txt 時發生錯誤: {e}")
        return {"error": f"解析 CHANGELOG.txt 失敗: {str(e)}"}


APP_BUILD_VERSION = os.getenv("APP_BUILD_VERSION", "forumkit-v1")


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev")

    # 僅開放 /api/* CORS（同源更安全；目前暫時允許全部來源）
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ========== Hooks ==========
    @app.before_request
    def _ctx() -> Response | None:  # pyright: ignore[reportUnusedFunction]
        # 設置請求追蹤資訊
        g.request_id = str(uuid.uuid4())
        g.request_ts = datetime.now(timezone.utc).isoformat()

        # 維護模式攔截（保留少數端點可通行）
        if request.path.startswith("/api"):
            allow_paths = {
                "/api/healthz",  # 健康檢查
                "/api/mode",     # 允許讀/寫以便解除維護
                "/api/report",   # 允許使用者回報問題
            }
            if request.path not in allow_paths:
                cfg = load_config() or {}
                mode = cfg.get("mode", "normal")
                if mode == "maintenance":
                    resp = jsonify(
                        {
                            "success": False,
                            "error": {
                                "code": "FK-MAINT-001",
                                "message": cfg.get("maintenance_message") or "系統維護中",
                                "hint": cfg.get("maintenance_until"),
                                "details": None,
                            },
                            "trace": {
                                "request_id": getattr(g, "request_id", None),
                                "ts": getattr(g, "request_ts", None),
                            },
                            "mode": cfg,
                        }
                    )
                    resp.status_code = 503
                    return resp
        return None

    @app.after_request
    def _headers(resp: Response) -> Response:  # pyright: ignore[reportUnusedFunction]
        # 統一加上可追蹤標頭
        resp.headers["X-Request-ID"] = getattr(g, "request_id", "")
        resp.headers["X-ForumKit-App"] = "backend"
        resp.headers["X-ForumKit-Build"] = APP_BUILD_VERSION
        return resp

    # ========== Routes ==========

    @app.route("/api/healthz")
    def healthz() -> Response:  # pyright: ignore[reportUnusedFunction]
        return jsonify(
            {
                "ok": True,
                "ts": getattr(g, "request_ts", None),
                "request_id": getattr(g, "request_id", None),
                "cwd": os.getcwd(),
                "debug": bool(os.getenv("FORUMKIT_DEBUG")),
            }
        )

    @app.route("/api/mode", methods=["GET"])
    def get_mode() -> Response:  # pyright: ignore[reportUnusedFunction]
        try:
            return jsonify(load_config() or {})
        except Exception as e:  # noqa: BLE001
            resp, _ = error("FK-MODE-READ", 500, "讀取模式失敗", hint=f"{e.__class__.__name__}: {e}")
            return resp

    @app.route("/api/mode", methods=["POST"])
    def update_mode() -> Response:  # pyright: ignore[reportUnusedFunction]
        data_raw: Any = request.get_json(force=True, silent=True) or {}
        data = cast(dict[str, Any], data_raw if isinstance(data_raw, dict) else {})
        mode = data.get("mode")
        if mode not in {"normal", "maintenance", "development"}:
            resp, _ = error("FK-MODE-001", 400, "mode 參數無效", hint="需為 normal / maintenance / development")
            return resp
        try:
            updated = set_mode(
                str(mode),
                maintenance_message=str(data.get("maintenance_message"))
                if data.get("maintenance_message") is not None
                else None,
                maintenance_until=str(data.get("maintenance_until"))
                if data.get("maintenance_until") is not None
                else None,
            )
            return jsonify(updated)
        except Exception as e:  # noqa: BLE001
            resp, _ = error("FK-MODE-WRITE", 500, "更新模式失敗", hint=str(e))
            return resp

    @app.route("/api/color_vote", methods=["POST"])
    def color_vote() -> Response:  # pyright: ignore[reportUnusedFunction]
        """顏色搭配器 API：接收用戶的配色方案建議"""
        try:
            payload_raw: Any = request.get_json(force=True, silent=True) or {}
            payload = cast(dict[str, Any], payload_raw if isinstance(payload_raw, dict) else {})

            # 處理舊版格式（簡單的 choice）
            if "choice" in payload:
                choice = payload.get("choice", "").strip()
                if not choice:
                    resp, _ = error("FK-COLOR-001", 400, "顏色選擇不能為空")
                    return resp
                # 直接發送到 Discord 簡訊息
                theme_webhook = os.getenv("DISCORD_THEME_WEBHOOK", "https://discordapp.com/api/webhooks/1405235985968795718/EE0rpOgHup3z3VS3gTwVj5bg9PYjdC0wksIwvf3zYWDYrb19mi7qbn5EMa0t4wGMU6bd")
                _post_discord(theme_webhook, {"content": f"[顏色投票] 選擇：{choice} | ts={getattr(g,'request_ts','unknown')}"})
                return jsonify({"ok": True, "type": "simple_choice"})

            # 處理新版格式（完整的配色方案）
            theme_name = payload.get("name", "").strip()
            description = payload.get("description", "").strip()
            colors = payload.get("colors", {})
            
            if not theme_name:
                resp, _ = error("FK-COLOR-002", 400, "主題名稱不能為空")
                return resp
            
            if not colors:
                resp, _ = error("FK-COLOR-003", 400, "顏色配置不能為空")
                return resp

            # 發送到 Discord Webhook（主題建議）
            theme_webhook = os.getenv("DISCORD_THEME_WEBHOOK", "https://discordapp.com/api/webhooks/1405235985968795718/EE0rpOgHup3z3VS3gTwVj5bg9PYjdC0wksIwvf3zYWDYrb19mi7qbn5EMa0t4wGMU6bd")
            embed_color = _hex_to_int(str(colors.get("primary", "#2B3137")))
            embed = {
                "title": f"主題建議：{theme_name}",
                "description": (description or "(未填寫)"),
                "color": embed_color,
                "fields": [
                    {"name": "主色調(背景)", "value": str(colors.get("primary", "N/A")), "inline": True},
                    {"name": "輔助色(框線)", "value": str(colors.get("secondary", "N/A")), "inline": True},
                    {"name": "深淺色類型", "value": str(colors.get("colorType", "N/A")), "inline": True},
                    {"name": "按鈕顏色", "value": str(colors.get("buttonColor", "N/A")), "inline": True},
                    {"name": "文字顏色", "value": str(colors.get("textColor", "N/A")), "inline": True},
                ],
                "footer": {"text": f"提交時間: {getattr(g, 'request_ts', 'unknown')} | Request-ID: {getattr(g, 'request_id', 'unknown')}"},
            }
            payload = {"content": None, "embeds": [embed]}
            res = _post_discord(theme_webhook, payload)
            
            # 記錄到控制台（用於除錯）
            print(f"[ForumKit] 顏色搭配器提交: {theme_name}")
            print(f"[ForumKit] Discord 傳送狀態: {res}")
            
            return jsonify({"ok": bool(res.get("ok")), "type": "theme_proposal", "delivery": "discord", "status": res.get("status")})
            
        except Exception as e:  # noqa: BLE001
            print(f"[ForumKit] 顏色搭配器錯誤: {e}")
            return error("FK-COLOR-EX", 500, "顏色投票處理失敗", hint=str(e))[0]

    @app.route("/api/report", methods=["POST"])
    def report_issue() -> Response:  # pyright: ignore[reportUnusedFunction]
        """使用者回報 API：改送 Discord Webhook；仍接受 Discord ID 或 Email。"""
        try:
            payload_raw: Any = request.get_json(force=True, silent=True) or {}
            payload = cast(dict[str, Any], payload_raw if isinstance(payload_raw, dict) else {})

            message = (payload.get("message") or "").strip()
            contact = (payload.get("contact") or payload.get("email") or "").strip()
            category = (payload.get("category") or "一般回報").strip()

            if not message or len(message) < 5:
                resp, _ = error("FK-REPORT-001", 400, "回報內容太短，請補充細節", hint="message >= 5 chars")
                return resp

            # 診斷資訊
            cfg = {}
            try:
                cfg = load_config() or {}
            except Exception:
                pass

            ua = request.headers.get("User-Agent")
            ip = request.headers.get("X-Forwarded-For") or request.remote_addr
            rid = getattr(g, "request_id", None)
            mode = cfg.get("mode", "normal")

            # 發送到 Discord Webhook（問題回報）
            report_webhook = os.getenv("DISCORD_REPORT_WEBHOOK", "https://discordapp.com/api/webhooks/1405236356648669214/bid8Od3hs-3aEFMDhSMuv3H4BQXYjbXymhtH4mQwYrDhRu-Yq2A81LuOSzbc2flAJmfk")
            embed = {
                "title": f"問題回報：{category}",
                "description": message,
                "color": 0x3B82F6,
                "fields": [
                    {"name": "聯絡方式 (DC ID / Email)", "value": contact or "(未填)", "inline": True},
                    {"name": "模式", "value": str(mode), "inline": True},
                    {"name": "IP", "value": str(ip), "inline": True},
                    {"name": "User-Agent", "value": str(ua)[:1000]},
                    {"name": "Request-ID", "value": str(rid)},
                ],
                "footer": {"text": f"提交時間: {getattr(g, 'request_ts', 'unknown')}"},
            }
            payload = {"content": None, "embeds": [embed]}
            res = _post_discord(report_webhook, payload)
            
            # 記錄到控制台（用於除錯）
            print(f"[ForumKit] 意見回饋提交: {category}")
            print(f"[ForumKit] Discord 傳送狀態: {res}")
            
            return jsonify({"ok": bool(res.get("ok")), "delivery": "discord", "status": res.get("status")})
        except Exception as e:  # noqa: BLE001
            print(f"[ForumKit] 意見回饋錯誤: {e}")
            return error("FK-REPORT-EX", 500, "回報寄送失敗", hint=str(e))[0]

    @app.route("/api/progress", methods=["GET"])
    def get_progress() -> Response:  # pyright: ignore[reportUnusedFunction]
        """讀取並解析 CHANGELOG.md 檔案，提供開發進度資訊"""
        try:
            progress_data = _parse_changelog()
            
            # 檢查是否有錯誤
            if "error" in progress_data:
                print(f"[ForumKit] 開發進度解析錯誤: {progress_data['error']}")
                return jsonify({
                    "progress_items": [],
                    "recent_updates": [],
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                    "error": progress_data["error"]
                })
            
            # 確保返回的資料格式正確
            return jsonify({
                "progress_items": progress_data.get("progress_items", []),
                "recent_updates": progress_data.get("recent_updates", []),
                "last_updated": progress_data.get("last_updated", datetime.now(timezone.utc).isoformat())
            })
            
        except Exception as e:  # noqa: BLE001
            print(f"[ForumKit] 開發進度錯誤: {e}")
            return jsonify({
                "progress_items": [],
                "recent_updates": [],
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "error": f"開發進度資訊讀取失敗: {str(e)}"
            })

    # ========== Errors ==========

    @app.errorhandler(Exception)
    def _err(e: Exception):  # pyright: ignore[reportUnusedFunction]
        # 統一錯誤輸出；若想顯示細節，設定環境變數 FORUMKIT_DEBUG=1
        if os.getenv("FORUMKIT_DEBUG") == "1":
            return error("FK-SYS-000", 500, f"系統忙碌: {e.__class__.__name__}: {e}")
        return error("FK-SYS-000", 500, "系統忙碌，請稍後再試")

    # 啟動時列出路由（協助除錯）
    try:
        routes_after = sorted(str(r) for r in app.url_map.iter_rules())  # type: ignore[attr-defined]
        print(f"[ForumKit][routes] {routes_after}")
    except Exception as ie:  # noqa: BLE001
        print(f"[ForumKit][routes] FAIL: {ie}")

    return app


def error(code: str, http: int, message: str, hint: str | None = None) -> Tuple[Response, int]:
    return (
        jsonify(
            {
                "success": False,
                "error": {"code": code, "message": message, "hint": hint, "details": None},
                "trace": {
                    "request_id": getattr(g, "request_id", None),
                    "ts": getattr(g, "request_ts", None),
                },
            }
        ),
        http,
    )


app = create_app()
