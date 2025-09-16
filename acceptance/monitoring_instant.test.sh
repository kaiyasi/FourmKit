#!/usr/bin/env bash
set -euo pipefail

# Acceptance test: instant monitoring returns queue health and recent events
# Usage: HOST_PORT=12005 TOKEN=... ./acceptance/monitoring_instant.test.sh

BASE_URL="${BASE_URL:-http://localhost:${HOST_PORT:-8080}}"
: "${TOKEN:?TOKEN env required (JWT)}"

resp=$(curl -s "$BASE_URL/api/admin/social/monitoring" -H "Authorization: Bearer $TOKEN")
echo "$resp" | jq . >/dev/null 2>&1 || { echo "FAIL: non-JSON"; exit 1; }

ok=$(echo "$resp" | jq -r .success)
[[ "$ok" == "true" ]] || { echo "FAIL: success=false"; echo "$resp"; exit 1; }

queue_ts=$(echo "$resp" | jq -r .monitoring.queue.ts)
events_len=$(echo "$resp" | jq -r '.monitoring.recent_events | length')

[[ -n "$queue_ts" && "$queue_ts" != "null" ]] || { echo "FAIL: missing queue.ts"; exit 1; }
[[ "$events_len" =~ ^[0-9]+$ ]] || { echo "FAIL: recent_events length invalid"; exit 1; }

echo "PASS: monitoring endpoint has queue health + ${events_len} recent events"

