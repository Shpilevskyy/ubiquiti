# 09 — `request.clientId`, schema-driven validation, central P2025 handling

**Status:** in progress — items 1 (`request.clientId`) and 3 (central P2025 + status→code mapping)
done; item 2 (schema-driven validation via `fastify-type-provider-zod`, incl. uuid param
validation) still to come, as its own follow-up diff given it's the riskiest part.
**Size:** M
**Depends on:** [04](04-route-scoping-and-conflict-check.md) (that task rewrites these same
handlers; do the correctness work first, then clean up around it)
**Source:** Staff review 2026-09-12

## Why

Three patterns repeat across the eight route handlers in
[lists.ts](../apps/server/src/routes/lists.ts), [todos.ts](../apps/server/src/routes/todos.ts) and
[subtasks.ts](../apps/server/src/routes/subtasks.ts):

1. `request.headers[CLIENT_ID_HEADER] as string | undefined` — **8 occurrences**, identical cast
   every time.
2. Hand-rolled `Schema.safeParse(request.body)` followed by a manual 400 — **8 occurrences**,
   identical five-line block every time.
3. `err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'` → 404 — **3
   occurrences**.

And a real gap hiding behind (2): **route params are never validated.** `listId`, `todoId` and
`subtaskId` are typed as `string` via the generic parameter and passed straight to Prisma. Nothing
checks they're uuids. The body schemas are rigorous; the params get nothing.

## What to do

1. **`request.clientId`.** An `onRequest` hook plus a `decorateRequest`, with the type added to
   [../apps/server/src/types/fastify.d.ts](../apps/server/src/types/fastify.d.ts) next to the
   existing `broadcaster` declaration. Eliminates all 8 casts and gives one place to change if the
   header convention ever moves.

2. **Schema-driven validation** via `fastify-type-provider-zod`. The zod schemas already exist in
   [../packages/shared/src/index.ts](../packages/shared/src/index.ts) — this makes Fastify use them
   as route schemas directly, so you get:
   - automatic 400s, funnelled through the existing error handler so the
     `{ error: { code, message } }` shape from
     [../specs/03-api-rest.md](../specs/03-api-rest.md#error-shape) is preserved — **verify this
     explicitly, it's the main risk of this change**
   - typed `request.body` and `request.params` with no generic parameters on the route
   - params validation, which closes the gap above

   Add `z.object({ listId: z.uuid() })`-style param schemas to `packages/shared` alongside the body
   schemas.

3. **Central P2025 handling.** Move the `PrismaClientKnownRequestError` / P2025 → 404 mapping into
   [../apps/server/src/errorHandler.ts](../apps/server/src/errorHandler.ts) and delete the three
   try/catch blocks. Note the current handler maps *every* non-5xx to `code: 'bad_request'`
   ([errorHandler.ts:19](../apps/server/src/errorHandler.ts)) — a 404 or 413 surfacing as
   `bad_request` is wrong. Map status → code properly while you're in there.

## Watch out for

- The error shape is specced and was deliberately unified across *all* paths including malformed
  JSON and unmatched routes (see PROGRESS.md). Any validation library that ships its own error
  serializer will break that silently. Re-test the malformed-JSON and unknown-route cases.
- `registerErrorHandling` must keep running before any routes are registered — Fastify bakes the
  current handlers into each route's context at registration time. The comment at
  [index.ts:19-21](../apps/server/src/index.ts) explains this; don't reorder it.

## Verification

- Every existing endpoint still returns identical status codes and bodies. curl each one.
- Malformed JSON body → the unified error shape, not Fastify's default.
- Unknown route → unified shape (and in production, the SPA fallback still works for non-`/api`
  GETs — see [errorHandler.ts:5](../apps/server/src/errorHandler.ts)).
- Invalid body → 400 in the unified shape.
- **New:** non-uuid `listId` → 400, not a Prisma error or a silent miss.
- Realtime still excludes the originating client (proves `request.clientId` is wired correctly):
  two tabs, mutate in one, confirm the other updates and the originator doesn't double-apply.

## Done when

- [ ] Zero `request.headers[CLIENT_ID_HEADER]` casts remain
- [ ] Body and param validation are declarative
- [ ] Non-uuid path params are rejected with 400
- [ ] P2025 handled in one place
- [ ] Error codes reflect actual status, not blanket `bad_request`
- [ ] Unified error shape verified on all paths, including malformed JSON and unknown routes
