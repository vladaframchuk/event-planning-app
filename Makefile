PYTHON ?= python
COMPOSE ?= docker compose
PROD_ENV_FILE ?= .env.prod
PROD_COMPOSE = $(COMPOSE) --env-file $(PROD_ENV_FILE) -f docker-compose.prod.yml

.PHONY: init lint fmt up down check prod-build prod-up prod-down prod-restart prod-logs prod-migrate createsuperuser deploy rollback

init:
	$(PYTHON) -m pip install -r backend/requirements.txt
	$(PYTHON) -m pip install -r backend/requirements-dev.txt
	cd frontend && npm install
	$(PYTHON) -m pip install pre-commit
	pre-commit install

lint:
	$(MAKE) -C backend lint
	cd frontend && npm run lint

fmt:
	$(MAKE) -C backend fmt
	cd frontend && npm run fmt

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

check:
	$(MAKE) -C backend test
	cd frontend && npm run lint
	cd frontend && npm run typecheck
	cd frontend && npm run test

prod-build:
	$(PROD_COMPOSE) build --pull

prod-up:
	$(PROD_COMPOSE) up -d

prod-down:
	$(PROD_COMPOSE) down

prod-restart:
	$(PROD_COMPOSE) up -d --force-recreate

prod-logs:
	$(PROD_COMPOSE) logs -f

prod-migrate:
	$(PROD_COMPOSE) exec -T backend python manage.py migrate --noinput

createsuperuser:
	$(PROD_COMPOSE) run --rm backend python manage.py createsuperuser

deploy:
	bash ./scripts/deploy.sh

rollback:
	bash ./scripts/rollback.sh
 