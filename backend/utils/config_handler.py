import json
from pathlib import Path
from typing import Any, Dict

CONFIG_PATH = Path(__file__).resolve().parent.parent / 'config.json'

DEFAULT_DATA: Dict[str, Any] = {
    "mode": "normal",  # normal | maintenance | development
    "maintenance_message": "",
    "maintenance_until": "",  # ISO datetime string
}


def load_config() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
        save_config(DEFAULT_DATA)
    try:
        with CONFIG_PATH.open('r', encoding='utf-8') as f:
            data = json.load(f)
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
    with CONFIG_PATH.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def set_mode(mode: str, maintenance_message: str | None = None, maintenance_until: str | None = None) -> Dict[str, Any]:
    data = load_config()
    data['mode'] = mode
    if maintenance_message is not None:
        data['maintenance_message'] = maintenance_message
    if maintenance_until is not None:
        data['maintenance_until'] = maintenance_until
    save_config(data)
    return data
