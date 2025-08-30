#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

bash "$ROOT_DIR/scripts/dev_full_rebuild.sh"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a; source "$ROOT_DIR/.env"; set +a
fi

if [ "${DISCORD_BOT_ENABLED:-0}" = "1" ]; then
  echo "[ForumKit] Launching Discord Bot (background)..."
  bash "$ROOT_DIR/scripts/run_discord_bot.sh"
else
  echo "[ForumKit] Discord Bot disabled (set DISCORD_BOT_ENABLED=1 to enable)."
fi

echo "[ForumKit] All services up."
