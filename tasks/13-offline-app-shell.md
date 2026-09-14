# 13 — PWA app shell + query persistence so a cold offline load works

**Status:** in progress — piece 1 (app shell) landed, see PROGRESS.md; piece 2 (query
persistence) still to do
**Size:** L
**Depends on:** [06](06-offline-edge-cases.md) (the paused-query crash becomes far more reachable
once cold offline loads are possible — fix it first)
**Source:** Staff review 2026-09-12

## Why — this is the biggest architectural gap in the app

[../README.md](../README.md) user story: *"I as a user can keep editing the list even when I lose
internet connection, and can expect it to sync up with BE as I regain connection."*

The **write** half is fully built and genuinely good: IndexedDB outbox, optimistic updates,
FIFO flush with backoff, poll fallback for browsers that miss the `online` event.

The **read** half doesn't exist:

- [../apps/web/index.html](../apps/web/index.html) is a bare Vite shell — no service worker
  registration, no manifest
- no `persistQueryClient` / storage persister anywhere; the TanStack cache is memory-only

So: **reload while offline and the app is gone.** The HTML itself fails to fetch. The user's queued
operations are sitting safely in IndexedDB with no way to reach them, and no indication they exist.

The story currently holds only for a tab that was already open and stays open. That's a meaningful
chunk of a headline requirement, and it's conspicuous precisely *because* the harder half was built
so carefully.

## What to do

Two independent pieces. They can ship as separate diffs — do the shell first, since query
persistence is useless without it.

1. **App shell** — `vite-plugin-pwa` in
   [../apps/web/vite.config.ts](../apps/web/vite.config.ts). Precache the built JS/CSS/HTML so a
   cold load works with no network. Add a web app manifest.

   Be careful with the navigation fallback: in production the server serves `index.html` for
   unmatched non-`/api` GETs via
   [errorHandler.ts:5](../apps/server/src/errorHandler.ts). The service worker's own fallback has
   to agree with that, and must **not** intercept `/api` or `/socket.io` requests — swallowing
   socket traffic in a service worker would break realtime in ways that are miserable to debug.

2. **Query persistence** — `@tanstack/query-sync-storage-persister` + `persistQueryClient`, wired
   at [../apps/web/src/App.tsx](../apps/web/src/App.tsx) where the `QueryClient` is created.
   Persist the `['list', listId]` and `['lists']` queries so the page renders from cache instantly
   on a cold offline start.

   Decide and record: `localStorage` (simple, synchronous, ~5MB) vs IndexedDB (already in use for
   the outbox, async, no practical size limit). Either is defensible; note the choice in
   PROGRESS.md.

## Interactions to get right

- **Persisted cache + pending outbox ops must not disagree.** On boot, the persisted cache reflects
  optimistic state that may include ops still queued. The flush replays them; the server is
  authoritative afterwards. Make sure the post-flush `invalidate()` reconciles, and that a replayed
  op doesn't double-apply. Client-generated ids make creates idempotent
  ([todos.ts:25-31](../apps/server/src/routes/todos.ts)), which is what makes this safe — don't
  regress that.
- **Service worker update strategy.** A stale precached shell serving against a newer API is a real
  hazard. Prefer auto-update with a reload prompt over silent long-lived caching.
- **Dev ergonomics.** Service workers make local development confusing. Keep it disabled in dev
  (`devOptions.enabled: false`) unless actively testing it.

## Verification

The real test is the one that fails today:

- Load the list, go **fully offline** (devtools offline, or actually disable Wi-Fi), add a todo,
  then **hard reload**. The app must load, show the list from cache including the offline todo, and
  show the "Offline" pill.
- Reconnect. The queued todo lands on the server, in order, without a flicker.
- Kill the tab entirely while offline, reopen it offline, confirm the same.
- Confirm realtime still works when online — this is where a mis-scoped service worker breaks
  things. Two tabs, mutate in one, confirm live update in the other.
- Confirm a deploy with changed assets doesn't leave a client stuck on the old shell indefinitely.

## Done when

- [ ] Cold offline load renders the app and the cached list
- [ ] Offline-created todos visible after a hard reload, and still sync on reconnect
- [ ] Service worker does not intercept `/api` or `/socket.io`
- [ ] Realtime verified unaffected
- [ ] Update strategy handles a redeploy
- [ ] Storage choice recorded in PROGRESS.md Decisions
