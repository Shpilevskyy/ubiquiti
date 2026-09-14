# 21 — Record the realtime transport decision (Socket.IO vs. SSE)

**Status:** done, see specs/01-architecture.md
**Size:** XS — documentation only, no code
**Depends on:** —
**Source:** Architecture review 2026-09-14

## Why this exists

[../specs/01-architecture.md](../specs/01-architecture.md) justifies Socket.IO as "rooms API fits
per-list broadcast, handles reconnection." True, but it doesn't address the obvious alternative,
and this is a likely interview question because **almost all the realtime traffic is one-way**.

Server → client: `list:updated`, `todo:*`, `subtask:*`, `presence:update` — seven of the eight
events ([../specs/04-realtime-protocol.md](../specs/04-realtime-protocol.md)).
Client → server: only `list:join` / `list:leave`.

Server-Sent Events would give: browser-native auto-reconnect (no client library at all), a smaller
bundle, and better behaviour through restrictive proxies. `list:join` could be a query parameter on
the `EventSource` URL, and `list:leave` is implicit on disconnect.

## The decision

**Keep Socket.IO.** The honest justification:

- Presence genuinely needs client→server identity at join time, and needs the server to notice
  disconnects to evict members — Socket.IO gives connection lifecycle events for free, whereas with
  SSE you'd be inferring liveness from a dropped response stream.
- The rooms API is the per-list fan-out, already written and working
  ([../apps/server/src/socket.ts](../apps/server/src/socket.ts)); with SSE you'd hand-roll the
  subscriber registry.
- Socket.IO's reconnection is load-bearing for the offline layer — `connectionStatus` is fed by its
  `connect`/`disconnect` events ([../apps/web/src/lib/connectionStatus.ts](../apps/web/src/lib/connectionStatus.ts)).

The cost accepted: a client bundle (the app's JS is already ~650 kB, flagged by the Vite build) and
a protocol that some corporate proxies handle worse than plain SSE.

## What to do

Add a row or short paragraph to specs/01's tech-stack table capturing the alternative considered and
the three reasons above. That's the whole task — this is about being able to defend the choice, not
about changing it.

## Done when

- [x] specs/01 records SSE as the considered alternative, why Socket.IO won, and the accepted cost
