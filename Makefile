PYTHON ?= python

.PHONY: init lint fmt up down logs check backend-lint backend-fmt

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
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

check:
	$(MAKE) -C backend test
	cd frontend && npm run lint
	cd frontend && npm run typecheck
	cd frontend && npm run test
