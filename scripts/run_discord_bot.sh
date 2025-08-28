#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BOT_DIR="$ROOT_DIR/discord-bot"
VENV_DIR="$BOT_DIR/.venv"
LOG_DIR="${LOG_DIR:-$BOT_DIR/logs}"
mkdir -p "$LOG_DIR"

# 載入根目錄 .env（若存在），讓 Python 拿得到必要環境變數
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

# 預設讓 Bot 連本機 Redis（依 .env 中 REDIS_PORT 覆寫），避免預設指向 Docker 內部主機名
export REDIS_URL="${REDIS_URL:-redis://localhost:${REDIS_PORT:-12008}/0}"

# 必填檢查
if [ -z "${DISCORD_BOT_TOKEN:-}" ]; then
  echo "[ForumKit-Bot] ERROR: 未設定 DISCORD_BOT_TOKEN" >&2
  exit 1
fi
if [ -z "${FORUMKIT_ADMIN_TOKEN:-}" ]; then
  echo "[ForumKit-Bot] ERROR: 未設定 FORUMKIT_ADMIN_TOKEN" >&2
  exit 1
fi

echo "[ForumKit-Bot] Using python: $(python3 -V 2>/dev/null || echo 'python3 not found')"

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

python -m pip install -U pip >/dev/null 2>&1 || true
if ! python -m pip install -r "$BOT_DIR/requirements.txt" >/dev/null 2>>"$LOG_DIR/pip.err"; then
  echo "[ForumKit-Bot] ERROR: 依賴安裝失敗，詳見 $LOG_DIR/pip.err" >&2
  exit 1
fi

echo "[ForumKit-Bot] Starting bot..."
nohup python "$BOT_DIR/forumkit_admin_bot.py" > "$LOG_DIR/bot.out" 2> "$LOG_DIR/bot.err" &
BOT_PID=$!
echo $BOT_PID > "$LOG_DIR/bot.pid"
echo "[ForumKit-Bot] PID=$BOT_PID (logs in $LOG_DIR)"
