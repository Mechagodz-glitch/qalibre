#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

EC2_HOST="${EC2_HOST:-16.28.63.198}"
PEM_PATH="${PEM_PATH:-C:/Users/Aravind/server_keys/TEST-ENGG-SOFT-TP-MISC-OTH-QALIBRE-AF_SOUTH_1-0426-00001_2026-04-20_05_30_46.pem}"
EC2_USER="${EC2_USER:-ubuntu}"
SSH_PORT="${SSH_PORT:-22}"
DOMAIN_NAME="${DOMAIN_NAME:-qalibre.detectpl.com}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-4200}"
NGINX_SITE_NAME="${NGINX_SITE_NAME:-qalibre}"

LOCAL_NGINX_CONFIG=""
TEMP_PEM=""

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
Usage: bash scripts/ec2/configure-domain-proxy.sh [options]

Options:
  --host <ip-or-dns>         EC2 public host. Default: ${EC2_HOST}
  --pem <path>               Path to PEM key. Default: ${PEM_PATH}
  --user <ssh-user>          SSH user. If omitted, tries ec2-user, then ubuntu, then admin.
  --domain <name>            Public domain to serve. Default: ${DOMAIN_NAME}
  --backend-port <port>      Backend port on the VM. Default: ${BACKEND_PORT}
  --frontend-port <port>     Frontend port on the VM. Default: ${FRONTEND_PORT}
  --site-name <name>         Nginx site filename prefix. Default: ${NGINX_SITE_NAME}
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
      --domain)
        DOMAIN_NAME="$2"
        shift 2
        ;;
      --backend-port)
        BACKEND_PORT="$2"
        shift 2
        ;;
      --frontend-port)
        FRONTEND_PORT="$2"
        shift 2
        ;;
      --site-name)
        NGINX_SITE_NAME="$2"
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
  local tools=(bash ssh scp mktemp chmod)
  for tool in "${tools[@]}"; do
    command -v "$tool" >/dev/null 2>&1 || fail "Required local tool not found: $tool"
  done
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

prepare_pem_copy() {
  local resolved_pem_path
  resolved_pem_path="$(resolve_local_path "$PEM_PATH")"
  [[ -f "$resolved_pem_path" ]] || fail "PEM file not found: ${PEM_PATH}"

  TEMP_PEM="$(mktemp)"
  cp "$resolved_pem_path" "$TEMP_PEM"
  chmod 600 "$TEMP_PEM"
}

ssh_opts() {
  printf '%s' "-i ${TEMP_PEM} -p ${SSH_PORT} -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"
}

verify_ssh_user() {
  local candidate="$1"
  if ssh $(ssh_opts) "${candidate}@${EC2_HOST}" "exit 0" >/dev/null 2>&1; then
    EC2_USER="$candidate"
    return 0
  fi
  return 1
}

detect_ssh_user() {
  if [[ -n "$EC2_USER" ]]; then
    verify_ssh_user "$EC2_USER" || fail "Unable to connect with SSH user ${EC2_USER}. Pass a different one with --user."
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

remote_exec_root() {
  ssh $(ssh_opts) "${EC2_USER}@${EC2_HOST}" "sudo bash -lc $(printf '%q' "$*")"
}

remote_exec() {
  ssh $(ssh_opts) "${EC2_USER}@${EC2_HOST}" "$@"
}

build_nginx_config() {
  LOCAL_NGINX_CONFIG="$(mktemp)"

  cat >"$LOCAL_NGINX_CONFIG" <<EOF
# Managed by scripts/ec2/configure-domain-proxy.sh
# Routes the public domain to the frontend and backend containers running on the VM.

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_NAME};

    client_max_body_size 25m;

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location = /health {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location ^~ /docs {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF
}

cleanup() {
  if [[ -n "${TEMP_PEM:-}" && -f "${TEMP_PEM:-}" ]]; then
    rm -f "$TEMP_PEM"
  fi

  if [[ -n "${LOCAL_NGINX_CONFIG:-}" && -f "${LOCAL_NGINX_CONFIG:-}" ]]; then
    rm -f "$LOCAL_NGINX_CONFIG"
  fi
}

main() {
  trap cleanup EXIT

  parse_args "$@"
  require_local_tools
  prepare_pem_copy
  detect_ssh_user
  build_nginx_config

  local remote_tmp_config="/tmp/${NGINX_SITE_NAME}.conf"
  local remote_site_available="/etc/nginx/sites-available/${NGINX_SITE_NAME}"
  local remote_site_enabled="/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"

  log "Using SSH target ${EC2_USER}@${EC2_HOST}:${SSH_PORT}"
  log "Configuring Nginx for ${DOMAIN_NAME} -> frontend ${FRONTEND_PORT}, backend ${BACKEND_PORT}"

  log "Installing Nginx on the VM if needed."
  remote_exec_root "export DEBIAN_FRONTEND=noninteractive; apt-get update && apt-get install -y nginx"

  log "Uploading Nginx site config."
  scp -i "$TEMP_PEM" -P "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "$LOCAL_NGINX_CONFIG" \
    "${EC2_USER}@${EC2_HOST}:${remote_tmp_config}"

  log "Applying Nginx config on the VM."
  remote_exec_root "set -Eeuo pipefail; install -d /etc/nginx/sites-available /etc/nginx/sites-enabled; mv '${remote_tmp_config}' '${remote_site_available}'; ln -sfn '${remote_site_available}' '${remote_site_enabled}'; rm -f /etc/nginx/sites-enabled/default; nginx -t; systemctl enable nginx; systemctl restart nginx"

  remote_exec_root "if command -v ufw >/dev/null 2>&1; then if ufw status 2>/dev/null | grep -q '^Status: active'; then ufw allow 80/tcp >/dev/null || true; fi; fi"

  log "Nginx is now serving ${DOMAIN_NAME}."
  log "Frontend: http://${DOMAIN_NAME}"
  log "Backend:  http://${DOMAIN_NAME}/api"
  log "Docs:     http://${DOMAIN_NAME}/docs"
  log "Health:   http://${DOMAIN_NAME}/health"
}

main "$@"
