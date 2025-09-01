#!/bin/bash
# Stop local development environment for Medeez v2

echo "Stopping Medeez v2 local development environment..."

docker-compose -f docker-compose.local.yml down

echo "Local development environment stopped."
