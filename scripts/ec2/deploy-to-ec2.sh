#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

EC2_HOST="${EC2_HOST:-16.28.63.198}"
PEM_PATH="${PEM_PATH:-C:/Users/Aravind/server_keys/TEST-ENGG-SOFT-TP-MISC-OTH-QALIBRE-AF_SOUTH_1-0426-00001_2026-04-20_05_30_46.pem}"
EC2_USER="${EC2_USER:-ubuntu}"
REMOTE_DIR="${REMOTE_DIR:-/opt/qalibre/app}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_BOOTSTRAP_DIR="${REMOTE_BOOTSTRAP_DIR:-/tmp/qalibre-ec2-bootstrap}"
SYNC_TOOL=""

ROOT_ENV_FILE="${PROJECT_DIR}/.env"
BACKEND_ENV_FILE="${PROJECT_DIR}/backend/.env"
BACKEND_ENV_EXAMPLE="${PROJECT_DIR}/backend/.env.example"
INSTALL_SCRIPT_REL="scripts/ec2/install-ec2-prereqs.sh"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

warn() {
  printf '\n[WARN] %s\n' "$*" >&2
}

fail() {
  printf '\n[ERROR] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Usage: bash scripts/ec2/deploy-to-ec2.sh [options]

Options:
  --host <ip-or-dns>         EC2 public host. Default: ${EC2_HOST}
  --pem <path>               Path to PEM key. Default: ${PEM_PATH}
  --user <ssh-user>          SSH user. If omitted, tries ec2-user, then ubuntu, then admin.
  --remote-dir <path>        Remote application directory. Default: ${REMOTE_DIR}
  --port <ssh-port>          SSH port. Default: ${SSH_PORT}
  -h, --help                 Show this help.
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --host)
        EC2_HOST="$2"
        shift 2
        ;;
      --pem)
        PEM_PATH="$2"
        shift 2
        ;;
      --user)
        EC2_USER="$2"
        shift 2
        ;;
      --remote-dir)
        REMOTE_DIR="$2"
        shift 2
        ;;
      --port)
        SSH_PORT="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
  done
}

require_local_tools() {
  local tools=(bash ssh scp awk mktemp chmod)
  for tool in "${tools[@]}"; do
    command -v "$tool" >/dev/null 2>&1 || fail "Required local tool not found: $tool"
  done

  if command -v rsync >/dev/null 2>&1; then
    SYNC_TOOL="rsync"
  elif command -v tar >/dev/null 2>&1; then
    SYNC_TOOL="tar"
  else
    fail "Required local tool not found: rsync or tar"
  fi
}

ensure_required_project_files() {
  local required_files=(
    "${PROJECT_DIR}/docker-compose.yml"
    "${PROJECT_DIR}/package.json"
    "${PROJECT_DIR}/backend/package.json"
    "${PROJECT_DIR}/frontend/package.json"
    "${PROJECT_DIR}/backend/Dockerfile.dev"
    "${PROJECT_DIR}/frontend/Dockerfile.dev"
    "${PROJECT_DIR}/${INSTALL_SCRIPT_REL}"
  )

  for file in "${required_files[@]}"; do
    [[ -f "$file" ]] || fail "Required file is missing: ${file}"
  done
}

ensure_root_compose_env() {
  if [[ -f "$ROOT_ENV_FILE" ]]; then
    log "Using existing root Compose env: ${ROOT_ENV_FILE}"
    return
  fi

  log "Root .env not found. Creating one with deployment defaults."
  cat >"$ROOT_ENV_FILE" <<'EOF'
POSTGRES_VOLUME_NAME=qalibre_ec2_pgdata
POSTGRES_DB=qa_dataset_db
POSTGRES_USER=qa_user
POSTGRES_PASSWORD=qa_password
POSTGRES_HOST_PORT=5433
EOF
}

ensure_backend_env() {
  if [[ -f "$BACKEND_ENV_FILE" ]]; then
    log "Using existing backend env: ${BACKEND_ENV_FILE}"
    return
  fi

  if [[ -f "$BACKEND_ENV_EXAMPLE" ]]; then
    log "backend/.env not found. Creating it from backend/.env.example."
    cp "$BACKEND_ENV_EXAMPLE" "$BACKEND_ENV_FILE"
    warn "backend/.env was created from the example file. Review and populate required secrets before production use."
    return
  fi

  fail "backend/.env is missing and backend/.env.example was not found."
}

