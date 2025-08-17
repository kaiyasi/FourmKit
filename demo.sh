#!/usr/bin/env bash
set -euo pipefail

# 1) 前端建置
( cd frontend && npm ci && npm run build )

# 2) 起容器
docker-compose up -d --build

# 3) 健康檢查
curl -sf http://localhost:12005/api/healthz || { echo "backend not healthy"; exit 1; }

# 4) 建帳號 + 取得 JWT（請確保後端已有這些路由）
curl -sS -X POST http://localhost:12005/api/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"u1","email":"u1@dev.local","password":"pass1234"}' >/dev/null || true

TOKEN=$(curl -sS -X POST http://localhost:12005/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"u1@dev.local","password":"pass1234"}' | jq -r .access_token)

# 5) 上傳一張假圖測試
python3 - <<'PY'
import io, requests
from PIL import Image
im = Image.new("RGB",(800,600),(200,30,30))
buf = io.BytesIO(); im.save(buf, format="JPEG"); buf.seek(0)
import os
token=os.environ.get("TOKEN")
files = {"files": ("demo.jpg", buf, "image/jpeg")}
data = {"title":"Day8 Demo","content":"hello"}
r = requests.post("http://localhost:12005/api/posts/with-media", data=data, files=files, headers={"Authorization": f"Bearer {token}"})
print(r.status_code, r.text)
PY
