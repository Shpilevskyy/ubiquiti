# Progress

> Living status file for this assignment. Read this first in any new session before touching
> code — it should make re-deriving context from git log/specs unnecessary. Update it at the
> end of any session that changes status, decisions, or environment.

## Snapshot (2026-09-11)

Deployed and live at **https://ubiquiti-635h.onrender.com/**. Prisma schema (List/Todo/SubTask),
local Postgres via docker-compose, and a Render-managed Postgres are all in place; the initial
migration has been applied both locally and on Render (confirmed via deploy log — `prisma migrate
deploy` ran clean). Full REST API (Lists/Todos/SubTasks, per
[specs/03-api-rest.md](specs/03-api-rest.md)) is implemented and manually verified locally
against Postgres — create/read/update/delete, idempotent create+delete, `version` incrementing
on update, 400/404 error cases. None of it is exercised through Render yet (not redeployed since
before this API work), and there's still no UI — the frontend is just the hello-world scaffold.

## Environment

- **Live URL**: https://ubiquiti-635h.onrender.com/
- **Repo**: github.com/Shpilevskyy/ubiquiti (public for now — must go private after review, per
  [specs/12-deployment.md](specs/12-deployment.md))
- **Hosting**: Render Web Service (not Static Site — this app needs a live Node process for the
  API + WebSocket)
- **Build command**: `npm install --include=dev && npm run build` — the `--include=dev` is
  required because `NODE_ENV=production` (set as a Render env var) otherwise makes `npm install`
  skip devDependencies (vite, typescript, @types/react, etc.), breaking the `tsc` build step.
- **Start command**: `npm run start` — runs `prisma migrate deploy && node dist/index.js`, so
  migrations apply automatically on every deploy.
- **Env vars set on Render**: `NODE_ENV=production`, `DATABASE_URL` (Render Postgres, Internal
  Database URL, same region as the Web Service)
- **Postgres**: connected on Render (free plan — remember it expires after 30 days on the free
  tier; recreate + re-point `DATABASE_URL` if this runs longer than that). Local dev still uses
  `docker compose up -d postgres` (see [docker-compose.yml](docker-compose.yml)) with
  `apps/server/.env` copied from `.env.example`.

## Completed

- [x] Monorepo scaffold: `apps/web` (React 19 + Vite), `apps/server` (Fastify + Socket.IO),
      `packages/shared` (commit 83b421d)
- [x] Design docs written: `specs/00` through `specs/12`
- [x] Deployed scaffold to Render as a Web Service, `/healthz` + hello-world API/WS all working
- [x] Prisma schema + initial migration, local Postgres via docker-compose
- [x] Render Postgres created and connected; migration applied and verified live
- [x] Lists REST API (POST/GET/PATCH `/api/lists`) — [specs/03-api-rest.md](specs/03-api-rest.md)
- [x] Todos REST API (POST/PATCH/DELETE `/api/lists/:listId/todos`)
- [x] SubTasks REST API (POST/PATCH/DELETE `/api/lists/:listId/todos/:todoId/subtasks`)
- [x] Unified error shape (`{ error: { code, message } }`) across all error paths, including
      malformed JSON and unmatched routes, not just handled ones — see
      [specs/03-api-rest.md](specs/03-api-rest.md#error-shape)

## Next up (in rough order, mapped to specs)

- [ ] Minimal UI wired to the API (list view, create/toggle/delete)
- [ ] Realtime protocol (Socket.IO events) — [specs/04-realtime-protocol.md](specs/04-realtime-protocol.md)
- [ ] Sync / conflict resolution — [specs/05-sync-conflict-resolution.md](specs/05-sync-conflict-resolution.md)
- [ ] Offline sync — [specs/06-offline-sync.md](specs/06-offline-sync.md)
- [ ] Frontend architecture — [specs/07-frontend-architecture.md](specs/07-frontend-architecture.md)
- [ ] Drag and drop — [specs/08-drag-and-drop.md](specs/08-drag-and-drop.md)
- [ ] Markdown descriptions — [specs/09-markdown-descriptions.md](specs/09-markdown-descriptions.md)
- [ ] Sharing and presence — [specs/10-sharing-and-presence.md](specs/10-sharing-and-presence.md)
- [ ] Testing — [specs/11-testing-strategy.md](specs/11-testing-strategy.md)
- [ ] Make repo private after reviewer has seen it

## Decisions & deviations from specs

- Hosting: chose Render over Heroku (Heroku dropped free dynos/Postgres; Render's free tier
  covers both web service and DB for a demo-length review window).
- Ruled out GitHub Pages / Render Static Site entirely — this app needs a persistent server
  process (WebSocket + API), which static hosting can't provide.
- Sequencing: building the full REST API (Lists → Todos → SubTasks) before any UI work, then a
  UI task per resource — keeps each task small/reviewable and each layer independently testable
  (curl/automated tests for API, browser for UI) rather than mixing both per task.
- No codegen between Prisma models and the shared zod wire schemas — see
  [specs/02-data-model.md](specs/02-data-model.md#prisma-models-vs-shared-zod-schemas--no-codegen).

## Open questions

- (none currently)
