#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR=${PROJECT_DIR:-$HOME/event-planning-app}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${ENV_FILE:-.env.prod}
DEPLOY_ENV=${DEPLOY_ENV:-deploy.env}
PREV_DEPLOY_ENV=${PREV_DEPLOY_ENV:-prev_deploy.env}
HEALTHCHECK_URL=${HEALTHCHECK_URL:-https://event-planning-app.ru/api/health}

GHCR_USERNAME=${GHCR_USERNAME:?}
GHCR_TOKEN=${GHCR_TOKEN:?}

cd "$PROJECT_DIR"

if [ ! -s "$PREV_DEPLOY_ENV" ]; then
  echo "prev_deploy.env is missing or empty" >&2
  exit 1
fi

cp "$PREV_DEPLOY_ENV" "$DEPLOY_ENV"

set -a
. "$DEPLOY_ENV"
set +a

printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
curl --fail --retry 5 --retry-delay 5 --connect-timeout 5 "$HEALTHCHECK_URL" > /dev/null
