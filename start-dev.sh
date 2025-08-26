#!/bin/bash
echo "Stopping existing containers..."
docker-compose down

echo "Building and starting all services in detached mode..."
docker-compose up -d --build

echo "Development environment is starting up!"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo "To view logs, run: docker-compose logs -f"