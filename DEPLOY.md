# Turnkey Deploy Runbook — AI Logistics Platform

> **Target topology diagram:** [`../logistics-web/docs/diagrams/04-deployment-topology.md`](../logistics-web/docs/diagrams/04-deployment-topology.md)
>
> **Env-var naming conventions:** [`../docs/superpowers/specs/2026-05-18-coding-conventions.md`](../docs/superpowers/specs/2026-05-18-coding-conventions.md) §14
>
> This runbook documents a complete first-time deploy. No secret values appear anywhere in this file — it tells you **where** every value comes from, never the value itself.

---

## Execution order

```
Step 1 — Provision managed data tiers
Step 2 — Deploy backend on Render (apply the Blueprint)
Step 3 — Deploy frontend on Vercel
Step 4 — Order of operations & smoke verification
Step 5 — Known gaps & notes
```

All three role apps (customer · driver · admin) must be reachable before the smoke loop in Step 4 is meaningful.

---

## Step 1 — Provision managed data tiers

Provision every managed service **before** applying the Render Blueprint. The Blueprint expects the connection-string secrets to exist in the Render dashboard at apply time.

### 1a. Neon Postgres — 4 databases

Create four separate Neon projects (or four databases in one project with separate roles). Use the **pooled** connection endpoint in all env vars (Prisma pool size 3–5 per service; Render free instances are small).

| Neon database | Connection string → service env var |
|---|---|
| `logistics-auth` | pooled URL → `AUTH_DB_URL` on `logistics-auth-service` |
| `logistics-user` | pooled URL → `USER_DB_URL` on `logistics-user-service` |
| `logistics-order` | pooled URL → `ORDER_DB_URL` on `logistics-order-service` |
| `logistics-dispatch` | pooled URL → `DISPATCH_DB_URL` on `logistics-dispatch-service` |

Connection string format: `postgresql://<user>:<password>@<pooler-host>/<dbname>?sslmode=require`

### 1b. MongoDB Atlas — 2 clusters

Create two Atlas clusters (M0 free tier is sufficient for V1). Enable network access (allow Render IPs or `0.0.0.0/0` as a temporary measure) and create a database user per cluster.

| Atlas cluster | Connection string → service env var |
|---|---|
| `logistics-tracking` | `mongodb+srv://...` → `TRACKING_MONGO_URL` on `logistics-tracking-service` |
| `logistics-notification` | `mongodb+srv://...` → `NOTIF_MONGO_URL` on `logistics-notification-service` |

### 1c. CloudAMQP — RabbitMQ

Create one CloudAMQP instance (free Little Lemur tier works for V1). The AMQP URL is in the instance dashboard.

| Credential | → env var (all services) |
|---|---|
| AMQP URL (`amqps://...`) | `RABBITMQ_URL` on every backend service (auth, user, order, dispatch, tracking, notification) |

### 1d. Redis

Create one Redis instance (Render Redis, Upstash, or Redis Cloud). The service URL is in the provider dashboard.

| Credential | → env var |
|---|---|
| Redis URL (`redis://...` or `rediss://...`) | `REDIS_URL` on gateway, auth-service, dispatch-service, tracking-service |

### 1e. Resend — transactional email

Create a Resend account, add + verify your sending domain, and generate an API key.

| Credential | → env var |
|---|---|
| Resend API key | `NOTIF_RESEND_API_KEY` on `logistics-notification-service` |
| Verified sender address (e.g. `noreply@example.com`) | `NOTIF_EMAIL_FROM` on `logistics-notification-service` |

---

## Step 2 — Backend on Render

### 2a. Apply the Blueprint

In the Render dashboard: **New → Blueprint** → connect your GitHub org → select the `logistics-infrastructure` repo → Render reads [`deploy/render.yaml`](deploy/render.yaml) and creates all 7 services.

> **Note:** GHCR images are already published by each service repo's CI pipeline (`ghcr.io/angelocp-01/<service>:latest`). The Blueprint references the Docker runtime; Render pulls the image that each repo's CI pushed. No manual image build is needed here.

### 2b. Set secrets in the Render dashboard

