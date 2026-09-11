# Progress

> Living status file for this assignment. Read this first in any new session before touching
> code — it should make re-deriving context from git log/specs unnecessary. Update it at the
> end of any session that changes status, decisions, or environment.

## Snapshot (2026-09-11)

Monorepo scaffold is deployed to Render as a hello-world. Prisma schema (List/Todo/SubTask) and
local Postgres via docker-compose are now in place, with an initial migration generated and
applied locally. No API routes use the DB yet — next up is the REST API.

## Environment

- **Repo**: github.com/Shpilevskyy/ubiquiti (public for now — must go private after review, per
  [specs/12-deployment.md](specs/12-deployment.md))
- **Hosting**: Render Web Service (not Static Site — this app needs a live Node process for the
  API + WebSocket)
- **Build command**: `npm install --include=dev && npm run build` — the `--include=dev` is
  required because `NODE_ENV=production` (set as a Render env var) otherwise makes `npm install`
  skip devDependencies (vite, typescript, @types/react, etc.), breaking the `tsc` build step.
- **Start command**: `npm run start`
- **Env vars set on Render**: `NODE_ENV=production`
- **Postgres**: local only so far, via `docker compose up -d postgres` (see
  [docker-compose.yml](docker-compose.yml)). `apps/server/.env.example` has the local
  `DATABASE_URL` — copy to `apps/server/.env` to run migrations/dev locally. Render Postgres not
  yet created; plan is Render-managed instance + `DATABASE_URL` env var on the Web Service (see
  [specs/12-deployment.md](specs/12-deployment.md)).
- Server `build` now runs `prisma generate` first; `start` runs `prisma migrate deploy` before
  booting, so migrations apply automatically on each Render deploy once `DATABASE_URL` is set
  there. Until then, `npm run start` in production would fail without `DATABASE_URL` — expected,
  since Postgres isn't connected on Render yet.

## Completed

- [x] Monorepo scaffold: `apps/web` (React 19 + Vite), `apps/server` (Fastify + Socket.IO),
      `packages/shared` (commit 83b421d)
- [x] Design docs written: `specs/00` through `specs/12`
- [x] Deployed scaffold to Render as a Web Service, `/healthz` + hello-world API/WS all working

## Next up (in rough order, mapped to specs)

- [ ] Data model + Prisma schema — [specs/02-data-model.md](specs/02-data-model.md)
- [ ] REST API — [specs/03-api-rest.md](specs/03-api-rest.md)
- [ ] Realtime protocol (Socket.IO events) — [specs/04-realtime-protocol.md](specs/04-realtime-protocol.md)
- [ ] Sync / conflict resolution — [specs/05-sync-conflict-resolution.md](specs/05-sync-conflict-resolution.md)
- [ ] Offline sync — [specs/06-offline-sync.md](specs/06-offline-sync.md)
- [ ] Frontend architecture — [specs/07-frontend-architecture.md](specs/07-frontend-architecture.md)
- [ ] Drag and drop — [specs/08-drag-and-drop.md](specs/08-drag-and-drop.md)
- [ ] Markdown descriptions — [specs/09-markdown-descriptions.md](specs/09-markdown-descriptions.md)
- [ ] Sharing and presence — [specs/10-sharing-and-presence.md](specs/10-sharing-and-presence.md)
- [ ] Testing — [specs/11-testing-strategy.md](specs/11-testing-strategy.md)
- [ ] Connect Render Postgres + Prisma migrations, redeploy — [specs/12-deployment.md](specs/12-deployment.md)
- [ ] Make repo private after reviewer has seen it

## Decisions & deviations from specs

- Hosting: chose Render over Heroku (Heroku dropped free dynos/Postgres; Render's free tier
  covers both web service and DB for a demo-length review window).
- Ruled out GitHub Pages / Render Static Site entirely — this app needs a persistent server
  process (WebSocket + API), which static hosting can't provide.

## Open questions

- (none currently)
