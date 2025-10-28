.PHONY: lint fmt test

lint:
	python -m flake8 apps config
	python -m mypy apps config

fmt:
	python -m isort apps config
	python -m black apps config

test:
	python -m pytest tests
