from __future__ import annotations
import os, sys, uuid, json, ssl, re, time
from datetime import datetime, timezone
from typing import Any, Tuple, cast, Dict, List, Optional
from urllib import request as urlrequest
from urllib.error import URLError, HTTPError
from utils.notify import send_admin_event as notify_send_event
from utils.notify import recent_admin_events
from utils.notify import get_admin_webhook_url as _get_admin_hook

import eventlet  # type: ignore
eventlet.monkey_patch()  # type: ignore

from flask import Flask, Response, g, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room  # type: ignore[import]

from utils.config_handler import load_config
from utils.db import init_engine_session, get_db_health
from utils.ticket import new_ticket_id
from utils.redis_health import get_redis_health
from utils.single_admin import ensure_single_admin
from routes.routes_posts import bp as posts_bp
from routes.routes_auth import bp as auth_bp
from routes.routes_schools import bp as schools_bp
from routes.routes_admin import bp as admin_bp
from routes.routes_mode import bp as mode_bp
from routes.routes_settings import bp as settings_bp
from routes.routes_pages import bp as pages_bp
from routes.routes_media_v2 import bp as media_v2_bp
from routes.routes_media import bp as media_bp
from routes.routes_account import bp as account_bp
from routes.routes_moderation import bp as moderation_bp
from routes.routes_instagram import bp as instagram_bp
from routes.routes_abuse import bp as abuse_bp
from routes.routes_support import bp as support_bp
from utils.ratelimit import is_ip_blocked
from flask_jwt_extended import JWTManager

APP_BUILD_VERSION = os.getenv("APP_BUILD_VERSION", "forumkit-v1.1.0")

# 先建立未綁 app 的全域 socketio，在 create_app() 裡再 init_app
socketio = SocketIO(
    cors_allowed_origins=[],  # 實際 origins 稍後在 init_app 指定
    async_mode="eventlet",
    logger=False,
    engineio_logger=False,
    ping_interval=25,
    ping_timeout=60,
)

_events_registered = False  # 防重註冊旗標


def __brand_footer_text() -> str:
    from datetime import datetime, timezone
    return f"DEV. Serelix Studio • {datetime.now(timezone.utc).isoformat()}"

# --------- Realtime rooms state (in-memory, single-process) ---------
from collections import deque
from typing import Deque, DefaultDict, Set

# 最近訊息：每個房間保留最多 N 則，以供新加入者獲得離線期間訊息
_ROOM_MAX_BACKLOG = int(os.getenv("WS_ROOM_BACKLOG", "50"))
_room_msgs: DefaultDict[str, Deque[dict]] = DefaultDict(lambda: deque(maxlen=_ROOM_MAX_BACKLOG))  # type: ignore[var-annotated]

# 連線與房間對應，用於離線清理與在房間內廣播線上名單
_sid_rooms: DefaultDict[str, Set[str]] = DefaultDict(set)  # type: ignore[var-annotated]
_room_clients: DefaultDict[str, Set[str]] = DefaultDict(set)  # client_id 集合，非 sid  # type: ignore[var-annotated]
_sid_client: DefaultDict[str, str] = DefaultDict(str)  # sid -> client_id  # type: ignore[var-annotated]

# 房間總量限制（避免被大量建房間耗盡記憶體）
_WS_ROOMS_MAX = int(os.getenv("WS_ROOMS_MAX", "1000"))

# WebSocket 速率限制（單進程）
_ws_hits: DefaultDict[str, Deque[float]] = DefaultDict(deque)  # type: ignore[var-annotated]

def _ws_allow(key: str, calls: int, per_seconds: int) -> bool:
    now = time.time()
    dq = _ws_hits.get(key)
    if dq is None:
        dq = deque()
        _ws_hits[key] = dq
    # 清掉視窗外的
    while dq and now - dq[0] > per_seconds:
        dq.popleft()
    if len(dq) >= calls:
        return False
    dq.append(now)
    return True

_ROOM_NAME_RE = re.compile(r"^[a-z0-9:_-]{1,64}$")
def _valid_room_name(name: str) -> bool:
    return bool(_ROOM_NAME_RE.match(name))


"""Ticket utilities moved to utils.ticket to avoid circular imports."""


# -------- Discord Webhook 工具 --------
def _hex_to_int(color_hex: str) -> int:
    try:
        h = color_hex.strip().lstrip('#')
        return int(h[:6], 16)
    except Exception:
        return 0x2B3137


# -------- CHANGELOG 讀取（嚴格：無 fallback 策略切換） --------
def _try_read_file(path_attempt: str) -> tuple[str | None, dict[str, Any]]:
    """安全試讀檔案，回傳 (content 或 None, 調試資訊)"""
    info: dict[str, Any] = {
        "path": path_attempt,
        "abs": os.path.abspath(path_attempt),
        "exists": os.path.exists(path_attempt),
        "is_file": False,
        "readable": False,
        "size": None,
        "perm_octal_tail": None,
        "error": None,
    }
    if not os.path.exists(path_attempt):
        return None, info
    try:
        info["is_file"] = os.path.isfile(path_attempt)
        if not info["is_file"]:
            return None, info
        st = os.stat(path_attempt)
        info["size"] = st.st_size
        info["perm_octal_tail"] = oct(st.st_mode)[-3:]
        with open(path_attempt, "r", encoding="utf-8") as tf:
            tf.read(10)
        info["readable"] = True
        with open(path_attempt, "r", encoding="utf-8") as f:
            return f.read(), info
    except PermissionError as pe:
        info["error"] = f"PermissionError: {pe}"
    except UnicodeDecodeError as ue:
        info["error"] = f"UnicodeDecodeError: {ue}"
    except Exception as e:
        info["error"] = f"{e.__class__.__name__}: {e}"
    return None, info


def _load_changelog_content() -> tuple[str | None, dict[str, Any]]:
    """
    優先序：
    1) CHANGELOG_CONTENT（全文）
    2) CHANGELOG_URL（http/https）
    3) CHANGELOG_PATH（檔案）
    4) 內建候選路徑
    任一成功回傳 (content, debug_info)，否則 (None, debug_info)
    """
    from urllib.parse import urlparse

    debug: dict[str, Any] = {
        "current_directory": os.getcwd(),
        "script_directory": os.path.dirname(__file__),
        "python_path_head": sys.path[:3],
        "checked": [],
        "used_source": None,
    }

    # 1) 直接吃環境變數全文
    env_text = os.getenv("CHANGELOG_CONTENT")
    if env_text:
        debug["used_source"] = "env:CHANGELOG_CONTENT"
        return env_text, debug

    # 2) URL 來源
    env_url = os.getenv("CHANGELOG_URL")
    if env_url:
        try:
            u = urlparse(env_url)
            if u.scheme in {"http", "https"}:
                req = urlrequest.Request(env_url, headers={"User-Agent": "ForumKit/1.0"})
                ctx = ssl.create_default_context()
                with urlrequest.urlopen(req, timeout=8, context=ctx) as resp:
                    body = resp.read().decode("utf-8", errors="replace")
                    debug["used_source"] = f"url:{env_url}"
                    debug["checked"].append({"type": "url", "url": env_url, "status": resp.status})
                    return body, debug
            else:
                debug["checked"].append({"type": "url", "url": env_url, "error": "unsupported scheme"})
        except Exception as e:
            debug["checked"].append({"type": "url", "url": env_url, "error": f"{e.__class__.__name__}: {e}"})

    # 3) 指定檔案路徑
    env_path = os.getenv("CHANGELOG_PATH")
    if env_path:
        content, info = _try_read_file(env_path)
        debug["checked"].append(info)
        if content is not None:
            debug["used_source"] = f"file:{env_path}"
            return content, debug

    # 4) 內建候選路徑
    candidate_paths = [
        # 常見檔名
        "/app/CHANGELOG.txt",
        "CHANGELOG.txt",
        "./CHANGELOG.txt",
        "/CHANGELOG.txt",
        "../CHANGELOG.txt",
        "../backend/CHANGELOG.txt",
        "backend/CHANGELOG.txt",
        os.path.join(os.path.dirname(__file__), "CHANGELOG.txt"),
        # 專案內已存在的開發紀錄檔（擴充支援）
        "DEVELOPMENT_RECORD.md",
        "./DEVELOPMENT_RECORD.md",
        "../DEVELOPMENT_RECORD.md",
        os.path.join(os.path.dirname(__file__), "..", "DEVELOPMENT_RECORD.md"),
        # 其他說明文件（最後備援）
        "Codex.md",
        "./Codex.md",
        "Code.md",
        "./Code.md",
    ]
    for p in candidate_paths:
        content, info = _try_read_file(p)
        debug["checked"].append(info)
        if content is not None:
            debug["used_source"] = f"file:{p}"
            return content, debug

    # 列出目前目錄的 .txt（排錯）
    try:
        debug["current_txt_files"] = [f for f in os.listdir(os.getcwd()) if f.endswith(".txt")][:15]
    except Exception as e:
        debug["current_txt_files"] = [f"listdir-error: {e}"]

    return None, debug