validate_backend_env() {
  local openai_key microsoft_tenant azure_tenant microsoft_client azure_client
  openai_key="$(read_kv "$BACKEND_ENV_FILE" "OPENAI_API_KEY" || true)"
  microsoft_tenant="$(read_kv "$BACKEND_ENV_FILE" "MICROSOFT_TENANT_ID" || true)"
  azure_tenant="$(read_kv "$BACKEND_ENV_FILE" "AZURE_TENANT_ID" || true)"
  microsoft_client="$(read_kv "$BACKEND_ENV_FILE" "MICROSOFT_CLIENT_ID" || true)"
  azure_client="$(read_kv "$BACKEND_ENV_FILE" "AZURE_CLIENT_ID" || true)"

  [[ -n "$openai_key" ]] || warn "OPENAI_API_KEY is empty in backend/.env. AI generation will not work until it is set."

  local has_tenant has_client
  has_tenant="false"
  has_client="false"
  if [[ -n "$microsoft_tenant" || -n "$azure_tenant" ]]; then
    has_tenant="true"
  fi
  if [[ -n "$microsoft_client" || -n "$azure_client" ]]; then
    has_client="true"
  fi

  if [[ "$has_tenant" == "false" && "$has_client" == "false" ]]; then
    log "No Azure/Microsoft tenant ID found in backend/.env. EC2 will start in local admin mode."
    return
  fi

  if [[ "$has_tenant" != "$has_client" ]]; then
    fail "backend/.env has a partial Microsoft/Azure auth configuration. Provide both tenant and client IDs, or remove them to use local admin mode."
  fi
}

read_kv() {
  local file="$1"
  local key="$2"
  awk -F= -v lookup="$key" '
    $1 == lookup {
      sub(/^[^=]*=/, "", $0)
      print $0
      exit
    }
  ' "$file"
}

prepare_pem_copy() {
  local resolved_pem_path
  resolved_pem_path="$(resolve_local_path "$PEM_PATH")"
  [[ -f "$resolved_pem_path" ]] || fail "PEM file not found: ${PEM_PATH}"

  TEMP_PEM="$(mktemp)"
  cp "$resolved_pem_path" "$TEMP_PEM"
  chmod 600 "$TEMP_PEM"
}

resolve_local_path() {
  local input_path="$1"

  if [[ -f "$input_path" ]]; then
    printf '%s\n' "$input_path"
    return
  fi

  if [[ "$input_path" =~ ^([A-Za-z]):[\\/](.*)$ ]]; then
    local drive tail normalized_tail
    drive="$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')"
    tail="${BASH_REMATCH[2]}"
    normalized_tail="${tail//\\//}"
    printf '/mnt/%s/%s\n' "$drive" "$normalized_tail"
    return
  fi

  printf '%s\n' "$input_path"
}

ssh_opts() {
  printf '%s' "-i ${TEMP_PEM} -p ${SSH_PORT} -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"
}

detect_ssh_user() {
  if [[ -n "$EC2_USER" ]]; then
    verify_ssh_user "$EC2_USER"
    return
  fi

  local candidate
  for candidate in ec2-user ubuntu admin; do
    if verify_ssh_user "$candidate"; then
      EC2_USER="$candidate"
      return
    fi
  done

  fail "Unable to determine a working SSH user. Pass one explicitly with --user."
}

verify_ssh_user() {
  local candidate="$1"
  if ssh $(ssh_opts) "${candidate}@${EC2_HOST}" "exit 0" >/dev/null 2>&1; then
    EC2_USER="$candidate"
    return 0
  fi
  return 1
}

remote_exec() {
  ssh $(ssh_opts) "${EC2_USER}@${EC2_HOST}" "$@"
}

remote_exec_root() {
  ssh $(ssh_opts) "${EC2_USER}@${EC2_HOST}" "sudo bash -lc $(printf '%q' "$*")"
}

upload_install_script() {
  REMOTE_BOOTSTRAP_SCRIPT="${REMOTE_BOOTSTRAP_DIR}/install-ec2-prereqs.sh"
  log "Uploading EC2 prerequisite script to ${EC2_USER}@${EC2_HOST}:${REMOTE_BOOTSTRAP_SCRIPT}"
  remote_exec "mkdir -p '${REMOTE_BOOTSTRAP_DIR}'"
  scp -i "$TEMP_PEM" -P "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "${PROJECT_DIR}/${INSTALL_SCRIPT_REL}" \
    "${EC2_USER}@${EC2_HOST}:${REMOTE_BOOTSTRAP_SCRIPT}"
}

