"""
Module: backend/utils/config_handler.py
Unified comment style: module docstring + minimal inline notes.
"""
import json, os
from pathlib import Path
from typing import Any, Dict

DEFAULT_CONFIG_DIR = os.getenv("CONFIG_DIR") or os.getenv("DATA_DIR") or os.getenv("FORUMKIT_DATA_DIR")

if DEFAULT_CONFIG_DIR:
    DATA_DIR = Path(DEFAULT_CONFIG_DIR)
else:
    current_dir = Path(__file__).parent.parent
    DATA_DIR = current_dir / "data"

try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except PermissionError:
    import tempfile
    DATA_DIR = Path(tempfile.gettempdir()) / "forumkit_data"
    DATA_DIR.mkdir(exist_ok=True)
    print(f"Warning: Using temporary directory for config: {DATA_DIR}")

CONFIG_PATH = DATA_DIR / "config.json"

DEFAULT_DATA: Dict[str, Any] = {
    "mode": os.getenv("APP_MODE", "normal"),
    "maintenance_message": "",
    "maintenance_until": "",
    "login_mode": "admin_only",
    "enforce_min_post_chars": True,
    "min_post_chars": int(os.getenv("MIN_POST_CHARS", "15")),
    "email_blacklist": [],
    "suspended_users": [],
}


def load_config() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
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
    changed = False
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
    
    if maintenance_message is not None:
        if isinstance(maintenance_message, str):
            data["maintenance_message"] = maintenance_message.strip() if maintenance_message.strip() else ""
        else:
            data["maintenance_message"] = ""
    elif mode == "maintenance" and not data.get("maintenance_message"):
        data["maintenance_message"] = ""
    
    if maintenance_until is not None:
        if isinstance(maintenance_until, str):
            data["maintenance_until"] = maintenance_until.strip() if maintenance_until.strip() else ""
        else:
            data["maintenance_until"] = ""
    elif mode == "maintenance" and not data.get("maintenance_until"):
        data["maintenance_until"] = ""
    
    save_config(data)
    return data