# -------- 解析工具：日期正規化與分組 --------
def _normalize_date_token(s: str) -> tuple[str | None, tuple[int, int, int] | None]:
    """
    從字串中抓日期，回 (YYYY-MM-DD, (Y,M,D))，抓不到回 (None, None)
    支援：YYYY-MM-DD / YYYY/MM/DD / M-D / M/D / M月D日
    年份缺失則補現在年份
    """
    s = s.strip()
    m = re.search(r"(20\d{2})[./-](\d{1,2})[./-](\d{1,2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{y:04d}-{mo:02d}-{d:02d}", (y, mo, d)
    m = re.search(r"\b(\d{1,2})[./-](\d{1,2})\b", s)
    if m:
        now = datetime.now(timezone.utc)
        y, mo, d = now.year, int(m.group(1)), int(m.group(2))
        return f"{y:04d}-{mo:02d}-{d:02d}", (y, mo, d)
    m = re.search(r"(\d{1,2})\s*月\s*(\d{1,2})\s*日?", s)
    if m:
        now = datetime.now(timezone.utc)
        y, mo, d = now.year, int(m.group(1)), int(m.group(2))
        return f"{y:04d}-{mo:02d}-{d:02d}", (y, mo, d)
    return None, None


def _strip_leading_date_prefix(s: str) -> str:
    """
    移除行首的：前導空白/項目符號 + (連續)日期 + 分隔符。
    例："- 2025-08-17 2025-08-17 說明" -> "說明"
    """
    if not s:
        return s

    # 日期樣式
    DATE = r'(?:\d{4}-\d{2}-\d{2}|\d{4}/\d{1,2}/\d{1,2}|\d{1,2}/\d{1,2}|\d{1,2}月\d{1,2}日)'
    # 前導垃圾：空白/零寬/nbsp + 項目符號/破折 + 空白
    JUNK = r'[\s\u00A0\u200B\u200C\uFEFF]*[-\*•●·—–—]?[\s\u00A0\u200B\u200C\uFEFF]*'
    # 日期後可接的分隔符
    SEP  = r'[\s\u00A0\u200B\u200C\uFEFF]*[-：:·]?[\s\u00A0\u200B\u200C\uFEFF]*'

    # 1) 把「前導垃圾 + 至少一個(日期+分隔) + 後續可能的(日期+分隔)*」剝掉
    strip_pattern = re.compile(r'^' + JUNK + DATE + SEP + r'(?:' + DATE + SEP + r')*')
    s2 = re.sub(strip_pattern, '', s).strip()
    return s2


def _parse_changelog_text(content: str) -> tuple[list[dict[str, Any]], Dict[str, List[tuple[int, str]]], dict[str, Any]]:
    """
    把純文字 CHANGELOG 轉為：
      - progress_items：讀 '#開發進度'
      - groups：{ 'YYYY-MM-DD': [(line_no, text), ...], 'undated': [...] }
      - extra_debug
    """
    progress_items: list[dict[str, Any]] = []
    groups: Dict[str, List[tuple[int, str]]] = {}
    extra: dict[str, Any] = {"lines_count": len(content.splitlines())}

    lines = content.splitlines()
    section = None
    current_date_key: Optional[str] = None

    status_map = {"完成": "completed", "開發中": "in_progress", "計畫": "planned", "規劃中": "planned"}

    for idx, raw in enumerate(lines, 1):
        t = raw.strip()
        if not t:
            continue

        # 接受「#開發進度」或「# 開發進度」（允許 # 後空白）
        if re.match(r"^#+\s*開發進度$", t):
            section = "progress"
            continue
        if re.match(r"^#+\s*開發紀錄$", t):
            section = "records"
            current_date_key = None
            continue

        if section == "progress":
            if t.startswith("#"):
                continue
            if "-" in t:
                parts = t.split("-", 2)
                if len(parts) >= 2:
                    status = status_map.get(parts[0].strip(), "planned")
                    name = parts[1].strip()
                    desc = parts[2].strip() if len(parts) > 2 else ""
                    progress_items.append({"name": name, "status": status, "description": desc, "line": idx})
            continue

        if section == "records":
            # 1) 日期標題行 → 切換群組
            iso, _ord = _normalize_date_token(t)
            if (t.startswith("#") and iso) or (iso and not t.lstrip().startswith(("-", "*", "•"))):
                current_date_key = iso
                if current_date_key:
                    groups.setdefault(current_date_key, [])
                continue

            # 2) 子項（-/*/• 開頭）
            if t.startswith(("-", "*", "•")) and len(t) > 1:
                item_text = t.lstrip("-*•").strip()

                # 如果子項本身帶日期，用該日期分組，否則用目前日期，再不然 'undated'
                iso2, _ = _normalize_date_token(item_text)
                key = iso2 or current_date_key or "undated"

                # 重要：行首日期清洗，避免後續再出現「黑字日期」
                clean_text = _strip_leading_date_prefix(item_text)

                groups.setdefault(key, [])
                groups[key].append((idx, clean_text))
                continue

    extra["groups_counts"] = {k: len(v) for k, v in groups.items()}
    return progress_items, groups, extra


def _flatten_recent_items(groups: Dict[str, List[tuple[int, str]]], limit: int) -> List[str]:
    """
    將日期分組攤平成最近 N 條：
    - 依日期新到舊排序（undated 最後）
    - 同一日期內依行號由大到小（越後面越新）
    - 每條加上日期前綴，供前端判讀與顯示徽章
    """
    items: List[tuple[str, int, str]] = []  # (date_key, line_no, label)
    for date_key, entries in groups.items():
        for line_no, text in entries:
            prefix = date_key if date_key != "undated" else ""
            label = f"{prefix} {text}".strip()
            items.append((date_key, line_no, label))

    def key_fn(t: tuple[str, int, str]):
        date_key = t[0]
        # undated 排最舊
        if date_key == "undated":
            return ("0000-00-00", -t[1])
        return (date_key, -t[1])

    items.sort(key=lambda x: key_fn(x), reverse=True)
    return [t[2] for t in items]


def _parse_changelog() -> dict[str, Any]:
    """
    嚴格模式：
    - 找不到或讀取失敗 → 回 error + 空陣列
    - 解析失敗 → 回 error + 空陣列
    - 解析成功 → progress_items + recent_updates（跨日期攤平成最近 N 條）
    """
    content, dbg = _load_changelog_content()
    now_iso = datetime.now(timezone.utc).isoformat()

    if not content:
        return {
            "progress_items": [],
            "recent_updates": [],
            "last_updated": now_iso,
            "source": dbg.get("used_source") or "none",
            "error": "找不到或無法讀取 CHANGELOG（建議設置 CHANGELOG_CONTENT / CHANGELOG_URL / CHANGELOG_PATH）",
            "debug_info": dbg,
        }

    def _fallback_parse_dev_record(md: str) -> list[str]:
        """解析 DEVELOPMENT_RECORD.md 類型文件，抽出日期與達成項目作為更新。
        規則：
        - 掃描 "## Day" 開頭段落，段落內尋找 "日期：" 及 "### 達成情況" 區塊下的 "- " 項。
        - 若無達成項目，退而用 Day 標題生成一條摘要。
        - 產出格式："YYYY-MM-DD 內容"，供前端 parseUpdate 處理。
        """
        lines = md.splitlines()
        updates: list[str] = []
        cur_title: str | None = None
        cur_date: str | None = None
        in_achievements = False
        cur_bullets: list[str] = []

        def flush():
            nonlocal cur_title, cur_date, cur_bullets
            if not cur_title and not cur_bullets:
                return
            date_norm, _ = _normalize_date_token(cur_date or "")
            prefix = (date_norm or "").strip()
            if cur_bullets:
                for b in cur_bullets:
                    text = b.strip("- ")
                    label = f"{prefix} {text}".strip()
                    updates.append(label)
            else:
                # 以標題作為摘要
                label = f"{prefix} {cur_title or ''}".strip()
                if label:
                    updates.append(label)
            # reset
            cur_title, cur_date, cur_bullets[:] = None, None, []

        for raw in lines:
            t = raw.strip()
            if t.startswith("## "):
                # 新段落
                if cur_title or cur_bullets:
                    flush()
                cur_title = t.lstrip('# ').strip()
                cur_date = None
                in_achievements = False
                cur_bullets = []
                continue
            if t.startswith("日期：") or t.startswith("日期:"):
                cur_date = t.split("：", 1)[-1] if "：" in t else t.split(":", 1)[-1]
                cur_date = (cur_date or "").strip()
                continue
            if t.startswith("### ") and ("達成" in t or "完成" in t):
                in_achievements = True
                continue
            if t.startswith("### "):
                in_achievements = False
                continue
            if in_achievements and t.startswith("-"):
                cur_bullets.append(t)
                continue

        # 最後一段
        flush()

        # 只取最近 N 條
        limit2 = int(os.getenv("CHANGELOG_RECENT_LIMIT", "30"))
        return updates[:limit2]

    try:
        progress_items, groups, extra = _parse_changelog_text(content)
        dbg.update(extra)

        limit = int(os.getenv("CHANGELOG_RECENT_LIMIT", "30"))
        updates = _flatten_recent_items(groups, limit)

        # 若主解析無結果，嘗試以 DEVELOPMENT_RECORD.md 風格解析
        if not progress_items and (not updates):
            updates = _fallback_parse_dev_record(content)
            dbg["fallback"] = "dev_record_md"

        return {
            "progress_items": progress_items,
            "recent_updates": updates,
            "last_updated": now_iso,
            "source": dbg.get("used_source") or "file",
            "debug_info": dbg,
        }
    except Exception as e:
        dbg["parse_error"] = f"{e.__class__.__name__}: {e}"
        return {
            "progress_items": [],
            "recent_updates": [],
            "last_updated": now_iso,
            "source": dbg.get("used_source") or "file",
            "error": "解析 CHANGELOG 失敗",
            "debug_info": dbg,
        }


# -------- Flask 應用 --------
def create_app() -> Flask:
    app = Flask(__name__)
    
    # 生成重啟標識，用於前端檢測重啟
    import uuid
    import time
    restart_id = str(uuid.uuid4())
    restart_timestamp = int(time.time())
    app.config['RESTART_ID'] = restart_id
    app.config['RESTART_TIMESTAMP'] = restart_timestamp
    
    print(f"[ForumKit] 啟動標識: {restart_id} (時間戳: {restart_timestamp})")
    
    # 讓 jsonify 直接輸出 UTF-8，而非 \uXXXX 逃脫序列，
    # 避免前端在某些備援路徑顯示不可讀的 Unicode 轉義。
    app.config["JSON_AS_ASCII"] = False
    
    # 把 Flask log 對齊 Gunicorn
    import logging
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.DEBUG)
    app.config["PROPAGATE_EXCEPTIONS"] = False  # 交給 errorhandler
    
    # 強制設定強密鑰，生產環境不使用預設值
    secret_key = os.getenv("SECRET_KEY")
    if not secret_key or secret_key == "dev":
        if os.getenv("FLASK_ENV") == "production":
            raise ValueError("生產環境必須設定 SECRET_KEY 環境變數")
        secret_key = "dev-only-key-not-for-production"
    app.config["SECRET_KEY"] = secret_key

    # 請求體大小限制（預設 16MB，可用 MAX_CONTENT_MB 覆寫）
    try:
        max_mb = int(os.getenv('MAX_CONTENT_MB', '16'))
        app.config['MAX_CONTENT_LENGTH'] = max_mb * 1024 * 1024
    except Exception:
        app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

    # 初始化資料庫和 JWT
    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "devkey")
    jwt = JWTManager(app)

    # 優先初始化資料庫，並（若啟用）以環境變數確保單一開發者帳號存在
    try:
        init_engine_session()
    except Exception as e:  # noqa: BLE001
        app.logger.error(f"DB init failed at startup: {e}")
    try:
        # 僅在明確開啟 ENFORCE_SINGLE_ADMIN 時執行；避免預設情況誤清使用者
        if os.getenv("ENFORCE_SINGLE_ADMIN", "0").strip().lower() in {"1", "true", "yes", "on"}:
            ensure_single_admin()
            app.logger.info("Single admin ensured from env (SINGLE_ADMIN_USERNAME)")
    except Exception as e:  # noqa: BLE001
        app.logger.error(f"ensure_single_admin failed: {e}")

    # 全域 JWT 錯誤回應，統一格式便於前端處理/除錯
    @jwt.unauthorized_loader  # 缺少 Authorization header 或 Bearer 錯誤
    def _jwt_missing(reason: str):  # type: ignore[override]
        return jsonify({"ok": False, "error": {"code": "JWT_MISSING", "message": "缺少授權資訊", "hint": reason}}), 401

    @jwt.invalid_token_loader  # token 解析失敗
    def _jwt_invalid(reason: str):  # type: ignore[override]
        return jsonify({"ok": False, "error": {"code": "JWT_INVALID", "message": "無效的憑證", "hint": reason}}), 401

    @jwt.expired_token_loader  # token 過期
    def _jwt_expired(h, p):  # type: ignore[override]
        return jsonify({"ok": False, "error": {"code": "JWT_EXPIRED", "message": "憑證已過期", "hint": None}}), 401

    @jwt.needs_fresh_token_loader  # 需要 fresh token
    def _jwt_not_fresh(h, p):  # type: ignore[override]
        return jsonify({"ok": False, "error": {"code": "JWT_NOT_FRESH", "message": "需要新的授權憑證", "hint": None}}), 401

    @jwt.revoked_token_loader  # 已撤銷 token（若有實作 blacklist）
    def _jwt_revoked(h, p):  # type: ignore[override]
        return jsonify({"ok": False, "error": {"code": "JWT_REVOKED", "message": "憑證已撤銷", "hint": None}}), 401
    
    try:
        init_engine_session()
        print("[ForumKit] DB init ok")
    except Exception as e:
        print("[ForumKit] DB init fail:", e)
    
    # 強制單一管理者模式：清空其他帳號，確保唯一的開發者帳號存在
    try:
        ensure_single_admin()
        print("[ForumKit] Single admin enforcement applied")
    except Exception as e:
        print("[ForumKit] Single admin enforcement failed:", e)

    # 準備品牌資產：將根目錄 ForumKit.png 複製到 uploads/public/assets 供 Webhook 取用
    try:
        src_candidates = [
            os.path.abspath(os.path.join(os.getcwd(), 'ForumKit.png')),
            os.path.abspath('/app/ForumKit.png'),
        ]
        src = next((p for p in src_candidates if os.path.exists(p)), None)
        if src:
            root = os.getenv('UPLOAD_ROOT', 'uploads')
            dest_dir = os.path.join(root, 'public', 'assets')
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, 'ForumKit.png')
            # 僅在不存在或來源較新時更新
            need = True
            try:
                if os.path.exists(dest):
                    need = os.path.getmtime(src) > os.path.getmtime(dest)
            except Exception:
                need = True
            if need:
                import shutil
                shutil.copyfile(src, dest)
                print('[ForumKit] Copied brand logo to', dest)
    except Exception as e:
        print('[ForumKit] Prepare brand asset failed:', e)

    # 啟動使用者 Webhook 推送服務（可用 ADMIN_NOTIFY_DELIVERY=webhook/bot/both 與用戶級 Webhook 並行）
    def _start_user_webhook_feeder():
        import json as _json
        import traceback
        from sqlalchemy.orm import Session
        from models import Post, School, User
        from utils.db import get_session
        from utils.notify import post_discord
        try:
            import redis  # type: ignore
        except Exception:
            return  # 無 redis 環境則略過

        url = os.getenv('REDIS_URL', 'redis://redis:80/0')
        interval = int(os.getenv('USER_WEBHOOK_FEED_INTERVAL', '60') or '60')
        r = None
        try:
            r = redis.from_url(url, decode_responses=True)
        except Exception:
            r = None
        if not r:
            return

        def _loop():
            while True:
                try:
                    items = r.hgetall('user:webhooks') or {}
                    if items:
                        with get_session() as s:  # type: Session
                            for uid, raw in items.items():
                                try:
                                    conf = _json.loads(raw) if raw else {}
                                except Exception:
                                    conf = {}
                                if not conf or not conf.get('enabled') or not conf.get('url'):
                                    continue
                                # 用戶學校（綁定）
                                try:
                                    u = s.get(User, int(uid))
                                    user_school_id = getattr(u, 'school_id', None)
                                except Exception:
                                    user_school_id = None

                                kinds = conf.get('kinds') or {}
                                wants_posts = bool(kinds.get('posts', True))
                                wants_comments = bool(kinds.get('comments', False))
                                wants_ann = bool(kinds.get('announcements', False))

                                # 取最新貼文（審核通過）
                                if wants_posts:
                                    q = s.query(Post).filter(Post.status == 'approved')
                                    if user_school_id:
                                        q = q.filter(Post.school_id == user_school_id)
                                    # 每用戶批次上限，可從設定帶入（預設 5）
                                    batch = int(conf.get('batch', 5) or 5)
                                    batch = 1 if batch < 1 else (10 if batch > 10 else batch)
                                    q = q.order_by(Post.id.desc()).limit(batch)
                                    posts = list(reversed(q.all()))
                                    last_key = f'user:webhooks:last:{uid}'
                                    last_raw = r.get(last_key)
                                    last_id = int(last_raw) if last_raw and last_raw.isdigit() else 0
                                    new_posts = [p for p in posts if int(getattr(p, 'id', 0)) > last_id]
                                    for p in new_posts:
                                        content = (p.content or '')
                                        excerpt = content[:180]
                                        try:
                                            excerpt = re.sub('<[^>]+>', '', excerpt)
                                        except Exception:
                                            pass
                                        title = f"#{p.id} 新貼文"
                                        embed = {
                                            'title': title,
                                            'description': excerpt,
                                            'color': 0x2b90d9,
                                            'url': f"{os.getenv('PUBLIC_BASE_URL', '').rstrip('/')}/posts/{p.id}" if os.getenv('PUBLIC_BASE_URL') else None,
                                            'author': { 'name': 'ForumKit', **({ 'icon_url': (os.getenv('PUBLIC_CDN_URL','') or os.getenv('PUBLIC_BASE_URL','')).rstrip('/') + ('/assets/ForumKit.png' if os.getenv('PUBLIC_CDN_URL') else '/uploads/assets/ForumKit.png') } if (os.getenv('PUBLIC_CDN_URL') or os.getenv('PUBLIC_BASE_URL')) else {}) },
                                            'footer': { 'text': __brand_footer_text() }
                                        }
                                        # 媒體縮圖（若可用）
                                        try:
                                            img_url = None
                                            cdn = os.getenv('PUBLIC_CDN_URL')
                                            if not cdn and os.getenv('PUBLIC_BASE_URL'):
                                                cdn = os.getenv('PUBLIC_BASE_URL').rstrip('/') + '/uploads'
                                            if cdn and getattr(p, 'media', None):
                                                # 僅挑第一張圖片（排除影片/其他）
                                                for m in p.media:
                                                    mp = (getattr(m, 'path', '') or '').lstrip('/')
                                                    mk = (getattr(m, 'kind', '') or '').lower()
                                                    is_img = any(mp.lower().endswith(ext) for ext in ['.jpg','.jpeg','.png','.webp','.gif']) or mk == 'image'
                                                    if not is_img:
                                                        continue
                                                    if mp.startswith('public/'):
                                                        img_url = cdn.rstrip('/') + '/' + mp.replace('public/','',1)
                                                    else:
                                                        img_url = cdn.rstrip('/') + '/' + mp
                                                    break
                                            if img_url:
                                                embed['image'] = { 'url': img_url }
                                        except Exception:
                                            pass
                                        try:
                                            post_discord(conf['url'], { 'content': None, 'embeds': [embed] })
                                        except Exception:
                                            pass
                                        last_id = max(last_id, int(p.id))
                                    r.set(last_key, str(last_id))

                                # 最新留言（審核通過）
                                if wants_comments:
                                    from models import Comment
                                    from sqlalchemy import desc
                                    cq = s.query(Comment).filter(Comment.status == 'approved', Comment.is_deleted == False)  # noqa: E712
                                    if user_school_id:
                                        # 透過貼文學校過濾
                                        cq = cq.join(Post, Post.id == Comment.post_id).filter(Post.school_id == user_school_id)
                                    batch = int(conf.get('batch', 5) or 5)
                                    batch = 1 if batch < 1 else (10 if batch > 10 else batch)
                                    cq = cq.order_by(desc(Comment.id)).limit(batch)
                                    cmts = list(reversed(cq.all()))
                                    c_last_key = f'user:webhooks:last_comment:{uid}'
                                    c_last_raw = r.get(c_last_key)
                                    c_last_id = int(c_last_raw) if c_last_raw and c_last_raw.isdigit() else 0
                                    new_cmts = [c for c in cmts if int(getattr(c, 'id', 0)) > c_last_id]
                                    for c in new_cmts:
                                        text = (c.content or '')[:180]
                                        try:
                                            text = re.sub('<[^>]+>', '', text)
                                        except Exception:
                                            pass
                                        title = f"💬 新留言 #{c.id}"
                                        # 連回貼文
                                        url_post = f"{os.getenv('PUBLIC_BASE_URL', '').rstrip('/')}/posts/{getattr(c, 'post_id', 0)}" if os.getenv('PUBLIC_BASE_URL') else None
                                        embed = { 'title': title, 'description': text, 'color': 0x6b7280, 'url': url_post,
                                                  'author': { 'name': 'ForumKit', **({ 'icon_url': (os.getenv('PUBLIC_CDN_URL','') or os.getenv('PUBLIC_BASE_URL','')).rstrip('/') + ('/assets/ForumKit.png' if os.getenv('PUBLIC_CDN_URL') else '/uploads/assets/ForumKit.png') } if (os.getenv('PUBLIC_CDN_URL') or os.getenv('PUBLIC_BASE_URL')) else {}) },
                                                  'footer': { 'text': __brand_footer_text() } }
                                        try:
                                            post_discord(conf['url'], { 'content': None, 'embeds': [embed] })
                                        except Exception:
                                            pass
                                        c_last_id = max(c_last_id, int(c.id))
                                    r.set(c_last_key, str(c_last_id))
                except Exception:
                    traceback.print_exc()
                finally:
                    eventlet.sleep(max(15, interval))

        try:
            eventlet.spawn_n(_loop)
            print('[ForumKit] user webhook feeder started')
        except Exception as e:
            print('[ForumKit] user webhook feeder failed:', e)

    _start_user_webhook_feeder()

    # 限制 CORS 來源
    # CORS 允許來源：預設涵蓋常見本機與 Docker 映射連入
    default_http_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:12005",
        "http://127.0.0.1:12005",
        # Vite 預設開發埠
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    allowed_origins = (
        [o for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
        if os.getenv("ALLOWED_ORIGINS") else default_http_origins
    )
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    # 初始化 SocketIO（只在這裡做一次）
    socketio_env = os.getenv("SOCKETIO_ORIGINS")
    if socketio_env:
        socketio_origins = [o for o in socketio_env.split(",") if o.strip()]
    else:
        # 預設放寬為 *，避免反代同網域（含 https/wss）握手被擋。
        # 若需嚴格限制，請在環境變數設定 SOCKETIO_ORIGINS="https://你的網域"
        socketio_origins = "*"
    socketio.init_app(app, cors_allowed_origins=socketio_origins)

    @app.before_request
    def add_req_id():
        g.req_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        g.request_id = g.req_id  # 保持向後相容
        g.request_ts = datetime.now(timezone.utc).isoformat()

    def _ctx() -> Any:
        # request_id 和 request_ts 已在 add_req_id 中設定

        if request.path.startswith("/api"):
            # IP 封鎖檢查（允許提交稽核報告來解封）
            if request.path != '/api/audit_report' and is_ip_blocked():
                return jsonify({
                    'ok': False,
                    'error': {
                        'code': 'IP_BLOCKED',
                        'message': '此 IP 已受限制，請提交稽核報告以解除',
                        'hint': 'POST /api/audit_report { contact?, reason?, message }'
                    }
                }), 451
            cfg = load_config() or {}
            mode = cfg.get("mode", "normal")
            if mode == "maintenance":
                # 允許 GET 類型查詢（看貼文）、允許 /api/mode、/api/report
                if request.method != "GET" and request.path not in {"/api/mode", "/api/report"}:
                    # 處理維護訊息，空白字串使用預設訊息
                    maintenance_msg = cfg.get("maintenance_message", "").strip()
                    if not maintenance_msg:
                        maintenance_msg = "系統維護中，暫停服務"
                    
                    maintenance_until = cfg.get("maintenance_until", "").strip()
                    if not maintenance_until:
                        maintenance_until = None
                    
                    return jsonify({
                        "ok": False,
                        "error": {
                            "code": "FK-MAINT-001",
                            "message": maintenance_msg,
                            "hint": maintenance_until,
                            "details": None
                        },
                        "trace": {"request_id": g.request_id, "ts": g.request_ts},
                        "mode": cfg,
                    }), 503
            # development 模式允許所有請求
            elif mode == "development":
                pass  # 允許所有請求通過
        return None

    app.before_request(_ctx)

    @app.after_request
    def add_resp_id(resp: Response) -> Response:
        resp.headers["X-Request-ID"] = getattr(g, "req_id", "-")
        resp.headers["X-ForumKit-App"] = "backend"
        resp.headers["X-ForumKit-Build"] = APP_BUILD_VERSION
        resp.headers["Access-Control-Expose-Headers"] = "X-ForumKit-Ticket, X-Request-ID, X-ForumKit-Build"
        if getattr(g, "ticket_id", None):
            resp.headers["X-ForumKit-Ticket"] = g.ticket_id
        # 安全標頭（可用環境變數關閉）
        if os.getenv('SECURITY_HEADERS_DISABLED', '0') not in {'1','true','yes','on'}:
            resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
            resp.headers.setdefault('X-Frame-Options', 'DENY')
            resp.headers.setdefault('Referrer-Policy', 'no-referrer')
            resp.headers.setdefault('Permissions-Policy', "geolocation=(), microphone=(), camera=()")
            # CSP（簡化版，允許 self 資源與 data/blob 圖片、ws 連線）
            csp = os.getenv('CONTENT_SECURITY_POLICY') or \
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " \
                "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; " \
                "base-uri 'none'; frame-ancestors 'none'"
            resp.headers.setdefault('Content-Security-Policy', csp)
            # 可選 HSTS（僅 https）
            if os.getenv('ENABLE_HSTS', '0') in {'1','true','yes','on'} and request.scheme == 'https':
                resp.headers.setdefault('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
        return resp



    # ---- REST ----
    @app.route("/api/healthz")
    def healthz():
        """健康檢查端點（含 DB / Redis / CDN 真實狀態檢測）。"""
        db = {}
        redis = {}
        cdn = {}
        
        # DB 健康檢查
        try:
            db = get_db_health()  # type: ignore[name-defined]
        except Exception as e:
            db = {"ok": False, "error": str(e)}
        
        # Redis 健康檢查
        try:
            redis = get_redis_health()  # type: ignore[name-defined]
        except Exception as e:
            redis = {"ok": False, "error": str(e)}
        
        # CDN 健康檢查（真實狀態檢測）
        try:
            import socket
            import requests
            host = os.getenv('CDN_HOST', '127.0.0.1')
            port = int(os.getenv('CDN_PORT', '12002'))
            
            # 1. TCP 連線測試
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2.0)
            tcp_ok = False
            try:
                s.connect((host, port))
                tcp_ok = True
            finally:
                try: s.close()
                except Exception: pass
            
            # 2. HTTP 狀態測試
            http_ok = False
            http_status = None
            try:
                cdn_url = f"http://{host}:{port}"
                response = requests.get(cdn_url, timeout=3)
                http_ok = response.status_code < 500
                http_status = response.status_code
            except Exception:
                pass
            
            # 3. 檔案服務測試
            file_test_ok = False
            try:
                test_url = f"http://{host}:{port}/test.txt"
                response = requests.head(test_url, timeout=2)
                file_test_ok = response.status_code in [200, 404]  # 404也是正常的，表示服務正常但檔案不存在
            except Exception:
                pass
            
            cdn = {
                "ok": tcp_ok and http_ok,
                "host": host,
                "port": port,
                "tcp_ok": tcp_ok,
                "http_ok": http_ok,
                "http_status": http_status,
                "file_test_ok": file_test_ok,
                "status": "OK" if (tcp_ok and http_ok) else "FAIL"
            }
        except Exception as e:
            cdn = {"ok": False, "error": str(e)}
        
        return jsonify({
            "ok": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "restart_id": app.config.get('RESTART_ID', 'unknown'),
            "restart_timestamp": app.config.get('RESTART_TIMESTAMP', 0),
            "uptime": int(time.time() - psutil.boot_time()) if 'psutil' in globals() else None,
            "version": "1.0.0",
            "environment": os.getenv('FLASK_ENV', 'production'),
            "db": db,
            "redis": redis,
            "cdn": cdn,
        })


    @app.route("/api/progress")
    def progress() -> Response:  # noqa: F841
        """回傳前端開發頁所需的進度與更新資料。
        結構：{ progress_items: [], recent_updates: [], last_updated: str, source?: str, error?: str, debug_info?: any }
        內容來源優先序：環境變數 → 變更檔 → 其他文件備援。
        """
        data = _parse_changelog()
        return jsonify(data)

    @app.get("/api/status/integrations")
    def status_integrations() -> Response:  # noqa: F841
        """提供整合狀態（不含敏感資訊）。
        - admin_webhook: 是否設定、Webhook 主機與遮罩識別。
        - recent_admin_events: 最近投遞結果（最多 10 筆）。
        - queue: 目前未啟用，先回固定資訊。
        """
        hook = (_get_admin_hook() or "").strip()
        configured = bool(hook)
        host = ""
        tail = ""
        try:
            if hook:
                # 解析主機名與最後一段 id（遮罩）
                from urllib.parse import urlparse
                u = urlparse(hook)
                host = u.netloc
                tail = (u.path.rsplit("/", 1)[-1] if "/" in u.path else u.path)
                if len(tail) > 6:
                    tail = tail[:3] + "…" + tail[-2:]
        except Exception:
            pass
        # 系統資訊（best-effort）
        sysinfo: dict[str, Any] = {}
        try:
            import platform, os as _os
            sysinfo["hostname"] = platform.node()
            sysinfo["platform"] = platform.platform()
            try:
                la = _os.getloadavg()
                sysinfo["loadavg"] = {"1m": la[0], "5m": la[1], "15m": la[2]}
            except Exception:
                pass
            try:
                import psutil  # type: ignore
                vm = psutil.virtual_memory()
                sysinfo["memory"] = {"total": vm.total, "available": vm.available, "percent": vm.percent}
                cpu = psutil.cpu_percent(interval=0.1)
                sysinfo["cpu_percent"] = cpu
                sysinfo["uptime"] = int(time.time() - psutil.boot_time())
                
                # 資料庫和CDN服務狀態檢查
                try:
                    # 資料庫服務狀態（檢查PostgreSQL連接）
                    db_running = False
                    try:
                        from utils.db import get_db_health
                        db_health = get_db_health()
                        db_running = db_health.get("ok", False)
                    except Exception:
                        pass
                    sysinfo["db_cpu_percent"] = 1.0 if db_running else None
                    
                    # CDN服務狀態（檢查Nginx HTTP連接）
                    cdn_running = False
                    try:
                        import requests
                        cdn_host = os.getenv('CDN_HOST', '127.0.0.1')
                        cdn_port = int(os.getenv('CDN_PORT', '12002'))
                        response = requests.get(f"http://{cdn_host}:{cdn_port}", timeout=2)
                        cdn_running = response.status_code < 500
                    except Exception:
                        pass
                    sysinfo["cdn_cpu_percent"] = 1.0 if cdn_running else None
                except Exception:
                    # 如果無法檢查服務，設為未知狀態
                    sysinfo["db_cpu_percent"] = None
                    sysinfo["cdn_cpu_percent"] = None
                    
            except Exception:
                # 無 psutil 時以 /proc/meminfo 粗略估算
                try:
                    with open("/proc/meminfo","r") as f:
                        mem = f.read()
                    sysinfo["meminfo"] = mem.splitlines()[:5]
                except Exception:
                    pass
        except Exception:
            pass
        # 佇列狀態：若能連到 Redis，回報 key 長度
        queue = {"enabled": False, "size": 0}
        try:
            from urllib.parse import urlparse
            import redis  # type: ignore
            url = os.getenv("REDIS_URL")
            if url:
                u = urlparse(url)
                r = redis.Redis(host=u.hostname, port=u.port or 6379, db=int((u.path or '/0').strip('/')), password=u.password, decode_responses=True)
                key = os.getenv("FK_QUEUE_KEY", "fk:queue")
                queue["size"] = int(r.llen(key) or 0)
                queue["enabled"] = True
        except Exception:
            pass
        
        # 使用者統計
        user_stats = {"total": 0}
        try:
            from models import User
            from utils.db import get_session
            with get_session() as s:
                user_stats["total"] = s.query(User).count()
        except Exception:
            pass
        return jsonify({
            "ok": True,
            "admin_webhook": {"configured": configured, "host": host, "id_mask": tail},
            "recent_admin_events": recent_admin_events(10),
            "queue": queue,
            "system": sysinfo,
            "user_stats": user_stats,
        })

    # 公告管理（管理員）
    @app.get('/api/admin/announcements')
    def admin_ann_list():  # type: ignore[override]
        from flask_jwt_extended import verify_jwt_in_request, get_jwt
        try:
            verify_jwt_in_request()
            claims = get_jwt() or {}
            if claims.get('role') not in { 'dev_admin','campus_admin','cross_admin' }:
                return jsonify({ 'msg': 'forbidden' }), 403
        except Exception:
            return jsonify({ 'msg': 'unauthorized' }), 401
        items: list[dict[str, Any]] = []
        try:
            import redis, json as _json
            r = redis.from_url(os.getenv('REDIS_URL','redis://redis:80/0'), decode_responses=True)
            raw = r.zrevrange('fk:announcements', 0, 49)
            for s in raw:
                try:
                    items.append(_json.loads(s))
                except Exception:
                    continue
        except Exception:
            pass
        return jsonify({ 'ok': True, 'items': items })

    @app.post('/api/admin/announcements')
    def admin_ann_create():  # type: ignore[override]
        from flask_jwt_extended import verify_jwt_in_request, get_jwt
        try:
            verify_jwt_in_request()
            claims = get_jwt() or {}
            if claims.get('role') not in { 'dev_admin','campus_admin','cross_admin' }:
                return jsonify({ 'msg': 'forbidden' }), 403
        except Exception:
            return jsonify({ 'msg': 'unauthorized' }), 401
        data = request.get_json(silent=True) or {}
        title = str(data.get('title') or '').strip()
        message = str(data.get('message') or '').strip()
        if not title or not message:
            return jsonify({ 'ok': False, 'msg': 'title/message required' }), 400
        # 透過 notify 管線發送（自動寫入公告來源、Webhook、Bot 等）
        res = notify_send_event(kind='announcement', title=title, description=message, source='/api/admin/announcements')
        return jsonify({ 'ok': True, 'delivery': 'ok' if res.get('ok') else 'local_only', 'status': res.get('status') })



    @app.route("/api/color_vote", methods=["POST"])
    def color_vote() -> Response:  # noqa: F841
        """顏色搭配器 API：支援簡單票選與完整主題提案；若 Discord 失敗，回 local_only。"""
        try:
            # 為此次請求產生處理單號
            ticket_id = new_ticket_id("FKC")  # ForumKit Color
            g.ticket_id = ticket_id

            payload_raw: Any = request.get_json(force=True, silent=True) or {}
            payload = cast(dict[str, Any], payload_raw if isinstance(payload_raw, dict) else {})

            # v1：簡單票選
            if "choice" in payload:
                choice = str(payload.get("choice") or "").strip()
                if not choice:
                    return error("FK-COLOR-001", 400, "顏色選擇不能為空")[0]
                res = notify_send_event(
                    kind="simple_choice",
                    title=f"顏色投票 〔{ticket_id}〕",
                    description=f"選擇：{choice}",
                    ticket_id=ticket_id,
                    ts=str(g.get('request_ts')),
                    request_id=str(g.get('request_id')),
                    source="/api/color_vote",
                )
                return jsonify({
                    "ok": True,
                    "type": "simple_choice",
                    "ticket_id": ticket_id,
                    "delivery": "discord" if res.get("ok") else "local_only",
                    "status": res.get("status")
                })

            # v2：完整主題提案 - 只驗證主題色
            theme_name = str(payload.get("name") or "").strip()
            description = str(payload.get("description") or "").strip()
            colors_raw: Any = payload.get("colors") or {}
            colors: dict[str, str] = cast(dict[str, str], colors_raw if isinstance(colors_raw, dict) else {})

            if not theme_name:
                return error("FK-COLOR-002", 400, "主題名稱不能為空")[0]
            if len(theme_name) > 50:
                return error("FK-COLOR-004", 400, "主題名稱過長（最多50字元）")[0]
            if len(description) > 500:
                return error("FK-COLOR-005", 400, "描述過長（最多500字元）")[0]
            if not colors or not colors.get("primary"):
                return error("FK-COLOR-003", 400, "主題色不能為空")[0]

            hex_pattern = re.compile(r'^#[0-9A-Fa-f]{6}$')
            primary_color_hex = colors.get("primary", "#3B82F6")
            if not hex_pattern.match(str(primary_color_hex)):
                return error("FK-COLOR-006", 400, "主題色格式無效")[0]

            primary_color_int = _hex_to_int(primary_color_hex)

            res = notify_send_event(
                kind="theme_proposal",
                title=f"主題提案：{theme_name} 〔{ticket_id}〕",
                description=description,
                fields=[
                    {"name": "主色", "value": colors.get("primary", ""), "inline": True},
                    {"name": "輔助色", "value": colors.get("secondary", ""), "inline": True},
                ],
                ticket_id=ticket_id,
                ts=str(g.get('request_ts')),
                request_id=str(g.get('request_id')),
                source="/api/color_vote",
            )

            if not res.get("ok"):
                # second attempt already handled by send_event failure; return status only
                res2 = res
                return jsonify({"ok": True, "type": "theme_proposal", "ticket_id": ticket_id,
                                "delivery": "discord" if res2.get("ok") else "local_only",
                                "status": res2.get("status")})

            return jsonify({"ok": True, "type": "theme_proposal", "ticket_id": ticket_id,
                            "delivery": "discord", "status": res.get("status")})
        except Exception as e:  # noqa: BLE001
            return error("FK-COLOR-EX", 500, "顏色投票處理失敗", hint=str(e))[0]

    @app.route("/api/report", methods=["POST"])
    def report_issue() -> Response:  # noqa: F841
        """問題回報：送 Discord；若 webhook 未設置則回 local_only。"""
        try:
            # 為此次請求產生處理單號
            ticket_id = new_ticket_id("FKR")  # ForumKit Report
            g.ticket_id = ticket_id

            payload_raw: Any = request.get_json(force=True, silent=True) or {}
            payload = cast(dict[str, Any], payload_raw if isinstance(payload_raw, dict) else {})

            message = str(payload.get("message") or "").strip()
            contact = str(payload.get("contact") or payload.get("email") or "").strip()
            category = str(payload.get("category") or "一般回報").strip()

            if len(message) < 5:
                return error("FK-REPORT-001", 400, "回報內容太短，請補充細節", hint="message >= 5 chars")[0]

            # 原始行為（XFF 或 remote_addr），並同時附上 CF 與服務端 IP
            ip_raw = request.headers.get("X-Forwarded-For") or request.remote_addr or "-"
            cf_ip = request.headers.get("CF-Connecting-IP") or "-"
            srv_ip = request.remote_addr or "-"
            ip_footer = f"raw={ip_raw}, cf={cf_ip}, srv={srv_ip}"

            res = notify_send_event(
                kind="issue_report",
                title=f"問題回報：{category} 〔{ticket_id}〕",
                description=message,
                actor=(contact or "匿名"),
                source=f"/api/report | {ip_footer}",
                ticket_id=ticket_id,
                ts=str(g.get('request_ts')),
                request_id=str(g.get('request_id')),
            )

            if not res.get("ok"):
                res2 = res
                return jsonify({"ok": True, "ticket_id": ticket_id,
                                "delivery": "discord" if res2.get("ok") else "local_only",
                                "status": res2.get("status")})
            return jsonify({"ok": True, "ticket_id": ticket_id, "delivery": "discord", "status": res.get("status")})
        except Exception as e:  # noqa: BLE001
            return error("FK-REPORT-EX", 500, "回報寄送失敗", hint=str(e))[0]

    @app.route("/api/progress", methods=["GET"])
    def get_progress() -> Response:  # noqa: F841
        data = _parse_changelog()
        # 嚴格模式：直接把 data 丟回去，前端自行依 error 判斷呈現
        return jsonify(data)

    # 掛載 API 藍圖
    app.register_blueprint(posts_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(schools_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(mode_bp)
    app.register_blueprint(settings_bp)
    # routes_media blueprint removed: it conflicted with current models
    # and moderation flow (pending/public). Use /api/posts/upload instead.
    app.register_blueprint(moderation_bp)
    app.register_blueprint(abuse_bp)
    app.register_blueprint(support_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(account_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(media_v2_bp)
    app.register_blueprint(instagram_bp)
    # 狀態與事件（僅 dev_admin 可讀）
    try:
        from routes.routes_status import bp as status_bp
        app.register_blueprint(status_bp)
    except Exception as _e:
        print('[ForumKit] routes_status not mounted:', _e)
    
    # 留言與反應系統
    from routes.routes_comments import bp as comments_bp
    app.register_blueprint(comments_bp)

    # ---- Realtime rooms debug APIs (for Day10 validation) ----
    from flask_jwt_extended import jwt_required
    from utils.authz import require_role

    @app.get("/api/rooms/summary")
    @jwt_required()
    @require_role("admin", "dev_admin", "campus_admin", "cross_admin", "moderator", "campus_moder", "cross_moder")
    def rooms_summary():  # noqa: F841
        try:
            rooms = set(list(_room_msgs.keys()) + list(_room_clients.keys()))
            items = []
            for r in rooms:
                items.append({
                    "room": r,
                    "clients": len(_room_clients.get(r, set())),
                    "backlog": len(_room_msgs.get(r, [])),
                })
            return jsonify({"ok": True, "items": items, "total": len(items)})
        except Exception as e:  # noqa: BLE001
            return jsonify({"ok": False, "error": {"message": str(e)}}), 500

    @app.get("/api/rooms/<string:room>/messages")
    @jwt_required()
    @require_role("admin", "dev_admin", "campus_admin", "cross_admin", "moderator", "campus_moder", "cross_moder")
    def rooms_messages(room: str):  # noqa: F841
        try:
            msgs = list(_room_msgs.get(room, []))
            return jsonify({"ok": True, "items": msgs, "total": len(msgs)})
        except Exception as e:  # noqa: BLE001
            return jsonify({"ok": False, "error": {"message": str(e)}}), 500

    @app.post("/api/rooms/<string:room>/clear")
    @jwt_required()
    @require_role("admin", "dev_admin", "campus_admin", "cross_admin", "moderator", "campus_moder", "cross_moder")
    def rooms_clear(room: str):  # noqa: F841
        try:
            if room in _room_msgs:
                _room_msgs[room].clear()
            # 廣播空消息（可選，不影響客戶端）
            try:
                emit("room.backlog", {"room": room, "messages": list(_room_msgs.get(room, []))}, to=room)
            except Exception:
                pass
            return jsonify({"ok": True, "room": room, "cleared": True})
        except Exception as e:  # noqa: BLE001
            return jsonify({"ok": False, "error": {"message": str(e)}}), 500

    from werkzeug.exceptions import HTTPException
    
    @app.errorhandler(Exception)
    def handle_any(e: Exception):  # noqa: F841
        if isinstance(e, HTTPException):
            code = e.code
            msg = e.description
        else:
            code = 500
            msg = str(e)
        app.logger.exception("Unhandled exception")  # 這行輸出完整 traceback 到容器 log
        return jsonify({
            "ok": False,
            "error": {
                "code": code,
                "message": msg,
                "hint": "check backend logs",
                "details": None
            },
            "trace": {"request_id": g.get("request_id"), "ts": g.get("request_ts")}
        }), code
    
    @app.errorhandler(HTTPException)
    def handle_http_error(e: HTTPException):
        app.logger.info(f"HTTP {e.code}: {e.description}")  # HTTP 錯誤記錄但不需要 traceback
        return jsonify({
            "ok": False,
            "error": {
                "code": f"HTTP-{e.code}",
                "message": e.description or "HTTP錯誤",
                "hint": "檢查請求參數與權限",
                "details": None
            },
            "trace": {"request_id": g.get("request_id"), "ts": g.get("request_ts")}
        }), e.code

    try:
        routes_after = sorted(str(r) for r in app.url_map.iter_rules())  # type: ignore[attr-defined]
        print(f"[ForumKit][routes] {routes_after}")
    except Exception as ie:  # noqa: BLE001
        print(f"[ForumKit][routes] FAIL: {ie}")

    register_socketio_events()  # 僅首次生效
    
    # SocketIO 事件已在 register_socketio_events() 中註冊
    # 心跳服務將通過 Dockerfile CMD 在另一個進程中啟動
    
    return app


def error(code: str, http: int, message: str, hint: str | None = None) -> Tuple[Response, int]:
    return jsonify({
        "ok": False,
        "error": {"code": code, "message": message, "hint": hint, "details": None},
        "trace": {"request_id": g.get("request_id"), "ts": g.get("request_ts")}
    }), http


def register_socketio_events():
    global _events_registered
    if _events_registered:
        return
    _events_registered = True

    @socketio.on("connect")
    def on_connect():  # noqa: F841
        from flask import current_app
        request_id = str(uuid.uuid4())
        request_ts = datetime.now(timezone.utc).isoformat()
        
        # 詳細連線日誌
        client_info = {
            "sid": request.sid,
            "remote_addr": request.remote_addr,
            "user_agent": request.headers.get("User-Agent", ""),
            "origin": request.headers.get("Origin", ""),
        }
        current_app.logger.info(f"[SocketIO] client connected: sid={request.sid} addr={request.remote_addr} ua='{request.headers.get('User-Agent', '')[:50]}...'")
        
        emit("hello", {"message": "connected", "request_id": request_id, "ts": request_ts, "sid": request.sid})

    @socketio.on("disconnect")
    def on_disconnect():  # noqa: F841
        from flask import current_app
        current_app.logger.info(f"[SocketIO] client disconnected: sid={request.sid}")
        # 清理該 sid 加入的所有房間的 presence
        sid = request.sid
        rooms = list(_sid_rooms.get(sid, set()))
        client_id = _sid_client.get(sid, f"sid:{sid}")
        for r in rooms:
            try:
                _sid_rooms[sid].discard(r)
                # 無法從 join_room/leave_room 移除（連線已斷），但我們維護自己的 presence 列表
            except Exception:
                pass
            try:
                if client_id in _room_clients.get(r, set()):
                    _room_clients[r].discard(client_id)
                    emit("room.presence", {"room": r, "count": len(_room_clients[r])}, to=r)
            except Exception:
                pass
        _sid_rooms.pop(sid, None)
        _sid_client.pop(sid, None)

    @socketio.on("ping")
    def on_ping(data: Any):  # noqa: F841
        from flask import current_app
        current_app.logger.debug(f"[SocketIO] ping from sid={request.sid}: {data}")
        emit("pong", {"echo": data, "ts": datetime.now(timezone.utc).isoformat(), "sid": request.sid})

    @socketio.on("room.join")
    def on_room_join(payload: dict):  # noqa: F841
        """加入聊天室房間，並回傳最近訊息（backlog）。
        payload: { room: str, client_id?: str }
        """
        try:
            room = str(payload.get("room") or "").strip()
            client_id = str(payload.get("client_id") or "").strip() or f"sid:{request.sid}"
            if not room:
                return emit("room.error", {"room": room, "error": "ROOM_REQUIRED"})
            if not _valid_room_name(room):
                return emit("room.error", {"room": room, "error": "INVALID_ROOM_NAME"})
            # 速率限制：每 sid 每 10s 最多 5 次 join
            if not _ws_allow(f"join:{request.sid}", calls=5, per_seconds=10):
                return emit("room.error", {"room": room, "error": "RATE_LIMIT"})
            # 房間數量上限：若是新房間且超額則拒絕
            is_new_room = room not in _room_msgs
            if is_new_room and (len(_room_msgs) >= _WS_ROOMS_MAX):
                return emit("room.error", {"room": room, "error": "ROOMS_LIMIT"})
            join_room(room)
            _sid_rooms[request.sid].add(room)
            _sid_client[request.sid] = client_id
            _room_clients[room].add(client_id)

            # 回傳 backlog 給加入者
            msgs = list(_room_msgs[room])
            emit("room.backlog", {"room": room, "messages": msgs})
            # 廣播線上名單/計數
            emit("room.presence", {"room": room, "count": len(_room_clients[room])}, to=room)
        except Exception as e:  # noqa: BLE001
            emit("room.error", {"error": str(e)})

    @socketio.on("room.leave")
    def on_room_leave(payload: dict):  # noqa: F841
        room = str(payload.get("room") or "").strip()
        client_id = str(payload.get("client_id") or "").strip() or f"sid:{request.sid}"
        if not room:
            return emit("room.error", {"room": room, "error": "ROOM_REQUIRED"})
        try:
            leave_room(room)
        except Exception:
            pass
        try:
            _sid_rooms[request.sid].discard(room)
            if client_id in _room_clients.get(room, set()):
                _room_clients[room].discard(client_id)
        except Exception:
            pass
        emit("room.presence", {"room": room, "count": len(_room_clients[room])}, to=room)

    @socketio.on("chat.send")
    def on_chat_send(payload: dict):  # noqa: F841
        """接收聊天訊息並廣播到房間，同時保存到 backlog。
        payload: { room: str, message: str, client_id?: str, ts?: str }
        """
        room = str(payload.get("room") or "").strip()
        msg = str(payload.get("message") or "").strip()
        client_id = str(payload.get("client_id") or "").strip() or f"sid:{request.sid}"
        if not room:
            return emit("room.error", {"room": room, "error": "ROOM_REQUIRED"})
        if not _valid_room_name(room):
            return emit("room.error", {"room": room, "error": "INVALID_ROOM_NAME"})
        if not msg:
            return emit("room.error", {"room": room, "error": "EMPTY_MESSAGE"})
        if len(msg) > 2000:
            return emit("room.error", {"room": room, "error": "MESSAGE_TOO_LONG"})
        # 資安/濫用保護
        try:
            from utils.ratelimit import is_ip_blocked, add_ip_strike
            if is_ip_blocked():
                return emit("room.error", {"room": room, "error": "IP_BLOCKED"})
            # 速率限制：每 client_id 每 10s 最多 8 則；每 sid 每 10s 最多 10 則
            if not _ws_allow(f"chat:{client_id}", calls=8, per_seconds=10) or not _ws_allow(f"sid:{request.sid}", calls=10, per_seconds=10):
                try: add_ip_strike()
                except Exception: pass
                return emit("room.error", {"room": room, "error": "RATE_LIMIT"})
        except Exception:
            pass

        payload_out = {
            "room": room,
            "message": msg,
            "client_id": client_id,
            "ts": payload.get("ts") or datetime.now(timezone.utc).isoformat(),
        }
        # 存入 backlog
        _room_msgs[room].append(payload_out)
        # 廣播到該房間
        emit("chat.message", payload_out, to=room)


# 別在模組層級呼叫 create_app()
# 留給 gunicorn --factory app:create_app
if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("FORUMKIT_PORT", os.getenv("PORT", "12005")))
    socketio.run(app, host="0.0.0.0", port=port)
