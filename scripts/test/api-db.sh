#!/usr/bin/env bash
# Starts a disposable Postgres for the API integration tests and applies migrations.
set -euo pipefail

NAME=nutritionist-api-test
PORT=54329
URL="postgresql://postgres:test@localhost:${PORT}/nutritionist_test"

if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=nutritionist_test -p "${PORT}:5432" pgvector/pgvector:pg17 >/dev/null
  until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
fi

DATABASE_URL="$URL" npx prisma migrate deploy
