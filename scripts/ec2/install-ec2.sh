#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

EC2_HOST="${EC2_HOST:-16.28.63.198}"
PEM_PATH="${PEM_PATH:-C:/Users/Aravind/server_keys/TEST-ENGG-SOFT-TP-MISC-OTH-QALIBRE-AF_SOUTH_1-0426-00001_2026-04-20_05_30_46.pem}"
EC2_USER="${EC2_USER:-}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_INSTALL_DIR="${REMOTE_INSTALL_DIR:-/tmp/qalibre-ec2-install}"
LOCAL_INSTALL_SCRIPT="${PROJECT_DIR}/scripts/ec2/install-ec2-prereqs.sh"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  printf '\n[ERROR] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Usage: bash scripts/ec2/install-ec2.sh [options]

Options:
  --host <ip-or-dns>         EC2 public host. Default: ${EC2_HOST}
  --pem <path>               Path to PEM key. Default: ${PEM_PATH}
  --user <ssh-user>          SSH user. If omitted, tries ec2-user, then ubuntu, then admin.
  --port <ssh-port>          SSH port. Default: ${SSH_PORT}
  --remote-dir <path>        Remote temp directory used for the uploaded script. Default: ${REMOTE_INSTALL_DIR}
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
      --port)
        SSH_PORT="$2"
        shift 2
        ;;
      --remote-dir)
        REMOTE_INSTALL_DIR="$2"
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

upload_install_script() {
  REMOTE_INSTALL_SCRIPT="${REMOTE_INSTALL_DIR}/install-ec2-prereqs.sh"
  log "Uploading install script to ${EC2_USER}@${EC2_HOST}:${REMOTE_INSTALL_SCRIPT}"
  ssh $(ssh_opts) "${EC2_USER}@${EC2_HOST}" "mkdir -p '${REMOTE_INSTALL_DIR}'"
  scp -i "$TEMP_PEM" -P "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "$LOCAL_INSTALL_SCRIPT" \
    "${EC2_USER}@${EC2_HOST}:${REMOTE_INSTALL_SCRIPT}"
}

run_install_script() {
  log "Running install script on ${EC2_HOST}."
  ssh $(ssh_opts) "${EC2_USER}@${EC2_HOST}" "sudo bash '${REMOTE_INSTALL_SCRIPT}'"
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
  [[ -f "$LOCAL_INSTALL_SCRIPT" ]] || fail "Missing install script: ${LOCAL_INSTALL_SCRIPT}"
  prepare_pem_copy
  detect_ssh_user

  log "Using SSH target ${EC2_USER}@${EC2_HOST}:${SSH_PORT}"

  upload_install_script
  run_install_script

  log "EC2 prerequisite setup completed."
}

main "$@"
