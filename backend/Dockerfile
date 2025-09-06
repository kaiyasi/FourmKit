FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev netcat-traditional \
    libmagic1 fonts-noto-cjk fonts-dejavu-core \
    # Playwright/Chromium runtime deps
    libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libatspi2.0-0 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libdrm2 libexpat1 \
    libxcb1 libx11-6 libxext6 ca-certificates \
    && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 啟兩個進程：gunicorn(app) + heartbeat(socket)
## 安裝 Playwright 瀏覽器（若未使用 HTML→PNG 可略過）
RUN python -m playwright install --with-deps chromium || true

CMD sh -c "python heartbeat.py & \
           gunicorn -k eventlet -w 1 -b 0.0.0.0:80 'app:create_app()'"
