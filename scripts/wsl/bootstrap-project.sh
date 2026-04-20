#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

step() {
  echo
  echo "[$1] $2"
}

if [[ "$REPO_ROOT" == /mnt/* ]]; then
  echo "This bootstrap script should be run from the WSL filesystem, not from a Windows-mounted path."
  echo "Current path: $REPO_ROOT"
  echo
  echo "Why:"
  echo "- npm bin linking on /mnt/c can fail with EPERM/chmod errors"
  echo "- Prisma engine binaries can fail to copy into node_modules on /mnt/c"
  echo
  echo "Move the repo into WSL, for example:"
  echo "  mkdir -p \$HOME/projects"
  echo "  rsync -a --delete --exclude node_modules --exclude frontend/dist --exclude backend/dist /mnt/c/Users/Khyati/VS_Code_Projects/qa-assistant/ \$HOME/projects/qa-assistant/"
  echo "  cd \$HOME/projects/qa-assistant"
  echo "  bash scripts/wsl/bootstrap-project.sh"
  exit 1
fi

run_npm_install() {
  step "1/4" "Installing npm dependencies"
  local npm_bin
  local node_bin_dir

  npm_bin="$(command -v npm)"
  node_bin_dir="$(dirname "$(command -v node)")"

  if npm install; then
    return 0
  fi

  echo
  echo "npm install failed. Retrying with sudo."
  echo "This is usually needed only when the repo is running from /mnt/c/... and existing files were created with incompatible permissions."

  sudo rm -rf node_modules frontend/node_modules backend/node_modules
  sudo env "PATH=${node_bin_dir}:$PATH" "$npm_bin" install --unsafe-perm
  sudo chown -R "$(id -u):$(id -g)" node_modules frontend/node_modules backend/node_modules 2>/dev/null || true
}

cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed in WSL. Run scripts/wsl/install-system-deps.sh first."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "PostgreSQL client is not installed in WSL. Run scripts/wsl/install-system-deps.sh first."
  exit 1
fi

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from backend/.env.example"
  echo "Update OPENAI_API_KEY in backend/.env before using AI refinement."
fi

run_npm_install

cd "$REPO_ROOT/backend"
step "2/4" "Generating Prisma client"
npx prisma generate

step "3/4" "Running Prisma migration"
npx prisma migrate dev --name init

step "4/4" "Seeding starter data"
npx prisma db seed

echo
echo "Project bootstrap complete."
echo "Backend env file: $REPO_ROOT/backend/.env"
echo "Start backend: cd $REPO_ROOT/backend && npm run dev"
echo "Start frontend: cd $REPO_ROOT/frontend && npm start"
