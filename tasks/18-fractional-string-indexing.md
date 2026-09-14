# 18 — Replace `position: Float` with string fractional indexing

**Status:** not started
**Size:** M (schema migration + data backfill + client helper swap)
**Depends on:** [17](17-record-reordering-decision.md) (record the client-vs-server decision first;
this task changes the key type, not who computes it)
**Source:** Architecture review 2026-09-14

## Why

`position` is a `Float` on both Todo and SubTask
([../apps/server/prisma/schema.prisma](../apps/server/prisma/schema.prisma)), and reordering
averages the two neighbours
([../apps/web/src/lib/position.ts:23](../apps/web/src/lib/position.ts)).

Repeatedly dropping an item into the same gap halves that gap each time. After ~50 insertions
between the same two neighbours the midpoint stops being representable and two items collide on an
identical position — at which point their relative order is whatever Postgres feels like.

[../specs/08-drag-and-drop.md](../specs/08-drag-and-drop.md) anticipates this and specs an
epsilon-triggered re-index fallback. That fallback is **not implemented** (documented as a known
limitation in `position.ts`), and building it means: detecting the collision, renumbering every
sibling, persisting N rows in one transaction, and broadcasting the whole reorder to other clients —
all of which has to interact correctly with the offline outbox.

**String fractional indexing removes the problem instead of handling it.** Lexicographically ordered
base-62 keys never run out of room: between `"a"` and `"b"` you can always insert `"am"`, and
between `"a"` and `"am"` you can insert `"ah"`, forever. Keys grow a character at a time rather than
losing precision. No fallback to build.

This is squarely inside the library policy in
[../specs/00-overview.md](../specs/00-overview.md#library-use-policy) — a single-purpose helper for a
narrow, well-understood sub-problem, exactly like `dnd-kit`. It does not solve reordering *or*
persistence for us.

## What to do

1. Add `fractional-indexing`. It exports `generateKeyBetween(a, b)` (either bound may be `null` for
   "insert at the start/end") and `generateNKeysBetween` for bulk generation.

2. Schema: `position Float` → `position String` on both models. Migration must **backfill**, not
   drop: for each list, read the existing todos ordered by their current float position and assign
   `generateNKeysBetween(null, null, count)` in that order. Same per todo for its subtasks. Get this
   right or every existing list silently reshuffles.

3. **Collation — the part that will bite you.** Postgres's default collation (`en_US.UTF-8` on most
   installs, which is what the docker-compose image and Render both give you) does *not* sort
   ASCII-betically: it applies locale rules that treat case and punctuation as secondary weights.
   Base-62 keys mix digits, uppercase and lowercase, so `ORDER BY position` under a locale collation
   can disagree with the ordering the key generator intends.

   The column must use `COLLATE "C"` (byte order). Prisma has no schema-level collation attribute
   for this, so add it as raw SQL in the migration:
   `ALTER TABLE "Todo" ALTER COLUMN "position" TYPE text COLLATE "C";`

   **Verify this explicitly** with a list containing keys that differ only in case — it's the kind
   of bug that looks fine on ten items and corrupts ordering on a hundred.

4. `computeReorderPosition` becomes a thin wrapper over `generateKeyBetween(prev?.position ?? null,
   next?.position ?? null)` — the `arrayMove` step to find the new neighbours stays exactly as it is.
   Delete the float-precision caveat comment.

5. Update the shared zod schemas (`position: z.number()` → `z.string()` in `TodoSchema`,
   `SubTaskSchema`, `TodoMutableSchema`, `SubTaskMutableSchema`, `CreateTodoBodySchema`,
   `CreateSubTaskBodySchema`) and the two `Date.now()` placeholder positions in
   [../apps/web/src/hooks/useList.ts](../apps/web/src/hooks/useList.ts) (`createTodo`,
   `createSubTask`) — a new item should get `generateKeyBetween(lastSibling?.position, null)`.

6. The optimistic `sort((a, b) => a.position - b.position)` in `reorderTodo`/`reorderSubTask`
   becomes a string comparison. Use `<`/`>`, not `localeCompare` — `localeCompare` reintroduces
   exactly the locale-ordering problem from step 3 on the client side.

## Verification

- Existing lists keep their exact order across the migration. Snapshot a list's todo order before
  and after; they must match item for item.
- Drag an item repeatedly into the *same* gap 100+ times. Under floats this eventually collides;
  under string keys the key just grows. Confirm order stays stable and reload-persistent.
- Mixed-case keys sort correctly server-side (the collation check from step 3) — construct the case
  deliberately, don't wait to stumble into it.
- Reorder offline, reconnect, confirm the queued reorder still replays correctly.
- Subtask reordering, same checks.

## Done when

- [ ] `position` is a `C`-collated string column on both models
- [ ] Existing data backfilled with order preserved
- [ ] `computeReorderPosition` delegates to `generateKeyBetween`; precision caveat deleted
- [ ] Repeated same-gap insertion never collides
- [ ] Offline reorder replay still works
