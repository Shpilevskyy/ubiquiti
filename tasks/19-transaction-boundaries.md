# 19 — Add transaction boundaries and collapse redundant round trips

**Status:** done
**Size:** S–M
**Depends on:** [04](04-route-scoping-and-conflict-check.md) (its Bug 2 fix is the single most
important transaction in the codebase; do it there, then apply the same treatment to the rest here)
**Source:** Architecture review 2026-09-14

## Why

`prisma.$transaction` appears **zero times** in the codebase. Every handler is a sequence of
independent round trips. In an app whose entire selling point is concurrent writes, that's something
a reviewer notices — and in one place ([04](04-route-scoping-and-conflict-check.md)) it's an actual
race.

## Sites

**`POST /api/lists/:listId/todos`** — [../apps/server/src/routes/todos.ts:20-43](../apps/server/src/routes/todos.ts)

Three sequential queries for one create:

```ts
const list = await prisma.list.findUnique(...);        // 404 check
const existing = await prisma.todo.findUnique(...);    // idempotency check
const todo = await prisma.todo.create(...);
```

Two clients replaying the same queued create concurrently (entirely possible — the outbox retries,
and [03](03-outbox-reliability.md) documents how concurrent flushes arise) can both see
`existing === null` and both attempt the create. The second gets a unique-constraint violation
(P2002) which currently falls through to the generic 500 handler, rather than the idempotent 200 the
design intends.

**Fix:** a single `upsert` keyed on the client-generated id, with an empty `update` — that's exactly
the "no-op upsert" semantics [../specs/06-offline-sync.md](../specs/06-offline-sync.md#why-client-generated-ids-matter-here)
already describes. The missing-list case surfaces as a foreign-key violation (P2003); map it to 404
in the central error handler alongside P2025 (see [09](09-server-route-boilerplate.md)). Three
queries become one, and the race disappears.

**`POST /api/lists/:listId/todos/:todoId/subtasks`** — [../apps/server/src/routes/subtasks.ts:24-42](../apps/server/src/routes/subtasks.ts)

Identical shape, identical fix.

**`PATCH` on todos and subtasks** — the read-then-write conflict check. Covered by
[04](04-route-scoping-and-conflict-check.md); don't duplicate it here.

**`DELETE /api/lists/:listId`** — [../apps/server/src/routes/lists.ts:88](../apps/server/src/routes/lists.ts)
is a single `deleteMany` with schema-level cascade. Already atomic. Leave it.

## Scope discipline

This is a correctness-and-tidiness pass, not a rewrite. Don't wrap single-statement handlers in a
transaction for symmetry — Prisma already runs each query atomically, and an unnecessary transaction
holds a connection longer for no benefit. The Render free-tier Postgres has a small connection
limit; profligate transactions are a real cost there.

## Verification

- POST the same todo id twice concurrently (two parallel requests, not sequential) — both must
  return 200 with the same row, no 500, exactly one row in the DB.
- Same for subtasks.
- POST a todo to a nonexistent list id → 404, in the unified error shape from
  [../specs/03-api-rest.md](../specs/03-api-rest.md#error-shape).
- Sequential double-POST (the existing idempotency path) still returns the existing row unchanged.
- `scripts/verify-conflict.py` still passes.

## Done when

- [x] Both create routes are a single round trip on the fast path — **not** `upsert` as originally
      proposed here: verified via Prisma's query logger that `upsert` isn't actually atomic against
      concurrent requests (it compiles to `BEGIN; SELECT; INSERT; COMMIT`, not a native
      `INSERT ... ON CONFLICT`), and reproduced the exact race it was supposed to fix. Used a bare
      `create` racing on the database's own unique constraint instead, with the loser catching
      `P2002` and re-fetching — genuinely atomic. See the PROGRESS.md entry for the full story.
- [x] P2003 maps to 404 centrally
- [x] Concurrent duplicate creates return 200, not 500
- [x] No transactions added where a single statement already suffices
