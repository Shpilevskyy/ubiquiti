# Progress

> Living status file for this assignment. Read this first in any new session before touching
> code — it should make re-deriving context from git log/specs unnecessary. Update it at the
> end of any session that changes status, decisions, or environment.

## Snapshot (2026-09-11)

Deployed and live at **https://ubiquiti-635h.onrender.com/**, serving the full REST API +
Tailwind-styled UI with realtime sync, presence, stale-write conflict detection, a public list
directory + deletion (cascading), and now full offline sync (outbox pattern, all 4 steps —
connectivity detection, IndexedDB queue, optimistic mutations routed through it, flush on
reconnect). Render auto-deploys on push, no manual redeploy needed — confirmed repeatedly this
session by polling the live site/API after each push. Prisma schema (List/Todo/SubTask), local
Postgres via docker-compose, and a Render-managed Postgres are all in place; migrations applied
both locally and on Render. Full REST API (Lists/Todos/SubTasks, per
[specs/03-api-rest.md](specs/03-api-rest.md)) is implemented with a unified error shape.
Offline sync was hardened against two rounds of real-device testing this session, not just
simulated scenarios: (1) the user tested live (two browsers, real offline, added todos) and both
were silently lost on reconnect — the exact gap already documented as "step 4 not yet built,"
fixed by building the flush; (2) a second round with real Wi-Fi toggling found Chrome (unlike
Safari) needed a manual reload to sync, traced to the `online` DOM event being unreliable for
real network changes — fixed with an event-independent 15s poll fallback. Both fixes verified by
reproducing the exact failure mode before and after.

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
- [x] Sync/conflict detection — [specs/05-sync-conflict-resolution.md](specs/05-sync-conflict-resolution.md):
      `UpdateTodoBodySchema`/`UpdateSubTaskBodySchema` gained an optional `baseVersion`; the
      PATCH routes for todos and subtasks compare it against the row's current `version` before
      applying the write (which always applies, per the whole-record-LWW rule) and return
      `hadConflict: true` when the row changed since the client last saw it. Delete-wins was
      already correct (PATCHing a deleted row 404s). Server-side verified with curl against a
      throwaway server instance exercising all four cases: fresh write, stale write, no-`baseVersion`
      write, patch-after-delete. Client (`useList`'s `toggleTodo`/`toggleSubTask`) now sends the
      cached `version` as `baseVersion` and shows a non-blocking, auto-dismissing toast ("This item
      was also edited elsewhere") in `ListPage` when `hadConflict` comes back true. Browser-verified
      by spoofing the tab's own `X-Client-Id` on an out-of-band curl PATCH (so the realtime
      broadcast — which normally keeps tabs in sync and would mask the race — excluded this tab),
      confirming the toast fires and auto-dismisses after 4s without blocking the checkbox.
- [x] Presence indicator: `useListSocket` now also returns who else is viewing the list (from
      `presence:update`), rendered in `ListPage` as small colored initial avatars next to the
      title, live-updating as tabs join/leave. Deliberately minimal — no name editing or join
      links (that's the rest of [specs/10-sharing-and-presence.md](specs/10-sharing-and-presence.md),
      left for later if wanted). Browser-verified with two tabs: avatar appears when the second
      tab joins and disappears when it closes.
- [x] Public list directory + deletion: `GET /api/lists` (all lists) shown on `LandingPage`,
      `DELETE /api/lists/:listId` (cascades Todos/SubTasks via the schema) wired to a "Delete
      list" button on `ListPage` and per-row "Delete" on the landing page, both confirm-gated.
      Realtime: a `list:deleted` broadcast invalidates the list query in any other open tab. Both
      deviate from specs/00's access-by-link scoping — see Decisions below.
- [x] Offline sync, step 1/4 — connectivity detection: `lib/connectionStatus.ts` is a global
      online/offline signal (not just `navigator.onLine`, per
      [specs/06-offline-sync.md](specs/06-offline-sync.md)) fed by Socket.IO connect/disconnect
      (`useListSocket`, ignoring our own intentional disconnect on navigation-away), a failed
      `fetch` (`lib/api.ts`), and the browser's online/offline events. `useConnectionStatus`
      (`useSyncExternalStore`) exposes it; `ListPage` shows an "Offline" pill when set. Purely
      additive/observational so far — doesn't change mutation behavior yet; that's steps 2-4
      (IndexedDB outbox, routing mutations through it with optimistic updates, flush-on-reconnect)
      still to come. Browser-verified by dispatching real `online`/`offline` window events and
      confirming the pill appears/disappears; the socket-disconnect and fetch-failure paths call
      the identical `markOffline`/`markOnline` functions so weren't separately re-verified live
      (would've meant disrupting the shared dev server another session had running).
- [x] Offline sync, step 2/4 — IndexedDB outbox: `lib/outbox.ts` (`idb-keyval`) is the queue data
      structure from [specs/06-offline-sync.md](specs/06-offline-sync.md) — one ordered array of
      `QueuedOp` per list, keyed so lists never interleave. `getQueue`/`enqueue`/`dequeue`. Not
      wired into any mutation flow yet (step 3). Browser-verified via the dev server's console
      (nothing imports this module yet, so there was no UI path to exercise it through): FIFO
      order preserved across two enqueues, `dequeue` removes the right op, and — the actual point
      of using IndexedDB over an in-memory array — a queued op survives a full page reload.
- [x] Offline sync, step 3/4 — route mutations through the outbox: `useList`'s `mutateWithOutbox`
      helper applies an optimistic update to the cache, persists the op to the outbox, then (if
      `connectionStatus` says online) sends it — dequeuing + refetching to reconcile on success,
      dropping + toasting on a 404 (parent deleted elsewhere), leaving it queued on any other
      failure. All six Todo/SubTask mutations in `useList` now go through this; `deleteList`
      deliberately doesn't (destructive/irreversible, and List has no `version` column so it's
      outside the conflict/outbox model entirely).
      **Bug found and fixed along the way**: TanStack Query's own `networkMode: 'online'` default
      was silently pausing every mutation — never even calling `mutationFn` — whenever it believed
      the browser was offline, since its internal `onlineManager` listens to the same
      `window` online/offline events `connectionStatus` does. That's a second, competing offline
      strategy that pre-empted ours entirely; fixed with `networkMode: 'always'` on all six
      mutations so our own connectivity check is the only one in control. Found via targeted debug
      logging after optimistic updates silently did nothing while offline — the mutation was never
      running at all, not failing.
      **Related gap confirmed, left for step 4**: TanStack's `refetchOnReconnect`/
      `refetchOnWindowFocus` defaults (also wired to the same window events) mean any refetch
      trigger — not just a page reload — while an op is still queued-but-unsent will silently
      overwrite the optimistic entry in the cache with server truth, making it disappear from the
      UI even though it's still safely persisted in the outbox (verified: dispatching a real
      `online` event caused exactly this, and the op was still in IndexedDB afterward). Step 4
      needs to disable those two refetch triggers for the list query and instead flush the outbox
      itself before any reconnect-driven refetch.
      Browser-verified end-to-end: dispatched a real `offline` window event, added a todo — it
      appeared immediately and was confirmed queued in IndexedDB (not sent, network request log
      confirmed zero attempts); toggling a todo online still works and leaves the outbox empty
      (sent + dequeued). Full monorepo build clean, no console errors.
