# 22 — Redis adapter for multi-instance realtime

**Status:** parked — single instance today, see "When to actually do this"
**Size:** M
**Depends on:** —
**Source:** Architecture review 2026-09-14

## The observation

Two pieces of realtime state live **in the memory of one Node process**, and both break the moment
a second instance exists:

1. **Socket.IO rooms.** `io.to(listRoom(listId)).emit(...)`
   ([../apps/server/src/socket.ts:60](../apps/server/src/socket.ts)) only reaches sockets connected
   to *this* process. Two users on the same list, load-balanced to different instances, stop seeing
   each other's changes entirely — the headline feature silently dies.

2. **`PresenceStore`** ([../apps/server/src/presence.ts](../apps/server/src/presence.ts)) is three
   in-memory `Map`s. Each instance would show only the members connected to itself, so the avatar
   row shows a subset of who's actually there.

It's worth being precise that these are *two* problems. The Redis adapter fixes rooms — broadcasts
cross instances — but **presence is separate state and does not come along for free.** A common
mistake is adding the adapter, seeing realtime work, and shipping with presence still fragmented.

Also affected but less obvious: `broadcastToList`'s exclusion of the originating client
([../apps/server/src/socket.ts:58-61](../apps/server/src/socket.ts)) depends on
`presence.getSocketIds(memberId)`, which only knows about local sockets. With multiple instances a
client could receive the echo of its own mutation — harmless-ish given the version guard in
`useListSocket`, but it would defeat the design's stated reason for the exclusion
([../specs/04-realtime-protocol.md](../specs/04-realtime-protocol.md#connecting-the-mutations-rest-id-to-the-socket)).

## When to actually do this

**Not now.** The app runs as a single Render web service on the free tier
([../specs/12-deployment.md](../specs/12-deployment.md)), which is one instance. Adding Redis means
another managed service, another connection string, another failure mode, and another thing that can
expire on a free tier — for zero benefit at one instance.

Triggers:

- Scaling past one instance (autoscaling, or a paid plan with >1 worker)
- Any zero-downtime deploy strategy that runs two instances concurrently during a rollover
- Moving to a platform that runs multiple processes by default

## What to do, when it's time

1. `@socket.io/redis-adapter` + a Redis instance; `io.adapter(createAdapter(pubClient, subClient))`.
   Rooms then fan out across instances with no change to
   [../apps/server/src/routes/](../apps/server/src/routes/).

2. **Presence must move too.** Either back `PresenceStore` with Redis (a hash per list, plus the
   member→socket index used for broadcast exclusion), or derive presence from Socket.IO's own
   cross-instance room membership via `io.in(room).fetchSockets()` and drop the bespoke store.
   The second is less code but makes presence a query rather than a push, so `presence:update`
   broadcasts need rethinking.

   Note the store's current lifecycle assumption — "resets on restart, which is fine since clients
   re-join on reconnect" ([../apps/server/src/presence.ts:8-9](../apps/server/src/presence.ts)) —
   stops being true once state is shared: a restarted instance no longer clears its own members,
   so stale presence entries need TTLs or explicit eviction.

3. Sticky sessions are **not** required with the Redis adapter, but Socket.IO's HTTP long-polling
   fallback does need them if polling is reachable. Either force `transports: ['websocket']` or
   enable session affinity at the load balancer — pick one deliberately.

## Interim: document the limit

Until this is done, add a line to PROGRESS.md's Environment section stating that the deployment is
single-instance **by requirement, not by accident**, and that realtime and presence both assume it.
That's the cheap part of this task and it's worth doing now — it turns an unexamined constraint into
a known one.

## Done when

Not scheduled. Interim step:

- [ ] PROGRESS.md records the single-instance requirement and why

If picked up:

- [ ] Broadcasts reach clients on other instances
- [ ] Presence reflects all instances, with stale-entry eviction
- [ ] Originating-client exclusion still works cross-instance
- [ ] Transport/affinity decision made explicitly
