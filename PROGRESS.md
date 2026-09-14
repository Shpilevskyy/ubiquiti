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
(see the top of Completed). The rest are recorded as tasks, of which two are documentation-only and
two are deliberately parked with trigger conditions:
- `tasks/17`, `tasks/21` — record the reasoning behind two decisions that currently read as
  defaults: drag positions computed client-side (value) rather than server-side (intent), and
  Socket.IO rather than SSE. Both ~10 minutes, no code.
- `tasks/18` — string fractional indexing instead of `position: Float`, which removes the
  float-precision collision specs/08 defers a fallback for rather than building that fallback.
- `tasks/19` — transaction boundaries; also collapses the three-query create into one `upsert`.
- `tasks/20` (service layer) and `tasks/22` (Redis adapter) — **parked**, not scheduled. Both are
  correct-at-larger-scale and wrong-at-this-scale; each file lists what would un-park it.

Deferred deliberately (see [tasks/DEFERRED.md](tasks/DEFERRED.md)):
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
- Cost rollup semantics ([tasks/01-cost-tracking-ui.md](tasks/01-cost-tracking-ui.md)): a todo's own
  cost and its subtasks' costs are shown separately — the todo's own `CostInput` plus a
  "Subtotal: $X" line under its subtasks (only rendered when it has any) — rather than summing
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

## Open questions

- (none currently)
