#!/usr/bin/env bash
# One-shot local dev setup: installs deps, starts Postgres, writes apps/server/.env,
# and applies Prisma migrations. Safe to re-run — every step is idempotent.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
elif docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
else
  echo "error: docker (with the compose plugin, or standalone docker-compose) is required for local Postgres but was not found" >&2
  exit 1
fi

echo "==> Installing dependencies"
npm install

echo "==> Starting Postgres (${DC[*]})"
"${DC[@]}" up -d

if [ ! -f apps/server/.env ]; then
  echo "==> Writing apps/server/.env from .env.example"
  cp apps/server/.env.example apps/server/.env
else
  echo "==> apps/server/.env already exists, leaving it as-is"
fi

echo "==> Waiting for Postgres to accept connections"
for _ in $(seq 1 30); do
  if "${DC[@]}" exec -T postgres pg_isready -U ubiquiti >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Applying Prisma migrations"
npm run db:migrate -w @ubiquiti-todo/server

echo
echo "Setup complete. Run 'npm run dev' to start the API (port 3001) and web app (port 5173)."
