# 12 — Deployment

Target: Render (see [01-architecture.md](01-architecture.md) for why). One Web Service + one
managed PostgreSQL instance.

## Web Service

- **Build command**: `npm install && npm run build` — builds `packages/shared`, then
  `apps/web` (Vite production build) and `apps/server` (TS → JS) in dependency order.
- **Start command**: `npm run start` — runs the compiled Fastify server, which:
  - serves `apps/web/dist` as static assets
  - serves the REST API under `/api`
  - upgrades the Socket.IO endpoint
  - runs `prisma migrate deploy` on boot (or as a Render "Pre-Deploy Command", if we want deploy
    to fail fast on a bad migration rather than crash-looping the app)
- **Health check**: `GET /healthz` → `200 ok`, used by Render to gate traffic during deploys.

## Database

Render-managed PostgreSQL. Connection string injected as `DATABASE_URL`. No manual provisioning
beyond creating the instance and linking it to the web service's env vars.

## Environment variables

| Var | Source |
|---|---|
| `DATABASE_URL` | Render Postgres instance (auto-linked) |
| `PORT` | set by Render |
| `NODE_ENV` | `production` |

## Local development

- `docker compose up` for a local Postgres only (app itself runs directly on the host for fast
  reload).
- `npm run dev` at the root runs the Vite dev server (web) and the Fastify server (with
  `tsx watch` or similar) concurrently; Vite proxies `/api` and the socket path to the server.
- `npx prisma migrate dev` for local schema changes.

## Repo/access hygiene (assignment requirement, manual step — not automated)

- Push to a GitHub repo, deploy from it on Render.
- Send the reviewer the hosted URL and the repo link.
- **After the review is complete, mark the repository private** — per the assignment notes.
