#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEFAULT_TARGET_DIR="$HOME/projects/qa-assistant"
TARGET_DIR="${1:-$DEFAULT_TARGET_DIR}"
TARGET_PARENT_DIR="$(dirname "$TARGET_DIR")"

step() {
  echo
  echo "[$1] $2"
}

load_nvm_if_present() {
  export NVM_DIR="$HOME/.nvm"
  set +u
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
  fi
  set -u
}

ensure_system_deps() {
  local missing=0
  for command_name in git rsync psql; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      missing=1
      break
    fi
  done

  load_nvm_if_present

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 || [ "$missing" -eq 1 ]; then
    step "0/5" "Installing missing system dependencies"
    bash "$SOURCE_REPO_ROOT/scripts/wsl/install-system-deps.sh"
    load_nvm_if_present
  fi
}

remove_generated_dirs() {
  local repo_dir="$1"

  sudo rm -rf \
    "$repo_dir/node_modules" \
    "$repo_dir/frontend/node_modules" \
    "$repo_dir/backend/node_modules" \
    "$repo_dir/frontend/dist" \
    "$repo_dir/backend/dist"
}

remove_install_state() {
  local repo_dir="$1"

  rm -rf \
    "$repo_dir/node_modules" \
    "$repo_dir/frontend/node_modules" \
    "$repo_dir/backend/node_modules" \
    "$repo_dir/frontend/dist" \
    "$repo_dir/backend/dist"

  rm -f "$repo_dir/package-lock.json"
}

ensure_postgres_app_db() {
  step "5/8" "Ensuring PostgreSQL user and database exist"

  sudo -u postgres psql <<'SQL'
DO
$$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'qa_user') THEN
    CREATE ROLE qa_user LOGIN PASSWORD 'qa_password' CREATEDB;
  END IF;
END
$$;
SQL

  sudo -u postgres psql -c "ALTER ROLE qa_user CREATEDB;"

  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'qa_dataset_db'" | grep -q 1; then
    sudo -u postgres psql -c "CREATE DATABASE qa_dataset_db OWNER qa_user;"
  fi

  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE qa_dataset_db TO qa_user;"
}

ensure_backend_env() {
  local repo_dir="$1"

  if [ ! -f "$repo_dir/backend/.env" ]; then
    cp "$repo_dir/backend/.env.example" "$repo_dir/backend/.env"
    echo
    echo "Created $repo_dir/backend/.env from backend/.env.example"
  fi
}

run_project_bootstrap() {
  local repo_dir="$1"

  cd "$repo_dir"

  ensure_backend_env "$repo_dir"

  step "6/8" "Installing Linux-native npm dependencies"
  npm install --include=optional

  step "7/8" "Generating Prisma client, running migrations, and seeding starter data"
  npm run prisma:generate --workspace backend
  npm run prisma:migrate --workspace backend
  npm run prisma:seed --workspace backend
}

warn_if_openai_missing() {
  local env_file="$1/backend/.env"

  if [ -f "$env_file" ] && ! grep -Eq '^OPENAI_API_KEY=.+$' "$env_file"; then
    echo
    echo "Warning: OPENAI_API_KEY is empty in $env_file"
    echo "The app will start, but AI refinement requests will fail until you set a valid key."
  fi
}

if [ -z "${WSL_DISTRO_NAME:-}" ] && ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "This script must be run inside WSL."
  exit 1
fi

if [[ "$TARGET_DIR" == /mnt/* ]]; then
  echo "Target directory must be inside the WSL filesystem, not under /mnt."
  echo "Example: $DEFAULT_TARGET_DIR"
  exit 1
fi

ensure_system_deps

step "1/8" "Removing generated dependency and build directories from the Windows-mounted source copy"
remove_generated_dirs "$SOURCE_REPO_ROOT"

step "2/8" "Copying the project into the WSL filesystem"
mkdir -p "$TARGET_PARENT_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude frontend/dist \
  --exclude backend/dist \
  "$SOURCE_REPO_ROOT/" \
  "$TARGET_DIR/"

step "3/8" "Cleaning previous install state from the WSL-native target copy"
remove_install_state "$TARGET_DIR"

step "4/8" "Starting PostgreSQL"
sudo service postgresql start

ensure_postgres_app_db

run_project_bootstrap "$TARGET_DIR"

warn_if_openai_missing "$TARGET_DIR"

step "8/8" "Starting backend and frontend"
cd "$TARGET_DIR"
echo "Running: npm run dev"
echo "Press Ctrl+C to stop both services."
echo
npm run dev

echo
echo "Project has been moved and bootstrapped in WSL."
echo "Working copy: $TARGET_DIR"
echo
echo "Backend:  http://localhost:3000"
echo "Frontend: http://localhost:4200"
