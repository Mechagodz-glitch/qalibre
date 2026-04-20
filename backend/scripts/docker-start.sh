#!/bin/sh
set -eu

PACKAGE_HASH_FILE="node_modules/.package-json.sha256"
CURRENT_HASH="$(sha256sum package.json | awk '{print $1}')"
INSTALLED_HASH=""

if [ -f "$PACKAGE_HASH_FILE" ]; then
  INSTALLED_HASH="$(cat "$PACKAGE_HASH_FILE")"
fi

if [ ! -d node_modules ] || [ ! -d node_modules/xlsx ] || [ ! -d node_modules/@prisma/client ] || [ "$CURRENT_HASH" != "$INSTALLED_HASH" ]; then
  echo "[backend] Installing dependencies"
  npm install
  mkdir -p node_modules
  printf '%s' "$CURRENT_HASH" > "$PACKAGE_HASH_FILE"
fi

echo "[backend] Generating Prisma client"
npx prisma generate

echo "[backend] Applying Prisma migrations"
npx prisma migrate deploy

echo "[backend] Seeding starter data"
npm run prisma:seed:docker

echo "[backend] Starting Fastify server"
npm run dev
