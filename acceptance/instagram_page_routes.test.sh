#!/usr/bin/env bash
set -euo pipefail

# Simple acceptance checks for instagram_page routes
# - Verifies /api/instagram_page/help/page_id returns 200 with success
# - Verifies POST /api/instagram_page/accounts/create_with_page is not 404 (likely 401/403 without token)

BASE_URL="${BASE_URL:-http://localhost:${HOST_PORT:-8080}}"

echo "[Check] GET /api/instagram_page/help/page_id"
code=$(curl -s -o /tmp/ig_help.json -w "%{http_code}" "$BASE_URL/api/instagram_page/help/page_id") || code=$?
if [[ "$code" != "200" ]]; then
  echo "FAIL: Expected 200, got $code"
  cat /tmp/ig_help.json || true
  exit 1
fi
if ! grep -q '"success": true' /tmp/ig_help.json; then
  echo "FAIL: Response did not contain success:true"
  cat /tmp/ig_help.json || true
  exit 1
fi
echo "PASS: help endpoint OK"

echo "[Check] POST /api/instagram_page/accounts/create_with_page (no auth)"
code=$(curl -s -o /tmp/ig_create.json -w "%{http_code}" \
  -X POST "$BASE_URL/api/instagram_page/accounts/create_with_page" \
  -H 'Content-Type: application/json' \
  --data '{"display_name":"t","page_id":"123456789012345"}') || code=$?

if [[ "$code" == "404" ]]; then
  echo "FAIL: create_with_page returned 404 (route missing)"
  cat /tmp/ig_create.json || true
  exit 1
fi
echo "PASS: create_with_page not 404 (got HTTP $code as expected without auth)"

echo "All checks passed."

