#!/bin/sh
echo "Waiting for PostgreSQL to start..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "PostgreSQL started"

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Starting ASGI server..."
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
