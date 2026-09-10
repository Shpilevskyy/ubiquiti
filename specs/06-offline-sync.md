# 06 — Offline Sync

Custom-built (per [00-overview.md](00-overview.md), no sync/CRDT framework). Uses IndexedDB only
as a storage primitive (`idb-keyval`), not for any sync logic.

## Outbox pattern

Every mutation goes through one function, `mutate(op)`, which:

1. **Applies an optimistic update** to the TanStack Query cache for `['list', listId]`
   immediately, so the UI never waits on the network.
2. **Appends the operation** to a persistent outbox: an IndexedDB store keyed by `listId`, value
   = ordered array of `{ opId, method, path, body, createdAt }`.
3. **Attempts to send it immediately** if the client believes it's online.

```ts
type QueuedOp = {
  opId: string;        // uuid, for local dedupe/logging only — the REST idempotency is via
                        // the todo/subtask id itself, see 03-api-rest.md
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;         // e.g. /api/lists/:listId/todos/:todoId
  body?: unknown;
  createdAt: number;
};
```

## Connectivity detection

`navigator.onLine` is necessary but not sufficient (it only reflects link-layer state, not
"can reach our server"). Actual connectivity is tracked as: Socket.IO's `connect`/`disconnect`
events, **plus** a failed `fetch` (network error, not an HTTP error status) marks the client
offline immediately rather than waiting for a browser event. A small `ConnectionStatus` singleton
holds the current state and is what the UI's connection indicator reads.

## Flushing the outbox

Triggered on: Socket.IO `connect`/`reconnect` event, and browser `online` event (belt and
braces — either can fire first).

- Ops for a given list are replayed **in FIFO order, awaiting each response** before sending the
  next — preserves the order the user made changes in, and keeps this simple (no need to reason
  about out-of-order application).
- On success (2xx): remove the op from the outbox.
- On `404` (parent list/todo was deleted elsewhere while offline): drop the op, surface a toast,
  continue with the rest of the queue.
- On network error / `5xx`: stop flushing, leave remaining ops queued, retry the whole flush with
  backoff (a few seconds, doubling, capped) rather than looping tightly.

## Why client-generated ids matter here

Because Todo/SubTask ids are generated on the client at creation time (see
[03-api-rest.md](03-api-rest.md)), a `create` operation queued while offline is safe to retry —
if the first attempt actually reached the server but the response was lost, replaying it is a
no-op upsert rather than a duplicate row. This is what lets the outbox use plain "retry on
failure" instead of needing its own separate idempotency-key protocol.

## Scope / limitations (documented, not fixed)

- Outbox ordering is only guaranteed within a single browser tab (its own IndexedDB store isn't
  shared/locked across tabs). Two offline tabs on the same list is out of scope.
- No merge UI for conflicts — see [05-sync-conflict-resolution.md](05-sync-conflict-resolution.md).
- The outbox does not currently coalesce redundant ops (e.g. five rapid title edits queue five
  PATCHes rather than one) — acceptable at this scale; could be optimized by debouncing before
  enqueueing if it turns out to matter.
