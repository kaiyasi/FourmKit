#!/usr/bin/env bash
# 上線後維護重啟：保留資料卷，重建映像與前端資產，套用遷移並健康檢查
set -euo pipefail

echo "🔄 ForumKit | 維護重啟 (PROD)"

# 1) 可選：重新建置前端（若前端由 Nginx 提供靜態檔）
if [ -f frontend/package.json ]; then
  echo "🧱 建置前端 ..."
  (cd frontend && npm ci && npm run build)
fi

# 2) 重新建置並啟動容器（保留資料卷）
echo "🐳 重建映像並啟動 ..."
docker compose up -d --build

echo "⏳ 等待服務啟動 ..."
# 等待 backend 服務就緒（最長 ~60s）
for i in $(seq 1 30); do
  if docker compose ps backend 2>/dev/null | grep -Eiq "\b(Up|running)\b"; then
    echo "✅ backend 已啟動"
    break
  fi
  printf "."; sleep 2
done

# 3) DB 遷移
echo "🗄️ 執行 Alembic 遷移 ..."
if docker compose exec -T backend true 2>/dev/null; then
  docker compose exec -T backend alembic upgrade head
else
  echo "ℹ️ backend 未在執行中，改以 one-off 容器進行遷移"
  docker compose run --rm backend alembic upgrade head
fi

# 4) 健康檢查
echo "🩺 健康檢查 ..."
curl -fsS http://localhost:12005/api/healthz | jq . || true

echo "📊 服務狀態："
docker compose ps

echo "✅ 完成"
