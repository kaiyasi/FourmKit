#!/usr/bin/env bash
# 服務狀態檢查（含 API /api/healthz）
set -euo pipefail

API="${API_ENDPOINT:-http://localhost:12005/api}"

echo "🌐 API: $API"

echo "🔎 docker compose 狀態"
docker compose ps || true

echo "🩺 /healthz 回應"
curl -fsS "$API/healthz" | jq . || {
  echo "❌ 無法取得健康檢查回應"
  exit 1
}

echo "✅ 檢查完成"

