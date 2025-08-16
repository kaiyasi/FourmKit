import json, os
from pathlib import Path
from typing import Any, Dict

# 依 Day1~Day4 設計：設定寫入容器可持久化目錄 /data（或經 CONFIG_DIR 覆寫）
DATA_DIR = Path(os.getenv("CONFIG_DIR", "/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_PATH = DATA_DIR / "config.json"

DEFAULT_DATA: Dict[str, Any] = {
    # 允許以 APP_MODE 指定預設（normal | maintenance | development）
    "mode": os.getenv("APP_MODE", "normal"),
    "maintenance_message": "",
    "maintenance_until": "",
}


def load_config() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
        save_config(DEFAULT_DATA)
        return DEFAULT_DATA.copy()
    try:
        data: Dict[str, Any] = json.loads(CONFIG_PATH.read_text("utf-8"))
    except Exception:
        data = DEFAULT_DATA.copy()
    # ensure keys
    changed = False
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
        data["maintenance_message"] = maintenance_message if maintenance_message.strip() else ""
    elif mode == "maintenance" and not data.get("maintenance_message"):
        # 如果切換到維護模式但沒有訊息，設定空字串避免顯示 None
        data["maintenance_message"] = ""
    
    # 處理維護時間
    if maintenance_until is not None:
        data["maintenance_until"] = maintenance_until if maintenance_until.strip() else ""
    elif mode == "maintenance" and not data.get("maintenance_until"):
        # 如果切換到維護模式但沒有時間，設定空字串避免顯示 None
        data["maintenance_until"] = ""
    
    save_config(data)
    return data
