#!/usr/bin/env bash
set -euo pipefail

# 目標：建立「內湖高中 (nhsh)」兩則匿名貼文（測試貼文1、測試貼文2），核准，並追蹤 IG 發布
# 需求：
# - 服務已啟動：backend、celery、celery-beat、redis、postgres、nginx
# - 已存在一個 Instagram SocialAccount（綁 nhsh 或全域均可），且有預設模板（若無，腳本會幫你建立一個 combined 預設模板）

BASE_URL="${BASE_URL:-http://localhost:12005}"
ADMIN_USER="${ADMIN_USER:-${SINGLE_ADMIN_USERNAME:-admin}}"
ADMIN_PASS="${ADMIN_PASS:-${SINGLE_ADMIN_PASSWORD:-admin12345}}"

ANON_USER="${ANON_USER:-anon_nhsh}"
ANON_MAIL="${ANON_MAIL:-anon_nhsh@example.com}"
ANON_PASS="${ANON_PASS:-anon12345}"
SCHOOL_SLUG="${SCHOOL_SLUG:-nhsh}"

say() { echo -e "[nhsh-demo] $*" >&2; }
fail() { echo -e "[nhsh-demo][ERROR] $*" >&2; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "需要指令 '$1'，請先安裝"; }
require_cmd curl

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
        if '[' in part:
            name, idx = part.rstrip(']').split('[')
            cur = cur.get(name, [])
            cur = cur[int(idx)] if isinstance(cur, list) and len(cur)>int(idx) else None
        else:
            cur = cur.get(part) if isinstance(cur, dict) else None
        if cur is None:
            return None
    return cur
expr = "$expr"
val = get(data, expr)
print(val if val is not None else "")
PY
  fi
}

api_login() {
  local user="$1" pass="$2"
  curl -sS -X POST "$BASE_URL/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$user\",\"password\":\"$pass\"}"
}

ensure_school() {
  say "檢查學校是否存在：$SCHOOL_SLUG"
  local L=$(curl -sS "$BASE_URL/api/schools")
  local found=$(echo "$L" | { $JQ_BIN '.items[]? | select(.slug=="'$SCHOOL_SLUG'") | .id' || true; })
  if [ -z "$found" ]; then
    say "學校不存在，嘗試以開發者建立學校：$SCHOOL_SLUG"
    local login_admin=$(api_login "$ADMIN_USER" "$ADMIN_PASS")
    local token=$(parse_json "$login_admin" '.access_token')
    [ -n "$token" ] || fail "登入管理員失敗：$login_admin"
    local hdr=( -H "Authorization: Bearer $token" )
    local create=$(curl -sS -X POST "$BASE_URL/api/schools" "${hdr[@]}" -H 'Content-Type: application/json' \
       -d "{\"slug\":\"$SCHOOL_SLUG\",\"name\":\"內湖高中\"}")
    local ok=$(parse_json "$create" '.ok')
    [ "$ok" = "True" -o "$ok" = "true" ] || fail "建立學校失敗：$create"
    say "已建立學校 $SCHOOL_SLUG"
  else
    say "學校已存在 (id=$found)"
  fi
}

ensure_anon_user() {
  say "檢查/建立匿名用戶：$ANON_USER (綁定學校 $SCHOOL_SLUG)"
  local login_admin=$(api_login "$ADMIN_USER" "$ADMIN_PASS")
  local token=$(parse_json "$login_admin" '.access_token')
  [ -n "$token" ] || fail "登入管理員失敗：$login_admin"
  local hdr=( -H "Authorization: Bearer $token" )

  # 嘗試建立（若已存在會 409）
  local res=$(curl -sS -X POST "$BASE_URL/api/admin/users" "${hdr[@]}" -H 'Content-Type: application/json' -d @- <<JSON || true
{ "username": "$ANON_USER", "email": "$ANON_MAIL", "password": "$ANON_PASS", "role": "user", "school_slug": "$SCHOOL_SLUG" }
JSON
  )
  if echo "$res" | grep -q '已存在'; then
    say "匿名用戶已存在，略過建立"
  else
    say "建立匿名用戶回應：$res"
  fi
}

