#!/bin/sh
set -eu

PACKAGE_HASH_FILE="node_modules/.package-json.sha256"
CURRENT_HASH="$(sha256sum package.json | awk '{print $1}')"
INSTALLED_HASH=""

if [ -f "$PACKAGE_HASH_FILE" ]; then
  INSTALLED_HASH="$(cat "$PACKAGE_HASH_FILE")"
fi

if [ ! -d node_modules ] || [ ! -d node_modules/@angular/core ] || [ "$CURRENT_HASH" != "$INSTALLED_HASH" ]; then
  echo "[frontend] Installing dependencies"
  npm install
  mkdir -p node_modules
  printf '%s' "$CURRENT_HASH" > "$PACKAGE_HASH_FILE"
fi

echo "[frontend] Clearing Angular/Vite cache"
rm -rf .angular/cache

echo "[frontend] Using API proxy target: ${NG_PROXY_TARGET:-http://127.0.0.1:3000}"
echo "[frontend] Starting Angular dev server"
npm run start -- --port 4200
