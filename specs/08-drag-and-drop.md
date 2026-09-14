# 08 — Drag & Drop / Ordering

## Library boundary

`dnd-kit` provides the drag *interaction* primitives (`DndContext`, `SortableContext`, sensors,
keyboard accessibility) — it has no concept of our `position` field or persistence. Computing the
new position and saving it is ours to write, which is the point of using a headless library here
rather than something like `react-beautiful-dnd`'s higher-level list-reordering helpers.

## Position strategy: fractional-index string keys

Each Todo/SubTask has a `position: string` — a fractional-index key
([`fractional-indexing`](https://www.npmjs.com/package/fractional-indexing), tasks/18) rather than
a float. Siblings are ordered by `position` ascending, using a database column that's `COLLATE "C"`
(byte order — see Collation below). To move an item between two neighbors:

```
newPosition = generateKeyBetween(prevSibling?.position ?? null, nextSibling?.position ?? null)
```

`generateKeyBetween` produces a lexicographically-ordered base-62 string that sorts strictly
between its two bounds (either may be `null` for "insert at the start/end"; an empty list's first
item gets `generateKeyBetween(null, null)`). This means a reorder only ever touches **one row**
(the moved item), regardless of list length — no need for a batch-reorder endpoint or rewriting
every sibling's position — same property floats had, without floats' precision ceiling (see
Known limitation, below, for why floats were replaced).

### Collation

Postgres's default locale collation (`en_US.UTF-8` on both the docker-compose image and Render)
does *not* sort ASCII-betically — it applies locale rules that treat case and punctuation as
secondary weights. Base-62 keys mix digits, uppercase and lowercase, so `ORDER BY position` under
a locale collation can disagree with the ordering the key generator intends. The `position` column
is `COLLATE "C"` (byte order) on both models — set via raw SQL in the migration, since Prisma has
no schema-level collation attribute. Client-side comparisons use plain `<`/`>`
(`lib/position.ts#comparePosition`), not `localeCompare`, for the same reason.

## Decision: client computes the position, not just the drag

`computeReorderPosition` runs on the client, which sends a computed **value**
(`PATCH { position: 1.5 }`) rather than an **intent** (`PATCH { after: todoId }`) for the server to
resolve against current truth. This was evaluated, not defaulted into
([tasks/17](../tasks/17-record-reordering-decision.md)):

Intent-based reordering degrades badly under this app's offline-replay requirement
([06-offline-sync.md](06-offline-sync.md)). `{ after: Y }` replayed once back online, after `Y` was
deleted during the offline window, is ambiguous — the server has to invent a fallback, and
whatever it picks will sometimes be wrong. `{ position: 1.5 }` always means something, even if the
neighbors moved by the time it's applied — it degrades to "roughly where the user dropped it,"
which is the graceful failure.

**Accepted cost**: two clients dragging concurrently each compute a position against their own
(possibly stale) view of the sibling array. Under this app's whole-record last-write-wins rule, the
winning value was computed against neighbors that may no longer be adjacent — or may no longer
exist — by the time it lands, so the item can end up somewhere neither user intended, not merely
"the other person's drag won." That's a real, demoable failure mode in a two-user session, which is
exactly the scenario this app gets shown in — but the offline requirement makes value-based the
better trade regardless, not the lazy one.

[tasks/18](../tasks/18-fractional-string-indexing.md) changed the position *key type* (float →
fractional string, done — see below) to fix a different problem (precision collisions) — it didn't
revisit this client-vs-server decision.

## Former limitation: float precision (fixed by tasks/18)

`position` was originally a `Float`, averaging two neighbors to insert between them. Repeated
insertions into the same gap halve the remaining space each time; after enough insertions in one
spot, the average stops being representable and two items collide on an identical position, at
which point their relative order is whatever Postgres feels like. The spec originally called for
an epsilon-triggered re-index fallback (detect a too-small gap, renumber the whole sibling list in
that request) — that fallback was never actually implemented, and building it correctly meant
detecting the collision, renumbering every sibling, persisting N rows in one transaction, and
broadcasting the whole reorder to other clients, all interacting correctly with the offline outbox.

String fractional indexing (above) removes the problem instead of handling it: lexicographically
ordered keys never run out of room — between `"a"` and `"b"` you can always insert `"am"`, and
between `"a"` and `"am"` you can insert `"ah"`, forever. Keys grow a character at a time rather
than losing precision. No fallback to build, none needed.

## Interaction flow

1. `onDragEnd` fires with the active item and its new index among siblings (top-level todos, or
   subtasks within one todo — separate `SortableContext`s, no cross-todo subtask dragging).
2. Client computes `newPosition` from the two on-screen neighbors at the drop point.
3. Optimistic reorder of local state (instant visual feedback) +
   `PATCH .../:id { position: newPosition }` via the same mutate/outbox path as any other edit
   (see [06-offline-sync.md](06-offline-sync.md) — reordering while offline is queued and synced
   like any other change).
4. Server persists, bumps `version`, broadcasts `todo:updated`/`subtask:updated` to the room (see
   [04-realtime-protocol.md](04-realtime-protocol.md)) so other viewers' lists re-sort live.

## Scope

Reordering is within the same parent only: top-level todos reorder among themselves; sub-tasks
reorder within their own todo. Dragging a sub-task out to become a top-level todo (or between
different todos) is out of scope.
