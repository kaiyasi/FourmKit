#!/usr/bin/env bash
set -euo pipefail

# Demo: 以管理員身份登入，建立兩則貼文，核准後觸發 IG 發布流程
# 需求：
# - 後端、nginx、celery、celery-beat 皆已啟動
# - 已存在一個 Instagram SocialAccount（狀態 active、有預設模板）
# - 你知道管理員帳密（或已設定 SINGLE_ADMIN_*）

BASE_URL="${BASE_URL:-http://localhost:12005}"
ADMIN_USER="${ADMIN_USER:-${SINGLE_ADMIN_USERNAME:-admin}}"
ADMIN_PASS="${ADMIN_PASS:-${SINGLE_ADMIN_PASSWORD:-admin12345}}"

say() { echo -e "[demo] $*"; }
fail() { echo -e "[demo][ERROR] $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "需要指令 '$1'，請先安裝"
}

require_cmd curl

JQ_BIN="jq"
if ! command -v jq >/dev/null 2>&1; then
  say "找不到 jq，用內建 python 解析 JSON"
  JQ_BIN="python3 -c"
fi

parse_json() {
  # 簡單 JSON 取值：parse_json '<json>' '<jq_expr>'
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
            # 支援 like accounts[0].id
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

say "1) 登入管理員 (${ADMIN_USER})"
LOGIN_RES=$(curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}") || fail "登入 API 失敗"

ACCESS_TOKEN=$(parse_json "$LOGIN_RES" '.access_token')
[ -n "$ACCESS_TOKEN" ] || fail "取得 access_token 失敗，回應: $LOGIN_RES"
AUTH_HEADER=( -H "Authorization: Bearer $ACCESS_TOKEN" )

say "2) 取得 IG 帳號清單"
ACC_RES=$(curl -sS "$BASE_URL/api/admin/social/accounts" "${AUTH_HEADER[@]}") || fail "讀取帳號清單失敗"
ACC_COUNT=$(parse_json "$ACC_RES" '.accounts|length')
[ "${ACC_COUNT:-0}" -gt 0 ] || fail "沒有任何 Instagram 帳號。請先用 /api/admin/social/accounts/simple 建立，或到後台綁定。"

# 選第一個帳號；僅示範用途
ACC_ID=$(parse_json "$ACC_RES" 'accounts[0].id')
ACC_STATUS=$(parse_json "$ACC_RES" 'accounts[0].status')
say "   使用帳號 ID=$ACC_ID (status=$ACC_STATUS)"
[ -n "$ACC_ID" ] || fail "解析帳號 ID 失敗"

say "3) 將帳號發布策略設為 IMMEDIATE（立即發布）"
SET_RES=$(curl -sS -X PUT "$BASE_URL/api/admin/social/accounts/$ACC_ID/settings" \
  "${AUTH_HEADER[@]}" -H 'Content-Type: application/json' \
  -d '{"publish_trigger":"immediate"}') || fail "更新帳號設定失敗"

OK=$(parse_json "$SET_RES" '.success')
[ "$OK" = "True" -o "$OK" = "true" ] || say "   警告：設定可能未更新：$SET_RES"

say "3.1) 確保帳號存在預設模板（combined）"
TPLS=$(curl -sS "$BASE_URL/api/admin/social/templates?account_id=$ACC_ID" "${AUTH_HEADER[@]}") || fail "讀取模板失敗"
TPL_COUNT=$(parse_json "$TPLS" '.templates|length')
if [ "${TPL_COUNT:-0}" -eq 0 ]; then
  say "   沒有模板，為你建立一個預設 COMBINED 模板"
  CREATE_TPL=$(curl -sS -X POST "$BASE_URL/api/admin/social/templates" "${AUTH_HEADER[@]}" -H 'Content-Type: application/json' -d @- <<JSON || true
{
  "account_id": $ACC_ID,
  "name": "Default Combined",
  "description": "Auto-created by demo script",
  "template_type": "combined",
  "is_default": true,
  "config": {
    "image": {
      "width": 1080,
      "height": 1080,
      "background": {"value": "#ffffff"},
      "text": {"font": "default", "size": 32, "lineSpacing": 10, "maxLines": 8},
      "padding": 60
    },
    "caption": {"template": "{content}\n\n{hashtags}", "max_length": 2200},
    "hashtags": []
  }
}
JSON
  )
  CT_OK=$(parse_json "$CREATE_TPL" '.success')
  [ "$CT_OK" = "True" -o "$CT_OK" = "true" ] || fail "建立預設模板失敗：$CREATE_TPL"
else
  say "   已存在 $TPL_COUNT 個模板，略過建立"
fi

say "4) 建立兩則貼文 (pending)"
P1=$(curl -sS -X POST "$BASE_URL/api/posts/create" "${AUTH_HEADER[@]}" -H 'Content-Type: application/json' \
  -d '{"content":"這是一個針對 IG 自動發布流程的測試貼文 A。內容足夠長以通過最小字數檢查，並且會在核准後觸發自動發布。#ForumKit"}') || fail "建立貼文1失敗"
P1_ID=$(parse_json "$P1" '.data.id')
[ -n "$P1_ID" ] || fail "解析貼文1 ID 失敗：$P1"

P2=$(curl -sS -X POST "$BASE_URL/api/posts/create" "${AUTH_HEADER[@]}" -H 'Content-Type: application/json' \
  -d '{"content":"這是一個針對 IG 自動發布流程的測試貼文 B。走相同步驟，核准後觸發 IMMEDIATE 任務。#ForumKit"}') || fail "建立貼文2失敗"
P2_ID=$(parse_json "$P2" '.data.id')
[ -n "$P2_ID" ] || fail "解析貼文2 ID 失敗：$P2"
say "   取得貼文 ID: $P1_ID, $P2_ID"

say "5) 核准兩則貼文（觸發 AutoPublisher）"
AP1=$(curl -sS -X POST "$BASE_URL/api/moderation/post/$P1_ID/approve" "${AUTH_HEADER[@]}") || fail "核准貼文1失敗"
AP2=$(curl -sS -X POST "$BASE_URL/api/moderation/post/$P2_ID/approve" "${AUTH_HEADER[@]}") || fail "核准貼文2失敗"

say "6) 等待 Celery 處理（最多 120 秒）"
ATTEMPTS=24
SLEEP=5
ok_count=0
for i in $(seq 1 $ATTEMPTS); do
  sleep "$SLEEP"
  POSTS_RES=$(curl -sS "$BASE_URL/api/admin/social/posts?status=published&account_id=$ACC_ID" "${AUTH_HEADER[@]}" || true)
  PUB_COUNT=$(parse_json "$POSTS_RES" '.data.total' 2>/dev/null || echo "0")
  say "   第 $i 次檢查：published 總數=$PUB_COUNT"
  if [ "${PUB_COUNT:-0}" -ge 2 ]; then
    ok_count=$PUB_COUNT
    break
  fi
done

if [ "${ok_count:-0}" -ge 2 ]; then
  say "✅ 成功發布至少兩則 IG 貼文！"
else
  say "⚠️ 尚未觀察到 2 則已發布，可能是：\n   - IG Token/權限問題\n   - 生成圖片 URL 外網不可訪問（請設定 PUBLIC_BASE_URL 或 PUBLIC_CDN_URL）\n   - Celery worker 未啟動或未吃 instagram 佇列\n   - 帳號無預設模板或模板為純文字（需 COMBINED/IMAGE）"
  exit 2
fi

say "完成。"
