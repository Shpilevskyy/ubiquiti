# 08 — Drag & Drop / Ordering

## Library boundary

`dnd-kit` provides the drag *interaction* primitives (`DndContext`, `SortableContext`, sensors,
keyboard accessibility) — it has no concept of our `position` field or persistence. Computing the
new position and saving it is ours to write, which is the point of using a headless library here
rather than something like `react-beautiful-dnd`'s higher-level list-reordering helpers.

## Position strategy: fractional keys

Each Todo/SubTask has a float `position`. Siblings are ordered by `position` ascending. To move
an item between two neighbors:

```
newPosition = (prevSibling.position + nextSibling.position) / 2
```

- Moving to the start: `newPosition = firstSibling.position - 1`
- Moving to the end: `newPosition = lastSibling.position + 1`
- Empty list: first item gets `position = 0`

This means a reorder only ever touches **one row** (the moved item), regardless of list length —
no need for a batch-reorder endpoint or rewriting every sibling's position.

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

[tasks/18](../tasks/18-fractional-string-indexing.md) changes the position *key type* (float →
fractional string) to fix a different problem (precision collisions, below) — it doesn't revisit
this client-vs-server decision.

## Known limitation: float precision

Repeated insertions into the same gap halve the remaining space each time; after enough
insertions in one spot, floats could theoretically lose precision. Mitigation kept intentionally
simple for this project's scope: if the computed gap between neighbors is smaller than a small
epsilon (e.g. `1e-7`), fall back to **re-indexing the whole sibling list** (assign `0, 1, 2, ...`)
in that one request before computing the new item's position. This is a rare-path safeguard, not
the common case.

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
