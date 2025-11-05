Event Planning App
==================

Проект для планирования событий: Django + Channels, Celery, Redis, PostgreSQL, Next.js и Nginx. В репозитории подготовлены production-окружение, CI/CD и мониторинг.

Локальный запуск
----------------

1. Установите Docker и Docker Compose.
2. Скопируйте переменные окружения:
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```
3. Поднимите стек:
   ```bash
   docker compose up -d --build
   ```
4. Проверьте доступность:
   * Backend: http://localhost:8000/api/health
   * Frontend: http://localhost:3000
5. Остановите контейнеры при завершении работы:
   ```bash
   docker compose down
   ```

Прод-окружение и CI/CD
----------------------

Workflow `.github/workflows/deploy.yml` запускается при push в ветку `main` и по `workflow_dispatch`. Процесс:

1. Buildx собирает и пушит образы в GHCR:
   * `ghcr.io/vladaframchuk/event-planning-app-backend:{sha,latest}`
   * `ghcr.io/vladaframchuk/event-planning-app-frontend:{sha,latest}`
2. SSH-деплой на сервер `89.108.113.118`:
   * логин в GHCR;
   * `docker compose -f docker-compose.prod.yml pull && up -d`;
   * `manage.py migrate` и `collectstatic`;
   * health-check `https://event-planning-app.ru/api/health`.
3. При сбое выполняется роллбек на предыдущие теги из `prev_deploy.env`.

### GitHub secrets

Добавьте в настройках репозитория:

* `GHCR_USERNAME` – владелец репозитория в GitHub;
* `GHCR_TOKEN` – токен с правами `write:packages` (можно `GITHUB_TOKEN`);
* `SSH_USER` – пользователь на сервере;
* `SSH_HOST` – `89.108.113.118`;
* `SSH_KEY` – приватный ключ, используемый для входа;
* `SSH_KNOWN_HOSTS` – вывод `ssh-keyscan 89.108.113.118`.

### Production-конфигурация

* `.env.prod` – боевые переменные окружения (PostgreSQL, Redis, Django).
* `deploy.env` – текущие образы (`BACKEND_TAG`, `FRONTEND_TAG`, `REGISTRY_IMAGE_PREFIX`).
* `prev_deploy.env` – предыдущий релиз (создаётся автоматически, не коммитится).

### Скрипты и Makefile

* `make prod-build` – собрать образы локально.
* `make prod-up` / `make prod-down` / `make prod-restart`.
* `make prod-logs` – tail логов.
* `make prod-migrate` – миграции в работающем стеке.
* `make deploy` – локальный вызов `scripts/deploy.sh` (требуются экспортированные переменные).
* `make rollback` – вызов `scripts/rollback.sh`.
* Health-проверка после успешного деплоя: `https://event-planning-app.ru/api/health`.

Образы backend/frontend задаются через `REGISTRY_IMAGE_PREFIX` и теги в `deploy.env`. При релизе `deploy.sh` сохраняет предыдущие значения в `prev_deploy.env`.

Перед релизом проверьте, что `.env.prod` и `deploy.env` обновлены и не попадают в git.
