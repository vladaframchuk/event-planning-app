#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR=${PROJECT_DIR:-$HOME/event-planning-app}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${ENV_FILE:-.env.prod}
DEPLOY_ENV=${DEPLOY_ENV:-deploy.env}
PREV_DEPLOY_ENV=${PREV_DEPLOY_ENV:-prev_deploy.env}
HEALTHCHECK_URL=${HEALTHCHECK_URL:-https://event-planning-app.ru/api/health}

BACKEND_TAG=${BACKEND_TAG:?}
FRONTEND_TAG=${FRONTEND_TAG:?}
GHCR_USERNAME=${GHCR_USERNAME:?}
GHCR_TOKEN=${GHCR_TOKEN:?}
REGISTRY_IMAGE_PREFIX=${REGISTRY_IMAGE_PREFIX:?}

cd "$PROJECT_DIR"

touch "$DEPLOY_ENV" "$PREV_DEPLOY_ENV"
if [ -s "$DEPLOY_ENV" ]; then
  cp "$DEPLOY_ENV" "$PREV_DEPLOY_ENV"
fi

cat > "$DEPLOY_ENV" <<EOF
BACKEND_TAG=$BACKEND_TAG
FRONTEND_TAG=$FRONTEND_TAG
REGISTRY_IMAGE_PREFIX=$REGISTRY_IMAGE_PREFIX
EOF

updated=1

rollback() {
  trap - ERR
  if [ "$updated" -eq 1 ] && [ -s "$PREV_DEPLOY_ENV" ]; then
    cp "$PREV_DEPLOY_ENV" "$DEPLOY_ENV"
    set -a
    . "$PREV_DEPLOY_ENV"
    set +a
    printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
  fi
  exit 1
}

trap rollback ERR

set -a
. "$DEPLOY_ENV"
set +a

printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend python manage.py migrate --noinput
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend python manage.py collectstatic --noinput
curl --fail --retry 5 --retry-delay 5 --connect-timeout 5 "$HEALTHCHECK_URL" > /dev/null

updated=0