- [x] Refactor: Immer for nested optimistic-cache updates — user feedback that the hand-rolled
      nested spread/map/ternary chains in `useList.ts` (from step 3) were hard to read. Swapped
      those six `applyOptimistic` functions for `produce(old, (draft) => { ... })` recipes that
      mutate the draft directly (e.g. `todo.done = done` instead of rebuilding the whole
      `{ ...old, todos: old.todos.map(...) }` tree by hand). Also checked the rest of the codebase
      for the same shape: `useListSocket.ts`'s `updateTodo` helper (backing the three
      `SUBTASK_*` realtime handlers) had the identical nested-merge problem and got the same
      treatment; its four single-level handlers (`LIST_UPDATED`/`TODO_CREATED`/`TODO_UPDATED`/
      `TODO_DELETED`) were left as plain spreads — already flat enough that Immer wouldn't
      clarify anything. No other nested-merge sites found elsewhere in the app. Pure refactor, no
      behavior change: browser-verified all three realtime `SUBTASK_*` handlers (created via curl
      from a spoofed second client, applied live to the open tab) and re-ran the offline-add +
      online-toggle outbox scenarios from step 3, all unchanged. Full build clean, no console
      errors.
- [x] Offline sync, step 4/4 (offline sync now fully implemented) — flush the outbox on
      reconnect: `useList`'s `flushOutbox` replays queued ops for a list in FIFO order, awaiting
      each response before the next; success dequeues, a 404 (parent deleted elsewhere) drops the
      op and shows a toast then continues the queue, a network/5xx error stops the flush and
      reschedules the whole thing with doubling backoff (2s → 30s cap). Triggered by
      `connectionStatus` going online (which already aggregates both of the spec's triggers —
      Socket.IO reconnect and the browser online event — so nothing extra needed wiring either
      one) and once on mount, for a queue left over from a previous offline session. Also disabled
      `refetchOnReconnect`/`refetchOnWindowFocus` on the list query — closes the gap noted in step
      3, where TanStack's own refetch-on-reconnect could win the race and silently wipe a
      still-queued optimistic change before the flush got to send it.
      **Found via a real production bug report**: the user deployed step 3, went offline in two
      separate browsers, added a todo in each, came back online, and both vanished — reproducing
      exactly the step-3-documented gap in real usage. Confirmed against the live server (only the
      online-created todo had persisted) before building this.
      Browser-verified by reproducing the report directly: created a todo online, went offline,
      added two more (appeared immediately, confirmed absent from the server), came back online —
      both landed on the server this time, in the correct order, with no flicker/disappearance,
      and survived a hard reload. Separately verified the 404 path: queued a subtask offline,
      deleted its parent todo from another "client" while still offline, came back online — the
      toast fired, the dead op was dropped (outbox left clean, not stuck retrying), and the other
      three todos were unaffected. Full monorepo build clean, no console errors beyond the
      expected/handled 404 from that last test.
      **Second round of real-device feedback, same session**: after deploying the above, the user
      tested with real Wi-Fi toggling (not simulated) in two browsers — Safari recovered on its
      own, Chrome needed a manual reload to show the synced data. Root cause: browsers are
      inconsistent about firing the `online` DOM event for a genuine network change (a
      well-documented Chrome weak spot in particular), and Socket.IO's reconnect can lag behind a
      real drop too — so neither of `flushOutbox`'s two triggers is guaranteed to fire promptly on
      every browser. Fixed by no longer gating `flushOutbox` on `connectionStatus`'s belief at
      all (a failed `sendOp` already means "stays queued," so attempting while actually offline
      just costs one harmless wasted request) and adding an unconditional 15s poll
      (`FLUSH_POLL_MS`) as a third, event-independent trigger — self-healing regardless of whether
      either event ever fires. Also: a successful `sendOp` now calls `connectionStatus.markOnline()`
      directly, so a successful poll-triggered flush also clears a stuck "Offline" pill that no
      real `online` event would otherwise have cleared.
      Browser-verified the exact failure mode: queued an op offline, deliberately never dispatched
      an `online` event at all (simulating Chrome's missed event), and confirmed the poll alone
      delivered it to the server (and cleared the pill) within ~18s with no other trigger firing.

- [x] Extracted `TodoItem`/`SubtaskItem`/`TodoList` components out of `ListPage`'s inline JSX
      (`apps/web/src/components/`), matching the component tree in
      [specs/07-frontend-architecture.md](specs/07-frontend-architecture.md) — pure refactor, no
      behavior change. Done now (not deferred) because [specs/08-drag-and-drop.md](specs/08-drag-and-drop.md)
      needs each todo/subtask row to be its own component regardless: `dnd-kit`'s `useSortable` is
      a hook, so it can't be called inline inside a `.map()` — see the small-PRs-vs-foreseeable-
      rework rule in [CLAUDE.md](CLAUDE.md). Browser-verified: add/toggle/delete subtask still
      works through the new component boundary, no console errors, list state unchanged after the
      test. Clean full build.

## Next up (in rough order, mapped to specs)
- [ ] Drag and drop — [specs/08-drag-and-drop.md](specs/08-drag-and-drop.md): now unblocked by the
      component extraction above. Still needed: add `dnd-kit`, `DndContext`/`SortableContext` in
      `TodoList` (todos) and in `TodoItem` (subtasks, separate context, no cross-todo dragging per
      spec), the fractional-position `newPosition` computation client-side, wiring `onDragEnd` to
      the existing outbox mutate path, and the epsilon/re-index fallback described in the spec.
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
- Added `GET /api/lists` (list every list, no auth) and show it on the landing page — deviates
  from [specs/00-overview.md](specs/00-overview.md#out-of-scope)'s "no 'my lists' dashboard"
  scoping, which was reasoned around lists being access-by-link/private. Explicit user call: this
  is a skills-demo app that won't hold real data, so trading that privacy property for landing-page
  discoverability is fine here — not a decision to carry into a real deployment unmodified.
- Added `DELETE /api/lists/:listId` (not in specs/03's endpoint table) alongside the public
  listing above — once lists are publicly browsable/creatable with no ownership, there needs to
  be a way to clean them up. Idempotent (`deleteMany`, 204 either way), same convention as the
  todo/subtask deletes; Todos/SubTasks cascade via the schema's existing `onDelete: Cascade`, no
  manual cleanup code needed. Broadcasts a new `list:deleted` socket event so a tab that has the
  list open when someone else deletes it gets its query invalidated and falls into the existing
  "Failed to load list: List not found" error branch — no dedicated UI built for that case.
  "Delete list"/"Delete" buttons added to `ListPage` and the landing page's list rows, both behind
  a native `confirm()` given the cascade is irreversible.

## Open questions

- (none currently)
