# 14 — Graceful shutdown, rate limit, helmet, body cap, real healthz, pagination

**Status:** not started
**Size:** M
**Depends on:** —
**Source:** Staff review 2026-09-12

Production-readiness gaps on a **public, unauthenticated, internet-facing** API. Each is small;
grouped because they're all `index.ts` plus a plugin registration. Split into two diffs if it gets
long.

## 1 — No graceful shutdown

[../apps/server/src/index.ts:49-51](../apps/server/src/index.ts) calls `app.listen()` and that's
it. Nothing handles `SIGTERM`.

Render sends `SIGTERM` on **every deploy**, and this app auto-deploys on push. So every deploy kills
in-flight requests and open WebSocket connections abruptly, and Prisma's pool is never drained.

**Fix:** `SIGTERM`/`SIGINT` handlers calling `io.close()`, `app.close()` and
`prisma.$disconnect()`, with a timeout so a hung connection can't block shutdown forever.

## 2 — No rate limiting, no security headers, no body cap

Anyone can create unlimited lists, and `POST /api/lists` has no size limit on `title`.

**Fix:** `@fastify/rate-limit` and `@fastify/helmet`. Set Fastify's `bodyLimit` well below the
default 1MB — the largest legitimate payload here is a markdown description.

Note `@fastify/helmet`'s CSP defaults may conflict with the Vite-built assets served by
`@fastify/static` in production, and with the Socket.IO connection. Test the production build, not
just dev.

**Also:** `Socket.IO` accepts `list:join` for any list id with no authorization at all
([socket.ts:31-38](../apps/server/src/socket.ts)). That's consistent with the deliberate
"lists are public" decision in PROGRESS.md, so it's not a bug — but there's no connection limit
either, and presence state is unbounded per-list memory. A cap is worth adding.

## 3 — `/healthz` doesn't check the database

[../apps/server/src/index.ts:31](../apps/server/src/index.ts) returns the string `'ok'`
unconditionally, so it reports healthy while Postgres is unreachable.

**Fix:** `await prisma.$queryRaw\`SELECT 1\`` with a short timeout; 503 on failure. Keep it cheap —
this gets polled.

Relevant context: the Render Postgres is on the free tier and **expires 30 days after creation**
(PROGRESS.md Environment). A healthz that actually checks the DB is what would surface that rather
than letting the app appear fine while every request 500s.

## 4 — `GET /api/lists` is unbounded

[../apps/server/src/routes/lists.ts:29-33](../apps/server/src/routes/lists.ts) returns **every list
ever created**, unpaginated, to the landing page. Since lists are publicly creatable with no
ownership, this grows without limit and is trivially abusable.

**Fix:** cursor or offset pagination with a sane default (say 50). `LandingPage` shows it under an
"Existing lists" heading — a capped list plus "show more" is fine; it doesn't need infinite scroll.

## Verification

- Send `SIGTERM` to the local server mid-request; the request completes and the process exits
  cleanly rather than dropping the connection.
- Exceed the rate limit; confirm a 429 **in the unified `{ error: { code, message } }` shape** from
  [../specs/03-api-rest.md](../specs/03-api-rest.md#error-shape) — plugins that ship their own
  error serializer will break that silently.
- POST an oversized body; confirm 413, also in the unified shape.
- Stop Postgres (`docker compose stop postgres`); confirm `/healthz` returns 503 and recovers when
  it's back.
- Create enough lists to page; confirm the landing page and the API both behave.
- **Full production-mode smoke test** (`NODE_ENV=production`, built assets) — helmet's CSP is the
  most likely thing to break, and only in production where static files are served.

## Done when

- [ ] Clean shutdown on SIGTERM/SIGINT, sockets and Prisma closed
- [ ] Rate limiting, security headers and a body cap in place
- [ ] All new error paths return the unified error shape
- [ ] `/healthz` reflects real database reachability
- [ ] `GET /api/lists` paginated
- [ ] Production build verified, including static assets and realtime
