Event Planning App
================

## Локальный запуск

1. Установите Docker и Docker Compose (https://docs.docker.com/get-docker/).
2. Скопируйте настройки бэкенда:
   ```bash
   cp backend/.env.example backend/.env
   ```
3. Запустите контейнеры:
   ```bash
   docker compose up -d --build
   # или
   make up
   ```
4. Дождитесь, пока backend (http://localhost:8000/api/health) и frontend (http://localhost:3000) станут доступны.
5. По завершении работы остановите контейнеры:
   ```bash
   docker compose down
   ```

## Развёртывание в продакшене

1. Подготовка сервера (рекомендуется Ubuntu 22.04)
   - Обновите пакеты:
     ```bash
     sudo apt update && sudo apt upgrade -y
     ```
   - Установите зависимости:
     ```bash
     sudo apt install -y ca-certificates curl gnupg ufw
     ```
   - Установите Docker Engine и Docker Compose (см. https://docs.docker.com/engine/install/ubuntu/)
   - Включите Docker при загрузке:
     ```bash
     sudo systemctl enable --now docker
     ```
   - Настройте брандмауэр (опционально, но рекомендуется):
     ```bash
     sudo ufw allow OpenSSH
     sudo ufw allow 80/tcp
     sudo ufw allow 443/tcp
     sudo ufw enable
     ```
   - Установите часовой пояс:
     ```bash
     sudo timedatectl set-timezone Europe/Moscow
     ```

2. Клонирование репозитория
   ```bash
   git clone https://github.com/vladaframchuk/event-planning-app.git
   cp .env.example .env.prod
   ```
   Заполните .env.prod боевыми значениями (секретный ключ, параметры БД, пароль от Yandex SMTP и т. д.).

3. Настройка почты Yandex 360
   - Подтвердите домен event-planning-app.ru в Yandex 360 для бизнеса.
   - Укажите в DNS у регистратора:
     - MX → mx.yandex.net
     - TXT (SPF) → v=spf1 include:_spf.yandex.net a mx ~all
     - Добавьте DKIM-запись после подтверждения домена.
   - Создайте почтовый ящик notify@event-planning-app.ru.
   - Сгенерируйте пароль приложения и добавьте его в .env.prod (EMAIL_HOST_PASSWORD).

4. Сборка и запуск продакшен-стека
   - Подгрузите переменные окружения (на время текущей сессии):
     ```bash
     set -a
     source .env.prod
     set +a
     ```
   - Соберите и запустите контейнеры:
     ```bash
     make prod-build
     make prod-up
     ```
   - Проверьте статус контейнеров:
     ```bash
     docker compose -f docker-compose.prod.yml ps
     ```

5. Выпуск HTTPS-сертификатов
   ```bash
   docker compose -f docker-compose.prod.yml run --rm certbot certonly \
     --webroot -w /var/www/certbot \
     -d event-planning-app.ru \
     -d www.event-planning-app.ru \
     --email "$CERTBOT_EMAIL" \
     --agree-tos \
     --no-eff-email
   docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
   ```

   Добавьте в cron (от root):
   ```bash
   sudo crontab -e
   ```
   и вставьте строку:
   ```bash
   0 3 * * * cd /opt/event-planning-app && docker compose -f docker-compose.prod.yml run --rm certbot renew --quiet && docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
   ```
   (замените /opt/event-planning-app на путь к проекту).

6. Проверка после деплоя
   - https://event-planning-app.ru — загружается фронтенд (Next.js).
   - https://event-planning-app.ru/api/health — возвращает {"status": "ok"}.
   - https://event-planning-app.ru/doc/ — документация ReDoc.
   - https://event-planning-app.ru/doc/swagger/ — Swagger UI.
   - https://event-planning-app.ru/admin/ — админка Django.
   - WebSocket-соединения (чат/задачи) обновляются в реальном времени.
   - Письма о регистрации и сбросе пароля приходят в почту.

7. Операции:
   - Просмотр логов:
     ```bash
     make logs
     ```
   - Перезапуск стека:
     ```bash
     make prod-restart
     ```
   - Остановка стека:
     ```bash
     make prod-down
     ```
   - Создание администратора:
     ```bash
     make createsuperuser
     ```
   - Пример резервного копирования БД:
     ```bash
     docker compose -f docker-compose.prod.yml exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
     ```
   - Просмотр логов конкретного сервиса:
     ```bash
     docker compose -f docker-compose.prod.yml logs -f backend
     ```

Примечания
----------
- Статические файлы хранятся в томе static_data (/app/static), медиа — в media_data.
- Daphne обслуживает ASGI-приложение; Redis используется для Channels и Celery.
- Nginx проксирует /api/ на Django, /ws/ для WebSocket’ов и / на Next.js, с включённым HSTS.
- Проверки здоровья контейнеров управляют запуском через depends_on с condition: service_healthy.
