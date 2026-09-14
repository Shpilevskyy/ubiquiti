# 03 — Outbox atomicity, poison ops, single-flight flush

**Status:** not started
**Size:** M
**Depends on:** —
**Source:** Staff review 2026-09-12

Three interlocking defects in the offline queue. They're bundled because fixing one in isolation
leaves the failure reachable via the others, and the whole fix is ~30 lines.

## Bug 1 — `enqueue`/`dequeue` race loses queued operations

[../apps/web/src/lib/outbox.ts:23-39](../apps/web/src/lib/outbox.ts)

Both `enqueue` and `dequeue` are read-modify-write across **two separate IndexedDB transactions**:
`await getQueue(...)` then `await set(...)`. Any interleaving loses data.

Concrete failure: offline, queue is `[A]`. User adds two todos in quick succession.

```
enqueue(B):  get -> [A]
enqueue(C):  get -> [A]
enqueue(B):  set([A, B])
enqueue(C):  set([A, C])      <- B is gone, silently
```

Same collision between an `enqueue` and a concurrent flush's `dequeue`: the dequeue can write back
an array that never contained the newly enqueued op, or resurrect an op that was already sent.

**Fix:** `idb-keyval` exports `update(key, updater)`, which performs the read and the write inside
a single `readwrite` transaction. Swap both functions to it. The updater must be synchronous —
both of these already are.

```ts
import { update } from 'idb-keyval';
// enqueue: update(storageKey(listId), (queue = []) => [...queue, queued])
// dequeue: update(storageKey(listId), (queue = []) => queue.filter(op => op.opId !== opId))
```

`enqueue` still needs to return the `QueuedOp` it built — build it before the `update` call and
return it after.

## Bug 2 — a permanently-failing op blocks the queue forever

[../apps/web/src/hooks/useList.ts:126-138](../apps/web/src/hooks/useList.ts) (and the same shape at
[:85-93](../apps/web/src/hooks/useList.ts))

Only `404` is treated as permanent. Every other status falls into the retry branch. A `400`
(`invalid_body`) therefore retries every 15s **forever**, and because the flush is strictly FIFO
with `await` between ops, it head-of-line-blocks every operation queued behind it. The user's
subsequent offline work never syncs and nothing in the UI says why.

**Fix:**

- Treat **any 4xx** as non-retryable: dequeue it, surface a notice, `continue` to the next op.
  Retry only network errors (no `HttpError` at all) and 5xx.
- Keep the existing 404 message ("This item no longer exists"); use a distinct, more generic
  message for other 4xx, since "no longer exists" would be wrong for a 400.
- Add a safety net regardless: an `attempts` counter on `QueuedOp`, incremented on each failed
  send, and drop the op past a cap (say 10) with a notice. This bounds any failure mode not
  enumerated above, including ones introduced later.

Adding `attempts` changes the persisted shape. Existing queues in a browser's IndexedDB won't have
it — default it (`op.attempts ?? 0`) rather than assuming presence.

## Bug 3 — unbounded concurrent flushes and stacking retry timers

[../apps/web/src/hooks/useList.ts:109-160](../apps/web/src/hooks/useList.ts)

`flushOutbox` has four triggers and **no in-flight guard**:

1. once on mount ([:147](../apps/web/src/hooks/useList.ts))
2. the `connectionStatus` subscription ([:148-150](../apps/web/src/hooks/useList.ts))
3. the 15s poll ([:151](../apps/web/src/hooks/useList.ts))
4. its own backoff `setTimeout` ([:134](../apps/web/src/hooks/useList.ts))

The poll fires regardless of whether a flush is already running. Worse, each failure schedules
*another* `setTimeout` while only the most recent handle is stored in `flushTimeoutRef`, so retry
chains accumulate, the cleanup at [:155](../apps/web/src/hooks/useList.ts) clears only the last
one, and the doubling backoff stops meaning anything once several chains overlap.

Concurrent flushes are also precisely what makes Bug 1 reachable in practice.

**Fix:**

- An `isFlushing` ref (or module-level flag once [07](07-extract-outbox-sync.md) lands). Return
  immediately if a flush is already in progress.
- Clear any pending retry timer before scheduling a new one, so at most one is ever outstanding.
- Reset the backoff to `FLUSH_RETRY_BASE_MS` on success (already done at
  [:141](../apps/web/src/hooks/useList.ts) — keep it).

## Verification

Bug 1 is the hard one to prove. Do it deliberately:

- In the dev console, fire two `enqueue` calls for the same list without awaiting between them,
  then read the queue back. Before the fix you get one op; after, two.
- Offline, add several todos as fast as you can type. Reload (queue must survive), reconnect, and
  confirm **every** todo lands on the server. Count them.

Bug 2:

- Queue an op offline that the server will reject with 400 (easiest: hand-write a `QueuedOp` into
  IndexedDB with an invalid body, e.g. an empty `title`). Queue a valid op behind it. Reconnect.
  Before the fix the valid op never sends; after, the bad op is dropped with a notice and the
  valid one goes through.

Bug 3:

- Add logging at the top of `flushOutbox`, go offline with a queued op, wait ~60s. Before the fix
  you see overlapping invocations and multiple retry chains; after, one at a time.

## Done when

- [ ] `enqueue`/`dequeue` use a single atomic `update()` transaction
- [ ] Any 4xx drops the op with a notice and the flush continues past it
- [ ] `attempts` cap bounds any other permanent failure
- [ ] At most one flush runs and at most one retry timer is pending at any time
- [ ] Rapid offline writes all survive to the server
