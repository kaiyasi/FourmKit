#!/usr/bin/env bash
set -euo pipefail

# Acceptance test: uploading a template logo returns direct CDN URL
# Usage: HOST_PORT=12005 TOKEN=... ./acceptance/template_logo_cdn.test.sh

BASE_URL="${BASE_URL:-http://localhost:${HOST_PORT:-8080}}"
: "${TOKEN:?TOKEN env required (JWT)}"

# Use an existing small image as payload
IMG_PATH="${IMG_PATH:-ForumKit.png}"
[ -f "$IMG_PATH" ] || { echo "Image not found: $IMG_PATH"; exit 1; }

echo "[Check] POST /api/media/upload (category=templates)"
boundary="----WebKitFormBoundary$(date +%s)$$"

resp=$(curl -s -X POST "$BASE_URL/api/media/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@$IMG_PATH;type=image/png" \
  -F "name=$(basename "$IMG_PATH")" \
  -F "hash=logo_test_$(date +%s)" \
  -F "category=templates" \
  -F "identifier=AcceptanceLogo")

echo "$resp" | jq . >/dev/null 2>&1 || { echo "FAIL: non-JSON response"; echo "$resp"; exit 1; }
ok=$(echo "$resp" | jq -r .ok)
[[ "$ok" == "true" ]] || { echo "FAIL: ok=false"; echo "$resp"; exit 1; }

url=$(echo "$resp" | jq -r .url)
[[ -n "$url" && "$url" != "null" ]] || { echo "FAIL: url missing"; echo "$resp"; exit 1; }
echo "Got URL: $url"

# Require CDN style URL
cdn_base="${PUBLIC_CDN_URL:-https://cdn.serelix.xyz}"
echo "$url" | grep -q "^$cdn_base" || { echo "FAIL: URL not from CDN ($cdn_base)"; exit 1; }

# Fetch and verify content-type
ctype=$(curl -sI "$url" | awk -F': ' '/^Content-Type:/ {print tolower($2)}' | tr -d '\r')
echo "Content-Type: $ctype"
echo "$ctype" | grep -q '^image/' || { echo "FAIL: Content-Type not image/*"; exit 1; }

echo "PASS: Template logo upload returns direct CDN URL and is reachable"

