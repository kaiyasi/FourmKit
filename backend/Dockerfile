FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev netcat-traditional && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 啟兩個進程：gunicorn(app) + heartbeat(socket)
CMD sh -c "python heartbeat.py & \
           gunicorn -k eventlet -w 1 -b 0.0.0.0:80 'app:create_app()'"
