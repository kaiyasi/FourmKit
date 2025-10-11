"""
Module: backend/infra/heartbeat_server.py
Unified comment style: module docstring + minimal inline notes.
"""
import socket
import threading

def start_heartbeat_server(host="0.0.0.0", port=12007):
    """
    啟動原生 socket 心跳服務
    如果端口被佔用，嘗試其他端口或跳過啟動
    """
    max_retries = 10
    original_port = port
    
    for attempt in range(max_retries):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            s.listen(5)
            
            def serve():
                while True:
                    try:
                        conn, addr = s.accept()
                        try:
                            data = conn.recv(64)
                            if data.strip() == b"ping":
                                conn.sendall(b"pong")
                            else:
                                conn.sendall(b"nope")
                        finally:
                            conn.close()
                    except Exception as e:
                        print(f"[heartbeat] connection error: {e}")
                        
            th = threading.Thread(target=serve, daemon=True)
            th.start()
            print(f"[heartbeat] started on {host}:{port}")
            return
            
        except OSError as e:
            if e.errno == 98:
                port += 1
                print(f"[heartbeat] port {port-1} in use, trying {port}")
                continue
            else:
                print(f"[heartbeat] socket error: {e}")
                break
        except Exception as e:
            print(f"[heartbeat] unexpected error: {e}")
            break
    
    print(f"[heartbeat] failed to start after {max_retries} attempts (tried ports {original_port}-{port-1})")
