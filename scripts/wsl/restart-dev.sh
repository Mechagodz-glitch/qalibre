#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

sudo service postgresql start

echo "Start backend in terminal 1:"
echo "cd \"$REPO_ROOT/backend\" && npm run dev"
echo
echo "Start frontend in terminal 2:"
echo "cd \"$REPO_ROOT/frontend\" && npm start"
