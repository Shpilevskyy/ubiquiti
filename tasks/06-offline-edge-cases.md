# 06 — Paused-query crash, `deleteList` while offline, toast timers

**Status:** not started
**Size:** S
**Depends on:** —
**Source:** Staff review 2026-09-12

Three small independent fixes, all in the offline/UX seam. Together they're a short diff.

## Bug 1 — `ListPage` crashes when the list query is paused

[../apps/web/src/hooks/useList.ts:30-43](../apps/web/src/hooks/useList.ts) and
[../apps/web/src/pages/ListPage.tsx:33-50](../apps/web/src/pages/ListPage.tsx)

The list query is the one network call **not** covered by the deliberate `networkMode: 'always'`
decision — that's applied only to mutations, via `OFFLINE_AWARE` at
[:168](../apps/web/src/hooks/useList.ts). So the query uses the default `'online'` and, when
TanStack's `onlineManager` believes the browser is offline, it **pauses**: `fetchStatus` is
`'paused'`, so `isFetching` is false, so `isLoading` (which is `isPending && isFetching`) is false.

`isError` is also false. Which means both guards at
[ListPage.tsx:33](../apps/web/src/pages/ListPage.tsx) and
[:40](../apps/web/src/pages/ListPage.tsx) fall through to:

```ts
const { list, todos } = listQuery.data!;   // data is undefined -> TypeError -> white screen
```

Reachable window is narrow today (needs the shell already loaded with the query still unresolved
when connectivity drops — a bfcache restore or a flaky load), and it becomes much wider once
[13](13-offline-app-shell.md) makes cold offline loads possible at all. Fix it now regardless; it's
two lines and it's an unhandled crash.

**Fix:**
- Decide explicitly what the list query should do offline and set `networkMode` on it accordingly,
  rather than leaving it on a default that contradicts the mutation config. `'always'` is the
  consistent choice: let it attempt, fail, and land in the existing error branch.
- Independently, make `ListPage` defensive: handle `!listQuery.data` explicitly instead of
  asserting with `!`. A non-null assertion on query data is never safe across all of TanStack's
  states.

## Bug 2 — "Delete list" hangs forever when offline

[../apps/web/src/hooks/useList.ts:384-390](../apps/web/src/hooks/useList.ts)

`deleteList` is the one mutation without `...OFFLINE_AWARE`. The inline comment says "Requires
being online, same as before" — but the actual behavior of the default `networkMode: 'online'` is
not "fails", it's **pauses**. So offline:

- `isPending` stays true → the button at
  [ListPage.tsx:100](../apps/web/src/pages/ListPage.tsx) stays disabled indefinitely
- nothing tells the user anything
- the delete silently fires whenever TanStack decides it's online again — a destructive,
  irreversible, `confirm()`-gated action executing long after the user gave up on it

**Fix:** if the intent really is online-only (reasonable — `List` has no `version` column and sits
outside the conflict model), make it *fail fast*: check `connectionStatus.getStatus()` before
firing and show "Can't delete while offline" via the existing notice mechanism. Do not leave a
destructive action queued in a paused state the user can't see.

## Bug 3 — notice timers stomp each other

[../apps/web/src/hooks/useList.ts:47-50](../apps/web/src/hooks/useList.ts)

```ts
const showNotice = (message: string) => {
  setNotice(message);
  window.setTimeout(() => setNotice(null), 4000);
};
```

No handle is kept. A second notice at t=3s is cleared by the *first* notice's timer at t=4s, so it
shows for one second. Nothing is cleared on unmount either.

**Fix:** keep the timeout id in a ref, clear it before setting a new one, and clear it on unmount.
Or adopt a toast library and delete this — see [12](12-tooling-lint-ci.md) for the `sonner`
suggestion; it handles queuing, stacking, and dismissal properly and this hand-rolled version will
keep accruing bugs.

## Verification

- Bug 1: with the page loaded, use devtools to go offline and force the list query to refetch from
  a pending state. Confirm you get the error branch, not a blank screen. Also confirm the normal
  online load path is unchanged.
- Bug 2: go offline, click "Delete list", confirm the dialog. You should get an immediate message
  and a re-enabled button — not a stuck spinner, and critically not a delete that fires minutes
  later on reconnect.
- Bug 3: trigger two notices ~1s apart (easiest: two conflicting PATCHes). The second must display
  for its full duration.

## Done when

- [ ] `ListPage` cannot crash on undefined query data in any TanStack state
- [ ] List query's `networkMode` is set deliberately, consistent with the mutations
- [ ] `deleteList` fails fast offline instead of pausing invisibly
- [ ] Overlapping notices each display for their full duration; timers cleared on unmount
