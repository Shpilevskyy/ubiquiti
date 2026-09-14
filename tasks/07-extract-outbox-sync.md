# 07 — Move the flush scheduler out of `useList` into a plain module

**Status:** done
**Size:** M
**Depends on:** [03](03-outbox-reliability.md) (do the correctness fixes first, then move the code —
moving buggy code and fixing it in one diff makes the review much harder)
**Source:** Staff review 2026-09-12

## Why

[../apps/web/src/hooks/useList.ts](../apps/web/src/hooks/useList.ts) is **407 lines** doing five
separate jobs:

1. query configuration ([:30-43](../apps/web/src/hooks/useList.ts))
2. optimistic cache recipes (the nine mutations)
3. outbox persistence (`mutateWithOutbox`, [:69-94](../apps/web/src/hooks/useList.ts))
4. a background flush scheduler with a retry policy ([:106-160](../apps/web/src/hooks/useList.ts))
5. toast/notice state ([:28](../apps/web/src/hooks/useList.ts), [:47-57](../apps/web/src/hooks/useList.ts))

Job 4 has nothing to do with React. It's a background sync loop — a timer, a queue, and a retry
policy — that happens to be living inside a component hook. That placement causes a concrete
footgun: **the flush effect runs once per `useList()` call site.** Today only `ListPage` calls it,
so there's exactly one poller. The moment a second component calls `useList` you get two pollers,
two subscriptions, and two racing flushes over the same IndexedDB queue.

That matters immediately, because [08](08-list-context.md) is about changing who calls `useList`.

## What to do

1. New `apps/web/src/lib/outboxSync.ts`. A plain module, no React:
   - `start(listId)` / `stop(listId)`, reference-counted so N callers produce one loop
   - owns the in-flight guard, the poll interval, the retry timer and the backoff state
   - owns the retry/drop policy from [03](03-outbox-reliability.md)
   - takes callbacks (or a small event emitter) for the two things it can't do itself: showing a
     notice, and invalidating the query after a batch drains

2. `useList` keeps the query, the mutations, and `mutateWithOutbox`. Its effect shrinks to
   `start`/`stop` on mount/unmount.

3. Move `showNotice` into its own `useNotice` hook (or replace it with the toast library from
   [12](12-tooling-lint-ci.md)) so notice state stops being tangled with sync state.

4. Preserve every behavior that was hard-won and is documented in PROGRESS.md — do not "clean
   these up" while moving them:
   - the 15s poll fallback for browsers that never fire the `online` event
   - `connectionStatus.markOnline()` on a successful send, so a stuck "Offline" pill self-heals
   - **not** gating the flush on `connectionStatus`'s current belief
   - `refetchOnReconnect: false` / `refetchOnWindowFocus: false` on the list query

   The load-bearing comments explaining *why* each of these exists should move with the code.
   They're the ones worth keeping (see [10](10-dead-code-cleanup.md) on comment volume generally).

## Verification

This is a pure refactor — no behavior change. Re-run the offline scenarios PROGRESS.md already
documents as the regression suite for this area:

- Offline → add todos → reconnect → all land, in order, no flicker, survive a hard reload.
- Queue a subtask offline, delete its parent from another client while still offline, reconnect →
  notice fires, dead op dropped, queue left clean, other todos unaffected.
- Queue an op offline and **never dispatch an `online` event** → the 15s poll alone delivers it and
  clears the "Offline" pill.

Then the thing this refactor is actually for: mount two components that call `useList` for the same
list, and confirm exactly one flush loop runs.

## Done when

- [ ] Flush scheduling lives in `lib/outboxSync.ts`, no React imports
- [ ] N callers of `useList` produce exactly one flush loop
- [ ] `useList` is meaningfully shorter and single-purpose
- [ ] All three documented offline scenarios still pass
