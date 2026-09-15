# 23 — Testing: tooling, harnesses, and the suites worth writing

**Status:** not started — see the per-step Status lines under [Steps](#steps)
**Size:** L overall — **deliberately split into 8 independently reviewable steps**, one per
session/PR. Do not batch them.
**Depends on:** —
**Source:** Un-parks the testing work deferred on 2026-09-12 ([DEFERRED.md](DEFERRED.md)),
planned 2026-09-15 after a read of the current code.

## Why

[../specs/11-testing-strategy.md](../specs/11-testing-strategy.md) is written and detailed, but
**zero tests exist** — no runner, no config, no test file anywhere in the repo. This task is the
executable version of that spec, adjusted for the code as it actually stands today.

Two things changed since specs/11 was written, and both matter before anyone starts:

1. **Parts of specs/11 are now stale.** It was written before tasks/17–19 landed and describes an
   app that no longer exists (float positions with an epsilon re-index, components that were never
   built). Step 1 fixes the spec first, so every later session reads accurate guidance.
2. **The server cannot currently be tested at all.**
   [../apps/server/src/index.ts](../apps/server/src/index.ts) builds the app *and* calls
   `await app.listen()` at module scope, plus registers `SIGTERM`/`SIGINT` handlers. Importing it
   from a test starts a real server on port 3001. Step 2 is the refactor that unblocks everything
   server-side.

## How to work this

Same rules as every other task in this directory, with one addition:

- **One step per session, one step per PR.** Each step below is self-contained: read this file's
  shared sections (Tooling, Hazards, Scope discipline), then your step, then do the work.
- **Update that step's `Status:` line** when you finish, and add a PROGRESS.md Completed entry the
  way existing entries are written.
- **Steps 1 and 2 are prerequisites.** Steps 4–8 can otherwise be reordered or dropped without
  breaking each other — value starts arriving at step 4 even if the sequence gets cut short.
- Never commit without the developer reviewing the diff first.

## Tooling

Decided once here so no step has to re-litigate it.

| Layer | Tool | Why this one |
|---|---|---|
| Runner (both workspaces) | **Vitest** | Web is already Vite, so it shares the transform pipeline; server is ESM + TS (`"type": "module"`, `tsx`) and Vitest runs that with no build step. One root config using `projects` for `server` / `web`. |
| Server HTTP | **`app.inject()`** — *not* Supertest | Fastify ships it; no socket binding, no port, faster. specs/11 calls for Supertest; it isn't needed. |
| Server DB | **Real Postgres** (`ubiquiti_todo_test`, same docker-compose service) | Per specs/11 — the interesting bugs here (the P2002 create race, the `$transaction` conflict check, FK→404 mapping) are exactly what an ORM mock would hide. |
| Server broadcasts | **Spy broadcaster object**, plus *one* real `socket.io-client` test | See [Step 2](#step-2--extract-buildapp-from-indexts). Cheap per-route assertions via a spy; one real test for the actual wiring. |
| Web DOM | **`@testing-library/react` + `jsdom`**, `@testing-library/user-event` | Standard. |
| Web IndexedDB | **`fake-indexeddb`** | `idb-keyval` runs against it unmodified, so `outbox.ts`'s real atomicity (its `update()` transaction) is what gets tested. |
| Web network | **`vi.mock('../lib/api', importOriginal)`** | The retry policy is entirely "what status did `sendOp` throw." `importOriginal` keeps the real `HttpError` class while stubbing `sendOp`. |
| Timers | **`vi.useFakeTimers()`** | `outboxSync.ts` has 2s→30s backoff and a 15s poll. Non-negotiable for step 5. |
| E2E (stretch) | **Playwright** | Two browser contexts for realtime; `context.setOffline(true)` for the offline flow. Step 8, cut first if time is short. |

**Deliberately not used:**

- **MSW** — it would add a dependency to simulate what is literally `throw new HttpError(404)`.
  Everything already funnels through the `lib/api.ts` seam, which is the boundary specs/11 itself
  names. Revisit only if a later test needs real `fetch` semantics.
- **`node:test`** — Node 22 ships it, but Vitest is what gives the web suite jsdom and the shared
  Vite config for free. Not worth two runners.
- **A DI container / service layer.** [20](20-service-layer.md) stays **parked**. `prisma` remains
  the module singleton; test isolation comes from pointing `DATABASE_URL` at a test database, not
  from injecting a repository.

## Scope discipline — what NOT to test

Worth stating explicitly, because coverage numbers tempt the opposite. specs/11's own framing
("cover the logic that's actually easy to get subtly wrong, not exhaustive CRUD coverage") governs.

- **`fractional-indexing`** — third party. Test *our* neighbor selection in `computeReorderPosition`,
  not their key generation.
- **Prisma and zod themselves.**
- **[../apps/server/src/serializers.ts](../apps/server/src/serializers.ts)** — mechanical field
  mapping; `typecheck` already covers it. It gets exercised incidentally by the integration tests.
- **Snapshot tests of Tailwind markup** — pure churn, no signal.
- **Getters/passthroughs** generally. If a test can only fail when the line is deleted, skip it.

## Hazards to handle up front

Both of these will cause confusing, order-dependent failures if they're discovered mid-suite
instead of designed around.

**1. Module-global state on the web side.** `connectionStatus` computes its initial status at import
time from `navigator.onLine` *and* attaches `window` listeners as a side effect;
[../apps/web/src/lib/outboxSync.ts](../apps/web/src/lib/outboxSync.ts) holds a module-level `states`
Map. Tests will leak into each other unless each resets. Use **`vi.resetModules()` + dynamic
`import()`** per test — do **not** add test-only reset hooks to production code.

**2. Test-DB isolation.** The routes already use `prisma.$transaction` internally, so the usual
"wrap each test in a transaction and roll it back" trick does not work here. Use
**`TRUNCATE ... RESTART IDENTITY CASCADE`** in `beforeEach`, and set **`fileParallelism: false`**
for the server project so parallel files don't share one database and interfere.

---

## Steps

### Step 1 — Correct specs/11 and DEFERRED.md

**Status:** done (2026-09-15) · **Size:** XS — docs only, no code

Do this first so no later session builds against a stale spec. In
[../specs/11-testing-strategy.md](../specs/11-testing-strategy.md):

- **Supertest → `app.inject()`.** (DEFERRED.md already records this conclusion; fold it into the
  spec itself.)
- **Backend item 1 is obsolete.** "Position/reordering math — midpoint calculation, the
  epsilon-triggered re-index fallback" describes the float scheme that
  [18](18-fractional-string-indexing.md) replaced with string fractional indexing. There is no
  midpoint and no epsilon any more. Replace with the neighbor-selection cases in
  [Step 4](#step-4--pure-unit-tests). DEFERRED.md's "the documented float-precision limitation" is
  stale for the same reason — fix it there too.
- **`lib/socket.ts` does not exist** — the client socket lives in
  [../apps/web/src/hooks/useListSocket.ts](../apps/web/src/hooks/useListSocket.ts). Fix the stated
  mocking boundary.
- **`AddTodoForm` does not exist** — the add-todo form is inline at
  [../apps/web/src/pages/ListPage.tsx:139](../apps/web/src/pages/ListPage.tsx). **`DescriptionEditor`
  does not exist** — it is
  [../apps/web/src/components/TodoDescription.tsx](../apps/web/src/components/TodoDescription.tsx).
- **Record the broadcast-testing change** from Step 2 (spy broadcaster for per-route assertions;
  one real `socket.io-client` test for the wiring) rather than `socket.io-client` for all of it.

**Done when:**
- [x] specs/11 describes the app as it exists on 2026-09-15
- [x] DEFERRED.md's testing section points at this task and drops the float-precision line
- [x] No code changed

---

### Step 2 — Extract `buildApp()` from `index.ts`

**Status:** done (2026-09-15) · **Size:** S — refactor only, **zero tests, zero behavior change**

The prerequisite for everything server-side. Landing it separately from any test file is the point:
per [../CLAUDE.md](../CLAUDE.md), a known-needed refactor goes in as its own small step rather than
bundled into the PR that needs it.

Extract an `apps/server/src/app.ts` exporting:

```ts
export function buildApp(options: { broadcaster: SocketBroadcaster; isProduction: boolean }): FastifyInstance
```

containing everything from the current `Fastify({...})` construction through the route/static
registration — error handling, helmet, rate limit, zod compilers, the `clientId` `onRequest` hook,
`/healthz`, and the three route plugins.

[../apps/server/src/index.ts](../apps/server/src/index.ts) keeps: creating the `SocketIOServer`
against `app.server`, calling `registerSocketHandlers`, `app.listen()`, and the whole SIGTERM
shutdown block.

**The one design point:** the broadcaster becomes a parameter rather than being constructed inline.
That is what lets route tests assert *"this PATCH broadcast `TODO_UPDATED` to `list:<id>` excluding
`<clientId>`"* against a spy object — no sockets, no ports, on every route. Note the ordering
constraint already documented in `index.ts`: `registerErrorHandling` must run before any route is
registered, because Fastify bakes the current handlers into each route's context at registration
time.

Watch for: `app.server` does not exist until the Fastify instance is built, and the io server needs
it — so `buildApp()` cannot itself create the io server without inverting that. Taking the
broadcaster as a parameter sidesteps it cleanly.

**Verification:** `npm run build`, `npm run typecheck`, `npm run lint` all pass; `npm run dev` still
serves the API, the UI, and realtime; SIGTERM still shuts down gracefully.

**Done when:**
- [x] `buildApp()` is importable with no side effects — no `listen`, no signal handlers
- [x] `index.ts` is the thin entry point: io server, listen, shutdown
- [x] Broadcaster is injected, not constructed inside `buildApp()`
- [x] No behavior change — this PR adds no tests

---

### Step 3 — Vitest scaffolding and the CI test step

**Status:** done (2026-09-15) · **Size:** S

Infrastructure only, with just enough of a test to prove the wiring works end to end.

- Root Vitest config with two **projects**: `server` (node environment, `fileParallelism: false`)
  and `web` (jsdom, setup file installing `fake-indexeddb/auto`).
- `npm test` and `npm run test:watch` at the root; per-workspace invocation should also work.
- One trivial passing test per project — the point is a green run, not coverage.
- **Add the test step to [../.github/workflows](../.github/workflows)'s existing CI job**, which
  today runs install → build shared → typecheck → lint → format check. DEFERRED.md already notes
  this is a one-line change once tests exist. The Postgres service container is *not* needed yet —
  it arrives with [Step 6](#step-6--server-integration-tests). Keep this PR's CI change to
  running the unit suites.
- Decide and document where test files live (`*.test.ts` next to source is the lower-friction
  convention for this repo) and make sure Biome's `includes` and the `tsconfig`s cover them.

**Done when:**
- [x] `npm test` runs both projects green from a clean checkout
- [x] CI runs the suite on push and PR
- [x] Lint and typecheck pass over the test files themselves

---

### Step 4 — Pure unit tests

**Status:** done (2026-09-15) · **Size:** S — no mocks, no DB, no DOM

The cheapest real signal in the repo. All four targets are pure functions or plain classes.

**[../apps/web/src/lib/position.ts](../apps/web/src/lib/position.ts) — `computeReorderPosition`**
- Move down, move up (the two are asymmetric — `arrayMove` removes before inserting, so indices
  shift differently in each direction). This asymmetry is the whole reason the function computes
  against the *reordered* array rather than the original.
- Move to the top (`prev` is `undefined` → `null` passed to the generator), move to the bottom
  (`next` likewise), single-item list, and drop-on-self (`activeId === overId`).
- **Unknown `activeId`:** `findIndex` returns `-1`, and `arrayMove`'s internal
  `newArray.splice(from, 1)` with `from === -1` removes the **last** element — so a stale id
  silently relocates the wrong sibling rather than throwing. Verified against the installed
  `@dnd-kit/sortable`. Probably unreachable today (dnd-kit only supplies ids from the rendered
  list), but pin the current behavior with a test so it is a decision rather than an accident.

**`comparePosition`** — byte ordering, and specifically that it does **not** behave like
`localeCompare` on mixed-case pairs, since it has to agree with the column's `COLLATE "C"`
([18](18-fractional-string-indexing.md)). Reuse the mixed-case pairs already noted in PROGRESS.md.

**[../apps/web/src/lib/cost.ts](../apps/web/src/lib/cost.ts) — `parseCostInput`**
- `''` → `null` (intentionally cleared) vs. non-numeric → `undefined` (never sent). These two
  return values mean different things and are easy to collapse by accident.
- `$`/comma/whitespace stripping; rounding to an integer number of cents (the schema 400s on a
  float); negative and multi-decimal input rejected; `COST_CENTS_MAX` refused client-side.
- `subtaskSubtotalCents` / `listTotalCents` — `null` costs skipped, parent cost and subtask costs
  both counted and not double-counted (the [01](01-cost-tracking-ui.md) rollup decision).

**[../apps/server/src/conflict.ts](../apps/server/src/conflict.ts) — `detectConflict`**
- `base: undefined` → `false`; a `base` field that disagrees → `true`.
- **A concurrent edit to a *different* field → `false`.** This is the regression the function was
  rewritten to fix (it used to compare row `version`); it is the single most valuable assertion here.

**[../apps/server/src/presence.ts](../apps/server/src/presence.ts) — `PresenceStore`**
- Two sockets for one member: one leaves, the member stays present until the last socket goes.
- `join` re-joining an already-joined socket (it calls `leave` first) doesn't duplicate or orphan.
- `leave` on an unknown socket returns `undefined`; `getSocketIds` drives sender exclusion.

**Done when:**
- [x] All four modules covered at the case level above
- [x] No mocking anywhere in this step

---

### Step 5 — Outbox tests

**Status:** done (2026-09-15) · **Size:** M–L — the highest-value step in this task

[../apps/web/src/lib/outboxSync.ts](../apps/web/src/lib/outboxSync.ts) is the most intricate logic
in the app and the site of the defects fixed in [03](03-outbox-reliability.md) and
[05](05-cache-reconciliation.md). Tests here are what keep those fixed. Needs `fake-indexeddb`,
`vi.useFakeTimers()`, a stubbed `sendOp`, and the `vi.resetModules()` discipline from
[Hazards](#hazards-to-handle-up-front).

**[../apps/web/src/lib/outbox.ts](../apps/web/src/lib/outbox.ts) — queue atomicity**
- Concurrent `enqueue` and `dequeue` both land. This is the regression test for the
  read-then-write clobber in [03](03-outbox-reliability.md); it only means something because
  `fake-indexeddb` gives real transaction semantics.
- `recordAttempt` increments and returns the new count; returns `0` for an already-dequeued op.
- Queues for two different `listId`s never interleave.

**`outboxSync.ts` — flush policy.** One assertion per documented decision:
- FIFO order preserved, each op awaited before the next is sent (a create must land before the
  PATCH that depends on it).
- Success → op dequeued, and `connectionStatus` flipped to online.
- **404 → dequeue + "no longer exists" notice + `continue`** — must not head-of-line-block the
  ops queued behind it.
- **Any other 4xx → dequeue + discarded notice + continue** — permanent, never retried.
- **Network error / 5xx → op stays queued**, backoff timer scheduled, remaining ops untouched.
- Backoff is 2s doubling to a 30s ceiling, and a new trigger clears any outstanding retry timer
  (at most one should ever exist).
- `MAX_FLUSH_ATTEMPTS`: the 10th failure drops the op rather than retrying forever.
- `isFlushing` re-entrancy guard: two overlapping triggers do not double-send the head op.
- `hadConflict` aggregation: **one** notice per flush, not one per op ([05](05-cache-reconciliation.md)).
- `reconcile: true` invalidates **even when the queue was empty** — the reconnect-staleness fix.
- Ref counting: two `start()` callers share one poller; the last `stop()` clears both the interval
  and any pending timeout.

**Done when:**
- [x] Every bullet above has an assertion
- [x] No test depends on another test's leftover module state
- [x] Suite runs in well under a second (fake timers, no real waiting)

---

### Step 6 — Server integration tests

**Status:** done (2026-09-15) · **Size:** M–L · **Depends on:** [Step 2](#step-2--extract-buildapp-from-indexts)

Real Postgres, `app.inject()`, spy broadcaster. The harness is a meaningful share of this step's
diff — build it deliberately.

**Harness**
- A `ubiquiti_todo_test` database on the existing docker-compose service, migrated with
  `prisma migrate deploy` before the run.
- `TRUNCATE ... RESTART IDENTITY CASCADE` in `beforeEach`; `fileParallelism: false` (see
  [Hazards](#hazards-to-handle-up-front)).
- A `buildApp({ broadcaster: spy, isProduction: false })` helper plus small fixture builders.
- **Add the Postgres service container to CI** in this PR — this is the step that needs it.

**Conflict signaling** — guards [../specs/05-sync-conflict-resolution.md](../specs/05-sync-conflict-resolution.md)
- A PATCH whose `base` disagrees returns `hadConflict: true` **and the write still applies**
  (whole-record LWW: the signal is soft, it never blocks).
- A matching `base` returns `false`; so does a concurrent edit to a different field.

**Route scoping** — guards [04](04-route-scoping-and-conflict-check.md) bug 1
- PATCH with a `listId` that doesn't own the todo → **404, row unmutated, nothing broadcast.**
  The broadcast assertion is the real point: a mismatched id must never reach the wrong room.
- Same for DELETE. A todo that doesn't exist at all still 204s (idempotent retry) — the two cases
  are deliberately distinguished.

**Idempotency** — guards [19](19-transaction-boundaries.md)
- POST the same client-generated id twice → one row, 200 both times (the bare-`create`-catching-P2002
  path). Do it **concurrently** as well as sequentially; the concurrent case is the one that
  regressed before.
- POST to a deleted/nonexistent list → FK violation → **404, not 500**.
- DELETE twice → 204 both times.

**Error shape** — guards [../specs/03-api-rest.md](../specs/03-api-rest.md)
- 400 (`invalid_body`, via a zod failure), 404 (`not_found`), 413 (`payload_too_large`, over the
  256KB cap) all return `{ error: { code, message } }` with the right code from `STATUS_TO_CODE`.
- A 500 does not leak an internal message.

**Broadcast assertions (via the spy)** — for each mutating route: the right event name, the right
room, and `excludeMemberId` taken from the `x-client-id` header.

**`GET /api/lists` pagination** — `hasMore` true/false around the boundary (it fetches `limit + 1`
to avoid a COUNT), `limit`/`offset` coercion and bounds.

**Done when:**
- [x] Harness is reusable and documented in the README's local-dev section
- [x] CI runs the integration suite against a Postgres service container
- [x] Every bullet above has an assertion

---

### Step 7 — One real socket test

**Status:** not started · **Size:** S · **Depends on:** [Step 6](#step-6--server-integration-tests)

The spy in step 6 proves each route *asks* for the right broadcast. This proves the wiring actually
delivers it. **One** test, with a real listening server and two `socket.io-client` connections:

- Both clients `list:join` the same list; a REST mutation from client A's `x-client-id` arrives at
  client B and **not** back at A (sender exclusion via `PresenceStore.getSocketIds`).
- Presence: B joining broadcasts an updated member list to A; B disconnecting broadcasts again.

Deliberately not more than this — it needs real ports and real timing, so it is the flakiest thing
in the suite. Everything cheaper to assert belongs in step 6.

**Done when:**
- [ ] Realtime delivery and sender exclusion proven end to end
- [ ] Server torn down cleanly; no open handles left hanging the run

---

### Step 8 — Frontend hook and component tests

**Status:** not started · **Size:** M

React Testing Library + jsdom, `lib/api` mocked at the boundary.

**[../apps/web/src/hooks/useList.ts](../apps/web/src/hooks/useList.ts) — optimistic update and
reconciliation** (guards [05](05-cache-reconciliation.md))
- A toggle updates the cache **immediately**, before any response.
- When the mocked response arrives, `replaceTodo` swaps the row in place — **no flicker, no revert.**
- A 404 drops the op and invalidates; a network error leaves it queued.
- `deleteList` / `updateListTitle` while offline fail fast with a notice rather than pausing
  invisibly (the [06](06-offline-edge-cases.md) fix) — these two sit outside the outbox.

**[../apps/web/src/components/TodoDescription.tsx](../apps/web/src/components/TodoDescription.tsx)**
- Edit/view toggle.
- **An incoming update while the textarea is open does not clobber the draft**, and the new value
  appears once the user exits edit mode
  ([../specs/09-markdown-descriptions.md](../specs/09-markdown-descriptions.md)).

**Components, lighter touch** — `SubtaskProgress` (counts and the zero case), `CostInput` (blur
commits, invalid input silently reverts, `COST_CENTS_MAX` refused), `TodoItem` render/interact.

**Stretch, cut first:** the Playwright pair from specs/11 — two browser contexts on one list
asserting realtime propagation, and one using `context.setOffline(true)` for the
offline → reconnect → sync flow. Only if everything above has landed.

**Done when:**
- [ ] Optimistic-update and no-flicker behavior asserted
- [ ] The mid-edit clobber protection asserted
- [ ] Component tests assert behavior, not markup

---

## Verification (whole task)

- `npm test` green from a clean checkout with docker-compose up.
- CI green on a pushed branch, including the Postgres service container.
- specs/11 and DEFERRED.md describe reality.
- PROGRESS.md's deferred-testing checkbox is closed out and the Completed section records each step.
