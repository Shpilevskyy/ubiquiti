# 03 — REST API

## Design decision: REST is the single write path

All mutations — whether coming from a live, connected client or replayed from an offline
client's outbox — go through the same REST endpoints. The server persists the change, then
pushes a Socket.IO broadcast to the list's room (see
[04-realtime-protocol.md](04-realtime-protocol.md)).

Rejected alternative: accepting mutations directly over the socket. That would mean two code
paths implementing the same validation/persistence logic (REST handlers + socket handlers) for
no real benefit here, and it would give the offline outbox a second protocol to replay against.
One write path is simpler to reason about and to test (plain HTTP, `supertest`-friendly).

## Idempotency via client-generated ids

Todo and SubTask ids are generated client-side (`crypto.randomUUID()`) at creation time and sent
in the request body/path. This makes retries naturally safe without a separate idempotency-key
ledger:
- **Create** = upsert by id (if the id already exists, treat as a no-op success — handles the
  outbox retrying a create whose response was lost).
- **Update** (PATCH) = idempotent by construction (same payload → same resulting row).
- **Delete** = idempotent (deleting an already-deleted id returns success, not 404).

This matters most for [06-offline-sync.md](06-offline-sync.md), where the outbox may replay an
operation more than once if a response was lost mid-flight.

## Endpoints

All under `/api`.

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/lists` | `{ title }` | `{ list }` | server generates `list.id` |
| GET | `/lists/:listId` | — | `{ list, todos: [{...todo, subtasks: [...]}] }` | full hydration payload; 404 if not found |
| PATCH | `/lists/:listId` | `{ title? }` | `{ list }` | rename |
| POST | `/lists/:listId/todos` | `{ id, title, position, costCents?, descriptionMd? }` | `{ todo }` | id is client-generated; upsert semantics |
| PATCH | `/lists/:listId/todos/:todoId` | any subset of `{ title, done, position, costCents, descriptionMd }` | `{ todo }` | partial update |
| DELETE | `/lists/:listId/todos/:todoId` | — | `204` | idempotent |
| POST | `/lists/:listId/todos/:todoId/subtasks` | `{ id, title, position, costCents? }` | `{ subtask }` | upsert semantics |
| PATCH | `/lists/:listId/todos/:todoId/subtasks/:subtaskId` | any subset of `{ title, done, position, costCents }` | `{ subtask }` | partial update |
| DELETE | `/lists/:listId/todos/:todoId/subtasks/:subtaskId` | — | `204` | idempotent |
| GET | `/healthz` | — | `200 ok` | deploy health check, see [12-deployment.md](12-deployment.md) |

Request/response bodies are typed in `packages/shared` and validated server-side with `zod`
(Fastify schema validation).

## Error shape

```ts
{ error: { code: string; message: string } }
```

Standard HTTP status codes (400 validation, 404 not found, 409 reserved but unused — see
[05-sync-conflict-resolution.md](05-sync-conflict-resolution.md) for why we don't reject
conflicting writes, 500 unexpected).

## Reordering

There is no dedicated batch-reorder endpoint. Moving one item only ever changes that item's
`position` (see [08-drag-and-drop.md](08-drag-and-drop.md)), so a single `PATCH` with the new
`position` value is sufficient.
