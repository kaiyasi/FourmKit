import os
import socket
import threading
import json
import pathlib
import time


DATA_DIR = pathlib.Path(os.environ.get("DATA_DIR", "data/logs"))
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _handle_client(conn: socket.socket, addr):
    buffer = b""
    try:
        conn.settimeout(300)
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                break
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                if not line.strip():
                    continue
                try:
                    event = json.loads(line.decode("utf-8"))
                except Exception:
                    continue
                _persist_event(event)
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _persist_event(event: dict):
    job_id = str(event.get("job_id", "unknown"))
    filepath = DATA_DIR / f"{job_id}.jsonl"
    # Avoid writing secrets to logs
    event_sanitized = dict(event)
    for key in list(event_sanitized.keys()):
        if "token" in key.lower():
            event_sanitized[key] = "***REDACTED***"
    event_sanitized["ts"] = time.time()
    with filepath.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event_sanitized, ensure_ascii=False) + "\n")


def run_server(host: str = None, port: int = None):
    host = host or os.environ.get("BIND_HOST", "0.0.0.0")
    port = int(port or os.environ.get("PORT", 80))

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((host, port))
    srv.listen(64)

    print(f"[forumkit] Socket server listening on {host}:{port}")
    try:
        while True:
            conn, addr = srv.accept()
            t = threading.Thread(target=_handle_client, args=(conn, addr), daemon=True)
            t.start()
    except KeyboardInterrupt:
        print("\n[forumkit] Shutting down...")
    finally:
        try:
            srv.close()
        except Exception:
            pass


if __name__ == "__main__":
    run_server()

