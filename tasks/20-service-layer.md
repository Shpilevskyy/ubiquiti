# 20 — Service layer between routes and Prisma

**Status:** parked — deliberately not scheduled, see "When to actually do this"
**Size:** L
**Depends on:** [04](04-route-scoping-and-conflict-check.md), [09](09-server-route-boilerplate.md),
[19](19-transaction-boundaries.md) — all three touch these handlers; restructuring first would mean
redoing them
**Source:** Architecture review 2026-09-14

## The observation

Each route handler currently owns: body validation, the 404 check, data access, serialization, **and
the realtime broadcast**. Five concerns in one function, repeated eight times.

Consequences visible in the code today:

- Tasks [04](04-route-scoping-and-conflict-check.md) and [09](09-server-route-boilerplate.md) both
  have to edit the same four functions for unrelated reasons.
- The broadcast is a separate step a route can simply forget — and one already did:
  `DELETE /todos/:todoId` broadcasts `todo:deleted` unconditionally without checking whether
  anything was deleted ([../apps/server/src/routes/todos.ts:99-106](../apps/server/src/routes/todos.ts)),
  unlike the list delete which does check `count`
  ([../apps/server/src/routes/lists.ts:89](../apps/server/src/routes/lists.ts)).
- There is nowhere natural to put a transaction boundary ([19](19-transaction-boundaries.md)).
- Mutation logic can't be tested without going through HTTP.

A thin `services/todos.ts` owning "apply this mutation and tell everyone about it" as one operation
would fix all four: the broadcast becomes a *consequence* of the write rather than a sibling step,
and the transaction gets an obvious home.

## When to actually do this

**Not now.** At three resources and ~300 lines of route code, adding a layer costs more indirection
than it removes duplication, and "add layers because layers are good" is a worse instinct than
living with a little repetition. [09](09-server-route-boilerplate.md) already removes most of the
*mechanical* duplication (the `clientId` cast, the validation blocks, the P2025 handling) without
restructuring anything.

Do it when any of these becomes true — these are the actual triggers, not vibes:

- **A fourth resource appears**, or any resource grows a second write path (e.g. a bulk reorder
  endpoint). The copy-paste cost crosses over here.
- **Auth/ownership lands.** Authorization checks scattered across eight handlers is how IDOR bugs
  happen — see [04](04-route-scoping-and-conflict-check.md)'s Bug 1, which is that shape already.
- **A mutation needs to happen from somewhere other than a route** — a scheduled job, a socket
  handler, a CLI, a seed script.
- **Server-side tests get written** ([DEFERRED.md](DEFERRED.md)) and mounting HTTP for every
  mutation test becomes annoying.

## Sketch, for whoever picks this up

```
services/
  todos.ts      createTodo(listId, input, clientId) -> { todo, hadConflict }
  subtasks.ts   ...
  lists.ts      ...
```

Each function: runs in a transaction, returns the serialized payload, and performs the broadcast
itself. Routes shrink to validate → call service → reply. The broadcaster is already decorated onto
the Fastify instance ([../apps/server/src/index.ts:29](../apps/server/src/index.ts)), so it would be
passed into the service rather than reached through `app`.

Keep it a *thin* layer: no repository abstraction over Prisma, no dependency-injection container.
Prisma is already the data-access layer; wrapping it again is the failure mode this task is most
likely to produce.

## Done when

Not scheduled. If picked up:

- [ ] Route handlers do validate → call → reply, nothing else
- [ ] Every mutation broadcasts from one place, impossible to forget
- [ ] Transactions live in the service layer
- [ ] No repository/DI abstraction introduced over Prisma