Every key below is marked `sync: false` in [`deploy/render.yaml`](deploy/render.yaml) and **must be set in the Render dashboard before the first deploy completes successfully**. Set them under each service → **Environment → Secret Files or Environment Variables**.

#### logistics-gateway

| Secret key | Value comes from |
|---|---|
| `JWT_SECRET` | A 32+ char random string — **must equal `AUTH_JWT_SECRET`** (gateway verifies user tokens minted by auth-service) |
| `SERVICE_JWT_SECRET` | A different 32+ char random string — **must equal the `SERVICE_JWT_SECRET` / `USER_SERVICE_JWT_SECRET` shared ring** (see §2c) |
| `REDIS_URL` | Redis instance URL (Step 1d) |
| `GATEWAY_CORS_ORIGINS` | Comma-separated list of allowed origins — set to the Vercel deployment URL (e.g. `https://logistics-web.vercel.app`) plus any preview URLs needed; no wildcard; no trailing slash |

#### logistics-auth-service

| Secret key | Value comes from |
|---|---|
| `AUTH_DB_URL` | Neon `logistics-auth` pooled URL (Step 1a) |
| `AUTH_JWT_SECRET` | The **same value** as gateway's `JWT_SECRET` |
| `AUTH_SERVICE_JWT_SECRET` | A 32+ char random string — auth's own service-JWT signing key (distinct from `AUTH_JWT_SECRET`) |
| `RABBITMQ_URL` | CloudAMQP AMQP URL (Step 1c) |
| `REDIS_URL` | Redis instance URL (Step 1d) |
| `AUTH_SEED_ADMIN_EMAIL` | Email address for the seeded admin account |
| `AUTH_SEED_ADMIN_PASSWORD` | Password for the seeded admin account (strong; store in a password manager) |
| `AUTH_RETURN_RESET_TOKEN` | Set to `false` (or leave absent) — the dev-only token-return flag **must not be `true` in production** |
| `AUTH_RETURN_VERIFICATION_TOKEN` | Set to `false` (or leave absent) — same reasoning |

#### logistics-user-service

| Secret key | Value comes from |
|---|---|
| `USER_DB_URL` | Neon `logistics-user` pooled URL (Step 1a) |
| `USER_JWT_SECRET` | The **same value** as `AUTH_JWT_SECRET` — user-service verifies inbound user tokens |
| `USER_SERVICE_JWT_SECRET` | The **same value** as gateway's `SERVICE_JWT_SECRET` — user-service verifies inbound service tokens from order-service and dispatch-service |
| `RABBITMQ_URL` | CloudAMQP AMQP URL (Step 1c) |

#### logistics-order-service

| Secret key | Value comes from |
|---|---|
| `ORDER_DB_URL` | Neon `logistics-order` pooled URL (Step 1a) |
| `ORDER_JWT_SECRET` | The **same value** as `AUTH_JWT_SECRET` — order-service verifies inbound user tokens |
| `SERVICE_JWT_SECRET` | The **same value** as gateway's `SERVICE_JWT_SECRET` — order-service signs outbound service tokens to user-service; **must differ from `ORDER_JWT_SECRET`** (boot enforces this) |
| `RABBITMQ_URL` | CloudAMQP AMQP URL (Step 1c) |

#### logistics-dispatch-service

| Secret key | Value comes from |
|---|---|
| `DISPATCH_DB_URL` | Neon `logistics-dispatch` pooled URL (Step 1a) |
| `REDIS_URL` | Redis instance URL (Step 1d) |
| `JWT_SECRET` | The **same value** as `AUTH_JWT_SECRET` — dispatch-service verifies inbound user tokens |
| `SERVICE_JWT_SECRET` | The **same value** as gateway's `SERVICE_JWT_SECRET` — dispatch-service signs outbound service tokens to user-service; **must differ from `JWT_SECRET`** (boot enforces this) |
| `RABBITMQ_URL` | CloudAMQP AMQP URL (Step 1c) |

#### logistics-tracking-service

