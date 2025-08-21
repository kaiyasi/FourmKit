#!/usr/bin/env bash
# 全平台重建（開發用）：清空容器與資料卷、重建前端、重建並啟動所有服務
set -euo pipefail

echo "🔁 ForumKit | 全平台重建 (DEV)"

# 1) 停服務並清資料卷
echo "📦 停止並清除 docker compose（含資料卷）..."
docker compose down -v || true

# 2) 清理前端產物（可選）
if [ -d frontend ]; then
  echo "🧹 清理前端產物 ..."
  rm -rf frontend/dist || true
  # 如需重新安裝相依，可解除下一行註解
  # rm -rf frontend/node_modules || true
fi

# 3) 重新建置前端（如你在容器外部署前端資產）
if [ -f frontend/package.json ]; then
  echo "🧱 建置前端 ..."
  (cd frontend && npm ci && npm run build)
fi

# 4) 啟動服務
echo "🐳 啟動 Docker 服務（build + up） ..."
docker compose up -d --build

echo "⏳ 等待服務啟動 ..."
# 等待 backend 服務就緒（最長 ~60s）
for i in $(seq 1 30); do
  # 服務存在且狀態為 Up/running 即通過
  if docker compose ps backend 2>/dev/null | grep -Eiq "\b(Up|running)\b"; then
    echo "✅ backend 已啟動"
    break
  fi
  printf "."; sleep 2
  if [ "$i" = "30" ]; then
    echo "\n❌ backend 尚未啟動，嘗試直接以 run 遷移"
  fi
done

# 5) DB 遷移
echo "🗄️ 執行 Alembic 遷移 ..."
# 優先以 exec（後台服務中）執行，若服務未啟動則退回 run --rm
if docker compose exec -T backend true 2>/dev/null; then
  docker compose exec -T backend alembic upgrade head
else
  echo "ℹ️ backend 未在執行中，改以 one-off 容器進行遷移"
  docker compose run --rm backend alembic upgrade head
fi

# 6) 確保最高管理員（僅在未啟用單一管理者模式時提供，避免誤覆寫）
if [ "${ENFORCE_SINGLE_ADMIN:-1}" = "0" ]; then
  echo "👑 建立/提升總管理員（dev_admin） ..."
  docker compose exec -T backend python manage.py create-superadmin "${ADMIN_USER:-Kaiyasi}" "${ADMIN_PASS:-change-me}"
else
  echo "🔒 單一管理者模式啟用：略過本地播種帳號"
fi

# 7) 健康檢查
echo "🩺 健康檢查 ..."
curl -fsS http://localhost:12005/api/healthz | jq . || true

echo "📊 服務狀態："
docker compose ps

echo "✅ 完成"
