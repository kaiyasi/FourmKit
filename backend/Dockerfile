# backend/Dockerfile
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# ★ 重要：加裝 CA 憑證和 PostgreSQL 開發工具
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        tzdata \
        libpq-dev \
        build-essential \
        && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先裝 gunicorn（容器快取較好用）
RUN pip install --no-cache-dir gunicorn

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製應用代碼和配置文件
COPY . .

# 立即設置所有檔案的權限
RUN chmod -R 644 /app/*.py 2>/dev/null || echo "Warning: Could not set permissions on Python files"
RUN chmod 644 /app/app.py 2>/dev/null || echo "Warning: Could not set permission on app.py"
RUN ls -la /app/app.py 2>/dev/null || echo "Could not list app.py permissions"

# 確保 CHANGELOG.txt 存在並設置正確權限
RUN if [ -f "CHANGELOG.txt" ]; then \
        chmod 644 CHANGELOG.txt && \
        echo "CHANGELOG.txt permissions set to 644"; \
    else \
        echo "Warning: CHANGELOG.txt not found in build context"; \
    fi

# 暫時移除非 root 用戶設定以避免權限問題
# RUN groupadd -r forumkit && useradd -r -g forumkit forumkit || true
# RUN chown -R forumkit:forumkit /app || echo "Warning: Could not change ownership"

# eventlet worker 支援 Flask-SocketIO
CMD ["gunicorn", "-k", "eventlet", "-w", "1", "-b", "0.0.0.0:8000", "app:app"]
