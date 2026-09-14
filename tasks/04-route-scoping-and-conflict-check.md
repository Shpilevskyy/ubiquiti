# 04 — Scope todo/subtask routes to their parent id; fix TOCTOU conflict check

**Status:** not started
**Size:** M
**Depends on:** —
**Source:** Staff review 2026-09-12

Two server-side defects in the same four route handlers. Bundled because the fix rewrites the same
`where` clauses — doing them separately means two passes over identical code.

## Bug 1 — routes ignore the parent id in the URL path

[../apps/server/src/routes/todos.ts:74-78](../apps/server/src/routes/todos.ts) (PATCH),
[:99](../apps/server/src/routes/todos.ts) (DELETE),
[../apps/server/src/routes/subtasks.ts:75-78](../apps/server/src/routes/subtasks.ts) (PATCH),
[:100](../apps/server/src/routes/subtasks.ts) (DELETE)

`PATCH /api/lists/:listId/todos/:todoId` resolves the todo by `todoId` **alone**, then broadcasts
to whatever `listId` the URL claimed:

```ts
const todo = await prisma.todo.update({ where: { id: request.params.todoId }, ... });
app.broadcaster.broadcastToList(request.params.listId, ...);   // <- unvalidated
```

So a request with a mismatched `listId` mutates the todo and notifies **the wrong room**. Every
client viewing the list that actually owns that todo receives no event and silently desyncs until
something else triggers a refetch. `deleteMany({ where: { id: todoId } })` has the same hole.

Today only our own client builds these URLs, so it's latent rather than actively firing — but the
API is public and unauthenticated, and in any version of this with auth it is a straightforward
IDOR.

**Fix:** scope every lookup to its parent.

- todos: `where: { id: todoId, listId }`
- subtasks: `where: { id: subtaskId, todoId }`

`prisma.update` with a non-unique compound `where` isn't allowed — use `updateMany` (see Bug 2,
which wants `updateMany` anyway) or verify the parent before updating. A mismatch must 404, not
silently no-op.

Also check `count` before broadcasting on DELETE, the way
[../apps/server/src/routes/lists.ts:89](../apps/server/src/routes/lists.ts) already does — right
now a delete of a nonexistent todo still broadcasts `todo:deleted`.

## Bug 2 — the conflict check is still TOCTOU

> **Updated 2026-09-14.** The *semantics* of this check were rewritten (it now compares the
> per-field `base` values the client last saw, not the row's `version` — see
> [../specs/05-sync-conflict-resolution.md](../specs/05-sync-conflict-resolution.md)). That fixed
> a false-positive problem, **not** the race described here, which is still open.

[../apps/server/src/routes/todos.ts:65-72](../apps/server/src/routes/todos.ts),
[../apps/server/src/routes/subtasks.ts:66-73](../apps/server/src/routes/subtasks.ts)

The check is a `findUnique` followed by a separate `update`, with no transaction between them:

```ts
const current = await prisma.todo.findUnique({ where: { id: request.params.todoId } });
if (!current) return 404;
const hadConflict = detectConflict(current, base);

const todo = await prisma.todo.update({ ... version: { increment: 1 } });
```

Another write landing between the read and the write is compared against values that are already
stale, so `hadConflict` can come back `false` for a write that demonstrably clobbered something.
The write itself is still LWW-correct; only the signal is unreliable.

**Fix:** wrap the read and the write in `prisma.$transaction` so the comparison and the write see
the same snapshot. (The earlier suggestion here — collapsing into a single `updateMany` with
`version` in the `where` — no longer applies now that the check compares field values rather than a
row counter. A transaction is both simpler and what the value comparison actually needs.)

Fold Bug 1's parent scoping into the same `where` clauses while you're in there.

## Verification

Use curl against a local server — this is server-only, no browser needed.

Bug 1:
- `PATCH /api/lists/<WRONG-LIST-ID>/todos/<REAL-TODO-ID>` must 404, and must not modify the row.
- Same for DELETE.
- Confirm the correct-parent path still works unchanged.

Bug 2:
- Matching `base` → `hadConflict: false`, write applies.
- Disagreeing `base` → `hadConflict: true`, write **still applies** (LWW — do not regress this).
- Omitted `base` → no conflict check, write applies.
- A concurrent edit to a *different* field → `hadConflict: false` (the false positive fixed on
  2026-09-14 — this is the one most likely to regress).
- PATCH after DELETE → 404.

All of these have a runnable regression script; see PROGRESS.md's conflict-detection entry for the
seven cases it covers. Re-run it after this change.

## Done when

- [ ] Mismatched parent id 404s on PATCH and DELETE, for both todos and subtasks
- [ ] DELETE only broadcasts when a row was actually deleted
- [ ] Version check and write are a single atomic statement
- [ ] All four conflict cases still behave as specced, LWW intact
