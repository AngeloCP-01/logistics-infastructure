#!/usr/bin/env bash
# First-time setup: brings up the local infra stack.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling images..."
docker compose -f compose/docker-compose.yml -f compose/docker-compose.dev.yml pull

echo "==> Starting RabbitMQ + Redis..."
docker compose -f compose/docker-compose.yml -f compose/docker-compose.dev.yml up -d

echo "==> Waiting for healthchecks..."
bash "$(dirname "$0")/healthcheck.sh"

echo
echo "Ready."
echo "  RabbitMQ AMQP:  amqp://dev:dev@localhost:5672"
echo "  RabbitMQ UI:    http://localhost:15672 (dev/dev)"
echo "  Redis:          redis://localhost:6379"
