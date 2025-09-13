#!/usr/bin/env bash
set -euo pipefail

# IG Post System acceptance check (dry-run, no external network)
# - Starts the socket server (dry-run)
# - Sends single-image and carousel requests via PostClient
# - Verifies two-phase responses arrive and success=true

HOST="${HOST:-localhost}"
PORT="${PORT:-8899}"

echo "[i] Starting IG Post Server (dry-run) on ${HOST}:${PORT} ..."
(
  cd "$(dirname "$0")/.."/post_system
  IG_DRY_RUN=1 LOG_LEVEL=INFO python3 src/post_server.py --host "$HOST" --port "$PORT" &
  echo $! > /tmp/ig_post_server.pid
)

cleanup() {
  if [[ -f /tmp/ig_post_server.pid ]]; then
    kill "$(cat /tmp/ig_post_server.pid)" >/dev/null 2>&1 || true
    rm -f /tmp/ig_post_server.pid
  fi
}
trap cleanup EXIT

sleep 0.6

echo "[i] Sending requests ..."
python3 - "$HOST" "$PORT" << 'PY'
import sys, time, json
sys.path.insert(0, 'post_system/src')
from post_client import PostClient, PostRequest

host, port = sys.argv[1], int(sys.argv[2])
client = PostClient(server_host=host, server_port=port)
assert client.connect(), "連線失敗"

responses = []
client.set_response_handler(lambda r: responses.append(r))

# Single image
req1 = PostRequest(user_token='DUMMY', page_id='DUMMY', image_url='https://picsum.photos/seed/solo/800/600', caption='dry-run single')
assert client.post_to_instagram(req1)

# Carousel (2 images)
req2 = PostRequest(user_token='DUMMY', page_id='DUMMY', image_urls=['https://picsum.photos/seed/1/1080/1080', 'https://picsum.photos/seed/2/1080/1080'], caption='dry-run carousel')
assert client.post_to_instagram(req2)

time.sleep(1.2)

# Basic assertions: we should have at least 4 responses (2 requests x 2 phases)
ok = len(responses) >= 4 and all(isinstance(r, dict) for r in responses)
if not ok:
    print(json.dumps(responses, ensure_ascii=False, indent=2))
    raise SystemExit(2)

# Check that at least one final success present
finals = [r for r in responses if r.get('success') and '發文成功' in r.get('message','')]
if not finals:
    print(json.dumps(responses, ensure_ascii=False, indent=2))
    raise SystemExit(3)

print(json.dumps(responses, ensure_ascii=False, indent=2))
client.disconnect()
PY

echo "[✓] IG Post acceptance (dry-run) passed"

