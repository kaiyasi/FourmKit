import socket
import json


def send_event(host: str, port: int, event: dict, timeout: float = 5.0):
    payload = (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8")
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect((host, int(port)))
        sock.sendall(payload)
    finally:
        try:
            sock.close()
        except Exception:
            pass

