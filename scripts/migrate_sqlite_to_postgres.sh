#!/usr/bin/env bash
set -euo pipefail

# ForumKit - SQLite → PostgreSQL one-shot migration helper
# Usage:
#   ./scripts/migrate_sqlite_to_postgres.sh
# Prereqs:
#   - docker / docker compose available
#   - existing SQLite at ./data/forumkit.db
#   - running compose stack with network name `forumkit-net` (default in repo)
#   - Postgres service reachable as `postgres:5432` with user/pass in .env

SQLITE_FILE="./data/forumkit.db"
PG_URL_DEFAULT="postgresql://forumkit:forumkit_password@postgres:5432/forumkit"
DOCKER_NET="forumkit-net"

PG_URL="${PG_URL:-$PG_URL_DEFAULT}"

echo "[i] Checking prerequisites..."
command -v docker >/dev/null || { echo "[x] docker not found"; exit 1; }
command -v docker compose >/dev/null || command -v docker-compose >/dev/null || { echo "[x] docker compose not found"; exit 1; }

if [[ ! -f "$SQLITE_FILE" ]]; then
  echo "[x] SQLite file not found at $SQLITE_FILE"
  exit 1
fi

echo "[i] Verifying compose network '$DOCKER_NET' exists..."
if ! docker network ls --format '{{.Name}}' | grep -q "^${DOCKER_NET}$"; then
  echo "[x] Compose network '$DOCKER_NET' not found. Start stack first: docker compose up -d postgres redis nginx"
  exit 1
fi

echo "[i] Stopping writers (backend, celery, celery-beat) to ensure consistent snapshot..."
docker compose stop backend celery celery-beat >/dev/null 2>&1 || true

echo "[i] Running pgloader in ephemeral container..."
echo "    FROM: sqlite://$SQLITE_FILE"
echo "    TO  : $PG_URL"

docker run --rm \
  --network "${DOCKER_NET}" \
  -v "${PWD}/data:/data:ro" \
  dimitri/pgloader:latest \
  pgloader sqlite:///data/$(basename "$SQLITE_FILE") "$PG_URL"

echo "[✓] Migration step finished. Starting backend services..."
docker compose up -d backend celery celery-beat

echo "[i] Hint: ensure your .env has DATABASE_URL pointing to Postgres, e.g."
echo "    DATABASE_URL=postgresql+psycopg2://forumkit:forumkit_password@postgres:5432/forumkit"
echo "[i] Verify health: curl -I https://forum.serelix.xyz/api/healthz"

