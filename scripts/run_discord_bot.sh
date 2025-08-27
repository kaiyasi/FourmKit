#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BOT_DIR="$ROOT_DIR/discord-bot"
VENV_DIR="$BOT_DIR/.venv"
LOG_DIR="${LOG_DIR:-$BOT_DIR/logs}"
mkdir -p "$LOG_DIR"

echo "[ForumKit-Bot] Using python: $(python3 -V 2>/dev/null || echo 'python3 not found')"

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"

pip install -U pip >/dev/null 2>&1 || true
pip install -r "$BOT_DIR/requirements.txt" >/dev/null

echo "[ForumKit-Bot] Starting bot..."
nohup python "$BOT_DIR/forumkit_admin_bot.py" > "$LOG_DIR/bot.out" 2> "$LOG_DIR/bot.err" &
BOT_PID=$!
echo $BOT_PID > "$LOG_DIR/bot.pid"
echo "[ForumKit-Bot] PID=$BOT_PID (logs in $LOG_DIR)"

