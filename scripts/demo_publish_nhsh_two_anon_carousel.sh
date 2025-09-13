#!/usr/bin/env bash
set -euo pipefail

# 目標：用「平台流程」做一篇輪播（兩則匿名 -> 審核 -> 依模板製圖 -> 合併發布為一篇輪播）
# 需求：後端堆疊已啟動（docker compose up），且可從 BASE_URL 存取。

BASE_URL="${BASE_URL:-http://localhost:12005}"
ADMIN_USER="${ADMIN_USER:-${SINGLE_ADMIN_USERNAME:-admin}}"
ADMIN_PASS="${ADMIN_PASS:-${SINGLE_ADMIN_PASSWORD:-admin12345}}"

ANON_USER="${ANON_USER:-anon_nhsh}"
ANON_MAIL="${ANON_MAIL:-anon_nhsh@example.com}"
ANON_PASS="${ANON_PASS:-anon12345}"
SCHOOL_SLUG="${SCHOOL_SLUG:-nhsh}"

say() { echo -e "[nhsh-carousel] $*" >&2; }
fail() { echo -e "[nhsh-carousel][ERROR] $*" >&2; exit 1; }

require() { command -v "$1" >/dev/null 2>&1 || fail "需要指令 '$1'"; }
require curl

JQ_BIN="jq"
if ! command -v jq >/dev/null 2>&1; then
  say "找不到 jq，用內建 python 解析 JSON"
  JQ_BIN="python3 -c"
fi

parse_json() {
  local json="$1" expr="$2"
  if [ "$JQ_BIN" = jq ]; then
    echo "$json" | jq -r "$expr"
  else
    python3 - <<PY
import sys, json
data=json.loads(sys.stdin.read())
def get(d, path):
    cur=d
    for part in path.strip('.').split('.'):
        if not part: continue
        if '[' in part:
            name, idx = part.rstrip(']').split('[')
            cur = cur.get(name, []) if isinstance(cur, dict) else []
            cur = cur[int(idx)] if isinstance(cur, list) and len(cur)>int(idx) else None
        else:
            cur = cur.get(part) if isinstance(cur, dict) else None
        if cur is None: return None
    return cur
expr = "$expr"
val = get(data, expr)
print(val if val is not None else "")
PY
  fi
}

api_login() {
  curl -sS -X POST "$BASE_URL/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}"
}

ensure_school() {
  say "檢查學校：$SCHOOL_SLUG"
  local L=$(curl -sS "$BASE_URL/api/schools")
  local found=$(echo "$L" | { $JQ_BIN '.items[]? | select(.slug=="'$SCHOOL_SLUG'") | .id' || true; })
  if [ -z "$found" ]; then
    say "建立學校：$SCHOOL_SLUG"
    local login_admin=$(api_login "$ADMIN_USER" "$ADMIN_PASS")
    local token=$(parse_json "$login_admin" '.access_token')
    [ -n "$token" ] || fail "登入管理員失敗：$login_admin"
    local hdr=( -H "Authorization: Bearer $token" )
    local create=$(curl -sS -X POST "$BASE_URL/api/schools" "${hdr[@]}" -H 'Content-Type: application/json' \
       -d "{\"slug\":\"$SCHOOL_SLUG\",\"name\":\"內湖高中\"}")
    echo "$create" | grep -q 'ok' || fail "建立學校失敗：$create"
  fi
}

ensure_anon_user() {
  say "檢查/建立匿名用戶：$ANON_USER"
  local login_admin=$(api_login "$ADMIN_USER" "$ADMIN_PASS")
  local token=$(parse_json "$login_admin" '.access_token')
  [ -n "$token" ] || fail "登入管理員失敗：$login_admin"
  local hdr=( -H "Authorization: Bearer $token" )
  local res=$(curl -sS -X POST "$BASE_URL/api/admin/users" "${hdr[@]}" -H 'Content-Type: application/json' -d @- <<JSON || true
{ "username": "$ANON_USER", "email": "$ANON_MAIL", "password": "$ANON_PASS", "role": "user", "school_slug": "$SCHOOL_SLUG" }
JSON
  )
  say "用戶建立回應（可忽略衝突）：$res"
}

