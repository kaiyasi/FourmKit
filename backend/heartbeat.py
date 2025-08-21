import socket, threading

def handle(conn: socket.socket):
    with conn:
        data = conn.recv(64)
        if data.strip().lower() == b"ping":
            conn.sendall(b"pong")

def serve(host="0.0.0.0", port=9101):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((host, port)); s.listen(16)
    while True:
        conn, _ = s.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()

if __name__ == "__main__":
    serve()
