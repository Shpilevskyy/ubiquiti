# Progress

> Living status file for this assignment. Read this first in any new session before touching
> code — it should make re-deriving context from git log/specs unnecessary. Update it at the
> end of any session that changes status, decisions, or environment.

## Snapshot (2026-09-11)

Deployed and live at **https://ubiquiti-635h.onrender.com/**, now serving the full REST API +
minimal UI (Render auto-deployed on push, no manual redeploy needed). Prisma schema
(List/Todo/SubTask), local Postgres via docker-compose, and a Render-managed Postgres are all in
place; the initial migration has been applied both locally and on Render (confirmed via deploy log
— `prisma migrate deploy` ran clean). Full REST API (Lists/Todos/SubTasks, per
[specs/03-api-rest.md](specs/03-api-rest.md)) is implemented with a unified error shape. The
minimal UI (React Router + TanStack Query, no styling/DnD/markdown yet) is browser-tested
end-to-end both locally and now live on Render: create list → add/toggle/delete todo → full page
reload persists (verified against the live Render Postgres, including client-side route
`/list/:id` surviving a hard reload, i.e. SPA fallback routing works in production too).

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
- [x] Minimal UI: `LandingPage` (create list) + `ListPage` (add/toggle/delete todo), React Router
      + TanStack Query per [specs/07-frontend-architecture.md](specs/07-frontend-architecture.md).
      No styling, drag-and-drop, markdown, or SubTask UI yet — browser-verified locally.
- [x] Extracted query/mutations out of `ListPage` into `hooks/useList.ts` (pure refactor, no
      behavior change, re-verified in browser) ahead of SubTask UI and realtime work needing the
      same pattern — see the small-PRs-vs-foreseeable-rework rule in [CLAUDE.md](CLAUDE.md).
- [x] Verified Render auto-deployed the REST API + UI work (no manual redeploy was needed) and
      browser-tested the live site end-to-end: create list → add/toggle/delete todo → hard reload
      persists via Render Postgres.
- [x] SubTask UI: add/toggle/delete subtasks nested under each todo, mirroring the Todo UI pattern
      (`createSubTask`/`toggleSubTask`/`deleteSubTask` added to `useList`, per-todo new-subtask
      input state in `ListPage`). Browser-verified locally, including persistence across reload.
- [x] Tailwind CSS wired in (`@tailwindcss/vite` plugin + `src/index.css` with
      `@import "tailwindcss"`), per [specs/01-architecture.md](specs/01-architecture.md) — setup
      only, no restyle yet. `src/vite-env.d.ts` added (was missing) so `tsc` recognizes the CSS
      side-effect import; verified with a clean `npm run build` and no visual/console regressions
      on the still-unstyled pages.
- [x] Restyled `LandingPage`/`ListPage` with Tailwind utility classes (replaced all inline
      `style={}` props) — card layout, indigo/slate palette straight from Tailwind's default
      theme (no custom design tokens — deliberately, to keep styling cost low per
      [specs/01-architecture.md](specs/01-architecture.md)'s rationale), hover-revealed Delete
      buttons, indented subtasks with a left border. Browser-verified locally end-to-end
      (create/toggle/delete todo + subtask) with a clean production build.
- [x] Realtime protocol — [specs/04-realtime-protocol.md](specs/04-realtime-protocol.md): REST
      mutations broadcast `list:updated`/`todo:*`/`subtask:*` to the list's Socket.IO room
      (`app.broadcaster.broadcastToList`, wired via `app.decorate('broadcaster', ...)` in
      `index.ts` so routes can reach it), a `useListSocket` hook applies them to the TanStack
      Query cache directly (no refetch) for other tabs. Includes the piece of
      [specs/10-sharing-and-presence.md](specs/10-sharing-and-presence.md) this depends on: a
      per-tab `member` id/name/color in `sessionStorage` (`lib/member.ts`), sent as `X-Client-Id`
      on every mutation and via `list:join`, so the server can exclude the originating tab's own
      socket(s) from a broadcast and track presence (`PresenceStore`, in-memory, not persisted).
      Browser-verified with two tabs open on the same list: create/toggle/delete on both todos
      and subtasks in one tab appear live in the other with no reload. Clean full production
      build (`shared` + `web` + `server`).
- [x] Presence indicator: `useListSocket` now also returns who else is viewing the list (from
      `presence:update`), rendered in `ListPage` as small colored initial avatars next to the
      title, live-updating as tabs join/leave. Deliberately minimal — no name editing or join
      links (that's the rest of [specs/10-sharing-and-presence.md](specs/10-sharing-and-presence.md),
      left for later if wanted). Browser-verified with two tabs: avatar appears when the second
      tab joins and disappears when it closes.

## Next up (in rough order, mapped to specs)

- [ ] Redeploy/verify everything above on Render once this is pushed
- [ ] Sync / conflict resolution — [specs/05-sync-conflict-resolution.md](specs/05-sync-conflict-resolution.md)
- [ ] Offline sync — [specs/06-offline-sync.md](specs/06-offline-sync.md)
- [ ] Frontend architecture — [specs/07-frontend-architecture.md](specs/07-frontend-architecture.md)
- [ ] Drag and drop — [specs/08-drag-and-drop.md](specs/08-drag-and-drop.md)
- [ ] Markdown descriptions — [specs/09-markdown-descriptions.md](specs/09-markdown-descriptions.md)
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
- Frontend foundation (React Router + TanStack Query) added in the same task as the first minimal
  UI, not deferred — these are structural per specs/07, not feature-specific, so adding them later
  would mean reworking the fetch/mutation code written today.

## Open questions

- (none currently)
