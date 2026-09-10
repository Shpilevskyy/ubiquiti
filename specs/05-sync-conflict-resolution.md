# 05 — Sync & Conflict Resolution

Shared rules used by both realtime collaboration ([04](04-realtime-protocol.md)) and offline
replay ([06](06-offline-sync.md)) when two writes to the same row happen close together.

## Strategy: whole-record last-write-wins, no merge UI

Every write to a Todo/SubTask increments its `version` column and updates `updatedAt`. The
server **always applies an incoming write** — it never rejects a mutation because the row
changed since the client last read it. The most recent write to reach the server wins for that
entire record (not per-field).

This is a deliberate scope decision for a time-boxed project: field-level merging or a proper
CRDT/OT algorithm would handle concurrent edits more gracefully (e.g. two people editing
different fields of the same todo at once would both survive), but is a much larger effort than
the assignment's time budget supports. Whole-record LWW is simple, predictable, and correct for
the common case (different people editing different todos, or the same todo sequentially).

**Known limitation** (documented, not fixed): if two clients edit the *same field* of the *same*
todo within the same round-trip window, one edit is silently overwritten. No conflict-resolution
UI is built for this.

## Stale-write indicator (soft signal, non-blocking)

The client includes the `version` it last saw when sending a PATCH. If the server's current
version for that row is higher than the client's `baseVersion` (i.e. someone else changed it in
the meantime), the server still applies the write, but the PATCH response includes
`{ hadConflict: true }`. The client shows a brief, non-blocking toast ("This item was also
edited elsewhere") — informational only, doesn't block or undo anything.

## Deletes

A delete always wins over a concurrent update: if a client tries to PATCH a row that no longer
exists (already deleted by someone else), the server returns `404`, the client drops that queued
operation and any dependent local state, and surfaces a toast rather than treating it as an
error to retry indefinitely.

## Ordering (`position`) conflicts

Position is just another field under the same LWW rule. Two people dragging the same item to
different spots at the same time — last write wins, same as any other field. See
[08-drag-and-drop.md](08-drag-and-drop.md) for how `position` values themselves are computed.
