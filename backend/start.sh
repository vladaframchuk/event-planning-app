#!/bin/sh
set -o errexit
set -o pipefail

echo "Waiting for database..."
python <<'PY'
import os
import time
from urllib.parse import urlparse

import psycopg2

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    raise SystemExit("DATABASE_URL is not set")

parsed = urlparse(db_url)
connect_kwargs = {
    "host": parsed.hostname,
    "port": parsed.port or 5432,
    "dbname": parsed.path.lstrip("/"),
    "user": parsed.username,
    "password": parsed.password,
}

for _ in range(30):
    try:
        psycopg2.connect(**connect_kwargs).close()
        break
    except psycopg2.OperationalError:
        time.sleep(2)
else:
    raise SystemExit("Database is unavailable after waiting")
PY

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting Daphne..."
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
