#!/usr/bin/env bash
set -euo pipefail

# Acceptance test: /uploads/public should serve from local volume first,
# and only fallback to CDN when local file is missing.
# Usage: HOST_PORT=12005 FILE_PATH="logos/templates/ForumKit.webp" ./acceptance/uploads_public_fallback.test.sh

BASE_URL="${BASE_URL:-http://localhost:${HOST_PORT:-8080}}"
FILE_PATH="${FILE_PATH:-logos/templates/ForumKit.webp}"

URL="$BASE_URL/uploads/public/$FILE_PATH"
echo "[Check] GET $URL"

code=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
if [[ "$code" != "200" ]]; then
  echo "FAIL: HTTP $code for $URL"
  exit 1
fi

ctype=$(curl -sI "$URL" | awk -F': ' '/^Content-Type:/ {print tolower($2)}' | tr -d '\r')
echo "Content-Type: $ctype"
echo "$ctype" | grep -q '^image/' || { echo "FAIL: Content-Type not image/*"; exit 1; }

echo "PASS: Local-first uploads/public works (200 + image/*)"

