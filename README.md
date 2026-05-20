# logistics-infrastructure

Local + deploy orchestration and shared workflow templates for the AI Logistics Platform.

## What's here

| Path | Purpose |
|---|---|
| `compose/docker-compose.yml` | Base RabbitMQ + Redis stack |
| `compose/docker-compose.dev.yml` | Dev override (in-memory Redis, dev/dev rabbit creds) |
| `deploy/render.yaml` | Render Blueprint skeleton; services are added in their own phases |
| `scripts/bootstrap.sh` | First-time local setup |
| `scripts/tail-logs.sh` | Follow logs from all infra containers |
| `scripts/healthcheck.sh` | Poll RabbitMQ + Redis until healthy |
| `shared/eslint.config.mjs` | Shared ESLint 9 flat config (consumed by Node services) |
| `shared/prettier.config.mjs` | Shared Prettier 3 config |
| `shared/tsconfig.base.json` | Shared TS base; services extend it |
| `.github/workflows/node-service.yml` | Reusable Node CI workflow |
| `.github/workflows/python-service.yml` | Reusable Python CI workflow |
| `examples/hello-world-service/` | Reference service exercising the reusable workflow |

## Get started locally

```bash
./scripts/bootstrap.sh
```

This brings up RabbitMQ (UI at http://localhost:15672, dev/dev) and Redis (localhost:6379).

## Consuming the reusable Node workflow

A Node service repo's `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  ci:
    uses: <gh-org>/logistics-infrastructure/.github/workflows/node-service.yml@main
    with:
      service-name: my-service
    secrets: inherit
```

## Render deploys

Each service uses its own Render service. Set `RENDER_DEPLOY_HOOK` as a repo secret pointing to the service's deploy webhook; the reusable workflow will trigger it after a successful push to GHCR.
