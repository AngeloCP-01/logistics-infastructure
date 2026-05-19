#!/usr/bin/env bash
# Tail logs from all running infra containers.
set -euo pipefail
cd "$(dirname "$0")/.."
exec docker compose -f compose/docker-compose.yml -f compose/docker-compose.dev.yml logs -f
