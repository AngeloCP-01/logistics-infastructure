#!/usr/bin/env bash
# Polls infra containers until healthy (or fails after timeout).
set -euo pipefail

TIMEOUT=60
INTERVAL=2
elapsed=0

check_rabbit() { docker exec logistics-rabbitmq rabbitmq-diagnostics ping >/dev/null 2>&1; }
check_redis()  { docker exec logistics-redis redis-cli ping 2>/dev/null | grep -q '^PONG$'; }

while (( elapsed < TIMEOUT )); do
  if check_rabbit && check_redis; then
    echo "RabbitMQ + Redis are healthy."
    exit 0
  fi
  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
  echo "  ...waiting ($elapsed/${TIMEOUT}s)"
done

echo "ERROR: services did not become healthy within ${TIMEOUT}s" >&2
exit 1
