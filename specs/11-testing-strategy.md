# 11 — Testing Strategy

Goal: cover the logic that's actually easy to get subtly wrong, not exhaustive CRUD coverage.
Priority order below reflects where bugs are most likely and least obvious.

**Sequencing:** written last, as Phase 6, once the full feature set in
[00-overview.md](00-overview.md) is functionally working end-to-end — not incrementally
alongside each feature phase. This is a deliberate choice for a time-boxed assignment: a working
app beats a partially-tested one if time runs short.

## Backend (`apps/server`) — Vitest + Supertest

1. **Position/reordering math** (unit) — midpoint calculation, start/end insertion, the
   epsilon-triggered re-index fallback. See [08-drag-and-drop.md](08-drag-and-drop.md).
2. **Idempotent create/update/delete** (integration, against a test Postgres) — POSTing the same
   client-generated id twice doesn't create a duplicate; PATCHing twice with the same body is a
   no-op; DELETEing twice doesn't error. See [03-api-rest.md](03-api-rest.md).
3. **Version/conflict signaling** (integration) — a PATCH with a stale `baseVersion` still
   succeeds and returns `hadConflict: true`; a PATCH with a current `baseVersion` doesn't. See
   [05-sync-conflict-resolution.md](05-sync-conflict-resolution.md).
4. **Realtime broadcast** (integration, using `socket.io-client`) — a REST mutation from one
   connected client results in the expected event on another client's socket in the same room,
   and is *not* delivered back to the originating client.
5. Standard CRUD happy-path coverage for the remaining endpoints, lighter-touch.

Test DB: a real Postgres (docker-compose service), migrated fresh per test run; not mocked, since
the interesting bugs here are exactly the kind an ORM mock would hide.

## Frontend (`apps/web`) — Vitest + React Testing Library

1. **Outbox behavior** (unit, with a fake IndexedDB / mocked `idb-keyval`) — an op queued while
   "offline" is retried on reconnect, in order, and removed on success. See
   [06-offline-sync.md](06-offline-sync.md).
2. **Optimistic update + reconciliation** — toggling "done" updates the UI instantly and doesn't
   flicker/revert when the (mocked) server response arrives.
3. **DescriptionEditor** edit/view toggle, including the "don't clobber active edit on incoming
   socket update" behavior from [09-markdown-descriptions.md](09-markdown-descriptions.md).
4. Component-level tests for `TodoItem`, `SubtaskProgress`, `AddTodoForm` — standard
   render/interact/assert.

API and socket layers are mocked at the `lib/api.ts` / `lib/socket.ts` boundary for frontend
tests, so they run fast and don't need a live server.

## End-to-end (stretch goal, only if time allows)

One Playwright test with two browser contexts on the same list, asserting an edit in one appears
in the other (validates the realtime path end-to-end, not just unit-level broadcast logic). A
second test toggling network conditions (route interception) to exercise the offline → reconnect
→ sync flow. These are explicitly "nice to have" — cut first if time is short, since the unit/
integration tests above already cover the risky logic.

## CI

Not required for the assignment, but if time allows: a GitHub Actions workflow running
typecheck + lint + both test suites on push, using a Postgres service container. See
[12-deployment.md](12-deployment.md).
