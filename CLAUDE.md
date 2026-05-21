# logistics-infrastructure — Repo Guide

> Local + deploy orchestration and shared workflow templates for the AI Logistics Platform.

**Phase:** 0 (foundation) — scaffold only; implementation per [`../docs/superpowers/plans/2026-05-18-phase-0-foundation.md`](../docs/superpowers/plans/2026-05-18-phase-0-foundation.md) Section B.
**Status:** ⬜ Not started

## What this repo is

The platform's plumbing. It contains:
- Docker Compose for local infra (RabbitMQ + Redis)
- Render Blueprint for cloud deployment
- Reusable GitHub Actions workflows that every service repo calls
- Shared lint / format / TypeScript configs
- A hello-world example service that exercises the reusable workflow end-to-end

This repo has NO service code of its own. The hello-world example exists only to validate the workflow.

## What ships from this repo

| Artifact | Path | Consumed by |
|---|---|---|
| Local infra stack | `compose/docker-compose.yml` + `compose/docker-compose.dev.yml` | Developer machines |
| Render Blueprint | `deploy/render.yaml` | Render auto-deploys (each service phase fills in its entry) |
| Reusable Node CI | `.github/workflows/node-service.yml` | Every Node service's `ci.yml` calls it |
| Reusable Python CI | `.github/workflows/python-service.yml` | AI service's `ci.yml` calls it |
| Shared configs | `shared/eslint.config.mjs`, `shared/prettier.config.mjs`, `shared/tsconfig.base.json` | All Node services |
| Helper scripts | `scripts/bootstrap.sh`, `scripts/tail-logs.sh`, `scripts/healthcheck.sh` | Developer ergonomics |

## Locked decisions

- **Local broker**: RabbitMQ 3.13 (management image), exposed on 5672 (AMQP) and 15672 (UI). Dev creds: `dev`/`dev`.
- **Local Redis**: Redis 7-alpine on 6379. Dev mode runs in-memory (no persistence).
- **Container registry**: GHCR (`ghcr.io/angelocp-01/<service>:<sha>` + `:latest`).
- **Render**: each service is its own Render service; deploy webhook stored as `RENDER_DEPLOY_HOOK` in each service repo's secrets.
- **Reusable workflow inputs**: `service-name`, `working-directory`, `run-tests`, `push-image`, `node-version` (or `python-version`).
- **Shared ESLint**: ESLint 9 flat config. Node services import it from this repo.

## Canonical shared configs (vendored by services)

Files in `shared/` are the source-of-truth that every Node service vendors. The platform decision (auth-service spec §15.1, coding-conventions §22) is **vendor + manual sync**: each service repo has its own copy because Docker COPY can't reach outside the build context in a polyrepo model.

| Canonical file               | Vendored at                     |
| ---------------------------- | ------------------------------- |
| `shared/tsconfig.base.json`  | `<service>/tsconfig.base.json`  |
| `shared/eslint.config.mjs`   | `<service>/eslint.config.mjs`   |
| `shared/prettier.config.mjs` | `<service>/prettier.config.mjs` |

**When you change a canonical file:** propagation is manual. Open a follow-up PR in each affected service repo copying the new content. Drift detection is a YAGNI candidate — add only if drift actually causes incidents.

## Layout (after Phase 0 ships)

```
compose/
  docker-compose.yml          # base: rabbit + redis
  docker-compose.dev.yml      # dev override
deploy/
  render.yaml                 # Render Blueprint (services added per phase)
scripts/
  bootstrap.sh                # first-time local setup
  tail-logs.sh                # follow all infra logs
  healthcheck.sh              # poll until healthy
shared/
  eslint.config.mjs           # ESLint 9 flat config
  prettier.config.mjs
  tsconfig.base.json
examples/
  hello-world-service/        # reference Node service (exercises reusable workflow)
.github/workflows/
  node-service.yml            # reusable Node CI
  python-service.yml          # reusable Python CI
  example-hello-world.yml     # runs node-service.yml against the example
  self-check.yml              # YAML lint + compose smoke + shellcheck
```

## Common commands (once Phase 0 ships)

```bash
./scripts/bootstrap.sh              # bring up RabbitMQ + Redis, wait for healthy
./scripts/tail-logs.sh              # follow logs
docker compose -f compose/docker-compose.yml down  # stop
```

## How a service repo uses this

Every Node service repo's `.github/workflows/ci.yml` is a thin wrapper:

```yaml
name: CI
on: [push, pull_request]
jobs:
  ci:
    uses: angelocp-01/logistics-infrastructure/.github/workflows/node-service.yml@main
    with:
      service-name: my-service
    secrets: inherit
```

The shared ESLint/Prettier/TS configs are referenced from each service's own config files. Service repos do NOT git-submodule this repo; they copy/import the configs.

## Conventions

- All workflows pin actions to major versions (e.g., `actions/checkout@v4`).
- All container images use `node:20-alpine` for Node, `python:3.12-slim` for Python.
- All compose service names match real service repo names (`auth-service`, not `auth`).
- All Render service names match repo names.

## Don't do

- Don't add a service's source code into this repo. Service code lives in its own repo.
- Don't put secrets in `render.yaml` or any compose file. Only env-var keys with placeholder values.
- Don't allow the reusable workflow to require secrets that some callers won't have — make optional things truly optional.
- Don't break the workflow interface (`workflow_call` inputs) without bumping a versioned tag and migrating callers.

## Pointers

- Spec: [`../docs/superpowers/specs/2026-05-18-platform-decomposition-design.md`](../docs/superpowers/specs/2026-05-18-platform-decomposition-design.md) §5 (conventions)
- Plan: [`../docs/superpowers/plans/2026-05-18-phase-0-foundation.md`](../docs/superpowers/plans/2026-05-18-phase-0-foundation.md) Section B
- Tracker: [`../docs/superpowers/tracker.md`](../docs/superpowers/tracker.md)