bootstrap_remote_host() {
  log "Bootstrapping the EC2 host."
  upload_install_script
  ssh $(ssh_opts) "${EC2_USER}@${EC2_HOST}" "sudo bash '${REMOTE_BOOTSTRAP_SCRIPT}'"
  remote_exec "rm -f '${REMOTE_BOOTSTRAP_SCRIPT}'"
}

copy_env_files() {
  remote_exec "mkdir -p '${REMOTE_DIR}/backend'"
  scp -i "$TEMP_PEM" -P "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "$ROOT_ENV_FILE" \
    "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/.env"
  scp -i "$TEMP_PEM" -P "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "$BACKEND_ENV_FILE" \
    "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/backend/.env"
}

sync_project_with_rsync() {
  remote_exec "mkdir -p '${REMOTE_DIR}' '${REMOTE_DIR}/backend' '${REMOTE_DIR}/frontend'"

  rsync -az --delete \
    -e "ssh $(ssh_opts)" \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude 'backend/node_modules/' \
    --exclude 'frontend/node_modules/' \
    --exclude 'frontend/dist/' \
    --exclude 'backend/dist/' \
    --exclude 'frontend/.angular/' \
    --exclude '.env' \
    --exclude 'backend/.env' \
    --exclude 'frontend-serve.err.log' \
    --exclude 'frontend-serve.out.log' \
    --exclude 'artifacts/' \
    --exclude 'test-results/' \
    "${PROJECT_DIR}/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/"

  copy_env_files
}

sync_project_with_tar() {
  local project_parent project_name
  project_parent="$(dirname "$PROJECT_DIR")"
  project_name="$(basename "$PROJECT_DIR")"

  log "rsync is unavailable. Using tar to sync the project."
  remote_exec "rm -rf '${REMOTE_DIR}' && mkdir -p '${REMOTE_DIR}'"

  tar -C "$project_parent" \
    --exclude="${project_name}/.git" \
    --exclude="${project_name}/node_modules" \
    --exclude="${project_name}/backend/node_modules" \
    --exclude="${project_name}/frontend/node_modules" \
    --exclude="${project_name}/frontend/dist" \
    --exclude="${project_name}/backend/dist" \
    --exclude="${project_name}/frontend/.angular" \
    --exclude="${project_name}/.env" \
    --exclude="${project_name}/backend/.env" \
    --exclude="${project_name}/frontend-serve.err.log" \
    --exclude="${project_name}/frontend-serve.out.log" \
    --exclude="${project_name}/artifacts" \
    --exclude="${project_name}/test-results" \
    -cpf - "$project_name" \
    | ssh $(ssh_opts) "${EC2_USER}@${EC2_HOST}" "tar -xpf - --strip-components=1 -C '${REMOTE_DIR}'"

  copy_env_files
}

sync_project() {
  log "Syncing project to ${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}"

  if [[ "$SYNC_TOOL" == "rsync" ]]; then
    sync_project_with_rsync
  else
    sync_project_with_tar
  fi
}

create_remote_external_volume() {
  local volume_name
  volume_name="$(read_kv "$ROOT_ENV_FILE" "POSTGRES_VOLUME_NAME" || true)"
  [[ -n "$volume_name" ]] || volume_name="qalibre_ec2_pgdata"

  log "Ensuring remote Docker volume exists: ${volume_name}"
  remote_exec_root "docker volume inspect '${volume_name}' >/dev/null 2>&1 || docker volume create '${volume_name}' >/dev/null"
}

deploy_remote_stack() {
  log "Deploying Docker Compose stack on EC2."
  remote_exec_root "cd '${REMOTE_DIR}' && docker compose down --remove-orphans || true"
  remote_exec_root "cd '${REMOTE_DIR}' && docker compose up -d --build --remove-orphans"
  remote_exec_root "cd '${REMOTE_DIR}' && docker compose ps"
}

cleanup() {
  if [[ -n "${TEMP_PEM:-}" && -f "${TEMP_PEM:-}" ]]; then
    rm -f "$TEMP_PEM"
  fi
}

main() {
  trap cleanup EXIT

  parse_args "$@"
  require_local_tools
  ensure_required_project_files
  ensure_root_compose_env
  ensure_backend_env
  validate_backend_env
  prepare_pem_copy
  detect_ssh_user

  log "Using SSH target ${EC2_USER}@${EC2_HOST}:${SSH_PORT}"

  bootstrap_remote_host
  sync_project
  create_remote_external_volume
  deploy_remote_stack

  log "Deployment complete."
  log "Frontend: http://${EC2_HOST}:4200"
  log "Backend:  http://${EC2_HOST}:3000"
}

main "$@"
