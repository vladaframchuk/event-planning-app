PYTHON ?= python
COMPOSE ?= docker compose
PROD_COMPOSE = $(COMPOSE) -f docker-compose.prod.yml

.PHONY: init lint fmt up down logs check prod-build prod-up prod-down prod-restart createsuperuser

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

logs:
	$(PROD_COMPOSE) logs -f

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

createsuperuser:
	$(PROD_COMPOSE) run --rm backend python manage.py createsuperuser
