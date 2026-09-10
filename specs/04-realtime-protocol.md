# 04 — Realtime Protocol

## Role of Socket.IO: broadcast only, not a write path

Per [03-api-rest.md](03-api-rest.md), all writes go through REST. Socket.IO is used purely to
push "something changed" notifications to everyone else viewing the same list, and for
lightweight presence. This keeps the realtime layer small and testable in isolation from
mutation logic.

## Rooms

One room per list: `list:{listId}`. A client joins when it opens `/list/:id` and leaves when it
navigates away/closes the tab (Socket.IO handles the leave-on-disconnect automatically).

## Client → server events

| Event | Payload | Effect |
|---|---|---|
| `list:join` | `{ listId, member: { id, name, color } }` | joins the room, adds member to in-memory presence map for that room, broadcasts `presence:update` to the room |
| `list:leave` | `{ listId }` | explicit leave (also happens implicitly on disconnect) |

`member.id` is a per-browser-tab id generated client-side and persisted in `sessionStorage` (see
[10-sharing-and-presence.md](10-sharing-and-presence.md)) — not a user account.

## Server → client events

Fired after the corresponding REST call commits to the database. Broadcast to the room via
`socket.to(room).emit(...)` — **excluding the socket that made the underlying REST call**, since
that client already has the authoritative response from its own `fetch`. This avoids each client
having to de-dupe "my own echoed change."

| Event | Payload |
|---|---|
| `list:updated` | `{ list }` |
| `todo:created` | `{ todo }` |
| `todo:updated` | `{ todo }` |
| `todo:deleted` | `{ todoId }` |
| `subtask:created` | `{ todoId, subtask }` |
| `subtask:updated` | `{ todoId, subtask }` |
| `subtask:deleted` | `{ todoId, subtaskId }` |
| `presence:update` | `{ members: [{ id, name, color }] }` |

## Client-side handling

A `useListSocket(listId)` hook (see [07-frontend-architecture.md](07-frontend-architecture.md))
subscribes to these events and applies them to the TanStack Query cache for `['list', listId]`
via targeted `setQueryData` updates (not a full refetch, to keep collaboration feeling instant).

## Connecting the mutation's REST id to the socket

Associating a REST call with "which socket made it" is done by having the client send its
`member.id` as a header (`X-Client-Id`) on every mutation request; the server stores
`socketId ↔ member.id` from the `list:join` payload and excludes that member's socket(s) from
the broadcast for that mutation.

## Presence data lifetime

Presence (who's currently viewing a list) is **in-memory only** on the server (a
`Map<listId, Map<memberId, {name, color}>>`), not persisted — it's inherently ephemeral and
resets on server restart, which is fine since clients re-`list:join` on reconnect.

## Reconnection

Socket.IO's built-in reconnection (exponential backoff) is used as-is. On `connect` (including
reconnects), the client re-emits `list:join` for the currently open list. A reconnect is also one
of the signals the offline-sync layer uses to trigger outbox flushing — see
[06-offline-sync.md](06-offline-sync.md).
