# 10 — Delete unreachable API helpers, hello scaffold, stale comments

**Status:** done — dead code, hello scaffold, and stale comments (the mechanical parts). The
comment-volume calibration pass is deliberately left for its own separate diff, per this file's own
"do it as its own pass so the diff is reviewable" note.
**Size:** S
**Depends on:** —
**Source:** Staff review 2026-09-12

## Dead code

**[../apps/web/src/lib/api.ts](../apps/web/src/lib/api.ts)** — since mutations were routed through
`sendOp`, these are unreachable. Verified by grepping every call site outside the file itself; the
only survivors are `getLists`, `getList`, `createList`, `deleteList`.

- `updateList` ([:80](../apps/web/src/lib/api.ts)) — there is no rename-list UI
- `createTodo` ([:85](../apps/web/src/lib/api.ts))
- `updateTodo` ([:88](../apps/web/src/lib/api.ts))
- `deleteTodo` ([:94](../apps/web/src/lib/api.ts))
- `createSubTask` ([:97](../apps/web/src/lib/api.ts))
- `updateSubTask` ([:103](../apps/web/src/lib/api.ts))
- `deleteSubTask` ([:109](../apps/web/src/lib/api.ts))

~45 lines. Deleting `updateList` also orphans `UpdateListBody`'s only client-side consumer — keep
the schema (the server route uses it), just stop re-exporting types nothing imports.

**Hello-world scaffold**, left over from the initial deploy:

- `HelloResponse` — [../packages/shared/src/index.ts:3](../packages/shared/src/index.ts)
- `SOCKET_EVENTS.HELLO` — [../packages/shared/src/index.ts:9](../packages/shared/src/index.ts)
- `GET /api/hello` — [../apps/server/src/index.ts:33-36](../apps/server/src/index.ts)
- the `socket.emit(SOCKET_EVENTS.HELLO, ...)` on connect —
  [../apps/server/src/socket.ts:26-29](../apps/server/src/socket.ts)

Nothing in `apps/web` consumes any of it.

## Stale comments

**[../apps/web/src/lib/outbox.ts:5-6](../apps/web/src/lib/outbox.ts)** — "Not wired into any
mutation flow yet; that's the next step (optimistic updates + enqueue-on-mutate), and flushing
after that." All three of those shipped. The comment now actively misleads.

**[../apps/web/src/lib/outbox.ts:10](../apps/web/src/lib/outbox.ts)** — documents `path` as
`e.g. /api/lists/:listId/todos/:todoId`, but the code stores paths **without** the `/api` prefix
(`/lists/${listId}/todos` at [useList.ts:191](../apps/web/src/hooks/useList.ts)), because `request`
in `api.ts` adds it. The comment at
[api.ts:60-64](../apps/web/src/lib/api.ts) gets this right; the one in `outbox.ts` contradicts it.
Fix the wrong one.

## Comment volume — a judgement call, not a defect

~140 comment lines across 2,138 lines of source. A good share is changelog prose rather than
explanation: "Bug found and fixed along the way", "Belt-and-braces beyond the spec's two triggers",
"Not wired into any mutation flow yet".

That history is valuable and it's **already** captured in
[../PROGRESS.md](../PROGRESS.md) and in commit messages, which is where it belongs.

The load-bearing comments are different and should be kept verbatim — they stop a future reader
from "cleaning up" a deliberate choice:

- `networkMode: 'always'` and why — [useList.ts:162-167](../apps/web/src/hooks/useList.ts)
- `refetchOnReconnect: false` and the race it prevents — [useList.ts:37-42](../apps/web/src/hooks/useList.ts)
- not gating the flush on `connectionStatus` — [useList.ts:96-105](../apps/web/src/hooks/useList.ts)
- handler registration order in Fastify — [index.ts:19-21](../apps/server/src/index.ts)
- the outbox path-prefix convention — [api.ts:60-64](../apps/web/src/lib/api.ts)

**Suggested rule:** keep a comment if removing it could cause someone to make a mistake. Delete it
if it only records what happened. Applying that should roughly halve the count.

This is a calibration call, not a bug — an interviewer could read the current density either way.
Worth doing, but do it as its own pass so the diff is reviewable.

## Verification

`npm run build` at the root must stay clean (shared → web → server). That's sufficient for the
deletions — anything still referenced will fail to compile. Smoke-test the app once afterwards,
since removing the socket `hello` emit touches the connection path.

## Done when

- [ ] Unreachable `api.ts` helpers removed
- [ ] Hello scaffold removed from shared, server and socket handler
- [ ] `outbox.ts` comments corrected
- [ ] Comment pass applied using the keep/delete rule above
- [ ] Clean full build; app smoke-tested
