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

## Bug 2 — conflict detection is TOCTOU

[../apps/server/src/routes/todos.ts:65-78](../apps/server/src/routes/todos.ts),
[../apps/server/src/routes/subtasks.ts:66-78](../apps/server/src/routes/subtasks.ts)

The version check is a `findUnique({ select: { version: true } })` followed by a separate
`update`, with no transaction between them:

```ts
const current = await prisma.todo.findUnique({ where: { id }, select: { version: true } });
const hadConflict = baseVersion !== undefined && current.version > baseVersion;
const todo = await prisma.todo.update({ ... version: { increment: 1 } });
```

Two concurrent PATCHes both read version 3, both compute `hadConflict: false`, and both report no
conflict — even though the second one demonstrably clobbered the first. The *write* is still
LWW-correct per
[../specs/05-sync-conflict-resolution.md](../specs/05-sync-conflict-resolution.md); only the signal
lies, which is worse than not having it, because the user is told nothing happened.

**Fix:** make the check and the write one atomic statement.

```ts
// Try the conditional write first: if it matches, there was no conflict.
const { count } = await prisma.todo.updateMany({
  where: { id: todoId, listId, ...(baseVersion !== undefined ? { version: baseVersion } : {}) },
  data: { ...updateData, version: { increment: 1 } },
});
```

`count === 1` means no conflict. `count === 0` means either the row is gone (→ 404) or the version
moved (→ conflict). Distinguish by re-reading the row; if it exists, apply the write
unconditionally (LWW still wins, per spec) and return `hadConflict: true`.

Note this also folds Bug 1's scoping in for free, since `updateMany` accepts the compound `where`.

`updateMany` doesn't support `include`, so the response still needs a follow-up read to return the
todo with its `subtasks` (`orderBy: { position: 'asc' }` — don't drop that, it was added
deliberately). Wrap the whole thing in `prisma.$transaction` if you want the read to be consistent
with the write.

## Verification

Use curl against a local server — this is server-only, no browser needed.

Bug 1:
- `PATCH /api/lists/<WRONG-LIST-ID>/todos/<REAL-TODO-ID>` must 404, and must not modify the row.
- Same for DELETE.
- Confirm the correct-parent path still works unchanged.

Bug 2:
- Fresh `baseVersion` → `hadConflict: false`, write applies.
- Stale `baseVersion` → `hadConflict: true`, write **still applies** (LWW — do not regress this).
- Omitted `baseVersion` → no conflict check, write applies.
- PATCH after DELETE → 404.

All four of those cases were verified once before (see PROGRESS.md's sync/conflict entry) — re-run
them, they're the regression suite for this change.

## Done when

- [ ] Mismatched parent id 404s on PATCH and DELETE, for both todos and subtasks
- [ ] DELETE only broadcasts when a row was actually deleted
- [ ] Version check and write are a single atomic statement
- [ ] All four conflict cases still behave as specced, LWW intact
