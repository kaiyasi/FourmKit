#!/usr/bin/env bash
set -euo pipefail

# Acceptance test: template preview returns an image URL and the URL is loadable as image/*
# Usage: HOST_PORT=12005 TOKEN=... TEMPLATE_ID=123 ./acceptance/template_preview.test.sh

BASE_URL="${BASE_URL:-http://localhost:${HOST_PORT:-8080}}"
: "${TOKEN:?TOKEN env required (JWT)}"
: "${TEMPLATE_ID:?TEMPLATE_ID env required}"

echo "[Check] POST /api/admin/social/templates/preview"
resp=$(curl -s -X POST "$BASE_URL/api/admin/social/templates/preview" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data "{\"template_id\": $TEMPLATE_ID, \"content_data\": {\"title\":\"t\",\"content\":\"c\",\"author\":\"a\"}}")

echo "$resp" | jq . >/dev/null 2>&1 || { echo "FAIL: non-JSON response"; echo "$resp"; exit 1; }
ok=$(echo "$resp" | jq -r .success)
[[ "$ok" == "true" ]] || { echo "FAIL: success=false"; echo "$resp"; exit 1; }

url=$(echo "$resp" | jq -r .preview.image_url)
[[ -n "$url" && "$url" != "null" ]] || { echo "FAIL: preview.image_url missing"; echo "$resp"; exit 1; }
echo "Got image_url: $url"

ctype=$(curl -sI "$url" | awk -F': ' '/^Content-Type:/ {print tolower($2)}' | tr -d '\r')
echo "Content-Type: $ctype"
echo "$ctype" | grep -q '^image/' || { echo "FAIL: Content-Type not image/*"; exit 1; }

echo "PASS: Template preview image is reachable and typed image/*"

