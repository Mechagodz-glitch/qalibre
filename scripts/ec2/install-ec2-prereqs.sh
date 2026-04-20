#!/usr/bin/env bash
set -Eeuo pipefail

# Run this on the EC2 host after the deploy script uploads it.

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  printf '\n[ERROR] %s\n' "$*" >&2
  exit 1
}

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo -E bash "$0" "$@"
  fi
  fail "Run this script as root or with sudo privileges."
fi

DOCKER_COMPOSE_VERSION="${DOCKER_COMPOSE_VERSION:-v2.29.7}"
TARGET_USER="${DEPLOY_USER:-${SUDO_USER:-}}"

if [[ -z "$TARGET_USER" ]]; then
  for candidate in ec2-user ubuntu admin; do
    if id "$candidate" >/dev/null 2>&1; then
      TARGET_USER="$candidate"
      break
    fi
  done
fi

install_common_packages_apt() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    openssl \
    rsync \
    tar \
    gzip \
    unzip \
    docker.io

  if ! apt-get install -y --no-install-recommends docker-compose-plugin; then
    log "docker-compose-plugin package not available via apt. Falling back to manual install."
  fi
}

install_common_packages_dnf() {
  dnf install -y \
    ca-certificates \
    curl \
    git \
    jq \
    openssl \
    rsync \
    tar \
    gzip \
    unzip \
    docker

  if ! dnf install -y docker-compose-plugin; then
    log "docker-compose-plugin package not available via dnf. Falling back to manual install."
  fi
}

install_common_packages_yum() {
  yum install -y \
    ca-certificates \
    curl \
    git \
    jq \
    openssl \
    rsync \
    tar \
    gzip \
    unzip \
    docker

  if ! yum install -y docker-compose-plugin; then
    log "docker-compose-plugin package not available via yum. Falling back to manual install."
  fi
}

install_compose_plugin_fallback() {
  if docker compose version >/dev/null 2>&1; then
    return
  fi

  local os arch plugin_dir plugin_path
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    *)
      fail "Unsupported architecture for Docker Compose plugin fallback: $arch"
      ;;
  esac

  plugin_dir="/usr/local/lib/docker/cli-plugins"
  plugin_path="${plugin_dir}/docker-compose"
  mkdir -p "$plugin_dir"

  log "Installing Docker Compose plugin ${DOCKER_COMPOSE_VERSION} manually."
  curl -fsSL \
    "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-${os}-${arch}" \
    -o "$plugin_path"
  chmod +x "$plugin_path"

  docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin installation failed."
}

ensure_docker_running() {
  systemctl daemon-reload || true
  systemctl enable --now docker
  systemctl is-active --quiet docker || fail "Docker service is not running."
}

configure_docker_group() {
  getent group docker >/dev/null 2>&1 || groupadd docker

  if [[ -n "$TARGET_USER" ]] && id "$TARGET_USER" >/dev/null 2>&1; then
    usermod -aG docker "$TARGET_USER" || true
    log "Added ${TARGET_USER} to the docker group."
  fi
}

prepare_directories() {
  mkdir -p /opt/qalibre
  mkdir -p /opt/qalibre/backups
  mkdir -p /opt/qalibre/shared

  if [[ -n "$TARGET_USER" ]] && id "$TARGET_USER" >/dev/null 2>&1; then
    chown -R "$TARGET_USER:$TARGET_USER" /opt/qalibre
  fi
}

main() {
  log "Installing EC2 prerequisites for QAlibre."

  if command -v apt-get >/dev/null 2>&1; then
    install_common_packages_apt
  elif command -v dnf >/dev/null 2>&1; then
    install_common_packages_dnf
  elif command -v yum >/dev/null 2>&1; then
    install_common_packages_yum
  else
    fail "Unsupported Linux distribution. Expected apt, dnf, or yum."
  fi

  ensure_docker_running
  configure_docker_group
  install_compose_plugin_fallback
  prepare_directories

  log "Installed tooling summary:"
  docker --version
  docker compose version
  git --version
  jq --version
  local rsync_version
  rsync_version="$(rsync --version)"
  printf '%s\n' "${rsync_version%%$'\n'*}"

  log "EC2 prerequisite setup completed."
  if [[ -n "$TARGET_USER" ]]; then
    log "Open a new shell session for ${TARGET_USER} if docker group membership does not apply immediately."
  fi
}

main "$@"
