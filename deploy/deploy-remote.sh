#!/usr/bin/env bash
# Deploy FUTGRN → VPS tips3x3
# Uso (Git Bash / WSL): bash deploy/deploy-remote.sh
set -euo pipefail

HOST="${FUTGREEN_HOST:-tips3x3}"
APP_DIR=/var/www/futgreen
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Sync → ${HOST}:${APP_DIR}"
if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete \
    --exclude node_modules \
    --exclude .git \
    --exclude data/futgreen.json \
    --exclude data/teams-cache.json \
    --exclude .env \
    --exclude logs \
    "${LOCAL_ROOT}/" "${HOST}:${APP_DIR}/"
else
  echo "    (sem rsync — usando tar|ssh)"
  cd "$LOCAL_ROOT"
  tar \
    --exclude=./node_modules \
    --exclude=./.git \
    --exclude=./data/futgreen.json \
    --exclude=./data/teams-cache.json \
    --exclude=./.env \
    --exclude=./.env.local \
    --exclude=./logs \
    --exclude=./.cursor \
    -czf - . | ssh "$HOST" "mkdir -p ${APP_DIR} && tar -xzf - -C ${APP_DIR}"
fi

if [[ -f "${LOCAL_ROOT}/.env.production" ]]; then
  echo "==> Enviando .env.production → .env"
  scp "${LOCAL_ROOT}/.env.production" "${HOST}:${APP_DIR}/.env"
fi

echo "==> Setup / restart na VPS"
ssh "$HOST" "bash ${APP_DIR}/deploy/setup-vps.sh"

echo ""
echo "Health: curl -sf https://futgreen.com.br/health || curl -sf http://127.0.0.1:3101/health (na VPS)"
