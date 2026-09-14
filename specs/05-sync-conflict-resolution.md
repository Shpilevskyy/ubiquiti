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

The client includes a `base` object on a PATCH: the values it last saw for **the fields it is
writing**. If any of them differs from the row's current value, the server still applies the write,
but the PATCH response includes `{ hadConflict: true }`. The client shows a brief, non-blocking
toast ("This item was also edited elsewhere") — informational only, doesn't block or undo anything.
Omitting `base` skips the check; the write applies either way.

**Revised 2026-09-14.** This was originally specced as a row-`version` comparison (client sends
`baseVersion`; conflict if the row's `version` advanced). That was wrong for this API: a PATCH
writes only the fields it names, so a row-level counter reported a conflict whenever *anything*
on the row had changed — including a field the incoming write never touches. Two people editing
different fields of the same todo both saw "also edited elsewhere" despite neither losing an edit.
Comparing per-field values makes the signal mean what the toast claims: *the value you overwrote
was not the value you last saw*.

Note this also means the implementation is field-level LWW, not the whole-record LWW described
above — writes to different fields of the same row both survive. That is strictly better than
specced, and the `base` check now reports conflicts accordingly.

`version` remains on the row, but its job is broadcast ordering — see
[04-realtime-protocol.md](04-realtime-protocol.md#ordering-and-the-version-column).

## Deletes

A delete always wins over a concurrent update: if a client tries to PATCH a row that no longer
exists (already deleted by someone else), the server returns `404`, the client drops that queued
operation and any dependent local state, and surfaces a toast rather than treating it as an
error to retry indefinitely.

## Ordering (`position`) conflicts

Position is just another field under the same LWW rule. Two people dragging the same item to
different spots at the same time — last write wins, same as any other field. See
[08-drag-and-drop.md](08-drag-and-drop.md) for how `position` values themselves are computed.
