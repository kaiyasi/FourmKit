"""
Module: backend/utils/redis_health.py
Unified comment style: module docstring + minimal inline notes.
"""
from __future__ import annotations
import os
import socket
from urllib.parse import urlparse


def _default_url() -> str:
    return os.getenv("REDIS_URL", "redis://127.0.0.1:12008/0").strip()


def _mask_url(url: str) -> str:
    try:
        p = urlparse(url)
        if p.username or p.password:
            auth = p.username or ""
            masked = f"{auth}:***" if p.password else auth
            netloc = p.hostname or "localhost"
            if p.port:
                netloc += f":{p.port}"
            if masked:
                netloc = f"{masked}@{netloc}"
            return f"{p.scheme}://{netloc}{p.path or ''}"
        return url
    except Exception:
        return url


def get_redis_health() -> dict:
    """
    以最小 RESP 協議透過 TCP 送出 PING，避免相依外部套件。
    回傳 { ok, url(遮蔽密碼), error? }
    """
    raw = _default_url()
    try:
        p = urlparse(raw if "://" in raw else f"redis://{raw}")
        host = p.hostname or "127.0.0.1"
        port = int(p.port or 6379)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.5)
        try:
            s.connect((host, port))
            s.sendall(b"*1\r\n$4\r\nPING\r\n")
            data = s.recv(64)
            ok = data.startswith(b"+PONG")
            return {"ok": ok, "url": _mask_url(raw), **({"error": data.decode(errors="ignore").strip()} if not ok else {})}
        finally:
            try:
                s.close()
            except Exception:
                pass
    except Exception as e:
        return {"ok": False, "url": _mask_url(raw), "error": str(e)}

