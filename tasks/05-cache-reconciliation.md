# 05 — Stop per-mutation full-list refetch clobbering optimistic state

**Status:** done — see PROGRESS.md Completed
**Size:** M
**Depends on:** —
**Source:** Staff review 2026-09-12

## Why

[../apps/web/src/hooks/useList.ts:83](../apps/web/src/hooks/useList.ts) — every successful mutation
calls `invalidate()`, and `mutateWithOutbox` never calls `cancelQueries` before applying its
optimistic update at [:73](../apps/web/src/hooks/useList.ts).

That's the exact scenario TanStack Query's `cancelQueries` exists to prevent. Failure:

1. Toggle todo A → optimistic write → PATCH sent → success → `invalidate()` → refetch starts.
2. User toggles todo B → optimistic write lands in the cache.
3. A's refetch resolves with a server snapshot taken **before** B's PATCH landed, and replaces the
   whole `GetListResponse` — including B's cell.
4. B visually reverts, then flips back when B's own `invalidate()` resolves.

Visible flicker, and it gets more likely the faster the user works.

There's a second, independent cost: **every mutation refetches the entire list.** A checkbox toggle
currently costs two IndexedDB writes plus a full `GET /api/lists/:listId`. That's a lot of work for
one boolean, and it scales with list size rather than with the size of the change.

## What to do

1. `await queryClient.cancelQueries({ queryKey })` at the top of `mutateWithOutbox`, before
   `setQueryData`. This is the canonical fix and is sufficient on its own for the flicker.

2. Replace the blanket refetch with a targeted cache write. The server already returns the full
   updated row:
   - `POST /todos` → `{ todo }`
   - `PATCH /todos/:id` → `{ todo, hadConflict }`
   - `POST /subtasks` → `{ subtask }`
   - `PATCH /subtasks/:id` → `{ subtask, hadConflict }`

   So on success, `setQueryData` the returned row into place (replacing the optimistic guess with
   real `version`/`updatedAt`) instead of calling `invalidate()`. DELETE returns 204 and has no
   body — the optimistic removal is already correct, so it needs no reconciliation at all.

   This makes reconciliation O(change) instead of O(list), and removes the race at its source
   rather than just papering it.

3. Keep the `invalidate()` calls in `flushOutbox`. After replaying a backlog a full resync is
   genuinely the right call — the optimistic state may be many operations stale.

   **Critical:** as of 2026-09-14 `flushOutbox` also takes a `reconcile` flag, passed on reconnect,
   that forces the closing `invalidate()` even when the queue was empty. That is now the *only*
   thing repairing broadcasts missed while the socket was down. Removing per-mutation invalidates
   is fine; removing that one silently reintroduces permanent staleness after any network blip.

## Related, decide and record

`flushOutbox` ignores `sendOp`'s response entirely ([:118](../apps/web/src/hooks/useList.ts)), so
a queued PATCH that comes back with `hadConflict: true` never surfaces the toast. A reconnect that
clobbers a collaborator's edit is silent.

That's arguably fine — the user is reconnecting after an offline stretch, and a toast per clobbered
op could be noisy — but right now it's an undocumented hole rather than a stated tradeoff. Either
surface a single aggregated notice ("Some changes were also edited elsewhere") after a flush, or
write the decision into PROGRESS.md's Decisions section. Don't leave it implicit.

## Verification

- Rapidly toggle several different todos (and subtasks) in succession. No cell should flicker or
  momentarily revert. Before the fix this is reproducible with fast clicking; use the network
  throttle to widen the window if needed.
- Confirm the network tab shows **no** full list GET after a single toggle — only the PATCH.
- Confirm `version` still advances correctly after a mutation (the reconciled row must come from
  the response, not the optimistic guess) — the socket ordering guard in `useListSocket` compares
  `version`, so a cache left holding a stale one will start dropping legitimate realtime updates.
- Offline → queue several ops → reconnect: the post-flush `invalidate()` must still fire and the
  final state must match the server.

## Done when

- [x] `cancelQueries` precedes every optimistic write
- [x] Single-mutation success reconciles from the response, not a full refetch
- [x] Post-flush full invalidate retained
- [x] `version` stays correct after mutations (no false conflict toasts)
- [x] Flush-time conflict signal either surfaced or documented as deliberately dropped