| Secret key | Value comes from |
|---|---|
| `TRACKING_MONGO_URL` | Atlas `logistics-tracking` connection string (Step 1b) |
| `REDIS_URL` | Redis instance URL (Step 1d) — used by the Socket.IO Redis adapter for horizontal fan-out |
| `RABBITMQ_URL` | CloudAMQP AMQP URL (Step 1c) |
| `JWT_SECRET` | The **same value** as `AUTH_JWT_SECRET` — tracking-service verifies WebSocket handshake tokens |

#### logistics-notification-service

| Secret key | Value comes from |
|---|---|
| `NOTIF_MONGO_URL` | Atlas `logistics-notification` connection string (Step 1b) |
| `RABBITMQ_URL` | CloudAMQP AMQP URL (Step 1c) |
| `JWT_SECRET` | The **same value** as `AUTH_JWT_SECRET` — notification-service verifies inbound user tokens |
| `NOTIF_RESEND_API_KEY` | Resend API key (Step 1e) |
| `NOTIF_EMAIL_FROM` | Verified Resend sender address (Step 1e) |

### 2c. JWT secret ring

All seven backend services share a consistent secret ring. The rule is:

- **User token verification:** every service that verifies user Bearer tokens must use the **same** value as `AUTH_JWT_SECRET`. The keys are named differently per service (`AUTH_JWT_SECRET`, `USER_JWT_SECRET`, `ORDER_JWT_SECRET`, `JWT_SECRET`) but must hold the **same secret**.
- **Service token verification:** every service that receives service JWTs from order-service or dispatch-service must use the same value as gateway's `SERVICE_JWT_SECRET`. The keys are named `SERVICE_JWT_SECRET` or `USER_SERVICE_JWT_SECRET` depending on service, but must hold the **same secret**.
- The two secrets (`AUTH_JWT_SECRET` and `SERVICE_JWT_SECRET`) **must be different from each other**. Several services enforce this at boot time and will refuse to start if they match.

### 2d. Per-service `RENDER_DEPLOY_HOOK` wiring

Each service repo's CI pipeline triggers a Render redeploy via a webhook after a successful image push. The deploy hook URL is available in the Render dashboard under each service → **Settings → Deploy Hooks**.

For each service, copy the hook URL from the Render dashboard and store it as `RENDER_DEPLOY_HOOK` in the **GitHub repository secrets** of the corresponding service repo. The reusable CI workflow in this repo reads it and calls it after pushing the new image to GHCR.

| Service | GitHub repo | Secret name |
|---|---|---|
| gateway | `angelocp-01/logistics-gateway` | `RENDER_DEPLOY_HOOK` |
| auth-service | `angelocp-01/logistics-auth-service` | `RENDER_DEPLOY_HOOK` |
| user-service | `angelocp-01/logistics-user-service` | `RENDER_DEPLOY_HOOK` |
| order-service | `angelocp-01/logistics-order-service` | `RENDER_DEPLOY_HOOK` |
| dispatch-service | `angelocp-01/logistics-dispatch-service` | `RENDER_DEPLOY_HOOK` |
| tracking-service | `angelocp-01/logistics-tracking-service` | `RENDER_DEPLOY_HOOK` |
| notification-service | `angelocp-01/logistics-notification-service` | `RENDER_DEPLOY_HOOK` |

### 2e. Note: database migrations

Each Prisma service (auth, user, order, dispatch) runs `prisma migrate deploy` as part of its Docker entrypoint or startup script. Confirm this is wired in each service's `Dockerfile` or `package.json` start command before the first deploy. The migration files are committed in each service repo and apply automatically.

---

## Step 3 — Frontend on Vercel

### 3a. Create the Vercel project

In the Vercel dashboard: **Add New → Project** → import from GitHub → select `angelocp-01/logistics-web`. Vercel auto-detects the Vite framework preset.

### 3b. Set environment variables

Set the following in Vercel → Project → **Settings → Environment Variables**. Mark each as applying to the `Production` environment (and `Preview` as needed).

