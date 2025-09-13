# Instagram Post System Dockerfile
# 基於 Python 3.12+ 構建，符合專案規範

FROM python:3.12-slim

# 設定工作目錄
WORKDIR /app

# 設定環境變數
ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

# 安裝系統依賴
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 複製需求檔案
COPY requirements.txt .

# 安裝 Python 依賴
RUN pip install --no-cache-dir -r requirements.txt

# 複製應用程式碼
COPY src/ ./src/
COPY config/ ./config/

# 建立日誌目錄
RUN mkdir -p /app/logs

# 暴露 port 80 (內部統一使用 port 80，對外由 docker-compose 映射)
EXPOSE 80

# 健康檢查：以 TCP 連線檢查 Socket 服務（容器內部統一使用 80）
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python - <<'PY' || exit 1
import socket
s=socket.socket()
s.settimeout(5)
try:
    s.connect(("127.0.0.1", 80))
    s.close()
    raise SystemExit(0)
except Exception:
    raise SystemExit(1)
PY

# 預設啟動命令
CMD ["python", "src/post_server.py", "--host", "0.0.0.0", "--port", "80"]
