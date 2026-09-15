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
- **Single-instance deployment is a requirement, not an accident** — the interim step of
  [tasks/22-horizontal-scale-redis.md](tasks/22-horizontal-scale-redis.md), recorded here rather
  than left unexamined. Two pieces of realtime state — Socket.IO's rooms and `PresenceStore`
  ([apps/server/src/presence.ts](apps/server/src/presence.ts)) — live in the memory of one Node
  process; a second instance would silently split both (users on the same list routed to different
  instances stop seeing each other's changes, and presence shows only who's connected to whichever
  instance answered). Render's free tier already runs exactly one Web Service instance, so this
  isn't a live constraint today, but scaling past one instance, a zero-downtime deploy that runs two
  instances concurrently during rollover, or moving to a platform that multi-processes by default
  would all break realtime silently rather than loudly. tasks/22 (parked) has the fix — a Redis
  adapter plus moving presence out of process memory — when any of those triggers happens.

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

- [x] Drag and drop, todos only — [specs/08-drag-and-drop.md](specs/08-drag-and-drop.md): added
      `@dnd-kit/core`+`sortable`+`utilities`. `TodoList` wraps the todo `<ul>` in a
      `DndContext`/`SortableContext` (pointer + keyboard sensors); `TodoItem` calls `useSortable`
      and exposes a dedicated drag-handle button (`listeners`/`attributes` scoped to the handle,
      not the whole row, so it doesn't fight the checkbox/delete click targets). `onDragEnd`
      computes the new fractional `position` client-side
      (`apps/web/src/lib/position.ts#computeReorderPosition`, using `arrayMove` to find the new
      neighbors then averaging them per the spec's formula) and sends it through a new
      `reorderTodo` mutation — same `mutateWithOutbox` path as every other mutation, so a reorder
      made offline queues and flushes like any other change. The optimistic cache update re-sorts
      `draft.todos` by `position` (matching how the server's `GET` already orders them) rather than
      splicing to the drop index, so a later refetch/broadcast can't visually jump the item.
      **Not done**: subtask reordering (dragging within a todo) — needs its own `SortableContext`
      per todo and, importantly, `orderBy: { position: 'asc' }` added to every server route that
      returns `subtasks` (`lists.ts`, `todos.ts` — currently unordered, a latent gap independent of
      drag-and-drop that only starts to matter once subtasks can be reordered). Also not done: the
      spec's epsilon/re-index fallback for float-precision collisions — documented as a known,
      rare-path limitation in `position.ts`, consistent with how other multi-step features here
      (e.g. offline sync) have shipped the common case first with gaps tracked, not silently
      dropped.
      Browser-verified: dragged a todo from the bottom to the top via its handle, watched the
      reorder happen instantly, hard-reloaded and confirmed the new order persisted from the
      server. A stray batch of hook-order/"more than one copy of React" console errors showed up
      once, traced to the shared dev server (another session's) re-optimizing its Vite dep cache
      mid-session after `npm install` added the new packages — confirmed harmless by opening a
      fresh tab against the same server, which loaded clean with no errors and the correct
      persisted order. Clean full build.

- [x] Drag and drop, subtasks — [specs/08-drag-and-drop.md](specs/08-drag-and-drop.md), completing
      the feature. `TodoItem` now wraps its subtask `<ul>` in its own `DndContext`/`SortableContext`
      (separate from `TodoList`'s, and from every other todo's — no cross-todo subtask dragging,
      per spec); `SubtaskItem` got the same `useSortable`+drag-handle treatment as `TodoItem`. New
      `reorderSubTask` mutation in `useList` mirrors `reorderTodo` exactly (same
      `computeReorderPosition` helper, same outbox path, same re-sort-by-position optimistic
      update). Also fixed the ordering gap noted above: every server route returning `subtasks`
      (`lists.ts`'s `GET`, and all three `include`s in `todos.ts`) now has `orderBy: { position:
      'asc' }` — without it, a subtask reorder would look right instantly (client-side re-sort) but
      revert to insertion order on the next fetch/reload.
      Browser-verified: added two subtasks under a todo, dragged the second above the first via its
      handle, hard-reloaded and confirmed the new order persisted (proving the server-side
      `orderBy` fix, not just the optimistic client state). Checked console on a fresh tab — clean,
      no errors. Clean full build.

- [x] Markdown descriptions — [specs/09-markdown-descriptions.md](specs/09-markdown-descriptions.md):
      `descriptionMd` was already on the Todo model/shared schemas/generic PATCH route from earlier
      work, so this was UI-only. Added `react-markdown` + `remark-gfm` (per the spec's library
      boundary — rendering only, no `rehype-raw`, so raw HTML input renders as literal escaped
      text rather than executing, verified by pasting an `<img onerror=...>` payload and
      confirming no `<img>` element was created). New `TodoDescription` component under each Todo:
      view mode renders markdown (muted "Add a description…" placeholder when empty), click enters
      edit mode (auto-growing `<textarea>`), saves on blur or Cmd/Ctrl+Enter, `Escape` discards and
      reverts with no PATCH sent. New `updateTodoDescription` mutation in `useList` mirrors
      `toggleTodo` exactly — same `mutateWithOutbox`/`baseVersion`/conflict-toast path, so
      descriptions are offline-safe and realtime-broadcast like every other field. The "don't yank
      text mid-edit" requirement needed no bespoke reconciliation logic: `TodoDescription` only
      reads `descriptionMd` from the cache when *entering* edit mode (not continuously), and view
      mode always renders the live prop directly — so a realtime update mid-edit updates the cache
      normally (existing `useListSocket` `TODO_UPDATED` handler, unchanged) but the open textarea
      is untouched, and the latest value appears as soon as the user exits edit mode either way.
      Markdown elements are unstyled by Tailwind's default utilities (no `@tailwindcss/typography`
      plugin added — out of scope for this task); a small set of `[&_selector]` arbitrary-variant
      overrides on the view wrapper gives lists/links/code/headings/blockquotes minimal readable
      styling instead.
      **Bug found via user testing, fixed same session**: the first pass only covered
      `p`/`ul`/`ol`/`a`/`code` — headings (`# `/`## `) rendered as flat, unstyled text because
      Tailwind's Preflight resets `h1`–`h6` `font-size`/`font-weight` to `inherit`. User tested
      live in their own browser (a real todo titled "# Repo rules for Claude" with a `## Test`
      section, synced to this session's tab via the existing realtime broadcast) and flagged
      headings not standing out. Fixed by adding bold+size overrides for `h1`/`h2` and
      `h3`–`h6`, plus a blockquote style. Re-verified against that same live todo.
      Browser-verified end-to-end: added a todo, entered edit mode by clicking the placeholder,
      typed heading/bold/link/list markdown, saved on blur, confirmed it rendered correctly and
      persisted across a hard reload; re-entered edit mode via click, typed more text, `Escape`
      discarded it (confirmed via no new PATCH network request and unchanged rendered content).
      Clean full build.

- [x] Conflict detection rewritten from row-`version` to per-field values, plus two realtime
      correctness fixes — all three from the architecture review on 2026-09-14, see
      [tasks/README.md](tasks/README.md).
      **Conflict signal**: `baseVersion` is gone from the wire; `UpdateTodoBodySchema`/
      `UpdateSubTaskBodySchema` now carry an optional `base` object holding the values the client
      last saw *for the fields it is writing* (schemas derived from a single `*MutableSchema` so
      `base` can't drift from the writable field set). The server compares them in
      `apps/server/src/conflict.ts#detectConflict`. Why: a PATCH only writes the fields it names,
      so comparing a row-level counter reported `hadConflict: true` whenever *anything* on the row
      had changed — two people editing different fields of the same todo both got "also edited
      elsewhere" despite neither losing an edit. Client-side this also *removed* plumbing rather
      than adding it: a toggle's previously-seen value is definitionally the negation of the new
      one, so `toggleTodo`/`toggleSubTask` derive `base` themselves and the components stopped
      threading `todo.version` through two component layers.
      **`version` kept, repurposed**: the column stays because the broadcast-ordering fix below
      needs a monotonic counter — `updatedAt` at Prisma's default millisecond precision would drop
      legitimate updates that land in the same millisecond. So `version` stopped being a bad
      conflict detector and became a good ordering guard. (The alternative considered and
      rejected: drop the column entirely and use `updatedAt`, which the review had suggested
      before the ordering fix made the precision requirement concrete.)
      **Realtime ordering guard**: `useListSocket`'s `TODO_UPDATED`/`SUBTASK_UPDATED` handlers now
      ignore any payload whose `version` isn't strictly greater than the cached row's. Broadcasts
      are fire-and-forget from inside the REST handler with no ordering guarantee, so two updates
      to one row could arrive reversed and leave the client latched on the older value — and
      nothing would repair it, since `refetchOnReconnect`/`refetchOnWindowFocus` are deliberately
      off. Deletes stay exempt (delete-wins) and creates keep their id check.
      **Reconnect resync**: `flushOutbox` takes a `reconcile` flag, passed when `connectionStatus`
      goes online, forcing the closing `invalidate()` even when the queue was empty. Previously
      `if (sentAny)` meant a network blip with nothing queued resynced nothing at all — the client
      silently missed every broadcast sent during the outage. The invalidate still runs only after
      the queue drains, so it can't race a still-unsent optimistic change.
      **Verified**: new `scripts/verify-conflict.py` (10 assertions incl. the exact false positive
      that motivated this) passes against a live server; browser-verified realtime still applies
      todo and subtask updates from a spoofed second client with no console errors; reproduced the
      reconnect-staleness bug directly by stopping the server, editing the row in Postgres, and
      restarting — tab picked up the change with an empty outbox, which is precisely what used to
      fail; offline add → reconnect → flush re-verified unchanged. Clean full build.
      Specs updated per specs/00's own rule: [specs/05](specs/05-sync-conflict-resolution.md)
      (revised conflict rule + why), [specs/04](specs/04-realtime-protocol.md) (new ordering and
      missed-broadcast sections), [specs/11](specs/11-testing-strategy.md), and
      [specs/00](specs/00-overview.md) now states that specs are design intent while PROGRESS.md
      is the as-built record, listing the standing divergences.

- [x] Cost/price UI — [tasks/01-cost-tracking-ui.md](tasks/01-cost-tracking-ui.md): `costCents` was
      already fully wired server/shared-side with zero UI (the task's finding). Added
      `updateTodoCost`/`updateSubTaskCost` mutations to `useList.ts`, mirroring
      `updateTodoDescription` exactly (same `mutateWithOutbox`/`base`/conflict-toast path), so cost
      edits are offline-safe and realtime-broadcast for free — no server change needed. New
      `CostInput` component (`apps/web/src/components/CostInput.tsx`) mirrors `TodoDescription`'s
      click-to-edit pattern: commits on blur/Enter, `Escape` discards, displays via
      `Intl.NumberFormat` currency formatting, shows a muted "Add cost…" placeholder when null.
      Parsing (`lib/cost.ts#parseCostInput`) strips `$`/commas/whitespace, rejects anything that
      isn't a non-negative decimal (so `abc`/`-5` are silently discarded, never sent), and rounds to
      the nearest cent so the result is always a valid integer (`costCents` is `z.number().int()`
      and 400s on a float). Clearing the field sends `null`, never `0`.
      **Rollup**: implemented the task's recommended option — a todo shows its own cost plus a
      separate subtask subtotal, and the list header shows a grand total. See Decisions below.
      Browser-verified end-to-end: set a todo cost ($12.50) and a subtask cost (entered `4.999`,
      correctly rounded to $5.00), confirmed the subtotal and grand total recomputed correctly;
      entered `abc` and `-5` and confirmed via the network log that no PATCH was ever sent for
      either; cleared a cost and confirmed via a direct API fetch that it persisted as
      `costCents: null`, not `0`; reloaded and confirmed both costs persisted; opened a second tab,
      set a cost there, and watched it and the grand total update live in the first tab with no
      reload (proves the existing `TODO_UPDATED`/`SUBTASK_UPDATED` broadcast already covers the
      field); dispatched a real `offline` event, set a subtask cost (applied immediately,
      optimistic, no request sent), and confirmed it reached the server once the existing
      poll-based flush ran — same outbox path as every other field. Clean full build.

- [x] Subtask progress indicator — [tasks/02-subtask-progress.md](tasks/02-subtask-progress.md):
      new `SubtaskProgress` component (`apps/web/src/components/SubtaskProgress.tsx`), a quiet
      `done/total` count with a thin bar, rendered in `TodoItem`'s header row next to the title.
      Takes plain `done`/`total` counts (derived in `TodoItem` from `todo.subtasks`) rather than
      the subtasks themselves, per the task's preference — keeps the component trivial and needs
      no state or query of its own, since `todo.subtasks` is already kept current by both
      optimistic writes and realtime broadcasts. Renders nothing for a todo with no subtasks.
      Browser-verified: added two subtasks (`0/2`), toggled one in the same tab (instant `1/2`),
      toggled the other from a second tab (`2/2` live, no reload), deleted a subtask (denominator
      dropped to `1/1`), deleted the last one (indicator disappeared entirely). Clean web build.

- [x] Outbox atomicity, poison ops, single-flight flush —
      [tasks/03-outbox-reliability.md](tasks/03-outbox-reliability.md): three interlocking offline
      bugs found by reading the code.
      **Atomicity**: `enqueue`/`dequeue` (`lib/outbox.ts`) were separate `get()` then `set()` calls
      across two IndexedDB transactions — two concurrent callers (two quick offline mutations, or
      an enqueue racing a flush's dequeue) could interleave and silently drop one write. Swapped
      both to `idb-keyval`'s `update()`, which does the read-modify-write inside one transaction.
      **Poison ops**: only 404 was treated as permanent; any other 4xx (e.g. a rejected body)
      retried every 15s forever and, since the flush is strictly FIFO with `await` between ops,
      head-of-line-blocked every op queued behind it. Any 4xx now dequeues with a notice
      ("A change could not be saved and was discarded") and the flush continues — fixed in both
      `flushOutbox` and `mutateWithOutbox`'s immediate-send path, which had the same shape. Added a
      `QueuedOp.attempts` counter (new `outbox.ts#recordAttempt`, atomic like enqueue/dequeue,
      defaults `op.attempts ?? 0` for queues persisted before this change) as a safety net: past 10
      failed attempts an op is dropped regardless of status, bounding any failure mode not already
      handled as permanent.
      **Single-flight**: `flushOutbox` had four triggers (mount, `connectionStatus`, the 15s poll,
      its own backoff timer) and no in-flight guard, so overlapping runs could both read the queue
      and both send the same head-of-queue op — also what made the atomicity bug reachable in
      practice, not just enqueue-vs-flush. Added an `isFlushingRef` guard (short-circuits if a flush
      is already running) and now clear any pending retry timer at the start of every flush
      attempt, so at most one is ever outstanding instead of accumulating a chain per failure.
      **Verified** in the dev console against a live server: fired two concurrent `enqueue` calls
      for the same list and confirmed both survived (the exact race from the bug report); added
      five todos as fast as the UI allows while offline and confirmed all five landed on the server,
      none lost or duplicated; hand-queued a `PATCH` with an empty `title` (guaranteed 400) ahead of
      a valid queued op and confirmed the flush dropped the bad one with the notice and still sent
      the valid one behind it; pre-seeded an op's `attempts` to 9 and confirmed the 10th failure
      dropped it via the cap rather than retrying forever; fired five `online` events back-to-back
      with one op queued and confirmed (via the network log) exactly one PATCH was sent, not five.
      Clean full build.

- [x] Route scoping + conflict-check TOCTOU —
      [tasks/04-route-scoping-and-conflict-check.md](tasks/04-route-scoping-and-conflict-check.md):
      two defects in the same four handlers (todo/subtask PATCH/DELETE), fixed together since both
      touch the same `where` clauses.
      **Parent scoping**: PATCH resolved the row by its own id alone and broadcast to whatever
      `listId`/`todoId` the URL claimed — a mismatched parent silently mutated the row and notified
      the wrong room. PATCH now runs the read and the write inside `prisma.$transaction`, with the
      read (`findFirst`) scoped to `{ id, listId }` (todos) / `{ id, todoId }` (subtasks); a
      mismatch 404s before anything is touched. DELETE now scopes its `deleteMany` the same way and
      only broadcasts when `count > 0` (matching the pattern `lists.ts` already used) — but a plain
      scoped `deleteMany` can't distinguish "wrong parent" from "already gone" (both are `count: 0`),
      and specs/03 documents delete as idempotent (already-gone → `204`, not `404`). So DELETE first
      does an unscoped `findUnique`: exists under a different parent → `404`; doesn't exist at all →
      falls through to the idempotent `204`. specs/03 updated with this distinction.
      **TOCTOU**: the conflict check was a `findUnique` then a separate `update` with no transaction
      between them — a write landing in the gap got compared against already-stale values, so
      `hadConflict` could read `false` for a write that did clobber something. Folded into the same
      `$transaction` as the parent-scoping fix above (both `tx.todo.findFirst`/`tx.todo.update`, not
      the outer `prisma` client), so the comparison and the write now see one snapshot. The `P2025`
      catch stays — read-committed isolation doesn't serialize across the transaction's two
      statements, so a concurrent delete landing between them is still possible and still 404s.
      **Verified with curl against a local server** (no browser needed, per the task): PATCH/DELETE
      through the wrong parent 404 and leave the row untouched, for both todos and subtasks;
      correct-parent PATCH/DELETE still work; deleting an already-gone todo is still a `204`
      (idempotency preserved); re-ran `scripts/verify-conflict.py` — all 10 pre-existing conflict
      cases (including the false-positive-on-different-field case fixed 2026-09-14) still pass.
      Clean full build.

- [x] Stop per-mutation full-list refetch clobbering optimistic state —
      [tasks/05-cache-reconciliation.md](tasks/05-cache-reconciliation.md).
      **The flicker**: every successful mutation called `invalidate()` (a full-list refetch), and
      `mutateWithOutbox` never called `cancelQueries` first. Toggle A, its refetch starts, toggle B
      lands optimistically, A's refetch resolves with a pre-B snapshot and overwrites the whole
      `GetListResponse` — B visually reverts until its own refetch lands. Fixed with
      `await queryClient.cancelQueries({ queryKey })` at the top of `mutateWithOutbox`, before the
      optimistic `setQueryData` — TanStack Query's documented fix for exactly this race.
      **The cost**: separately, every mutation — even a single checkbox toggle — refetched the
      entire list. The server already returns the full updated row (`{ todo }`/`{ subtask }`, or
      with `hadConflict` for a PATCH), so `mutateWithOutbox` now takes an optional `applyResponse`
      callback that splices that row into the cache in place (`replaceTodo`/`replaceSubTask`,
      shared helpers) instead of invalidating. DELETE returns `204`/no body and needs no
      reconciliation — the optimistic removal was already correct. The 404/other-4xx failure paths
      still call a full `invalidate()`: there's no successful response to reconcile from there, and
      the optimistic state is known wrong, not just stale.
      **Reconnect resync kept as-is**: `flushOutbox`'s `invalidate()` (including the `reconcile`
      flag forcing it even on an empty queue, landed 2026-09-14) is untouched — after replaying a
      backlog the optimistic state may be many ops stale, so a full resync is genuinely correct
      there, unlike the single-mutation case.
      **Decided and implemented, not left implicit**: `flushOutbox` previously ignored `sendOp`'s
      response entirely, so a queued PATCH that came back `hadConflict: true` during a reconnect
      replay never surfaced the toast a live edit gets. Chose to surface it rather than document it
      away — silently dropping a "this clobbered someone's edit" signal seemed worse than one extra
      toast. Aggregated into a single "Some changes were also edited elsewhere" notice per flush
      (not one per op) so a multi-op backlog replay can't spam the single-notice toast UI.
      **Verified in-browser**: rapidly toggled three different todos in succession — no flicker or
      revert, and the network log showed no `GET` after any of the `PATCH`es, only after the
      deliberate reconnect-flush test below; confirmed via a direct API fetch that `version`
      advances correctly and the reconciled row (not the optimistic guess) is what lands in the
      cache; queued an op offline, reconnected, and confirmed the flush's `invalidate()` still fired
      (a `GET` followed the replayed `PATCH`) with the final state matching the server; hand-queued
      an op with a deliberately stale `base`, reconnected, and confirmed the aggregated conflict
      toast fired. Clean full build.

- [x] Paused-query crash, `deleteList` while offline, notice timers —
      [tasks/06-offline-edge-cases.md](tasks/06-offline-edge-cases.md), closing out P2. Three small
      independent bugs in the offline/UX seam.
      **Paused-query crash**: the list query was the one network call left on TanStack's default
      `networkMode: 'online'` while every mutation already opts into `'always'`
      (`OFFLINE_AWARE`) — offline, `'online'` *pauses* the query rather than failing it, so
      `isLoading`/`isError` both read `false` with `data` still `undefined`, and `ListPage`'s
      `listQuery.data!` crashed to a blank screen. Set `networkMode: 'always'` on the list query
      too (consistent with the mutations: attempt, fail, land in the existing error branch), and
      independently made `ListPage` defensive — an explicit `if (!listQuery.data)` guard instead of
      the non-null assertion, since no single TanStack state combination is safe to assert past.
      **`deleteList` hanging offline**: the one mutation without `OFFLINE_AWARE`; its comment said
      "requires being online" but the actual default-`networkMode` behavior is pause, not fail —
      offline, the button stayed disabled indefinitely and the delete would silently fire whenever
      TanStack next believed it was online, long after the user gave up. Added `OFFLINE_AWARE` plus
      an explicit `connectionStatus.getStatus()` check inside `mutationFn` that shows "Can't delete
      while offline" and throws before ever calling the API — fails fast and visibly instead of
      queuing a destructive, `confirm()`-gated action somewhere invisible.
      **Notice timers**: `showNotice` didn't keep its `setTimeout` handle, so a second notice
      arriving before the first's 4s elapsed got cut short by the first's stale timer. Now keeps
      the handle in a ref, clears it before scheduling a new one, and clears it on unmount too.
      **Verified in-browser**: patched `fetch` to reject a specific list's GET and confirmed
      `ListPage` renders the error branch cleanly, not a blank screen; went offline and clicked
      "Delete list" — got the notice immediately, the button never got stuck, and (confirmed via
      the network log) no request was even attempted; came back online and confirmed delete still
      works normally; triggered two notices exactly 1s apart via scripted clicks and sampled the
      DOM on a precise timer — the second notice was still showing at t+3.1s (past the point the
      old bug would have cleared it at t+3s) and cleared at its own correct t+4s, not the first
      notice's. Clean full build.
      **Housekeeping note**: while testing the crash fix, mistakenly deleted a pre-existing demo
      list ("conflict test", not one created for this task's testing) during test cleanup instead
      of a list created for this session — caught and disclosed immediately, no code or data
      recovery needed (this app holds no real data, see specs/00), but noted here as a reminder to
      create fresh test fixtures rather than reusing/deleting existing ones.

- [x] Move the flush scheduler out of `useList` into a plain module —
      [tasks/07-extract-outbox-sync.md](tasks/07-extract-outbox-sync.md). `useList.ts` was 407
      lines doing five jobs; the background flush/retry/poll loop (job 4) had nothing to do with
      React and, more concretely, ran once per `useList()` call site — the moment a second
      component called `useList` for the same list it would start a second poller/subscription
      racing the first over the same IndexedDB queue, which [08](08-list-context.md) was about to
      make possible.
      **New `lib/outboxSync.ts`**: a plain module, no React. `start(listId, { onNotice,
      onInvalidate })` / the function it returns to stop are reference-counted per `listId` via a
      module-level `Map`, so N callers share exactly one poll interval, one backoff timer, and one
      `connectionStatus` subscription; callbacks are collected in a `Set` so every registered
      caller hears every notice/invalidate. `flush()` itself (the retry/backoff/poison-op policy
      from tasks/03) moved over unchanged — same FIFO loop, same 404/other-4xx/attempts-cap
      handling, same `reconcile` flag, same "don't gate on connectionStatus's belief" reasoning and
      the same 15s poll fallback, load-bearing comments moved with the code.
      **`useList` shrank accordingly**: its effect is now just `return startOutboxSync(listId, {
      onNotice: showNotice, onInvalidate: invalidate })` on mount/unmount. `mutateWithOutbox`
      (immediate-send path) and all nine mutations were untouched — only the background loop moved.
      **`useNotice` hook** (`hooks/useNotice.ts`) pulled the toast/timer state (job 5) out
      separately, same behavior (keeps the timeout handle so a second notice always gets its own
      full 4s, per tasks/06) — `useList` now just calls `showNotice`/reads `notice`/`dismissNotice`
      from it instead of owning `useState`/`useRef` directly.
      **Verified**: clean full build. Browser-verified against a second, isolated dev server (the
      shared one from another session was left untouched) on a fresh test list: offline → add two
      todos → reconnect delivered both in order with no flicker, survived a hard reload; queued a
      third op offline and *never* dispatched an `online` event — the 15s poll alone delivered it
      (confirmed via the network log) and cleared the "Offline" pill. Then the point of the
      refactor: from the browser console, dynamically imported the exact `outboxSync`/`outbox`
      modules the running app uses, enqueued a fake op for a synthetic list id, and called `start`
      twice with two distinct callback objects — exactly one network request was made (not two),
      and both callbacks' `onNotice` fired once each, confirming N callers fan out from a single
      shared loop rather than each running their own.

- [x] `ListProvider` context to kill prop drilling; push subtask-input state down —
      [tasks/08-list-context.md](tasks/08-list-context.md). `useList` returned 13 values that
      `ListPage` mapped into 11 props on `TodoList`, which mapped those into 10 props on
      `TodoItem`, which passed more down to `SubtaskItem` — roughly a third of `ListPage` was prop
      plumbing, and every one of those callbacks was a freshly allocated inline arrow.
      **New `context/ListContext.tsx`**: `ListProvider` calls `useList(listId)` exactly once;
      `useListContext()` exposes the full result (used by `ListPage` for `listQuery`,
      `conflictNotice`, `deleteList`); `useListActions()` exposes just the mutation triggers, which
      `TodoItem`/`SubtaskItem` now call directly using their own `todo`/`subtask` prop (e.g.
      `toggleTodo.mutate({ todoId: todo.id, done: !todo.done })`) instead of receiving a
      todo-id-bound callback prop from three components up. Target prop surface hit exactly:
      `TodoItem` takes `todo`, `SubtaskItem` takes `subtask`, nothing else.
      **New `AddSubtaskForm`**: `newSubTaskTitles: Record<string, string>` — previously lifted all
      the way to `ListPage` even though each entry was read by exactly one `TodoItem`, so a
      keystroke in any subtask input re-rendered every todo/subtask/`DndContext` on the page — is
      gone. Each `TodoItem` now renders its own `AddSubtaskForm` owning its own local `useState`,
      so a keystroke only re-renders that one form.
      **`ListPage` split**: the outer `ListPage` component just resolves `listId` and renders
      `<ListProvider>`; a new `ListPageContent` (inside the provider) does everything the old
      `ListPage` did, reading from `useListContext()` instead of calling `useList` directly.
      **Step 3 (React.memo / React Compiler) deliberately not done**: the task frames this as
      "worth considering," contingent on a separate decision (hand-memoize vs. the React Compiler
      Babel plugin), and none of the task's four "Done when" criteria actually require it — the
      typing-perf goal is satisfied by localizing input state (above), not by memoizing render
      output. Revisit if profiling ever shows an unrelated todo/subtask update visibly re-rendering
      every row (Immer keeps unmodified `Todo`/`SubTask` object references stable across a mutation,
      so `React.memo` would be effective if added, but nothing today demonstrates it's needed).
      **Verified** against an isolated dev server (left the other session's shared one on 5173
      alone): full interaction matrix on a fresh test list — add/toggle/delete todo and subtask,
      cost input (rollup total updated), description edit (saved on blur, markdown rendered),
      drag-reorder a todo (persisted across hard reload), two tabs with realtime toggle + presence
      avatar both applying live, and offline add → reconnect → synced (confirmed via network log).
      Clean full build.

- [x] `request.clientId` + central P2025/status-code handling (part of
      [tasks/09-server-route-boilerplate.md](tasks/09-server-route-boilerplate.md) — items 1 and 3;
      item 2, schema-driven validation via `fastify-type-provider-zod`, is its own follow-up given
      it's the riskiest part of the task). Two of the three repeated patterns the 2026-09-12 review
      found across the eight route handlers in `lists.ts`/`todos.ts`/`subtasks.ts`:
      **`request.clientId`**: an `onRequest` hook in `index.ts` reads `X-Client-Id` once per
      request and stores it via `app.decorateRequest`/a new `FastifyRequest.clientId` type
      ([types/fastify.d.ts](apps/server/src/types/fastify.d.ts)) — replaces all 8 occurrences of
      the identical `request.headers[CLIENT_ID_HEADER] as string | undefined` cast at every
      broadcast call site.
      **Central P2025 handling**: the three near-identical try/catch blocks (todo/subtask PATCH,
      list PATCH) mapping Prisma's "record to update not found" to a 404 are gone; a thrown
      `PrismaClientKnownRequestError` with code `P2025` now propagates to Fastify's
      `setErrorHandler` ([errorHandler.ts](apps/server/src/errorHandler.ts)), which maps it to 404
      before falling through to the generic status handling. The `if (!result) return 404` checks
      in the todo/subtask transactions stay as-is — those are application-level "didn't exist at
      read time" checks, not Prisma exceptions, and are a distinct case from the P2025 race (a
      concurrent delete landing *inside* the transaction).
      **Status→code mapping fixed**: the generic error handler previously mapped *every* non-5xx to
      `code: 'bad_request'`, so e.g. a 413 would misreport as `bad_request` — now a small
      `STATUS_TO_CODE` table maps 400/404/409/413/429 to their proper codes, falling back to
      `bad_request` only for anything unlisted.
      **Verified with curl** against the shared local dev server (already running under `tsx
      watch`, so it picked up these route/handler changes automatically — no separate instance
      needed): malformed JSON body now reports `invalid_body` instead of the old blanket
      `bad_request`; unknown route still reports the unified `{ code: 'not_found', message: "Not
      found" }` shape; deleting a list then PATCHing it exercises the actual Prisma P2025 path
      (list PATCH has no explicit not-found check, unlike todo/subtask) and correctly 404s via the
      new central handler; PATCHing a nonexistent todo still 404s via its existing application-level
      check. Two-tab browser check confirmed `request.clientId` is wired correctly end-to-end: a
      todo added in one tab broadcasts live to the other (plus its presence avatar), with no
      self-echo errors in the originating tab's console. Clean full build.

- [x] Schema-driven request validation via `fastify-type-provider-zod`, completing
      [tasks/09-server-route-boilerplate.md](tasks/09-server-route-boilerplate.md) (item 2; items 1
      and 3 landed in the previous entry). This was flagged as the riskiest part of the task since
      any validation library that ships its own error serializer could silently break the specced
      unified error shape.
      **New param schemas** in `packages/shared`: `ListParamsSchema`/`TodoParamsSchema`/
      `SubTaskParamsSchema`, each `z.uuid()` per segment — closes a real gap the review found:
      `listId`/`todoId`/`subtaskId` were typed as `string` via Fastify's generic type parameter
      (TypeScript-only, no runtime check) and passed straight to Prisma, so a malformed id either
      500'd or silently missed rather than 400ing.
      **Wiring**: `app.setValidatorCompiler`/`setSerializerCompiler` (from the library) set once in
      `index.ts` before routes are registered; each route file does `app.withTypeProvider<ZodTypeProvider>()`
      once and passes the shared zod schemas directly as `schema: { params, body }` on each route,
      giving typed, pre-validated `request.body`/`request.params` with no generic type parameter
      needed. All 8 hand-rolled `Schema.safeParse(request.body)` + manual-400 blocks are gone.
      **Verified the error-shape risk directly**: a validation failure throws Fastify's own
      validation error (statusCode 400) rather than a custom-formatted one, which falls straight
      into the existing generic status→code mapping in `errorHandler.ts` — no special-casing
      needed, and confirmed with curl that malformed JSON, invalid bodies, and (new) non-uuid path
      params all still return the exact `{ error: { code, message } }` shape, just with more
      readable messages (Fastify's own formatter, e.g. `"params/listId Invalid UUID"`) than the old
      raw zod-issues JSON dump. Full curl pass across every endpoint (create/get/patch/delete for
      lists, todos, subtasks; valid and invalid bodies; valid and non-uuid params; idempotent
      double-delete; unknown route) plus re-running `scripts/verify-conflict.py`'s 10 assertions
      against a freshly built server instance — all pass unchanged. Clean full build.

- [x] Dead code cleanup — [tasks/10-dead-code-cleanup.md](tasks/10-dead-code-cleanup.md), mechanical
      parts only (the comment-volume calibration pass is deliberately deferred to its own diff, per
      the task's own note that it needs to be reviewable separately).
      **Unreachable `api.ts` helpers removed**: `updateList`, `createTodo`, `updateTodo`,
      `deleteTodo`, `createSubTask`, `updateSubTask`, `deleteSubTask` — all mutations go through the
      outbox's `sendOp` instead (confirmed via grep: zero call sites outside the file). `api.ts` now
      only has the four list-level operations that genuinely bypass the outbox (List has no
      `version` column, sits outside the conflict/outbox model). `UpdateListBody`/`CreateTodoBody`/
      etc. imports dropped since nothing in `apps/web` referenced those types once the dead
      functions were gone (the server still uses the schemas directly).
      **Hello-world scaffold removed**: `HelloResponse` and `SOCKET_EVENTS.HELLO` from
      `packages/shared`, `GET /api/hello` from `index.ts`, and the `socket.emit(HELLO, ...)` on
      connect from `socket.ts` — confirmed via grep that nothing in `apps/web` consumed any of it.
      **Stale comment fixed**: `outbox.ts`'s `QueuedOp.path` field comment illustrated a path with
      an `/api` prefix the code never actually stores (confirmed against `useList.ts`'s
      `/lists/${listId}/todos` and `api.ts`'s own correct comment on `sendOp`). The other stale
      comment this task flagged ("not wired into any mutation flow yet") had already been corrected
      by an earlier task.
      **Verified**: clean full build (anything still referenced would fail to compile, per the
      task's own verification note); smoke-tested in-browser since removing the socket `hello` emit
      touches the connection path — list loads, presence/realtime unaffected, and a todo toggle
      still applies live via the socket, confirming the connection handshake works without it.
      `curl /api/hello` now 404s in the unified error shape.

- [x] Replaced the arbitrary-variant class soup on todo descriptions with
      `@tailwindcss/typography` — [tasks/11-tailwind-typography.md](tasks/11-tailwind-typography.md).
      `TodoDescription.tsx`'s ~400-character `[&_selector]` className (which had already proven
      brittle — the earlier markdown work missed headings entirely and needed a follow-up patch)
      is gone. `@tailwindcss/typography` registered via `@plugin "@tailwindcss/typography";` in
      [index.css](apps/web/src/index.css) (the v4 pattern, since this repo has no
      `tailwind.config.js` and uses the `@tailwindcss/vite` plugin) instead of a v3
      `tailwind.config.js` `plugins` array. The className is now `prose prose-sm prose-slate
      max-w-none` plus a handful of `prose-*` density overrides (`prose-headings:my-1
      prose-headings:text-xs`, `prose-p:my-1`, etc.) to keep the row compact — `prose` alone is
      tuned for article width/spacing, not a nested row in a todo list.
      **Fixes real gaps the old class list had**: no `[&_table]`/`[&_hr]` rules at all, so GFM
      tables (which `remark-gfm` already enables) and horizontal rules rendered unstyled.
      **Security boundary re-verified, not just carried over**: still no `rehype-raw`; pasting
      `<img src=x onerror="alert(1)">` renders as visible literal text with `document.querySelector('img[onerror]')`
      confirming zero `<img>` elements created.
      Browser-verified end-to-end on a fresh test list/todo covering the full range from the task's
      checklist: h1–h6 (distinguishably sized/weighted, confirmed not to blow out row density), bold,
      italic, inline code, a link, nested unordered list, ordered list, blockquote, `hr` (confirmed
      via computed style — a 1px border, subtle but present), and a GFM table (header row + borders
      render correctly, previously unstyled). Clean full build (`tsc` + `vite build`), no console
      errors.

- [x] Linter/formatter, `typecheck` script, CI workflow —
      [tasks/12-tooling-lint-ci.md](tasks/12-tooling-lint-ci.md). Repo had no linter, no formatter,
      and no dedicated typecheck script anywhere.
      **Biome** chosen over ESLint+Prettier (one dependency, one config, covers lint+format+import
      sorting), configured via `biome.jsonc` at the repo root, scoped to `apps/**`/`packages/**`.
      Formatter settings (2-space indent, single quotes for JS, 100-col width) matched to the
      codebase's existing hand-written style rather than Biome's defaults, so `npm run lint` doesn't
      fight established conventions. The React Hooks domain (`linter.domains.react`) is on, which
      includes `useExhaustiveDependencies`.
      **Root scripts**: `typecheck` (builds `shared` for real — other workspaces resolve its
      generated `dist`/types via the workspace symlink — then `tsc --noEmit` for `server` and `web`,
      since `web` already sets `noEmit: true` but `server`/`shared` emit by default), `lint`
      (`biome lint .`), `format` (`biome format --write .`).
      **CI**: new [.github/workflows/ci.yml](.github/workflows/ci.yml), on push to `main` and on
      every PR — install, build `shared`, typecheck, lint. Test step intentionally not added yet,
      per [tasks/DEFERRED.md](tasks/DEFERRED.md); wire it into this same workflow whenever testing
      is picked up.
      **Real findings fixed** (separate commit from the config, per the task's own instruction —
      "a config diff mixed with a hundred auto-formatted files is unreviewable"):
      - The exhaustive-deps case the task called out by name
        ([useList.ts](apps/web/src/hooks/useList.ts), the outbox-sync mount effect deliberately
        keyed on `listId` alone) now carries an explicit `biome-ignore` next to its existing prose
        justification, instead of being invisible to the linter.
      - `TodoDescription.tsx`'s `autoGrow` helper closed over nothing from the component and was
        flagged as a missing effect dependency; moved it to module scope (a pure function of its
        `el` argument) — the correct fix, not a suppression, and one fewer function recreated every
        render.
      - Three `Array.forEach(cb => cb())`-shaped callbacks
        ([connectionStatus.ts](apps/web/src/lib/connectionStatus.ts),
        [outboxSync.ts](apps/web/src/lib/outboxSync.ts) x2) wrapped in braces so the arrow doesn't
        implicitly return a value `forEach` ignores.
      - Four Delete/drag-handle `<button>`s missing an explicit `type="button"`
        ([SubtaskItem.tsx](apps/web/src/components/SubtaskItem.tsx),
        [TodoItem.tsx](apps/web/src/components/TodoItem.tsx),
        [LandingPage.tsx](apps/web/src/pages/LandingPage.tsx),
        [ListPage.tsx](apps/web/src/pages/ListPage.tsx)) — harmless today (none sit inside a
        `<form>`) but a real latent bug the a11y rule caught for free.
      - `noNonNullAssertion` turned off repo-wide (config change, not a per-site fix): this codebase
        uses `!` deliberately wherever a value's non-nullness is already guaranteed by an adjacent
        runtime check (e.g. `listId!` inside a query gated on `enabled: Boolean(listId)`) — over a
        dozen call sites, all following the same established, locally-justified pattern. Rewriting
        all of them to fight the rule seemed worse than documenting the convention and moving on.
      **Three click-to-edit a11y findings deliberately left as tracked `biome-ignore`s, not
      fixed here**: `CostInput.tsx`, `TodoDescription.tsx`, and the conflict-notice toast in
      `ListPage.tsx` all have an `onClick` on a non-interactive element with no keyboard
      equivalent — exactly [tasks/16-accessibility.md](tasks/16-accessibility.md)'s scope (its
      item 3 names `TodoDescription.tsx` specifically). Fixing them here would've meant doing
      task 16's work inside task 12's diff; each site instead got an inline `biome-ignore` with a
      comment pointing at that task, so CI stays green without silently dropping the signal —
      removing the ignore comments is task 16's own verification step.
      **Full repo-wide formatting pass deliberately not run**: `format` exists as a script and
      works, but running it now would touch on the order of dozens of files with zero behavioral
      change — exactly the "config diff mixed with a hundred auto-formatted files" the task warns
      against, and orthogonal to what CI actually enforces (CI runs `lint`, not `format --check`).
      Left for whoever wants that diff on its own.
      **Verified**: `npm run typecheck`/`lint`/`build` all pass from a simulated clean state
      (deleted `packages/shared/dist` and `apps/server/dist` first, confirming `typecheck` rebuilds
      what it needs rather than relying on stale output); browser-smoke-tested the description
      click-to-edit/autoGrow/Escape-discard path (touched by the `autoGrow` move) against a live
      dev server with no console errors.

- [x] Keyboard reachability and accessible names —
      [tasks/16-accessibility.md](tasks/16-accessibility.md). Four independent a11y gaps, three of
      which the new Biome linter (tasks/12) had already surfaced and left as tracked
      `biome-ignore`s pointing here — this task is what removes those.
      **Invisible-when-focused controls**: drag handles and Delete buttons
      ([TodoItem.tsx](apps/web/src/components/TodoItem.tsx),
      [SubtaskItem.tsx](apps/web/src/components/SubtaskItem.tsx),
      [LandingPage.tsx](apps/web/src/pages/LandingPage.tsx)) were `opacity-0` until
      `group-hover`, so a keyboard user could tab onto a fully invisible control — on a todo row,
      the very next thing reachable was an irreversible delete. Added `focus-visible:opacity-100`
      plus an explicit `focus-visible:ring-2 focus-visible:ring-indigo-500/50` everywhere
      `group-hover:opacity-100` appears (browser-verified via `getComputedStyle` after a real `Tab`
      keypress: opacity `1`, a visible box-shadow ring).
      **Checkboxes had no accessible name**: bare `<input type="checkbox">` next to a sibling
      `<span>` with no association. Wrapped both in a `<label>` in `TodoItem`/`SubtaskItem` — also
      makes the title text a click target for toggling, per the task's suggested UX win.
      Browser-verified: `checkbox.labels[0].textContent` reads the todo/subtask title for both.
      **Description/cost editors unreachable by keyboard**: `TodoDescription`'s and `CostInput`'s
      click-to-edit triggers were a plain `<div>`/`<span>` with only `onClick`. Per the task's own
      suggested resolution — a real `<button>` can't legally contain the block content
      (headings/lists/tables) `ReactMarkdown` renders, and would need its default box styling
      overridden anyway for the inline `CostInput` case — both became `role="button" tabIndex={0}`
      with an `onKeyDown` treating Enter/Space as `onClick` (`lint/a11y/useSemanticElements`
      suppressed at both sites with that reasoning, since Biome's default suggestion doesn't apply
      here). Browser-verified end-to-end via real `Tab`/`Enter` keypresses (no mouse): tabbed onto
      each trigger, pressed Enter, confirmed `document.activeElement` became the `<textarea>`/
      `<input>`, typed a value, committed with `Cmd+Enter`/`Enter`, and confirmed it rendered and
      persisted.
      **Connectivity/presence conveyed by more than colour/`title`**: the "Offline" pill got
      `role="status"`; presence avatars got `aria-label` alongside the existing (screen-reader-
      unreliable) `title`, which required adding `role="img"` too — a plain `<span>` doesn't
      support `aria-label` per ARIA's role-attribute rules, another rule the linter caught
      (`lint/a11y/useAriaPropsSupportedByRole`). The conflict-notice toast's `role="status"` was
      already correct per the task's own note; its pre-existing `onClick`-to-dismiss stayed
      mouse-only rather than gaining `tabIndex` — `role="status"` is an ARIA live-region role,
      non-interactive by definition, and mixing in keyboard-focusability would itself be an ARIA
      violation (`lint/a11y/noNoninteractiveTabindex` caught this too, on a first attempt that did
      add `tabIndex`). Not a real reachability gap either way: the toast auto-dismisses on its own
      after 4s, so nothing is exclusively reachable through it.
      **Not touched**: keyboard drag-reorder itself — `dnd-kit`'s `KeyboardSensor` was already
      wired up (specs/08); this task only changed the handle's visibility/labeling, not the
      sensors, and re-verifying the existing reorder flow wasn't necessary since nothing in that
      path changed.
      **Verified**: `npm run lint`/`typecheck`/`build` all clean (zero `biome-ignore` comments
      remain in any of the touched files). Browser-verified the full keyboard path with real
      `Tab`/`Enter`/`Space` keypresses against a fresh test list: reached and activated the drag
      handle (visible + ringed), the labeled checkbox, the cost editor, the delete button, and the
      description editor in tab order; typed and saved a description via keyboard alone; confirmed
      both todo and subtask checkboxes report their title as the accessible name via
      `checkbox.labels[0].textContent`; confirmed the drag-handle glyph is `aria-hidden`. No
      console errors.

- [x] PWA app shell (piece 1/2 of
      [tasks/13-offline-app-shell.md](tasks/13-offline-app-shell.md); piece 2, query persistence,
      still to do) — precaches the built shell so a cold offline load can render at all, closing
      half of the gap the task describes: the outbox makes offline *writes* durable, but nothing
      previously made a reload survive being offline in the first place.
      **`vite-plugin-pwa`** added to `apps/web`, configured in
      [vite.config.ts](apps/web/vite.config.ts): `generateSW` strategy (the default), disabled in
      dev (`devOptions.enabled: false` — a service worker adds nothing over Vite's own HMR
      locally and only confuses dev testing), `registerType: 'prompt'` rather than `'autoUpdate'`
      so a redeploy surfaces a reload control instead of silently swapping the cached shell out
      from under an open tab — new
      [`UpdatePrompt.tsx`](apps/web/src/components/UpdatePrompt.tsx) uses the plugin's
      `virtual:pwa-register/react` hook to render that control, mounted in
      [App.tsx](apps/web/src/App.tsx). A web app manifest is generated inline in the config
      (name/theme/icons); two placeholder indigo-500 PNG icons added at
      `apps/web/public/pwa-{192,512}x512.png` (192 and a 512 duplicated with `purpose: maskable`)
      since the app had no icon asset of any kind before this.
      **The one thing the task flagged as a real hazard** — the service worker's navigation
      fallback swallowing `/api` or `/socket.io` traffic — is handled via
      `workbox.navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//]`; confirmed in the built
      `dist/sw.js`'s `NavigationRoute` that both are in the `denylist` alongside the existing
      server-side fallback ([errorHandler.ts](apps/server/src/errorHandler.ts), which already
      serves `index.html` for unmatched non-`/api` GETs in production — the two now agree).
      **Verified**: full monorepo build clean; `dist/sw.js` precaches the expected 7 entries (JS,
      CSS, `index.html`, both icons, the manifest); `dist/index.html` gets the `<link
      rel="manifest">` injected automatically, with no separate inlined registration script since
      `useRegisterSW` handles that from the bundle itself (confirmed via grep — no
      `registerSW.js` reference, but `workbox-window`'s registration call is present in the main
      bundle). Smoke-tested the production build end-to-end in-browser (existing list load,
      todo/subtask toggle, no new console errors) to confirm the plugin didn't regress anything.
      **Could not verify end-to-end in this session**: actually registering the service worker.
      This session's browser tool is a sandboxed/embedded browser that refuses all
      `navigator.serviceWorker.register()` calls with a generic "unknown error fetching script" —
      confirmed this is the browser, not the app, by fetching `/sw.js` directly (200, correct
      `application/javascript` content-type, correct body) while the identical URL fails only
      through the Service Worker registration API. So the actual "go offline, hard reload, app
      still loads" scenario — the task's real acceptance test — is unverified by me and needs a
      real browser (Chrome/Safari devtools offline toggle, or actually disabling Wi-Fi) before
      this can be considered done. Flagging this explicitly rather than claiming a UI outcome I
      couldn't actually observe.
      **Not done, left for piece 2**: `@tanstack/query-sync-storage-persister` +
      `persistQueryClient` — without it, the offline-cached shell currently has an empty
      TanStack cache, so a cold offline load will render the app frame but not the list contents.
      Piece 1 alone is a real but partial step; the task isn't done until piece 2 lands.

- [x] Query persistence (piece 2/2 of [tasks/13](tasks/13-offline-app-shell.md), completing the
      task): `@tanstack/query-sync-storage-persister` + `persistQueryClient`, wired in
      [App.tsx](apps/web/src/App.tsx) right where `queryClient` is created. Persists only the
      `['list', id]` and `['lists']` query shapes (a key-prefix filter composed with TanStack's
      own `defaultShouldDehydrateQuery`, so a query that's currently loading/erroring isn't
      persisted with no usable data) — nothing else in this app needs to survive a reload.
      **Storage choice: `localStorage`**, not IndexedDB (the task asked this be decided and
      recorded, see Decisions below). Uses `createAsyncStoragePersister` (not the sync-specific
      variant, which is deprecated upstream in favor of this one) — same `localStorage` underneath,
      caught and fixed in review before this landed.
      **A real bug found and fixed while verifying this**: [ListPage.tsx](apps/web/src/pages/ListPage.tsx)
      checked `listQuery.isError` before checking whether `listQuery.data` was present. That was
      fine when it was written (tasks/06, defending against a *different* paused-query state) but
      is actively wrong now — TanStack Query's `'error'` action sets `status: 'error'` on **any**
      failed fetch, including a background refetch on an already-successful query, and does *not*
      clear the existing `data`. Piece 2 makes that the common case, not an edge case: a cold
      offline mount always has persisted `data` (that's the point) and always fails its mount-time
      fetch (`networkMode: 'always'`) while offline — so unmodified, `ListPage` would hide the very
      data persistence just restored behind a "Failed to load list" screen the instant the failed
      fetch resolved. Fixed by checking `data` first: render it whenever present, regardless of a
      concurrent/subsequent fetch error, and only show the error screen when there's truly no data
      to fall back on. Confirmed by reading `query-core`'s reducer directly
      (`node_modules/@tanstack/query-core/build/modern/query.js`, the `case "error"` branch),
      not just inferred from behavior.
      **Verified**: full monorepo build/typecheck/lint clean. Since this session's browser tool
      can't register a service worker (see piece 1's entry above), the literal "go offline, hard
      reload" test isn't directly available here. Used a proxy that exercises the same code path
      minus the service worker: loaded a real list (online, so TanStack persisted it to
      `localStorage` — confirmed via reading the `REACT_QUERY_OFFLINE_CACHE` key directly),
      patched `window.fetch` to reject every `/api/` call (simulating offline without touching
      the SW), then forced a remount of `ListPage` via client-side navigation away and back. Before
      the `ListPage` fix: blank error screen (`Failed to load list: simulated offline`) — the exact
      bug described above, and it also **erased the persisted snapshot**, since `persistQueryClient`
      re-persists on every cache change and the now-`error`-status query no longer passed the
      dehydrate filter. After the fix: the list rendered correctly from cache with the existing
      "Offline" pill showing, and the persisted snapshot stayed intact. Restored `fetch` and
      confirmed everything returns to normal (no "Offline" pill, todo/list interactions work).
      Separately confirmed no regression in realtime: with the app tab open and unpatched, sent a
      todo creation via a spoofed second client (direct `fetch` to the API, distinct `X-Client-Id`)
      and confirmed it applied live with no reload, both before and after this change.
      **Also confirmed while debugging, unrelated to this task's code**: the ad-hoc local server
      used for this verification (`node dist/index.js`, `NODE_ENV=production`) briefly appeared to
      serve a broken app (JS bundle returned as `text/html`) after a rebuild — traced to
      `@fastify/static`'s `wildcard: false` mode, which snapshots the dist directory's file list
      *once at server startup* rather than serving it dynamically; a server process left running
      across a rebuild has stale routes for any file whose content-hashed name changed. Restarting
      the process (exactly what every real deploy already does, build-then-fresh-start) resolved
      it — not a bug in this repo, just a trap specific to re-testing against a long-lived local
      server across edits without restarting it.

- [x] Graceful shutdown + real `/healthz` (items 1 and 3/4 of
      [tasks/14-server-hardening.md](tasks/14-server-hardening.md); items 2 and 4 — rate
      limit/helmet/body cap, and `GET /api/lists` pagination — still to do). Both in
      [index.ts](apps/server/src/index.ts).
      **Graceful shutdown**: Render sends `SIGTERM` on every deploy (this app auto-deploys on every
      push), which previously dropped in-flight requests and open Socket.IO connections abruptly
      and left Prisma's connection pool undrained. New `SIGTERM`/`SIGINT` handler: `io.close()`
      first (actively ends every open socket, not just stops accepting new ones — also closes the
      shared `http.Server` as a side effect), then `app.close()` (Fastify's own plugin/route
      teardown; tolerates the server already being closed — confirmed by reading its source, it
      swallows `ERR_SERVER_NOT_RUNNING`), then `prisma.$disconnect()` last so the pool stays alive
      until in-flight requests are done. A 10s force-exit timeout (`unref()`'d, so it can't itself
      keep the process alive) backstops a hung connection; Render kills the process outright after
      its own grace period regardless, so this is just an attempt at a clean exit first.
      **Real `/healthz`**: was `return 'ok'` unconditionally. Now runs `prisma.$queryRaw\`SELECT
      1\``, returning `503` in the unified error shape on failure. Matters concretely here: the
      Render Postgres is on the free tier and expires 30 days after creation (see Environment
      above) — an honest healthz is what would surface that rather than the app reporting healthy
      while every real request 500s.
      **Verified**: full build/typecheck/lint clean. Sent `SIGTERM` to a running production-mode
      instance — logged the shutdown, exited `0`, well under the 10s timeout; repeated with a
      request fired within ~20ms of the signal and confirmed it still completed (`200`, not a
      connection reset). Pointed an isolated instance at an unreachable `DATABASE_URL` (not the
      shared local Postgres, to avoid disrupting another session's dev server also using it) and
      confirmed `/healthz` returns `503` with `{"error":{"code":"service_unavailable",...}}`;
      confirmed `200 ok` against the real database. Did not touch the shared docker-compose
      Postgres for this — verified the failure path via a bad connection string instead so the
      already-running dev server on port 3001 (another session's) wasn't disrupted.

- [x] Rate limiting, security headers, body cap, and a Socket.IO connection cap (item 2/4 of
      [tasks/14-server-hardening.md](tasks/14-server-hardening.md); item 4, `GET /api/lists`
      pagination, still to do). All in [index.ts](apps/server/src/index.ts) except the socket cap.
      **`@fastify/helmet`** registered with its default config — no directive overrides needed,
      since everything here is same-origin (built JS via a same-origin `<script src>`, React's
      inline `style={}` covered by CSP's default `style-src 'unsafe-inline'`, Socket.IO's
      XHR/WebSocket traffic same-origin too). Verified against the production build specifically
      (static files, and therefore this header, are Fastify-served only in production) — no CSP
      violations, list load and realtime both unaffected.
      **`@fastify/rate-limit`**, global, `100/minute`. Its default error is a plain `Error` with
      `.statusCode = 429`, which — since it's thrown, not directly serialized by the plugin —
      flows through the same generic `setErrorHandler` as everything else
      ([errorHandler.ts](apps/server/src/errorHandler.ts)'s `STATUS_TO_CODE` already had `429`
      mapped), so no custom `errorResponseBuilder` was needed to keep the unified shape. Confirmed
      by reading the plugin's source before trusting that, not just by testing after the fact.
      **`bodyLimit: 256 * 1024`** on the Fastify constructor — well below the 1MB default; the
      largest legitimate payload today is a markdown description, no size-limited elsewhere in the
      shared zod schemas.
      **Socket.IO connection cap** ([socket.ts](apps/server/src/socket.ts)): a flat
      `MAX_SOCKET_CONNECTIONS = 500` checked in an `io.use` middleware via
      `io.engine.clientsCount`, rejecting the handshake past that. Flat rather than per-list: this
      app has no notion of "too many real viewers of one list" worth engineering around, just "too
      many sockets, period" — `list:join` accepting any list id with no auth stays intentional
      (lists are public, see Decisions below), unchanged.
      **Verified** against an isolated production-mode instance: `curl -I` confirmed the CSP/
      `X-Content-Type-Options`/`X-Frame-Options` headers present; a >256KB POST body returned `413`
      with `{"error":{"code":"payload_too_large",...}}`; 98 rapid requests to `/healthz` triggered
      `429` with `{"error":{"code":"too_many_requests","message":"Rate limit exceeded, retry in 50
      seconds"}}` — the unified shape, confirming no custom error handling was needed. Restarted
      with a clean rate-limit window (it's in-memory, per-IP) and browser-verified the production
      build end-to-end: list loads, no CSP console errors, and realtime still applies a spoofed
      second client's change live with no reload. Full build/typecheck/lint clean.

- [x] `GET /api/lists` pagination (item 4/4 of
      [tasks/14-server-hardening.md](tasks/14-server-hardening.md), completing the task). Lists
      are publicly creatable with no ownership, so this endpoint returned *every list ever
      created*, unbounded.
      **Offset-based, not cursor-based**: simpler, and the task's own framing ("a capped list plus
      'show more' is fine; it doesn't need infinite scroll") doesn't need cursor pagination's
      extra correctness work. New `ListsQuerySchema`/`LISTS_PAGE_SIZE` (=50) in
      [packages/shared](packages/shared/src/index.ts); the route
      ([lists.ts](apps/server/src/routes/lists.ts)) fetches `limit + 1` rows to learn `hasMore`
      without a separate `COUNT` query, `limit` capped at 100 by the schema.
      **`LandingPage`**: "Show more" bumps a `limit` state value (starting at `LISTS_PAGE_SIZE`)
      and re-fetches everything up to the new limit, rather than fetching-and-merging separate
      pages — no client-side dedup/merge logic needed, always exactly the server's own order, and
      correct by construction for the list counts this app deals with.
      **Verified** directly against a live server: `?limit=3`/`?limit=3&offset=3` sliced correctly
      and in the right order (confirmed against the unpaginated list), `hasMore` accurate at each
      boundary, `?limit=9999` correctly 400s in the unified error shape (zod's `.max(100)` on the
      querystring schema). Confirmed the web client sends `?limit=50` by default (network log) and
      that the existing 14 test lists all still load with no regression. Did not click through
      "Show more" itself in-browser — that would've meant creating 40+ throwaway lists in the
      shared dev database just to cross the default page size, for a two-line, low-risk state
      bump; the underlying pagination it depends on was verified directly instead.
      Full build/typecheck/lint clean.

- [x] Composite `(listId, position)`/`(todoId, position)` indexes; landing-page ordering fixed to
      match reality — [tasks/15-db-indexes.md](tasks/15-db-indexes.md).
      **Indexes**: every read path orders by `position` within a list/todo (comprehensive since
      subtask drag-and-drop landed), but the schema only had single-column `@@index([listId])`/
      `@@index([todoId])` — Postgres could use those for the filter but still had to sort the
      matched rows afterward. Replaced (not added to, since the composite index's leading column
      still serves listId/todoId-only lookups) with `@@index([listId, position])` on `Todo` and
      `@@index([todoId, position])` on `SubTask`. New migration
      (`20260914131213_composite_position_indexes`), applied locally.
      **Landing-page ordering, fixed not just indexed**: `GET /api/lists` ordered by
      `updatedAt: 'desc'`, but nothing ever touched a `List` row when its todos/subtasks changed
      (Prisma's `@updatedAt` only fires on writes to that row itself) — in practice this was
      creation order wearing a misleading "recently active" label. **Chose `createdAt`** over
      genuinely bumping `updatedAt` on every child mutation: the task's own framing calls this "the
      honest cheap option," and bumping would mean a second write on every todo/subtask mutation
      plus an open question about `list:updated` broadcast semantics (do other open tabs care that
      a list's timestamp moved with no visible change?) for a property nothing in the UI currently
      surfaces (no "last edited" display anywhere) — not worth the cost for behavior no one can see
      yet.
      **Verified**: `EXPLAIN ANALYZE` at current data volume (~19 rows total) shows Postgres
      correctly preferring a sequential scan — too little data for an index to pay off, as the task
      itself anticipates ("small at current data volumes... the correct index for the access
      pattern"). Confirmed the index actually eliminates the sort when used by forcing it
      (`SET enable_seqscan = off`): the plan became a bare `Index Scan using
      "Todo_listId_position_idx"` with no separate `Sort` node. `prisma migrate deploy` against an
      isolated local instance reported the new migration already applied cleanly (picked up from
      the earlier `migrate dev` run) — the same command Render's start script runs on every
      deploy, so nothing about that path changed. Browser-verified list load/ordering with no
      regression, no console errors. Full build/typecheck/lint clean.

- [x] Recorded the realtime transport decision (Socket.IO vs. SSE) —
      [tasks/21-record-transport-decision.md](tasks/21-record-transport-decision.md). Docs only,
      no code change. Almost all realtime traffic here is one-way server→client, SSE's exact
      shape, and was considered and rejected in favor of Socket.IO for three reasons: presence
      needs client→server identity at join and server-side disconnect detection (Socket.IO's
      connection lifecycle gives this for free), the rooms API is the per-list fan-out already
      written, and `connectionStatus` is fed directly by Socket.IO's own reconnect events. Full
      reasoning and the accepted cost (bundle size, worse behavior through some corporate proxies)
      now in [specs/01-architecture.md](specs/01-architecture.md#realtime-transport-why-not-server-sent-events).

- [x] String fractional indexing, replacing `position: Float` —
      [tasks/18-fractional-string-indexing.md](tasks/18-fractional-string-indexing.md). Repeated
      insertions into the same gap halve a float's remaining space each time; the spec's own
      epsilon/re-index fallback for that was never actually implemented (a known, documented gap
      since drag-and-drop shipped). `fractional-indexing`'s lexicographic string keys remove the
      problem instead of handling it — see
      [specs/08-drag-and-drop.md](specs/08-drag-and-drop.md#position-strategy-fractional-index-string-keys)
      for the full design (collation included).
      **Schema + migration, in two steps with a required backfill in between** (Prisma migrations
      are pure SQL; `generateNKeysBetween` is a JS algorithm with no reasonable SQL port):
      1. `20260914140000_add_position_key_columns` — additive, backward-compatible: nullable
         `positionKey TEXT COLLATE "C"` columns alongside the untouched float `position` columns.
      2. `apps/server/scripts/backfillPositionKeys.ts` (`npm run db:backfill-positions -w
         @ubiquiti-todo/server`) — for each list/todo, reads existing rows ordered by the old float
         `position`, assigns `generateNKeysBetween(null, null, count)` in that order via raw SQL
         (`$queryRaw`/`$executeRaw`, deliberately not the typed Prisma Client — schema.prisma
         already declares the final `position String` shape, so the generated client doesn't know
         about either transitional column). Idempotent: always recomputes from the still-intact
         float order, safe to re-run.
      3. `20260914140100_finalize_position_as_string` — drops the old float `position`, renames
         `positionKey` into its place, sets `NOT NULL`, recreates the composite
         `(listId, position)`/`(todoId, position)` indexes from tasks/15 (dropping the float column
         drops any index defined on it, so these would otherwise silently disappear).
      **Deployment hazard caught before it mattered**: this app auto-deploys via `prisma migrate
      deploy` on every push (see Environment above) with nothing to stop both migrations applying
      back-to-back, unattended, in one deploy — if the backfill script hasn't been run against that
      database yet, migration 2 would rename an all-NULL column into place and permanently lose
      every row's ordering. Fixed by making migration 2 itself abort (`RAISE EXCEPTION` in a `DO`
      block, checking for any `positionKey IS NULL`) rather than relying on a comment someone has
      to remember to read — a failed deploy is the safe failure mode, not a silent data-destroying
      one. **Verified the guard directly**, not just reasoned about: built the exact hazard
      scenario in a throwaway database (init + index migrations, then only the additive migration,
      then a manually-seeded row with a null `positionKey`), confirmed migration 2 aborts with a
      clear, actionable error naming the exact row counts and the script to run; then ran the
      backfill against that same throwaway database and confirmed migration 2 then applies cleanly.
      **Collation**: `COLLATE "C"` set on both columns via raw SQL (Prisma has no schema-level
      attribute for this). **Could not reproduce the described divergence locally** — this repo's
      `docker-compose` Postgres (`postgres:17-alpine`, musl libc) reports `en_US.utf8` as its
      collation but several deliberately-constructed mixed-case test pairs (`'Ab'` vs `'aA'`,
      `'aa'` vs `'AB'`, and others) sorted identically under it and under explicit `COLLATE "C"` —
      Alpine's musl-based locale support appears to fall back to byte order rather than
      implementing glibc's multi-level (case-as-secondary-weight) collation. Flagging this
      honestly rather than claiming to have reproduced a bug I couldn't actually trigger here:
      the fix is still correct and worth keeping regardless (explicit byte-order collation is
      always the right choice for this use case, whatever a given Postgres build's default happens
      to do), and Render's Postgres — almost certainly a standard glibc-based image, not Alpine —
      is exactly where the task's warning is more likely to bite.
      **Client** ([lib/position.ts](apps/web/src/lib/position.ts)): `computeReorderPosition`
      delegates directly to `generateKeyBetween`; new `comparePosition` helper (plain `<`/`>`,
      deliberately not `localeCompare`, which would reintroduce the same collation problem
      client-side) used by both `reorderTodo`/`reorderSubTask`'s optimistic re-sort. `createTodo`/
      `createSubTask`'s `Date.now()` placeholder positions
      ([useList.ts](apps/web/src/hooks/useList.ts)) now read the current last sibling from the
      query cache and call `generateKeyBetween(lastSibling?.position ?? null, null)`. Shared zod
      schemas (`TodoSchema`, `SubTaskSchema`, `TodoMutableSchema`, `SubTaskMutableSchema`,
      `CreateTodoBodySchema`, `CreateSubTaskBodySchema`) changed `position: z.number()` →
      `z.string().min(1)`.
      **Verified end-to-end** against a running server: order-preservation confirmed for every
      existing Todo and SubTask via a `row_number()` comparison (old float rank vs new key rank) —
      all matched exactly across all lists. 150 repeated same-gap insertions via the library
      directly, then 30 more via real PATCH requests against the running server, produced zero
      collisions (keys just grew, e.g. reaching 3 characters after 150 insertions). Fresh creates,
      reorders, and subtask reorders all round-tripped correctly through the real API. Offline
      reorder replay verified by writing a `QueuedOp` with a string `position` directly into the
      outbox's IndexedDB store and confirming `outboxSync`'s flush-on-mount sent and applied it
      correctly (and dequeued it) on the next page load — the outbox/flush code has no
      position-specific logic (bodies are opaque JSON), so this was never a high-risk path, but was
      still checked directly rather than assumed. Full monorepo build/typecheck/lint clean.
      **Couldn't verify a real pointer-drag gesture** in this session's browser automation — a
      simulated drag was interpreted as plain text selection rather than triggering `dnd-kit`'s
      `PointerSensor`, a known limitation of this tool for pointer-based drag interactions, not a
      regression (the DnD wiring itself is unchanged by this task; only the position *value*
      computation changed, already verified through the same `reorderTodo`/`reorderSubTask`
      mutation code paths via direct API calls).

- [x] Transaction boundaries on the two create routes —
      [tasks/19-transaction-boundaries.md](tasks/19-transaction-boundaries.md). `prisma.$transaction`
      appeared zero times in the codebase before tasks/04; this closes the other gap that review
      found: `POST /api/lists/:listId/todos` and `POST /api/lists/:listId/todos/:todoId/subtasks`
      were each three sequential round trips (parent-exists check, idempotency check, create), so
      two clients replaying the same queued create concurrently — a real scenario, the outbox
      retries — could both see `existing === null` and both attempt the create, the second hitting
      an unhandled unique-constraint violation (P2002) that fell through to a generic 500 instead of
      the idempotent 200 the design intends.
      **The task's own prescribed fix (`prisma.todo.upsert`) turned out not to actually work**:
      verified by turning on Prisma's query logger before trusting it, `upsert` here compiles to
      `BEGIN; SELECT id WHERE id = $1; INSERT; COMMIT` — a hand-rolled check-then-insert inside a
      transaction, not a native `INSERT ... ON CONFLICT DO UPDATE` — so it raced exactly like the
      original code under genuine concurrency. Confirmed directly: two real concurrent POSTs with
      `prisma.todo.upsert` in place still produced one `200` and one `500` with Prisma's own P2002
      surfacing as the error. Root-caused before writing the actual fix, not just noticed and
      patched over.
      **Actual fix**: a bare `prisma.todo.create`/`prisma.subTask.create` racing on the database's
      own unique constraint on `id` — genuinely atomic, since Postgres guarantees exactly one of two
      concurrent inserts for the same id can succeed — with the loser catching `P2002` and
      re-fetching the winner's now-committed row via `findUniqueOrThrow` instead of erroring. Three
      queries become one on the fast path (a fresh create) and two on the losing side of a genuine
      race (failed insert + fetch), matching the task's own framing without relying on Prisma
      upsert's incidental (and here, absent) atomicity.
      **P2003 → 404**: the missing-parent case (deleted/nonexistent list or todo) now surfaces as a
      foreign-key violation on the insert rather than a separate existence check; mapped to 404
      centrally in [errorHandler.ts](apps/server/src/errorHandler.ts) alongside the existing P2025
      mapping, same unified error shape.
      **Broadcast on the idempotent-retry path too**: previously the "already exists" branch
      returned silently with no broadcast; now every successful response broadcasts, including a
      sequential-retry idempotent return. Verified this is harmless, not just assumed: both
      `TODO_CREATED` and `SUBTASK_CREATED` handlers in
      [useListSocket.ts](apps/web/src/hooks/useListSocket.ts) already dedupe by id before applying
      to the cache.
      **`DELETE /api/lists/:listId`** — already a single atomic `deleteMany`, left untouched per the
      task's own scope discipline note (no transaction added where one statement already suffices).
      **Found and fixed along the way**: [scripts/verify-conflict.py](scripts/verify-conflict.py)
      had been silently broken since tasks/18 (fractional string indexing) landed — it still POSTed
      `"position": 1` (a number), which the schema has required as a string since that task, so
      every create in the script 400'd and every assertion after it compared against `None`. Fixed
      both call sites to `"position": "a0"`; unrelated to this task's actual change but needed to
      run its own verification step, and is exactly the kind of stale-script drift worth catching
      rather than working around.
      **Verified**: fired real concurrent duplicate POSTs (not sequential) against a running local
      server for both todos and subtasks, 5 pairs each — all 10 requests returned `200`, and a direct
      `SELECT ... GROUP BY id` against Postgres confirmed exactly one row per id, zero duplicates and
      zero 500s (the exact scenario that motivated this task). Confirmed the missing-parent 404 for
      both routes. Confirmed the pre-existing sequential-idempotency path (same id POSTed twice, not
      concurrently) still returns the same row unchanged. Re-ran the now-fixed
      `scripts/verify-conflict.py` — all 10 assertions pass. Full monorepo build/typecheck/lint
      clean.

- [x] **Production incident**: Render deploy broken by an unrun production backfill, fixed same
      session. Pushing the tasks/19 commit above triggered a Render auto-deploy that never came
      up — `prisma migrate deploy` (run automatically by the `start` script on every deploy, see
      Environment above) failed with `P3009`, blocking that migration and every migration after it,
      so the app never started (0 open ports).
      **Root cause, unrelated to tasks/19**: tasks/18 (fractional string indexing, landed earlier
      the same day) shipped two schema migrations with a required data-backfill script
      (`backfillPositionKeys.ts`) that had to run *between* them, against whatever database was
      being migrated. That ran and was verified locally, but was never actually run against
      Render's production database before the second migration
      (`20260914140100_finalize_position_as_string`) shipped. That migration's own guard — added
      specifically to prevent this — did exactly its job: it hard-aborted rather than renaming an
      all-NULL `positionKey` column into place, but a failed migration also permanently blocks
      `prisma migrate deploy` from proceeding at all (by design — every migration tool refuses to
      blindly retry a failed one, since that could paper over a real problem) until a human
      resolves it. So the safety mechanism worked; the process gap was that the manual step it
      depends on silently never happened against the one database that mattered.
      **Fixed by**: running `backfillPositionKeys.ts` against Render's production database (confirmed
      first: only 6 Todo + 7 SubTask rows existed, all genuinely missing a `positionKey`, not zero as
      a fresh/empty DB would've had — this was live, if small, real data, so recreating the database
      from scratch was considered and rejected in favor of the surgical fix once that was known),
      verified zero rows still `NULL` afterward, then `prisma migrate resolve --rolled-back` on the
      failed migration (safe because Postgres DDL is transactional — the `RAISE EXCEPTION` inside a
      `DO` block aborted the migration's transaction before any `ALTER TABLE` ran, so nothing partial
      was ever applied) followed by `prisma migrate deploy` to apply it for real. Confirmed after:
      `/healthz` returns `200 ok`, `GET /api/lists` returns the same pre-incident lists (no data
      lost).
      **Two of these commands were blocked by the harness's own auto-mode safety classifier**
      (writes to a shared/production resource) even after explicit user authorization in chat and a
      known-safe, idempotent script; per its own guidance this wasn't something to route around, so
      the user ran `migrate resolve` and the final `migrate deploy` directly.
      **Follow-up recorded**, not yet built: `prisma migrate deploy` has no way to express "run this
      data script between these two schema migrations," so nothing short of remembering to do it
      manually would have prevented this specific class of gap. If a future migration needs the same
      shape (a data backfill that must run before a later schema change can finalize), fold the
      backfill into the deploy path itself — e.g. have the `start` script run the backfill script
      before `prisma migrate deploy` for that one deploy — rather than relying on a human to run it
      against production out-of-band before pushing.

- [x] UI polish, user-requested (not from `tasks/`): a back link on `ListPage` to the landing
      page, plus a mobile-friendliness pass across `ListPage`/`LandingPage`/`TodoItem`/
      `SubtaskItem`/`AddSubtaskForm`. Tailwind class changes only, no behavior/logic change.
      **Back link**: `ListPage` had no way back to the list directory except the browser's own
      back button. Added a `← Back to lists` `Link` to `/` above the title.
      **Touch targets weren't tappable at all on a real phone**: the drag handle and Delete
      buttons on todo/subtask rows, and Delete on the landing page's list rows, were
      `opacity-0 group-hover:opacity-100` — invisible and (since `group-hover` never fires without
      a mouse) permanently unreachable on a touchscreen, not just hard to hit. Changed to
      `opacity-60` by default (dimmed but visible and tappable) rising to full opacity on
      hover/focus, and gave both buttons real padding (`p-1`/`px-1.5 py-1`) instead of a bare
      glyph/text as the tap target.
      **Narrow-viewport layout**: the `ListPage` card's fixed `p-8` padding left very little
      content width on a 375px phone once combined with the outer `px-4`; made padding/vertical
      spacing responsive (`p-4 sm:p-8` etc.) on `ListPage`/`LandingPage`. The header row (title +
      total + Offline pill + presence avatars + Delete list) now wraps (`flex-wrap`) instead of
      being forced onto one line, and the title truncates (`min-w-0 truncate`) instead of pushing
      other controls off-screen. The todo row (drag handle, checkbox, title, subtask progress,
      cost, Delete) also wraps and its title truncates for the same reason; nested indentation
      (subtasks, description, add-subtask form) shrinks on narrow screens (`ml-5 pl-3` vs.
      `sm:ml-7 sm:pl-4`) to leave more room for content.
      **Verified**: clean `typecheck`/`lint`/full production build. Browser-verified against the
      already-running dev server at a 375×812 (mobile) viewport: landing page list rows show
      legible, tappable Delete buttons with no hover; opened a list, confirmed the back link
      returns to the landing page; todo/subtask rows with descriptions, costs, and markdown
      (including headings and the existing XSS-payload test content) all render without overflow,
      drag handles and Delete buttons visible and correctly sized without needing hover. Re-checked
      the same list at desktop width to confirm no regression there. No console errors.

- [x] Fixes from a pre-submission review (2026-09-14/15), all browser/API-verified against a
      fresh local server and the live Render deploy:
      **Subtask route scoping** (a real defect, same class as tasks/04 but one level deeper):
      subtask PATCH/DELETE scoped queries to `todoId` alone, ignoring the `listId` in the URL —
      a request naming the right subtask under the *wrong* list still mutated the row and then
      broadcast to a room nobody was in. Fixed by scoping to `todo: { listId }` too, in both
      [apps/server/src/routes/subtasks.ts](apps/server/src/routes/subtasks.ts)'s PATCH and DELETE.
      **Cost/length bounds**: `costCents` had no upper bound against Postgres `INTEGER`, so a
      large value 500'd — and since 5xx is retried, one bad value blocked a list's whole outbox
      queue for ~10 retries before being discarded. No lower bound either (negative costs
      accepted). No length cap on `title`/`descriptionMd` (a 100KB title went through). Added
      `CostCentsSchema` (`.min(0).max(2_147_483_647)`) and `TitleSchema`/`DescriptionSchema` as
      shared primitives in [packages/shared/src/index.ts](packages/shared/src/index.ts), used
      across all six body schemas; `COST_CENTS_MAX` also exported and used by
      [lib/cost.ts](apps/web/src/lib/cost.ts)'s `parseCostInput` so the client refuses what the
      server would reject, rather than a value silently blocking the queue for two minutes before
      the discard.
      **`api.ts` bug**: `body?.error.message` stopped one optional-chain short of `error?.message`
      — an error body without the expected shape (e.g. from a proxy) threw a TypeError instead of
      an `HttpError`, which the outbox then misfiled as a retryable network failure. Fixed.
      **Subtotal display**: "Subtotal: $X" rendered under every todo with subtasks, including
      "$0.00" when none were priced — contradicted the list header's own total, which already
      hides at zero. Now hides at zero too, matching the rest of the app's optional-affordance
      convention (presence avatars, the Offline pill).
      **Rate limit headroom**: 100/min per IP was measuring the wrong thing — it's global
      (covers static assets too) and per-IP (two collaborating browser tabs share one), putting a
      normal two-person demo within reach of a 429. Raised to 600/min.
      **README**: never mentioned the live URL. Now leads with it, plus pointers into `specs/`.
      **Live deploy cleanup**: two leftover test lists from the 2026-09-11 offline-sync session
      were still on the public landing page; deleted.
      **CI had never once passed** since the workflow was added (all runs red, including on
      commits before this session) — `npm run typecheck` type-checks against `@prisma/client` but
      never generates it; `npm run build` does (the server's build script runs `prisma generate`
      first), so this passed locally wherever a prior build had left a client in `node_modules`,
      and failed on every clean `npm ci`. Fixed in the script (`typecheck` now runs a new
      `db:generate` first — delegated to the server workspace, not run with `--schema` from the
      root, since generating from the root resolves the client's runtime `.env` lookup against the
      wrong directory) rather than papering over it with a CI-only step, so a fresh clone works
      too. Verified in a clean room: copied the tree without `node_modules`/`dist`/`.env`, ran
      `npm ci`, then the exact CI step sequence — first genuinely green run in the repo's history.
      Also added `format:check` (`biome format .`, no writes) as its own CI step and root script,
      catching the 22-file formatting drift that had built up with nothing to catch it.
      **List rename**: `PATCH /lists/:listId` ("rename" per
      [specs/03-api-rest.md](specs/03-api-rest.md)) and the `LIST_UPDATED` broadcast/handler all
      already existed on both sides, but no UI ever called it. Completed rather than removed,
      since the spec names it as an intended endpoint, not incidental surface: added
      `api.updateList`, a `updateListTitle` mutation in `useList.ts` (online-only + explicit check
      like `deleteList`, for the same reason — List has no version column, and the default
      `networkMode: 'online'` pauses invisibly instead of failing fast), and a new
      [`ListTitle.tsx`](apps/web/src/components/ListTitle.tsx) click-to-edit component mirroring
      `CostInput`/`TodoDescription`'s pattern. Browser-verified: click → edit → blur saves and
      persists server-side; Escape discards without saving.
      Deliberately not touched, per explicit instruction: adding tests (deferred to a separate
      session, see [tasks/DEFERRED.md](tasks/DEFERRED.md)) and rewriting the pushed "UI
      improvments" commit message typo, which would need a force-push.

- [x] Testing, step 1/8 — corrected specs/11 and DEFERRED.md —
      [tasks/23-testing.md](tasks/23-testing.md#step-1--correct-specs11-and-deferredmd). Docs only,
      no code, per that step's own scope. [specs/11-testing-strategy.md](specs/11-testing-strategy.md)
      now: Supertest → `app.inject()`; backend item 1 (position/reordering math) replaced with the
      neighbor-selection cases for `computeReorderPosition` (the float-scheme midpoint/epsilon
      content it described no longer exists, per [18](tasks/18-fractional-string-indexing.md)); the
      socket boundary corrected to `hooks/useListSocket.ts` (`lib/socket.ts` was never real); the
      frontend component list corrected to name `TodoDescription.tsx` and the inline add-todo form
      in `ListPage.tsx` rather than the never-built `DescriptionEditor`/`AddTodoForm`; and the
      realtime-broadcast testing approach updated to the spy-broadcaster-plus-one-real-socket-test
      split tasks/23 step 2 introduces, rather than `socket.io-client` for everything.
      [tasks/DEFERRED.md](tasks/DEFERRED.md)'s testing section had the same stale float-precision
      line in its own priority list; corrected to match. Remaining 7 steps not started — see
      tasks/23 for the plan (one step per session/PR, steps 1-2 are prerequisites for the rest).

- [x] Testing, step 2/8 — extracted `buildApp()` from `index.ts` —
      [tasks/23-testing.md](tasks/23-testing.md#step-2--extract-buildapp-from-indexts). Refactor
      only, no tests added, no behavior change — the prerequisite for every server-side test in the
      rest of tasks/23, since importing the old `index.ts` started a real server on port 3001 via a
      module-scope `await app.listen()`.
      **New [app.ts](apps/server/src/app.ts)**: exports `buildApp({ broadcaster, isProduction })`,
      containing everything from the `Fastify({...})` constructor through route/static
      registration — error handling (still registered first, since Fastify bakes the current
      handlers into each route's context at registration time), helmet, rate limit, the zod
      compilers, the `clientId` hook, `/healthz`, and the three route plugins. No `listen()`, no
      signal handlers, no side effects — a test can call it directly and drive it with
      `app.inject()`.
      **The ordering problem the task flagged, and how it's resolved**: `buildApp()` takes the
      broadcaster as a parameter (so route tests can pass a spy with no sockets/ports involved),
      but the *real* broadcaster is `registerSocketHandlers(io, app.log)`, and both `io` and
      `app.log` need `app.server`/`app` to already exist — which `buildApp()` itself constructs.
      [index.ts](apps/server/src/index.ts) breaks the cycle with a thin forwarding shim: a
      `broadcaster` object whose `broadcastToList` closes over a `let realBroadcaster` that starts
      `undefined` and is assigned the instant `app.server` exists (right after `buildApp()`
      returns, before `app.listen()`). Routes only ever call `app.broadcaster.broadcastToList` at
      request time — never during registration — so by the time any request could reach it,
      `realBroadcaster` is long since set; the shim is invisible at runtime. (Consistent with this
      repo's existing convention of allowing `!` where non-nullness is guaranteed by an adjacent
      runtime fact, per tasks/12's `noNonNullAssertion` decision.)
      **`index.ts` now just**: builds the shim, calls `buildApp()`, creates the Socket.IO server
      against `app.server`, wires the real broadcaster into the shim, `app.listen()`, and the
      unchanged SIGTERM/SIGINT shutdown block.
      **One deliberate deviation from the task's literal type signature**: the task writes
      `buildApp(...): FastifyInstance`; this returns `Promise<FastifyInstance>` (an `async`
      function) instead, so the internal `await app.register(...)` calls could stay exactly as they
      were rather than becoming unawaited/floating — preserving the original registration order
      byte-for-byte took priority over matching the sketch's literal (non-`Promise`) annotation.
      **Verified**: full monorepo build/typecheck/lint clean. Ran an isolated instance on a spare
      port (3099, not the shared dev server on 3001 another session had running) against the local
      docker-compose Postgres: `/healthz` 200s, `GET`/`POST`/`PATCH`/`DELETE /api/lists` all work;
      two real `socket.io-client` connections joined the same list room and confirmed a PATCH from
      one client's `X-Client-Id` delivered `list:updated` to the other client and *not* back to the
      originator — proving the forwarding-shim broadcaster wiring actually works, not just
      typechecks. Sent `SIGTERM` and confirmed the same clean-exit log sequence as before this
      refactor. Cleaned up the throwaway test list afterward.

- [x] Testing, step 3/8 — Vitest scaffolding and the CI test step —
      [tasks/23-testing.md](tasks/23-testing.md#step-3--vitest-scaffolding-and-the-ci-test-step).
      Infrastructure only: one root [vitest.config.ts](vitest.config.ts) with two `test.projects`
      entries (`server`: node environment, `fileParallelism: false` per the Hazards section — the
      route handlers' `prisma.$transaction` usage rules out the usual per-test-transaction-rollback
      trick, so step 6's integration tests will TRUNCATE a shared test DB instead, which only stays
      correct with test files serialized; `web`: jsdom + a `setupFiles` entry installing
      `fake-indexeddb/auto`, since jsdom itself has no IndexedDB and `outbox.ts` has no in-memory
      fallback). One deliberately trivial test per project (`apps/server/src/scaffold.test.ts`,
      `apps/web/src/test/scaffold.test.ts`) — not a no-op assertion, but a real check that each
      project's environment/setup actually took effect (node has no `window`; jsdom has both
      `window` and `indexedDB`). `npm test`/`npm run test:watch` added at the root; per-workspace
      `npm run test -w @ubiquiti-todo/server`/`-w @ubiquiti-todo/web` also work (each workspace's
      `test` script points `--config`/`--project` back at the root config).
      **Two file-path pitfalls found and fixed while wiring this, not anticipated from the task's
      own sketch**: (1) a project's `test.root` inside `vitest.config.ts` resolves against the
      *process's* cwd, not the config file's own directory — so the natural-looking
      `root: './apps/server'` broke the moment the per-workspace scripts ran `vitest` from inside
      `apps/server` instead of the repo root. Fixed with an absolute path built from
      `fileURLToPath(new URL(relative, import.meta.url))`, cwd-independent either way. (2) test
      files matched `apps/server/tsconfig.json`'s `include: ["src"]`, so `tsc -p tsconfig.json`
      (the **build** script — real emit, unlike the noEmit typecheck script) was compiling
      `scaffold.test.ts` straight into `dist/`, alongside the code Render actually runs. New
      [apps/server/tsconfig.build.json](apps/server/tsconfig.build.json) (extends the base config,
      adds `exclude: ["src/**/*.test.ts"]`) is now what `build` points at; `typecheck` still uses
      the unmodified `tsconfig.json`, so test files stay type-checked, just not shipped — the
      "Lint and typecheck pass over the test files themselves" done-when item and "no test code in
      the production bundle" both hold at once.
      **Test file convention decided and recorded** (the task's own ask): `*.test.ts`/`*.test.tsx`
      next to the source file it covers — already Biome's `includes`/both `tsconfig`s' `include`
      scope, so no config change was needed there beyond the build-vs-typecheck split above.
      **CI**: added a `Test` step (`npm test`) to
      [.github/workflows/ci.yml](.github/workflows/ci.yml), between build-shared and typecheck —
      no Postgres service container yet, deliberately, per the step's own note that it arrives
      with step 6.
      **Also added `"type": "module"` to the root [package.json](package.json)**: without it,
      loading `vitest.config.ts` (ESM syntax, no matching root package type) printed a real,
      if non-fatal, "unsupported by configLoader: 'native'" warning on every run; every other
      `package.json` in the repo already declares this, and the root had no plain `.js` files for
      it to change the interpretation of.
      **Verified**: `npm test` green at the root and via both per-workspace scripts; full
      `typecheck`/`build`/`lint`/`format:check` all clean, and `dist/` confirmed to contain no
      `.test.*` files after a build. Re-ran this repo's existing clean-room check (tasks/12) —
      copied the exact tracked-plus-new-untracked file set (`git ls-files --cached --others
      --exclude-standard`, since the new files aren't committed yet) into a scratch directory,
      `npm ci`, then the literal CI step sequence (build shared → test → typecheck → lint →
      format:check) — all green from a fresh install, not just in this already-`npm install`ed
      working tree.

- [x] Testing, step 4/8 — pure unit tests, no mocks/DB/DOM —
      [tasks/23-testing.md](tasks/23-testing.md#step-4--pure-unit-tests). 34 assertions across the
      four modules named in the task, all against real dependencies (the actual
      `@dnd-kit/sortable`/`fractional-indexing` libraries, not reimplementations of them).
      **[position.test.ts](apps/web/src/lib/position.test.ts)** — `computeReorderPosition`'s five
      siblings are built with real `generateNKeysBetween` output, not hand-typed strings, and every
      expected result is computed with `generateKeyBetween` in the test itself rather than a
      hard-coded literal, so the assertions describe the *relationship* being tested, not a magic
      value. Move down/up (and the comment spelling out why they're not mirror images — arrayMove
      removes before inserting, so the neighbor pair differs depending on direction), top/bottom
      insertion, a single-item list, drop-on-self (pinned as *not* a no-op — it generates a new key
      between the same neighbors rather than returning the existing one), and the unknown-`activeId`
      case.
      **The unknown-`activeId` case took two tries to get right**: the first attempt assumed it was
      equivalent to explicitly moving the actual last sibling (matching the task's own framing of
      "silently relocates the wrong sibling"), and that assumption was wrong — traced by literally
      instrumenting the function with `console.log` outside the test suite before writing the
      assertion. `findIndex` returns -1 *twice* here, not once: once for `oldIndex` (arrayMove's
      documented behavior of removing the last element) and again for the *second* lookup
      (`newIndex`, against the already-reordered array, where the unknown id still isn't found
      either) — so `prev` is always out-of-bounds (`undefined`) and `next` is always the reordered
      array's first element, independent of which sibling `overId` named. Pinned against a
      hand-computed `arrayMove` call in the test rather than a restated assumption, after
      confirming the real value with the instrumented run.
      `comparePosition` — plain byte order, plus a direct proof it disagrees with `localeCompare`
      on the exact mixed-case pairs noted in PROGRESS.md's tasks/18 entry (asserted against the
      *sign* of `localeCompare`'s own result, not a hard-coded expectation, so the test documents
      the disagreement rather than assuming it).
      **[cost.test.ts](apps/web/src/lib/cost.test.ts)** — `parseCostInput`'s `null` (cleared) vs.
      `undefined` (unusable) distinction, symbol/comma/whitespace stripping, rounding (the
      `4.999` → `500` example from the cost-tracking task), and the `COST_CENTS_MAX` boundary
      computed from the real exported constant (exact accept at the max, refuse one cent over —
      float precision checked directly rather than assumed, since `(COST_CENTS_MAX/100).toFixed(2)`
      round-tripping exactly back to the integer was worth confirming, not assuming). `Todo`/
      `SubTask` fixtures satisfy the real shared zod-inferred types, not loosely-typed stand-ins.
      `subtaskSubtotalCents`/`listTotalCents` — null costs skipped, a todo's own cost and its
      subtasks' costs both counted and not double-counted (the tasks/01 rollup decision).
      **[conflict.test.ts](apps/server/src/conflict.test.ts)** — `base: undefined` → false, a
      disagreeing field → true, and the regression assertion this function exists for: a
      concurrent edit to a *different* field than the one in `base` → false (the false-positive the
      old row-`version` check used to produce). Also empty `base` and multi-field `base` with one
      mismatch.
      **[presence.test.ts](apps/server/src/presence.test.ts)** — two sockets for one member (leave
      one, member stays present until the last socket goes; verified via both `getMembers` and
      `getSocketIds`), re-joining an already-joined socket (no duplicate/orphan) and re-joining
      under a *different* list (moves the socket rather than leaving it present on both — not in
      the task's bullet list verbatim but the same `join`-calls-`leave`-first mechanism, and a real
      gap if `leave`'s no-op case relies on it), `leave` on an unknown socket (`undefined`, no
      state change), and `getSocketIds`/`getMembers` isolation across multiple members and lists.
      **Verified**: `npm test` — 34/34 across 6 files (2 scaffolding placeholders from step 3 plus
      these 4). Full `typecheck`/`lint`/`format:check`/`build` clean; confirmed `dist/` still has
      no `.test.*` output (tsconfig.build.json from step 3 still doing its job).

- [x] Testing, step 5/8 — outbox tests, the task's own "highest-value step" —
      [tasks/23-testing.md](tasks/23-testing.md#step-5--outbox-tests). 16 new tests across
      [outbox.test.ts](apps/web/src/lib/outbox.test.ts) (queue atomicity) and
      [outboxSync.test.ts](apps/web/src/lib/outboxSync.test.ts) (the flush/retry/poll policy) —
      every bullet in the step's checklist, covering the exact defects
      [tasks/03](tasks/03-outbox-reliability.md) and [tasks/05](tasks/05-cache-reconciliation.md)
      fixed.
      **Harness**: `vi.mock('./api', importOriginal)` keeps the real `HttpError` class (the retry
      policy branches on `instanceof HttpError`/`.status`) while stubbing `sendOp`, per the
      Tooling table. Module-level state in `outboxSync.ts` (the `states` Map) and
      `connectionStatus.ts` (`status`, its `window` listeners) is reset between tests with
      `vi.resetModules()` + dynamic `import()`, per the Hazards section — not a test-only reset
      hook added to production code.
      **A real gap in the Tooling table's own plan, found and worked around**: `fake-indexeddb`
      schedules every IndexedDB request callback via the *real* `setImmediate`, not
      `setTimeout`/`queueMicrotask` — confirmed by reading
      `node_modules/fake-indexeddb/build/esm/lib/scheduling.js` directly rather than assumed.
      Faking every timer (`vi.useFakeTimers()` with no options, as the Tooling table's one-line
      mention implies) would freeze IndexedDB itself, since `idb-keyval`'s operations depend on it
      — every `getQueue`/`enqueue`/`dequeue` call would simply hang. Fixed by faking only
      `setTimeout`/`clearTimeout`/`setInterval`/`clearInterval` (what `outboxSync.ts` actually
      uses for its own backoff/poll timers) and leaving `setImmediate` real, then flushing pending
      real macrotasks with a small helper between assertions. This is the load-bearing discovery
      of this step — without it, the harness described in tasks/23 doesn't actually run.
      **A backoff-precision test that initially passed the wrong way**: the first draft of "backs
      off with a doubling delay" split each round into a "just under the expected delay" advance
      and a separate "+1ms" advance (to also prove it doesn't fire early), and failed with one
      extra call partway through. Root cause, found by instrumenting both the failing test and a
      working one side by side rather than guessing: `outboxSync.ts`'s 15s poll interval and its
      backoff retry timer share the same `isFlushing` guard, so when both come due within one
      `vi.advanceTimersByTimeAsync()` call, the guard correctly collapses them to a single
      attempt — but splitting the advance into several smaller awaited calls (each separated by a
      real macrotask flush) gives the poll's due moment its own independent turn *after* the
      preceding attempt has already finished and reset the guard, producing a genuine extra
      attempt. Real, correct interaction between the two timers, not a test bug — fixed by
      advancing by each full expected delay in one call per round (matching the pattern that
      already worked in the MAX_FLUSH_ATTEMPTS test) and dropping the "not a moment before" half
      of the check, with a comment recording why.
      **Coverage**: FIFO ordering with each op awaited before the next (proven by holding the
      first mocked response open and asserting the second is never sent early, not just asserting
      final order); success → dequeue + `connectionStatus.markOnline()`; 404 → dequeue + notice +
      continues past it; any other 4xx → dequeue + discarded notice + continues past it; a
      network/5xx failure leaves the *whole* queue untouched behind the head op and schedules
      exactly one retry timer (`vi.getTimerCount()`); the full 2s→4s→8s→16s→30s→30s backoff
      schedule; the 10th failed attempt (not before) drops the op; the `isFlushing` guard against
      two overlapping triggers double-sending the head op; `hadConflict` aggregated to one notice
      per flush across two ops, not two; `reconcile: true` invalidating on a genuinely empty queue
      (first confirmed a *non*-reconcile mount-time flush does *not* invalidate on empty, so the
      assertion isolates what `reconcile` specifically contributes); and ref-counted `start()`/
      `stop()` — two callers share one poll interval and one mount-time flush, stopping one leaves
      the other's callbacks live, and the last `stop()` clears every timer
      (`vi.getTimerCount() === 0`).
      **`outbox.ts` atomicity** (the direct regression test for tasks/03): concurrent `enqueue`
      calls for the same list both land (real `idb-keyval` `update()` transactions, not a mocked
      store, so this actually exercises the fix); an `enqueue` racing a `dequeue` loses neither;
      `recordAttempt` increments and returns `0` for an already-dequeued op; queues for different
      `listId`s never interleave.
      **Verified**: `npm test` — 50/50 across 8 files in ~1s. Full
      `typecheck`/`lint`/`format:check`/`build` clean (one small fix needed: `apps/web`'s tsconfig
      has no Node types, being a browser app, so the test file's use of the real `setImmediate`
      needed a narrow local `declare const setImmediate` rather than pulling in all of
      `@types/node`'s globals for one function). Re-ran the full `outboxSync.test.ts`/
      `outbox.test.ts` pair 5× in a row to check for flakiness given how timer-sensitive this
      harness is — stable every time.

- [x] Testing, step 6/8 — server integration tests, against a real Postgres —
      [tasks/23-testing.md](tasks/23-testing.md#step-6--server-integration-tests). 39 new tests
      across [lists.test.ts](apps/server/src/routes/lists.test.ts),
      [todos.test.ts](apps/server/src/routes/todos.test.ts),
      [subtasks.test.ts](apps/server/src/routes/subtasks.test.ts), and
      [errorShape.test.ts](apps/server/src/errorShape.test.ts) — every bullet in the step's
      checklist, built on step 2's `buildApp()`.
      **New `ubiquiti_todo_test` database**, same docker-compose Postgres, separate from the one
      `npm run dev` uses. `scripts/setup.sh` now creates + migrates it (idempotent, guarded with a
      `pg_database` existence check before `CREATE DATABASE`); `vitest.config.ts`'s `server`
      project injects its `DATABASE_URL` directly via `test.env`, so `prisma.ts`'s module-scope
      `new PrismaClient()` picks it up before any test file imports anything. Documented in a new
      README "Running tests" section, including the manual equivalent of what setup.sh does.
      **New [`test/harness.ts`](apps/server/src/test/harness.ts)**: `buildTestApp()` wraps
      `buildApp()` with a `vi.fn()`-based `SpyBroadcaster`; `truncateAll()` (`TRUNCATE ...
      RESTART IDENTITY CASCADE`, per the Hazards section — the routes' `prisma.$transaction` usage
      rules out the usual transaction-rollback isolation trick) runs in each file's `beforeEach`;
      `createList`/`createTodo`/`createSubTask` are thin `app.inject()` wrappers, dogfooding the
      real POST routes as fixtures rather than writing rows directly via Prisma. One `buildTestApp()`
      per test *file* (`beforeAll`), not per test — `broadcaster.broadcastToList.mockClear()` in
      `beforeEach` instead — since nothing about a stateless Fastify instance needs rebuilding
      per test, and building 40+ of them (helmet/rate-limit/zod-compiler setup each time) would
      have been pure overhead.
      **A quiet, unplanned side effect fixed while building the harness**: `buildApp()`'s
      `logger: true` writes real JSON log lines straight to stdout via pino, which bypasses
      Vitest's console interception entirely (pino doesn't go through `console.*`) — every one of
      dozens of integration tests would otherwise print a request/response log line regardless of
      pass/fail. Fixed by adding an optional `logger` parameter to `buildApp()`'s options
      (defaulting to `true`, so `index.ts`'s call is completely unaffected — zero behavior change
      for production), which the harness sets to `false`.
      **A real, reviewer-relevant gap found and fixed in the same pass**: `apps/server/tsconfig.build.json`
      (added in step 3 to keep `*.test.ts` files out of `dist/`) didn't catch `test/harness.ts` —
      a file that itself has no `.test.ts` suffix — so it was silently compiling straight into
      `dist/test/harness.js` alongside the code Render actually runs. Fixed by also excluding
      `src/test/**`, confirmed by deleting `dist` and rebuilding clean.
      **A flaky test found and fixed, not just noticed**: an offset-pagination test assumed
      three back-to-back `createList()` calls would land in creation order under
      `ORDER BY createdAt DESC`, but `createdAt` is millisecond-precision with no secondary sort
      key — a real, unindexed-tiebreak property of the endpoint itself, not a test bug — so three
      rapid creates can legitimately land in the same millisecond with Postgres free to return them
      in either order. Reproduced directly (1 failure in ~25 runs, exact mismatch confirmed via the
      diff) rather than assumed from reasoning alone, then fixed by deriving the "expected middle
      item" from the server's own reported order (an unpaginated fetch first) instead of assuming
      insertion order — self-consistent regardless of how ties resolve. Re-ran 20× clean afterward.
      **Coverage**: idempotent create — sequential and, the actual regression (tasks/19), truly
      *concurrent* duplicate POSTs for both todos and subtasks, each producing exactly one row;
      POST to a deleted/nonexistent parent 404s via the real P2003→404 path, not a 500. Conflict
      signaling — disagreeing/matching/different-field `base`, mirroring conflict.test.ts's unit
      coverage but through the real transaction. Route scoping — PATCH/DELETE with a mismatched
      `listId` 404 with the row provably unmutated and *nothing broadcast* (the actually-dangerous
      failure mode: a wrong-room broadcast leaves real viewers silently stale), for todos and,
      one level deeper, subtasks (both the right-todo-wrong-list and wrong-todo-entirely cases).
      Delete idempotency, distinct from the wrong-parent 404. Error shape — 400 (zod), 404, 413
      (a real >256KB body), and a 500 that doesn't leak the underlying message (via a throwaway
      route on a dedicated app instance, exercising the real registered handler's generic branch —
      no route in this app actually 500s under normal conditions, which says something good about
      the validation/P2025/P2003 coverage elsewhere, not something to route around). `GET
      /api/lists` pagination — `hasMore` at the exact boundary, non-numeric/out-of-range
      `limit`/`offset` 400ing.
      **Verified**: full server suite (53 tests: 13 from step 4's units plus the step 3 scaffold
      placeholder plus these 39) run 15×
      in a row clean after the flaky test fix — one genuine failure caught and fixed *before* that
      streak, not papered over. Full monorepo `npm test` (89 tests total), `typecheck`, `lint`,
      `format:check`, and `build` all clean, `dist/` confirmed free of anything under `src/test/`.
      Re-ran this repo's clean-room check against a **freshly dropped and recreated**
      `ubiquiti_todo_test` (not the already-migrated one every other check in this session reused)
      to prove the from-scratch migration path CI will actually exercise: fresh `npm ci`, build
      shared, typecheck, `prisma migrate deploy` against the empty database (all 4 migrations
      applied cleanly), test, lint, format:check — green end to end.
      **CI**: added a `postgres:17-alpine` service container to
      [.github/workflows/ci.yml](.github/workflows/ci.yml) (`POSTGRES_DB: ubiquiti_todo_test`
      creates the test database directly) plus a "Migrate test database" step
      (`prisma migrate deploy`) before the existing Test step. Same credentials as local dev
      throughout — a local-only, already-public dev password, not a secret, consistent with how
      `.env.example` already handles this.
      **Found in passing, not fixed here**: running the *existing* `db:migrate` script
      (`prisma migrate dev`) against the shared local dev database hit an interactive
      "migration was modified after it was applied, reset the schema?" prompt — unrelated to this
      session's changes (no migration file was touched), pre-existing, and orthogonal to this
      task's scope (the new test-database path uses `migrate deploy`, which has no such prompt, so
      nothing here depends on it). Confirmed the dev database's data was untouched (the prompt
      aborted with no TTY rather than proceeding) before moving on. Flagging for whoever picks this
      up next rather than touching the dev database further mid-testing-task.

- [x] Testing, step 7/8 — one real socket test —
      [tasks/23-testing.md](tasks/23-testing.md#step-7--one-real-socket-test). New
      [realtime.test.ts](apps/server/src/realtime.test.ts), deliberately the only test in the
      whole suite that binds a real port: `app.listen({ port: 0 })` for an OS-assigned ephemeral
      port (no fixed-port collision with the shared dev server or anything else running locally),
      a real `SocketIOServer` attached to `app.server`, and two real `socket.io-client`
      connections. Everything cheaper than this belongs in step 6's spy-broadcaster tests, which
      already prove each route *asks* for the right broadcast — this is the one proof that it's
      actually *delivered*.
      **The same app.server/io/broadcaster construction-order shim from
      [index.ts](apps/server/src/index.ts)** (step 2), copied into the test rather than imported,
      since it's test-harness wiring rather than something worth exposing from production code for
      one caller.
      **One assertion bug, caught by the assertion itself rather than a silent false pass**: the
      first draft waited for *any* `presence:update` on client A to prove "both members present
      after B joins," but A's own `list:join` already broadcasts presence (with just A) before B
      ever joins — the naive wait resolved on that first, wrong event and failed with a length-1
      array where 2 was expected. Fixed by making `waitForEvent` take a predicate (`members.length
      === 2` / `=== 1`) instead of matching the first occurrence of the event name, so both the
      "both present" and "back to one after B disconnects" waits pin the exact state being tested
      rather than a race against which presence update arrives first.
      **New devDependency**: `socket.io-client` added to `apps/server` (already a dependency of
      `apps/web`, same version pinned) — the server side never needed a client library before.
      **Verified**: proves real delivery + sender exclusion (A's own REST mutation, sent with A's
      `x-client-id`, reaches B but is confirmed absent from A after a real wait, not just
      "eventually consistent") and both presence transitions (member list grows to 2 when B joins,
      shrinks back to 1 when B disconnects). Re-ran 15× in a row with no failures — the one thing
      this step's own framing calls out as the flakiest test in the suite, so this got real
      repetition, not a single lucky pass. Full server suite (54 tests) still completes in ~2s with
      this test included, and exits cleanly with no lingering handles (confirmed via `time` — the
      process returns control immediately, no forced-exit needed). Full monorepo `npm test` (90
      tests), `typecheck`, `lint`, `format:check`, `build` all clean; `dist/` still free of test
      code.

- [x] Testing, step 8/8 — frontend hook and component tests, **completing tasks/23-testing.md** —
      [tasks/23-testing.md](tasks/23-testing.md#step-8--frontend-hook-and-component-tests). 27
      new tests: [useList.test.tsx](apps/web/src/hooks/useList.test.tsx) (5),
      [TodoDescription.test.tsx](apps/web/src/components/TodoDescription.test.tsx) (8),
      [TodoItem.test.tsx](apps/web/src/components/TodoItem.test.tsx) (5),
      [CostInput.test.tsx](apps/web/src/components/CostInput.test.tsx) (6), and
      [SubtaskProgress.test.tsx](apps/web/src/components/SubtaskProgress.test.tsx) (3).
      **New devDependencies**: `@testing-library/react`, `@testing-library/user-event`, and
      `@testing-library/jest-dom` (the last isn't named in tasks/23's Tooling table, only implied
      by "@testing-library/react" — without its `.toBeInTheDocument()`/`.toHaveValue()` matchers,
      every assertion would fall back to raw `.textContent`/`.value` reads). Wired into
      [test/setup.ts](apps/web/src/test/setup.ts) alongside a global `afterEach(cleanup)` — needed
      because `@testing-library/react`'s own auto-cleanup only self-registers against a *global*
      `afterEach`, and this project imports `afterEach` per file (no `test.globals: true`), so
      nothing would otherwise unmount a rendered component between tests.
      **A real isolation conflict with the Hazards section's own pattern, reasoned through rather
      than copied blindly**: `outboxSync.test.ts` (step 5) resets module state with
      `vi.resetModules()` + dynamic `import()` per test. Doing the same here would also tear down
      React's own module instance — imported statically, the same instance
      `@testing-library/react`'s `renderHook`/`render` use — breaking hooks entirely. Used instead:
      a fresh `QueryClient` and a fresh random `listId` per test (so outbox/IndexedDB state, keyed
      by listId, never collides across tests), plus an explicit `connectionStatus.markOnline()`
      reset in `beforeEach` — the only piece of cross-test module state `useList`'s own code path
      actually touches. `../lib/outboxSync` itself is mocked to a no-op `start`, so these tests
      exercise only `useList`'s foreground `mutateWithOutbox` path (the background flush/poll loop
      is already exhaustively covered by step 5) without a concurrent background flush racing the
      same mocked `sendOp`.
      **`useList` coverage**: a toggle updates the query cache before `sendOp`'s promise resolves
      (held open deliberately), then reconciles to the server's exact response once it does —
      checked against a `version` value only the server would set, plus a full subscription-history
      recording proving `done` never reverts to `false` in between, not just that the final state
      is eventually correct. A 404 drops the queued op (`getQueue` empty) and triggers a real
      refetch (`api.getList` called a second time). A network error (a plain `TypeError`, not an
      `HttpError`) leaves the op queued rather than dropped. `deleteList`/`updateListTitle` while
      offline both fail fast with their respective notices and never call the underlying `api.*`
      method — the exact tasks/06 behavior (pause-invisibly was the bug fixed there).
      **`TodoDescription` coverage**, including the one behavior this task calls out by name: an
      incoming prop update (simulating a realtime broadcast landing in the cache) while the
      textarea is open leaves the open draft untouched, and a *second* test confirms re-entering
      edit mode afterward picks up the latest prop value rather than a stale one — both halves of
      "don't clobber, but don't go stale either" from specs/09.
      **`TodoItem` coverage** ("lighter touch," per the task): rendered through the real
      `ListProvider` (not a mocked context — `ListContext`'s underlying context object isn't
      exported, and changing that to ease testing was out of this step's scope) wrapped in a
      minimal `DndContext`/`SortableContext` (`useSortable` requires one). Renders title/checkbox
      state correctly for both done/not-done; a real click on the checkbox sends the exact PATCH
      body through the full `ListProvider -> useList -> mutateWithOutbox -> sendOp` chain; the
      checkbox's accessible name (tasks/16) and `SubtaskProgress`'s presence/subtotal-hiding
      wiring both render correctly in context.
      **`CostInput`/`SubtaskProgress`**: blur commits a parsed value, invalid input reverts
      silently with no `onSave` call, `COST_CENTS_MAX` refused (computed from the real exported
      constant, not hard-coded), Escape discards, an unchanged value doesn't call `onSave`; done/
      total counts and the zero-subtasks `null` render.
      **Playwright stretch (specs/11) not attempted** — explicitly "cut first if time is short" in
      both specs/11 and this task's own step 8 framing, and every one of step 8's actual "Done
      when" items is satisfied without it.
      **Verified**: full web suite (63 tests) run 10× in a row clean. Full monorepo `npm test` —
      **117 tests across 18 files, 0 failures** — plus `typecheck`, `lint`, `format:check`, and
      `build` all clean; `dist/` (both workspaces) confirmed free of test code.
      **tasks/23-testing.md is now fully done — all 8 steps landed, one PR each, as the task's own
      "do not batch them" instruction asked for.** `CI green on a pushed branch` (the task's whole-
      task verification bullet) is the one thing not literally confirmed from here: the workflow is
      correctly configured and its Postgres-migration step was verified locally end-to-end against
      a freshly created database (step 6), but this session hasn't pushed to the remote, so an
      actual GitHub Actions run is still unobserved.

## Next up

**The backlog now lives in [tasks/](tasks/) — read [tasks/README.md](tasks/README.md) for the
ordered list.** Each task file is self-contained (context, file:line references, concrete steps,
verification), sized to one reviewable diff, so a fresh session can pick one up cold.

It came out of a full staff-level code review on 2026-09-12 covering all three workspaces. Summary
of what it found:

- **Two user stories from [README.md](README.md) are unimplemented**: cost/price tracking
  (`costCents` exists in the schema, shared zod schemas, serializers and API — with zero UI) and
  subtask progress. Both are UI-only work on a finished backend. `tasks/01`, `tasks/02`.
- **Four real defects in the sync/offline layer**: non-atomic IndexedDB read-modify-write in the
  outbox (loses ops on concurrent offline writes), a non-404 error permanently head-of-line-blocking
  the FIFO queue, unguarded concurrent flushes with stacking retry timers, and `invalidateQueries`
  on every mutation without `cancelQueries` (optimistic state can be clobbered by an in-flight
  refetch). `tasks/03`, `tasks/05`.
- **Server**: todo/subtask PATCH/DELETE resolve rows by their own id and ignore the parent id in the
  URL path, so a mismatched `listId` mutates the row but broadcasts to the wrong room; and the
  version/conflict check is a TOCTOU across two queries. `tasks/04`.
- **The offline story is half-built**: writes are durable, reads aren't. No service worker and no
  query persistence, so a reload while offline loses the app entirely even though the outbox
  survives in IndexedDB. `tasks/13` — the largest single gap against the brief.
- **Structure**: `useList.ts` is 407 lines doing five jobs; `ListPage` drills 11 props into
  `TodoList` and 10 into `TodoItem`. `tasks/07`, `tasks/08`.
- **No linter or formatter anywhere in the repo**, and no `typecheck` script. `tasks/12`.
- Plus dead code, production hardening, indexes and accessibility — `tasks/09`–`tasks/16`.

A second pass on 2026-09-14 reviewed the *architecture* rather than the code (`tasks/17`–`tasks/22`).
Its conclusion was that the design is sound and worth keeping — single origin serving API + WS +
static, `packages/shared` as the hand-written wire contract, REST for writes with WS for fanout,
client-generated ids, server-authoritative outbox over a CRDT. Three findings were fixed immediately
(see the top of Completed). The rest were recorded as tasks 17-22; 17, 18, 19, and 21 have since
landed (see Completed above) — `tasks/20` (service layer) and `tasks/22` (Redis adapter) are the
only ones remaining, and both are **parked**, not scheduled: both are correct-at-larger-scale and
wrong-at-this-scale; each file lists what would un-park it.

Deferred deliberately (see [tasks/DEFERRED.md](tasks/DEFERRED.md)):
- [x] Testing — un-parked and completed 2026-09-15, all 8 steps of
      [tasks/23-testing.md](tasks/23-testing.md) landed (one PR each, per that task's own
      instruction not to batch them); see the Completed entries above, one per step.
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
- Cost rollup semantics ([tasks/01-cost-tracking-ui.md](tasks/01-cost-tracking-ui.md)): a todo's own
  cost and its subtasks' costs are shown separately — the todo's own `CostInput` plus a
  "Subtotal: $X" line under its subtasks (rendered only when that subtotal is non-zero, so a todo
  whose subtasks are all unpriced doesn't carry a permanent "$0.00" — same hide-at-zero rule as the
  header total below) — rather than summing
  subtask costs into the parent's total. Summing silently would hide the subtasks' contribution
  whenever the parent also carries its own cost. The list header shows one grand total (every
  todo's own cost plus every subtask's, across the list), hidden when zero to match the app's
  existing pattern for optional affordances (presence avatars, the Offline pill).
- Flush-time conflict signal ([tasks/05-cache-reconciliation.md](tasks/05-cache-reconciliation.md)):
  `flushOutbox` used to ignore `sendOp`'s response entirely, so a queued PATCH replayed on
  reconnect that came back `hadConflict: true` never told the user — an offline stretch could
  silently clobber a collaborator's edit with no signal at all. Chose to surface it (a single
  aggregated "Some changes were also edited elsewhere" toast per flush, not one per op) rather than
  document the silence as acceptable — an extra toast after reconnecting seemed like the smaller
  cost next to a silently lost edit.

- Query persistence storage ([tasks/13-offline-app-shell.md](tasks/13-offline-app-shell.md)):
  `localStorage` over IndexedDB for the persisted TanStack Query cache — list/todo JSON is well
  within its ~5MB limit for a demo app, and it needs no extra glue code. IndexedDB (already used
  for the outbox queue) would only earn its added complexity at a data size this app doesn't reach.
  Either was defensible per the task's own framing; this is the one with less code for the win it
  needed to deliver. Wired via `createAsyncStoragePersister` (`@tanstack/query-async-storage-
  persister`) rather than the sync-specific package/function, which is deprecated upstream in
  favor of this one — same `localStorage` underneath either way, since the "async" in the name
  describes the persister's uniform interface, not a requirement on the storage it wraps.

- Reordering: client-computed position, not server-resolved intent
  ([tasks/17-record-reordering-decision.md](tasks/17-record-reordering-decision.md)). Drag-and-drop
  sends a computed value (`PATCH { position: 1.5 }`), not an intent (`PATCH { after: todoId }`) for
  the server to resolve. Evaluated, not defaulted into: intent-based reordering degrades badly
  under this app's offline-replay requirement — `{ after: Y }` replayed after `Y` was deleted
  during the offline window is ambiguous and forces the server to invent a fallback that's
  sometimes wrong, while `{ position: 1.5 }` always means something even if neighbors moved,
  degrading gracefully to "roughly where the user dropped it." **Accepted cost**: two clients
  dragging concurrently each compute against their own possibly-stale sibling view, so under
  whole-record LWW the winning value can land the item somewhere neither user intended — a real,
  demoable failure mode in exactly the two-user scenario this app gets shown in. The offline
  requirement makes this the better trade anyway, not the lazy one. See
  [specs/08-drag-and-drop.md](specs/08-drag-and-drop.md#decision-client-computes-the-position-not-just-the-drag).

## Open questions

- (none currently)
