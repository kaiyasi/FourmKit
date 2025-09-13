#!/usr/bin/env bash
set -euo pipefail

# 兩則「內湖高中 (nhsh)」IG 測試貼文發佈腳本
# - 使用既有 Socket 伺服器 (post_server.py) + 客戶端 (post_client.py)
# - TOKEN 與 PAGE_ID 走環境變數，避免外洩
#
# 用法（真發佈）：
#   export TOKEN="<你的使用者Token>"
#   export PAGE_ID="785993367933796"   # 內湖高中粉專 ID
#   ./scripts/post_nhsh_two_posts.sh
#
# 自訂參數（可選）：
#   HOST, PORT, IMG1, IMG2, CAP1, CAP2

HOST="${HOST:-localhost}"
PORT="${PORT:-8888}"

if [[ -z "${TOKEN:-}" || -z "${PAGE_ID:-}" ]]; then
  echo "[x] 需要環境變數 TOKEN 和 PAGE_ID，才能發佈。"
  echo "    例如：TOKEN=EAA... PAGE_ID=785993367933796 ./scripts/post_nhsh_two_posts.sh"
  exit 1
fi

# 預設用兩張示意圖（單圖兩則）
IMG1="${IMG1:-https://picsum.photos/seed/nhsh1/1080/1080}"
IMG2="${IMG2:-https://picsum.photos/seed/nhsh2/1080/1080}"

# 以「模板轉文字」的概念準備文案（帶入 school/index）
school="內湖高中 (nhsh)"
CAP1_DEFAULT="【${school}】系統測試 1/2 #ForumKit #socket #nhsh"
CAP2_DEFAULT="【${school}】系統測試 2/2 #ForumKit #socket #nhsh"
CAP1="${CAP1:-$CAP1_DEFAULT}"
CAP2="${CAP2:-$CAP2_DEFAULT}"

echo "[i] 啟動 IG 發布伺服器於 ${HOST}:${PORT}（背景）..."
python3 src/post_server.py --host "$HOST" --port "$PORT" --log-level INFO &
SERVER_PID=$!
sleep 0.8

cleanup() {
  echo "[i] 關閉伺服器 (pid=$SERVER_PID)"
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[i] 送出第 1 則（單圖）..."
python3 - "$HOST" "$PORT" << 'PY'
import sys, time, os, json
sys.path.insert(0, 'src')
from post_client import PostClient, PostRequest

host, port = sys.argv[1], int(sys.argv[2])
client = PostClient(server_host=host, server_port=port)
assert client.connect(), "連線失敗，請確認伺服器已啟動"

token = os.environ['TOKEN']
page_id = os.environ['PAGE_ID']
img = os.environ['IMG1']
cap = os.environ['CAP1']

responses = []
client.set_response_handler(lambda r: responses.append(r))

req = PostRequest(
    user_token=token,
    page_id=page_id,
    image_url=img,
    caption=cap,
)

ok = client.post_to_instagram(req)
print("[i] 已送出第 1 則請求")
time.sleep(2.0)
print(json.dumps(responses, ensure_ascii=False, indent=2))
client.disconnect()
PY

sleep 1

echo "[i] 送出第 2 則（單圖）..."
python3 - "$HOST" "$PORT" << 'PY'
import sys, time, os, json
sys.path.insert(0, 'src')
from post_client import PostClient, PostRequest

host, port = sys.argv[1], int(sys.argv[2])
client = PostClient(server_host=host, server_port=port)
assert client.connect(), "連線失敗，請確認伺服器已啟動"

token = os.environ['TOKEN']
page_id = os.environ['PAGE_ID']
img = os.environ['IMG2']
cap = os.environ['CAP2']

responses = []
client.set_response_handler(lambda r: responses.append(r))

req = PostRequest(
    user_token=token,
    page_id=page_id,
    image_url=img,
    caption=cap,
)

ok = client.post_to_instagram(req)
print("[i] 已送出第 2 則請求")
time.sleep(2.0)
print(json.dumps(responses, ensure_ascii=False, indent=2))
client.disconnect()
PY

echo "[✓] 兩則貼文流程送出完成（請查看 API 回應與 IG 帳號）。"

