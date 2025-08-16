import socket
import threading

def start_heartbeat_server(host="0.0.0.0", port=9101):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind((host, port))
    s.listen(5)
    def serve():
        while True:
            conn, addr = s.accept()
            try:
                data = conn.recv(64)
                if data.strip() == b"ping":
                    conn.sendall(b"pong")
                else:
                    conn.sendall(b"nope")
            finally:
                conn.close()
    th = threading.Thread(target=serve, daemon=True)
    th.start()
