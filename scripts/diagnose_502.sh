#!/usr/bin/env bash
# 502 快速診斷腳本：檢查容器狀態、API 健康、反代連線
set -euo pipefail

API="${API_ENDPOINT:-http://localhost:12005/api}"

echo "🩺 502 診斷開始"
echo "🌐 API: $API"

echo "\n🔎 docker compose 狀態"
docker compose ps || true

echo "\n🧪 直接從宿主呼叫 /healthz"
if ! curl -fsS "$API/healthz" | jq .; then
  echo "❌ 主機無法從 Nginx 取得健康回應（多半為 502/504）"
fi

echo "\n🧪 從 Nginx 容器內測試轉發到 backend"
if docker compose exec -T nginx sh -lc 'wget -qO- http://backend:80/api/healthz' 2>/dev/null | jq .; then
  echo "✅ Nginx → backend 連線正常"
else
  echo "❌ Nginx → backend 連不上（backend 可能未啟動/崩潰/名稱解析問題）"
fi

echo "\n🧪 從 backend 容器內自我連線測試"
docker compose exec -T backend python - <<'PY' || true
import json, sys
from urllib import request, error
try:
    with request.urlopen('http://127.0.0.1:80/api/healthz', timeout=4) as resp:
        print(json.dumps(json.loads(resp.read().decode('utf-8')), ensure_ascii=False, indent=2))
except Exception as e:
    print(f"backend self-check failed: {e}")
    sys.exit(1)
PY

echo "\n🧪 最近 200 行後端日誌"
docker compose logs --tail=200 backend || true

echo "\n💡 小抄：常見解法"
cat <<'TIPS'
- 服務未啟動：執行 `docker compose up -d --build` 或 `bash scripts/dev_full_rebuild.sh`
- DB 尚未就緒：稍等 5~10 秒或重跑 Alembic：
    docker compose exec -T backend alembic upgrade head \
    || docker compose run --rm backend alembic upgrade head
- 連線名稱錯誤：Nginx 需 proxy_pass 到 `http://backend:80`（已預設）
- Port 被占用：確認 12005/12007/12008 無被其他程式占用
- 後端啟動錯誤：檢視上方 backend 日誌最後錯誤訊息
TIPS

echo "\n✅ 診斷完成"

