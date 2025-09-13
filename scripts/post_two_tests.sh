#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/data/logs"
mkdir -p "$LOG_DIR"

HOST="127.0.0.1"
PORT="18081"
TS=$(date +%s)

(
  PORT="$PORT" python -m forumkit.server
) &
SERVER_PID=$!
sleep 0.5

cleanup() {
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

JOB1="nhsh-test-1-$TS"
JOB2="nhsh-test-2-$TS"

echo "[two-tests] 發第一篇 nhsh 測試（乾跑）"
python -m forumkit.page_poster \
  --message "nhsh 測試貼文一（dry-run）" \
  --job-id "$JOB1" \
  --event-host "$HOST" \
  --event-port "$PORT" \
  --dry-run >/dev/null

echo "[two-tests] 發第二篇 nhsh 測試（乾跑）"
python -m forumkit.page_poster \
  --message "nhsh 測試貼文二（dry-run）" \
  --job-id "$JOB2" \
  --event-host "$HOST" \
  --event-port "$PORT" \
  --dry-run >/dev/null

echo "[two-tests] 檢查是否具備 IG 轉貼需求（需 image_url 才能轉 IG）"
echo "  Job1 Log: $LOG_DIR/${JOB1}.jsonl"
echo "  Job2 Log: $LOG_DIR/${JOB2}.jsonl"

grep '"stage": "page_post", "status": "completed"' "$LOG_DIR/${JOB1}.jsonl" >/dev/null && echo "[ok] JOB1 完成 Page 發佈（dry-run）"
grep '"stage": "page_post", "status": "completed"' "$LOG_DIR/${JOB2}.jsonl" >/dev/null && echo "[ok] JOB2 完成 Page 發佈（dry-run）"

echo "[two-tests] 若要轉 IG：
python -m forumkit.page_poster \
  --message 'nhsh 測試轉 IG' \
  --job-id 'nhsh-ig-$TS' \
  --event-host $HOST --event-port $PORT \
  --page-id <PAGE_ID> --access-token <TOKEN> \
  --convert-to-ig --ig-user-id <IG_USER_ID> --image-url <IMAGE_URL>"