ensure_ig_account_and_template_batch2() {
  say "設定 IG 帳號為 batch_count=2，模板預設 combined"
  local login_admin=$(api_login "$ADMIN_USER" "$ADMIN_PASS")
  local token=$(parse_json "$login_admin" '.access_token')
  [ -n "$token" ] || fail "登入管理員失敗：$login_admin"
  local hdr=( -H "Authorization: Bearer $token" )
  local accs=$(curl -sS "$BASE_URL/api/admin/social/accounts" "${hdr[@]}")
  local acc_id=$(echo "$accs" | { $JQ_BIN -r '(.accounts[]? | select(.school.slug=="'$SCHOOL_SLUG'")) // (.accounts[]? | select(.school==null)) | .id' || true; })
  [ -n "$acc_id" ] || fail "找不到 IG 帳號，請先在後台新增"
  say "使用 IG 帳號 id=$acc_id"
  curl -sS -X PUT "$BASE_URL/api/admin/social/accounts/$acc_id/settings" "${hdr[@]}" -H 'Content-Type: application/json' \
    -d '{"publish_trigger":"batch_count","batch_size":2}' >/dev/null || true
  # 檢查模板
  local tpls=$(curl -sS "$BASE_URL/api/admin/social/templates?account_id=$acc_id" "${hdr[@]}")
  local tcnt=$(parse_json "$tpls" '.templates|length')
  if [ "${tcnt:-0}" -eq 0 ]; then
    curl -sS -X POST "$BASE_URL/api/admin/social/templates" "${hdr[@]}" -H 'Content-Type: application/json' -d @- >/dev/null <<JSON
{ "account_id": $acc_id, "name": "NHSH Combined", "description": "Auto-created by nhsh carousel demo", "template_type": "combined", "is_default": true, "config": {"image": {"width":1080,"height":1080, "background": {"value":"#ffffff"}, "text": {"font":"default","size":32,"lineSpacing":10,"maxLines":8}, "padding":60}, "caption": {"template": "{content}\n\n{hashtags}", "max_length": 2200}, "hashtags": []}}
JSON
  fi
  echo "$acc_id"
}

create_two_posts() {
  local login_anon=$(api_login "$ANON_USER" "$ANON_PASS")
  local token=$(parse_json "$login_anon" '.access_token')
  [ -n "$token" ] || fail "匿名用戶登入失敗：$login_anon"
  local hdr=( -H "Authorization: Bearer $token" )
  local cid="anon-client-$(date +%s)"
  local p1=$(curl -sS -X POST "$BASE_URL/api/posts/create" "${hdr[@]}" -H 'Content-Type: application/json' -H "X-Client-Id: $cid" -d @- <<JSON)
{ "content": "測試貼文1（nhsh 匿名）", "school_slug": "${SCHOOL_SLUG}" }
JSON
  local id1=$(parse_json "$p1" '.data.id')
  [ -n "$id1" ] || fail "建立貼文1失敗：$p1"
  local p2=$(curl -sS -X POST "$BASE_URL/api/posts/create" "${hdr[@]}" -H 'Content-Type: application/json' -H "X-Client-Id: $cid" -d @- <<JSON)
{ "content": "測試貼文2（nhsh 匿名）", "school_slug": "${SCHOOL_SLUG}" }
JSON
  local id2=$(parse_json "$p2" '.data.id')
  [ -n "$id2" ] || fail "建立貼文2失敗：$p2"
  echo "$id1 $id2"
}

approve_and_wait_carousel() {
  local acc_id="$1" p1="$2" p2="$3"
  local login_admin=$(api_login "$ADMIN_USER" "$ADMIN_PASS")
  local token=$(parse_json "$login_admin" '.access_token')
  [ -n "$token" ] || fail "登入管理員失敗：$login_admin"
  local hdr=( -H "Authorization: Bearer $token" )
  say "核准兩則貼文（觸發批次輪播）: $p1 / $p2"
  curl -sS -X POST "$BASE_URL/api/moderation/post/$p1/approve" "${hdr[@]}" >/dev/null || true
  curl -sS -X POST "$BASE_URL/api/moderation/post/$p2/approve" "${hdr[@]}" >/dev/null || true
  say "等待輪播發布（最多 2 分鐘）..."
  for i in $(seq 1 24); do
    sleep 5
    # 嘗試查詢已發布社交貼文，期望至少 1 則（輪播）
    local posts=$(curl -sS "$BASE_URL/api/admin/social/posts?status=published&account_id=$acc_id" "${hdr[@]}" || true)
    local total=$(parse_json "$posts" '.data.total')
    say "檢查[$i] 已發布總數: ${total:-0}"
    if [ "${total:-0}" -ge 1 ]; then
      echo "$posts"
      return 0
    fi
  done
  return 2
}

main() {
  ensure_school
  ensure_anon_user
  acc_id=$(ensure_ig_account_and_template_batch2)
  ids=$(create_two_posts)
  p1=$(echo "$ids" | awk '{print $1}')
  p2=$(echo "$ids" | awk '{print $2}')
  approve_and_wait_carousel "$acc_id" "$p1" "$p2" || fail "未在時間內觀察到已發布輪播（請查 Worker/權限/模板）"
  say "✅ 已完成：平台流程（發文→審核→模板→合併輪播發布）"
}

main "$@"

