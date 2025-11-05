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
   * `ghcr.io/<OWNER>/<REPO>-backend:{sha,latest}`
   * `ghcr.io/<OWNER>/<REPO>-frontend:{sha,latest}`
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

* `.env.prod` – боевые переменные окружения (PostgreSQL, Redis, Django, Grafana).
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

Мониторинг
----------

Стек описан в `docker-compose.monitoring.yml` и подключается к общей сети `event-planning-net`.

Команда запуска:
```bash
docker compose -f docker-compose.monitoring.yml up -d
```

Сервисы:

* Prometheus (`monitoring/prometheus/prometheus.yml`, правила `alerts.yml`);
* Grafana (`monitoring/grafana/provisioning` – datasource и dashboards);
* cAdvisor, node_exporter, nginx-prometheus-exporter.

### Grafana

* Доступ: `https://event-planning-app.ru/grafana`.
* Basic Auth: пользователь `grafana`, пароль `GrafanaPass123` (файл `nginx/grafana.htpasswd`; смените значения после деплоя).
* Creds Grafana admin: `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` в `.env.prod`.
* Дашборды: `cadvisor`, `node`, `django`, `nginx`.

### Prometheus и алерты

Prometheus собирает:

* `backend:8000/metrics` (django-prometheus + пользовательские Celery/WS метрики);
* `nginx-exporter:9113`;
* `cadvisor:8080`;
* `node_exporter:9100`.

Алерты (см. `monitoring/prometheus/alerts.yml`):

* InstanceDown, HighCPU, HighMemory, DiskFill;
* HTTP5xxRate, WSDisconnects, CeleryQueueLag;
* В `annotations.runbook` оставлены TODO для интеграции Alertmanager.

Метрики приложения
------------------

* `django-prometheus` добавлен в `INSTALLED_APPS` и middleware.
* Бэкенд доступен по `/metrics` внутри сети Docker (без проксирования Nginx).
* Пользовательские метрики (`backend/config/metrics.py`):
  * очередь Celery (`celery_task_queue_latency_seconds`, `celery_tasks_active`, success/failed/retried counters);
  * WebSocket (`channels_ws_active_connections`, `channels_ws_disconnects_total`, `channels_ws_errors_total`).
* Nginx не отдаёт `/metrics` наружу; `/grafana` защищён Basic Auth.

Полезные файлы
--------------

* `.github/workflows/deploy.yml` – CI/CD.
* `docker-compose.prod.yml`, `docker-compose.monitoring.yml`.
* `scripts/deploy.sh`, `scripts/rollback.sh`.
* Мониторинг: `monitoring/prometheus/*`, `monitoring/grafana/provisioning/*`.
* Nginx: `nginx/event-planning-app.ru.conf`, `nginx/grafana.htpasswd`.

Перед релизом проверьте, что `.env.prod`, `deploy.env` и htpasswd обновлены и не попадают в git.
