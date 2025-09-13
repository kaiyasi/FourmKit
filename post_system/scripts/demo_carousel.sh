#!/usr/bin/env bash
set -euo pipefail

# 小劇場：一鍵啟動 Socket 伺服器，然後用客戶端送一筆「輪播」發文請求。
# 用法：
#   TOKEN=短或長期使用者Token PAGE_ID=粉專ID HOST=localhost PORT=8888 ./scripts/demo_carousel.sh
# 若未設定 image URL，就用 picsum 當示意圖。

HOST="${HOST:-localhost}"
PORT="${PORT:-8888}"

if [[ -z "${TOKEN:-}" || -z "${PAGE_ID:-}" ]]; then
  echo "[x] 需要環境變數 TOKEN 和 PAGE_ID 才能測喔～"
  echo "    例如：TOKEN=EAA... PAGE_ID=1234567890 ./scripts/demo_carousel.sh"
  exit 1
fi

IMG1="${IMG1:-https://picsum.photos/seed/1/1080/1080}"
IMG2="${IMG2:-https://picsum.photos/seed/2/1080/1080}"
CAPTION="${CAPTION:-輪播自動化測試 🧪 #socket #carousel}"

echo "[i] 啟動伺服器於 ${HOST}:${PORT}（背景）..."
python3 src/post_server.py --host "$HOST" --port "$PORT" --log-level INFO &
SERVER_PID=$!
sleep 0.6

cleanup() {
  echo "[i] 關閉伺服器 (pid=$SERVER_PID)"
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[i] 送出輪播請求（2 張圖）..."
python3 - "$HOST" "$PORT" << 'PY'
import sys, time, json
sys.path.insert(0, 'src')
from post_client import PostClient, PostRequest

host, port = sys.argv[1], int(sys.argv[2])
client = PostClient(server_host=host, server_port=port)
assert client.connect(), "連線失敗，請確認伺服器有啟動"

import os
token = os.environ['TOKEN']
page_id = os.environ['PAGE_ID']
img1 = os.environ['IMG1']
img2 = os.environ['IMG2']
caption = os.environ['CAPTION']

responses = []
client.set_response_handler(lambda r: responses.append(r))

req = PostRequest(
    user_token=token,
    page_id=page_id,
    image_urls=[img1, img2],
    caption=caption,
)

ok = client.post_to_instagram(req)
print("[i] 已送出請求")
time.sleep(2.0)
print(json.dumps(responses, ensure_ascii=False, indent=2))
client.disconnect()
PY

echo "[✓] Demo 完成"

