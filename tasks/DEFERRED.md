# Deferred

Parked deliberately. Recorded here rather than dropped, so the decision is visible and the work is
easy to pick back up.

## Testing — [../specs/11-testing-strategy.md](../specs/11-testing-strategy.md)

**Deferred by the developer on 2026-09-12. Un-parked on 2026-09-15 — the plan now lives in
[23-testing.md](23-testing.md), which supersedes the sketch below.** The three priorities named here
survived into that plan; its step 1 is to correct the stale parts of specs/11 (and of this file —
the float-precision note below no longer applies since [18](18-fractional-string-indexing.md)).

Status: the strategy doc is written and detailed; **zero tests exist**. No Vitest, no test runner,
no test files anywhere in the repo.

Worth being clear-eyed about the tradeoff, since this is the one deferral a reviewer is most likely
to ask about: specs/11 itself frames this as a deliberate time-box call ("a working app beats a
partially-tested one if time runs short"), so the reasoning is at least already written down and
consistent.

If it's ever picked up, the three highest-value tests — the ones covering logic that is genuinely
easy to get wrong, in rough order:

1. **`computeReorderPosition`** ([../apps/web/src/lib/position.ts](../apps/web/src/lib/position.ts))
   — pure function, no mocking, ~20 lines of test. Move up/down, insertion at both ends, single-item
   list, drop-on-self, and an unknown `activeId`. Cheapest possible unit test in the codebase.
2. **Outbox flush ordering and retry policy** — FIFO preserved, success dequeues, 404 drops and
   continues, network error stops and retries. This is where the defects in
   [03](03-outbox-reliability.md) live, so tests here are what keep them fixed. `fake-indexeddb`
   for the queue.
3. **Conflict signaling** (integration) — a `base` that disagrees with the row returns
   `hadConflict: true` and still applies the write; a matching one doesn't; and an edit to a
   different field reports no conflict. Guards the LWW contract in
   [../specs/05-sync-conflict-resolution.md](../specs/05-sync-conflict-resolution.md) and the
   atomicity fix in [04](04-route-scoping-and-conflict-check.md).

One correction to specs/11 when the time comes: it calls for **Supertest**, which isn't needed —
Fastify ships `app.inject()` for exactly this and it's faster (no socket binding).

CI is already scoped in [12](12-tooling-lint-ci.md) to run build + typecheck + lint. Adding a test
step to that workflow is a one-line change whenever tests exist.

## Make the repository private

**Deferred by the developer on 2026-09-12.**

Per [../specs/12-deployment.md](../specs/12-deployment.md), `github.com/Shpilevskyy/ubiquiti` is
public for the review window and should go private afterwards. Nothing to build — just don't forget
it once the reviewer has seen it.

Note [../apps/server/.env](../apps/server/.env) is gitignored and the only committed value is the
local docker-compose placeholder in `.env.example`, so there's nothing sensitive exposed in the
meantime. The Render `DATABASE_URL` lives only in Render's env vars.
