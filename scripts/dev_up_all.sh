#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

bash "$ROOT_DIR/scripts/dev_full_rebuild.sh"

echo "[ForumKit] Launching Discord Bot (background)..."
bash "$ROOT_DIR/scripts/run_discord_bot.sh"

echo "[ForumKit] All services up."