| Variable | Value |
|---|---|
| `GATEWAY_URL` | The public Render URL of `logistics-gateway` (e.g. `https://logistics-gateway.onrender.com`) — this is the BFF function's backend |
| `VITE_API_BASE_URL` | `/api` (literal — the SPA calls same-origin `/api/*` which Vercel rewrites to the gateway) |
| `VITE_WS_URL` | The public Render URL of `logistics-tracking-service` (e.g. `https://logistics-tracking-service.onrender.com`) — the Socket.IO client connects to this origin with path `/v1/tracking/socket.io/` |
| `VITE_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/dark` (or your preferred MapLibre style JSON URL) |

### 3c. Replace the gateway origin placeholder in `vercel.json`

[`../logistics-web/vercel.json`](../logistics-web/vercel.json) currently contains:

```json
{ "source": "/api/:path*", "destination": "https://REPLACE_WITH_GATEWAY_ORIGIN/v1/:path*" }
```

Replace `REPLACE_WITH_GATEWAY_ORIGIN` with the actual Render gateway public URL (same value as `GATEWAY_URL` above, without a trailing slash). Commit and push that change to `logistics-web` before deploying, or update it immediately after the gateway URL is known.

Example after replacement:

```json
{ "source": "/api/:path*", "destination": "https://logistics-gateway.onrender.com/v1/:path*" }
```

The second rewrite rule (`/((?!api/).*) → /index.html`) is the SPA catch-all and does not need to change.

### 3d. Confirm CORS is aligned

After the Vercel deployment URL is known (e.g. `https://logistics-web.vercel.app`), go back to the Render dashboard and ensure `GATEWAY_CORS_ORIGINS` on `logistics-gateway` includes that origin. Update and redeploy the gateway if it does not.

---

## Step 4 — Order of operations & smoke verification

### 4a. Deployment order

Deploy in this order to avoid dependency races:

1. **Managed data tiers** (Step 1) — all must be reachable before any service starts.
2. **Backend services** (Step 2, Blueprint apply) — Render starts all 7 services simultaneously; each will boot-fail-fast if its dependency is missing. Wait until every service shows **Live** in the Render dashboard.
3. **Frontend** (Step 3, Vercel deploy) — must happen after the gateway URL is known so the `vercel.json` placeholder and `GATEWAY_URL` env var can be set correctly.

### 4b. Health checks per service

Once all services are green in the Render dashboard, verify each endpoint responds:

```
GET https://<service>.onrender.com/healthz   → 200 {"status":"ok"}
GET https://<service>.onrender.com/readyz    → 200 {"status":"ok",...}
```

The `/readyz` endpoint checks live dependencies (Postgres/Mongo connection, RabbitMQ channel, Redis ping). A failing `/readyz` indicates a misconfigured connection string or unreachable managed tier.

Services to check: `logistics-gateway`, `logistics-auth-service`, `logistics-user-service`, `logistics-order-service`, `logistics-dispatch-service`, `logistics-tracking-service`, `logistics-notification-service`.

For the gateway, the public URL is the only externally reachable one:
```
GET https://logistics-gateway.onrender.com/healthz
GET https://logistics-gateway.onrender.com/readyz
```

For other services on the Render private network, use the Render dashboard shell or a one-off Render service to reach their internal URLs, or temporarily enable the public URL for each service while verifying.

### 4c. End-to-end smoke loop

Run through the full delivery lifecycle to confirm every service wires up:

1. **Register** — `POST /v1/auth/register` (customer role). Expect 201. Check that the notification-service sent a welcome email via Resend.
2. **Login** — `POST /v1/auth/login`. Expect 200 + access token. Use it for subsequent requests.
3. **Get or create a driver** — register a second account with `role: driver`, log in, complete the driver profile (`PATCH /v1/users/me/driver`), toggle availability on (`PUT /v1/users/me/availability` → `{isAvailable: true}`).
4. **Place an order** — `POST /v1/orders`. Expect 201 + orderId. Verify `dispatch-service` received `order.created` (dispatch will immediately try to assign the available driver).
5. **Driver accepts offer** — poll `GET /v1/dispatch/offers/current` as the driver until an offer appears (should arrive within the `DISPATCH_OFFER_TTL_SECONDS` window), then `POST /v1/dispatch/assignments/{orderId}/accept`.
6. **Open the tracking screen** — connect the Socket.IO client to `VITE_WS_URL` with path `/v1/tracking/socket.io/` and emit `room:join {orderId}`. Verify no auth error.
7. **Driver sends location update** — emit `location:update {orderId, lat, lng}`. Verify the customer socket receives `driver:location`.
8. **Driver marks pickup** — emit `delivery:pickup {orderId}`. Verify order moves to `in_transit` (`GET /v1/orders/{orderId}` → `status: "in_transit"`).
9. **Driver marks complete** — emit `delivery:complete {orderId}`. Verify order moves to `completed`. Verify `delivery.completed` event reached notification-service (delivery email sent).
10. **Notifications feed** — `GET /v1/notifications` as the customer. Expect at least: order placed, driver assigned, on the way, delivered.

