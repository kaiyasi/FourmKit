#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/data/logs"
mkdir -p "$LOG_DIR"

HOST="127.0.0.1"
PORT="18080"
JOB_ID="acc-$(date +%s)"

(
  PORT="$PORT" python -m forumkit.server
) &
SERVER_PID=$!
sleep 0.5

cleanup() {
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

python -m forumkit.pipeline \
  --caption "Acceptance 測試" \
  --image-url "https://example.com/image.jpg" \
  --job-id "$JOB_ID" \
  --event-host "$HOST" \
  --event-port "$PORT" \
  --dry-run >/dev/null

LOG_FILE="$LOG_DIR/${JOB_ID}.jsonl"
if ! grep -q '"stage": "pipeline", "status": "done"' "$LOG_FILE"; then
  echo "[ACC] 流程未完成：$LOG_FILE"
  exit 1
fi

echo "[ACC] 驗收通過：$LOG_FILE"

