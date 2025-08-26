#!/bin/sh
echo "Waiting for PostgreSQL to start..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "PostgreSQL started"

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Starting Django server..."
exec python manage.py runserver 0.0.0.0:8000