If any step fails, check the Render logs for the relevant service and look for `boot_failed` or error events.

---

## Step 5 — Known gaps & notes

### Tracking-service: use a paid Render tier

The `logistics-tracking-service` entry in [`deploy/render.yaml`](deploy/render.yaml) is set to `plan: free` as a placeholder. **Free tier Render services spin down after inactivity and drop WebSocket connections on wake-up.** The tracking service's primary transport is a persistent WebSocket (Socket.IO); customers and drivers will see disconnects if the service spins down mid-delivery.

**Action before production use:** upgrade `logistics-tracking-service` to at least the Render Starter ($7/month) plan in the Render dashboard. Update `plan: starter` in `render.yaml` at the same time to keep the Blueprint in sync.

### This runbook closes the per-phase Render follow-ups

Several service CLAUDE.md files noted a follow-up to add their service to the Render Blueprint:
- `logistics-order-service` was listed as missing from the Blueprint.
- `logistics-dispatch-service` was listed as missing from the Blueprint.
- `logistics-tracking-service` was listed as missing from the Blueprint.

All three services are now included in [`deploy/render.yaml`](deploy/render.yaml) alongside auth, user, gateway, and notification. This runbook's completion closes those open follow-ups.

### CORS origins: update when deployment URL changes

`GATEWAY_CORS_ORIGINS` (set in Step 2b for the gateway) must list every origin that the browser SPA runs from. After Vercel assigns a deployment URL or if custom domains are added, update this env var in the Render dashboard and redeploy the gateway. Common pattern: `https://logistics-web.vercel.app,https://your-custom-domain.com`. No wildcard; no trailing slash (see coding-conventions §14.6).

### Secret rotation

When rotating a shared JWT secret (e.g. `AUTH_JWT_SECRET`):
1. Generate a new secret value.
2. Update **all** services that hold a copy of that secret simultaneously in the Render dashboard (all "user token verification" services in §2c).
3. Trigger a redeploy of all affected services at the same time to minimize the window where some services hold the old secret and some the new one.
4. All existing access tokens signed with the old secret will immediately become invalid. Users will need to re-login. Refresh tokens (stored hashed in the auth DB) will also be invalidated since they cannot be exchanged for new access tokens.

Rotate `SERVICE_JWT_SECRET` separately following the same pattern (update gateway + order-service + dispatch-service + user-service simultaneously).

### `AUTH_RETURN_RESET_TOKEN` and `AUTH_RETURN_VERIFICATION_TOKEN`

These are dev-only flags that cause the auth-service to return token values in HTTP responses (enabling local testing without an email provider). They **must be absent or `false` in production**. They are listed as `sync: false` in the Blueprint so the operator explicitly sets them — set both to `false` in the Render dashboard for `logistics-auth-service`.

### Prisma migrations: verify entrypoint

Before the first production deploy, confirm each Prisma service's Docker entrypoint runs `prisma migrate deploy` (not `prisma db push`). `db push` is destructive on schema drift; `migrate deploy` applies committed migrations in order. Check each service's `Dockerfile` and `package.json` `start` script.

### MongoDB Atlas index bootstrapping

`logistics-tracking-service` and `logistics-notification-service` call `bootstrapMongo()` at boot, which idempotently creates the required collections, indexes (including the `2dsphere` index on the time-series `driver_locations` collection), and TTL settings. No manual Atlas index creation is needed — but the Atlas cluster must be reachable at boot time.
