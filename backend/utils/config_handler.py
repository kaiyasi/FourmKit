import json, os
from pathlib import Path
from typing import Any, Dict

# 依 Day1~Day4 設計：設定寫入容器可持久化目錄 /data（或經 CONFIG_DIR 覆寫）
DATA_DIR = Path(os.getenv("CONFIG_DIR", "/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_PATH = DATA_DIR / "config.json"

DEFAULT_DATA: Dict[str, Any] = {
    # 允許以 APP_MODE 指定預設（normal | maintenance | development | test）
    "mode": os.getenv("APP_MODE", "normal"),
    "maintenance_message": "",
    "maintenance_until": "",
    # 登入模式設定（single | admin_only | open）
    "login_mode": "admin_only",
    # 內容字數審核（最小字數與開關）
    "enforce_min_post_chars": True,
    "min_post_chars": int(os.getenv("MIN_POST_CHARS", "15")),
}


def load_config() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
        # 初始建立檔案，同步執行舊值修正
        data = DEFAULT_DATA.copy()
        try:
            if str(data.get("mode", "normal") or "normal") == "dev":
                data["mode"] = "test"
        except Exception:
            pass
        save_config(data)
        return data
    try:
        data: Dict[str, Any] = json.loads(CONFIG_PATH.read_text("utf-8"))
    except Exception:
        data = DEFAULT_DATA.copy()
    # 修正舊值並確保鍵存在
    changed = False
    # 移除舊模式值 'dev'（一律轉成 'test' 並保存回檔案）
    try:
        raw_mode = str(data.get("mode", "normal") or "normal")
        if raw_mode == "dev":
            data["mode"] = "test"
            changed = True
    except Exception:
        pass
    for k, v in DEFAULT_DATA.items():
        if k not in data:
            data[k] = v
            changed = True
    if changed:
        save_config(data)
    return data


def save_config(data: Dict[str, Any]) -> None:
    CONFIG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def set_mode(mode: str, maintenance_message: str | None = None, maintenance_until: str | None = None) -> Dict[str, Any]:
    data = load_config()
    data["mode"] = mode
    
    # 處理維護訊息，確保不會是空白字串
    if maintenance_message is not None:
        # 確保 maintenance_message 是字串類型
        if isinstance(maintenance_message, str):
            data["maintenance_message"] = maintenance_message.strip() if maintenance_message.strip() else ""
        else:
            data["maintenance_message"] = ""
    elif mode == "maintenance" and not data.get("maintenance_message"):
        # 如果切換到維護模式但沒有訊息，設定空字串避免顯示 None
        data["maintenance_message"] = ""
    
    # 處理維護時間
    if maintenance_until is not None:
        # 確保 maintenance_until 是字串類型
        if isinstance(maintenance_until, str):
            data["maintenance_until"] = maintenance_until.strip() if maintenance_until.strip() else ""
        else:
            data["maintenance_until"] = ""
    elif mode == "maintenance" and not data.get("maintenance_until"):
        # 如果切換到維護模式但沒有時間，設定空字串避免顯示 None
        data["maintenance_until"] = ""
    
    save_config(data)
    return data