ensure_ig_account_and_template() {
  say "選擇 IG 帳號（優先綁 $SCHOOL_SLUG，其次全域）"
  local login_admin=$(api_login "$ADMIN_USER" "$ADMIN_PASS")
  local token=$(parse_json "$login_admin" '.access_token')
  [ -n "$token" ] || fail "登入管理員失敗：$login_admin"
  local hdr=( -H "Authorization: Bearer $token" )

  local accs=$(curl -sS "$BASE_URL/api/admin/social/accounts" "${hdr[@]}")
  local acc_id=$(echo "$accs" | { $JQ_BIN -r '(.accounts[]? | select(.school.slug=="'$SCHOOL_SLUG'")) // (.accounts[]? | select(.school==null)) | .id' || true; })
  [ -n "$acc_id" ] || fail "找不到綁 $SCHOOL_SLUG 或全域的 IG 帳號，請先在後台新增"
  say "使用 IG 帳號 id=$acc_id"

  say "將帳號發布策略設為 immediate（立即發布）"
  curl -sS -X PUT "$BASE_URL/api/admin/social/accounts/$acc_id/settings" "${hdr[@]}" -H 'Content-Type: application/json' -d '{"publish_trigger":"immediate"}' >/dev/null || true

  say "檢查預設模板，若無則建立 combined 預設"
  local tpls=$(curl -sS "$BASE_URL/api/admin/social/templates?account_id=$acc_id" "${hdr[@]}")
  local tcnt=$(parse_json "$tpls" '.templates|length')
  if [ "${tcnt:-0}" -eq 0 ]; then
    curl -sS -X POST "$BASE_URL/api/admin/social/templates" "${hdr[@]}" -H 'Content-Type: application/json' -d @- >/dev/null <<'JSON'
{
  "account_id": $acc_id,
  "name": "NHSH Combined",
  "description": "Auto-created by nhsh demo",
  "template_type": "combined",
  "is_default": true,
  "config": {
    "image": {"width":1080,"height":1080, "background": {"value":"#ffffff"}, "text": {"font":"default","size":32,"lineSpacing":10,"maxLines":8}, "padding":60},
    "caption": {"template": "{content}\n\n{hashtags}", "max_length": 2200},
    "hashtags": []
  }
}
JSON
    say "已建立預設模板"
  else
    say "已有 $tcnt 個模板，略過"
  fi

  echo "$acc_id"
}

create_two_posts_as_anon() {
  local login_anon=$(api_login "$ANON_USER" "$ANON_PASS")
  local token=$(parse_json "$login_anon" '.access_token')
  [ -n "$token" ] || fail "登入匿名用戶失敗：$login_anon"
  local hdr=( -H "Authorization: Bearer $token" )
  local cid="anon-client-$(date +%s)"

  say "建立貼文：測試貼文1"
  local p1=$(curl -sS -X POST "$BASE_URL/api/posts/create" "${hdr[@]}" -H 'Content-Type: application/json' -H "X-Client-Id: $cid" -d @- <<'JSON')
{ "content": "測試貼文1：這是一段用於 IG 發布流程驗證的內容，長度足夠通過最小字數。#ForumKit", "school_slug": "${SCHOOL_SLUG}" }
JSON
  local p1id=$(parse_json "$p1" '.data.id')
  [ -n "$p1id" ] || fail "建立貼文1失敗：$p1"

  say "建立貼文：測試貼文2"
  local p2=$(curl -sS -X POST "$BASE_URL/api/posts/create" "${hdr[@]}" -H 'Content-Type: application/json' -H "X-Client-Id: $cid" -d @- <<'JSON')
{ "content": "測試貼文2：這是一段用於 IG 發布流程驗證的內容，長度足夠通過最小字數。#ForumKit", "school_slug": "${SCHOOL_SLUG}" }
JSON
  local p2id=$(parse_json "$p2" '.data.id')
  [ -n "$p2id" ] || fail "建立貼文2失敗：$p2"
  echo "$p1id $p2id"
}

approve_posts_and_watch() {
  local acc_id="$1" p1="$2" p2="$3"
  local login_admin=$(api_login "$ADMIN_USER" "$ADMIN_PASS")
  local token=$(parse_json "$login_admin" '.access_token')
  [ -n "$token" ] || fail "登入管理員失敗：$login_admin"
  local hdr=( -H "Authorization: Bearer $token" )

  say "核准貼文 $p1 / $p2（將觸發 AutoPublisher）"
  curl -sS -X POST "$BASE_URL/api/moderation/post/$p1/approve" "${hdr[@]}" >/dev/null || true
  curl -sS -X POST "$BASE_URL/api/moderation/post/$p2/approve" "${hdr[@]}" >/dev/null || true

  say "追蹤 IG 發布狀態（最多 120 秒）"
  local attempts=24; local sleep_s=5
  for i in $(seq 1 $attempts); do
    sleep "$sleep_s"
    local posts=$(curl -sS "$BASE_URL/api/admin/social/posts?status=published&account_id=$acc_id" "${hdr[@]}" || true)
    local total=$(parse_json "$posts" '.data.total')
    say "第 $i 次檢查：published=$total"
    if [ "${total:-0}" -ge 2 ]; then
      say "✅ NHSH 測試兩貼文已成功發布到 IG（至少 2 則）"
      return 0
    fi
  done
  say "⚠️ 尚未觀察到 2 則已發布。請檢查：Token/權限、圖片 URL 公開性、Celery worker、模板類型等。"
  return 2
}

main() {
  ensure_school
  ensure_anon_user
  acc_id=$(ensure_ig_account_and_template)
  ids=$(create_two_posts_as_anon)
  p1=$(echo "$ids" | awk '{print $1}')
  p2=$(echo "$ids" | awk '{print $2}')
  approve_posts_and_watch "$acc_id" "$p1" "$p2"
}

main "$@"
