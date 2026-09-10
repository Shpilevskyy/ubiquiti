# 01 — Architecture

## Repo layout

npm workspaces monorepo (no extra tooling like pnpm/turborepo needed at this scale — a reviewer
should be able to `npm install && npm run dev` from the root):

```
/
├── apps/
│   ├── web/        # React + Vite + TS frontend
│   └── server/      # Node + TS backend (Fastify + Socket.IO)
├── packages/
│   └── shared/       # Shared TS types, zod schemas, socket event contracts
├── specs/            # this directory
└── package.json       # workspaces root
```

`packages/shared` exists so the REST/WS payload shapes are defined once and imported by both
apps — avoids drift between client and server types without needing codegen.

## System diagram

```
┌─────────────────────┐        HTTPS (REST)        ┌───────────────────────────┐
│                      │ ──────────────────────────▶│                           │
│   React SPA (web)    │                             │   Fastify server (Node)  │
│                      │ ◀────────WebSocket──────────│   + Socket.IO            │
└──────────┬───────────┘   (realtime sync, rooms      └─────────────┬─────────────┘
           │                per list id)                            │
           │                                                        │ Prisma
     localStorage /                                                  ▼
     IndexedDB (offline                                    ┌──────────────────┐
     outbox + last-known                                    │   PostgreSQL     │
     list state)                                            └──────────────────┘
```

- One Node process serves the built React static assets, the REST API, and the WebSocket
  endpoint — same origin, no CORS/deploy-topology complexity.
- A "list" (todo list) is the unit of persistence, sharing, and realtime collaboration — see
  [02-data-model.md](02-data-model.md).
- Each connected client joins a Socket.IO room named by the list id when viewing that list; the
  server is the source of truth and broadcasts accepted mutations to the room — see
  [04-realtime-protocol.md](04-realtime-protocol.md).

## Tech stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript everywhere | assignment requirement |
| Frontend framework | React + Vite | assignment requirement; Vite for fast dev/build |
| Backend framework | Fastify | TS-first, built-in schema validation, lighter than Nest, more structured than bare Express |
| Realtime transport | Socket.IO | rooms API fits per-list broadcast, handles reconnection — we still write the broadcast/merge logic ourselves |
| Database | PostgreSQL | relational fit for lists/todos/subtasks, realistic "production" choice, survives restarts |
| ORM | Prisma | type-safe queries/migrations, fast to iterate with |
| Drag & drop | dnd-kit | headless interaction primitives only; we implement reorder/position logic |
| Markdown rendering | react-markdown + remark-gfm | rendering only; edit/view toggle and storage are ours |
| Client server-state | TanStack Query | cache + optimistic updates; natural place to merge socket-pushed updates |
| Client UI state | React context / Zustand (light use) | connection status, drag state, presence — ephemeral, not server data |
| Styling | Tailwind CSS | fast to build consistent UI without hand-rolling a design system |
| Local persistence (offline) | IndexedDB via a thin wrapper (`idb-keyval`) | storage primitive only; outbox/replay/idempotency logic is ours — see [06-offline-sync.md](06-offline-sync.md) |
| Testing | Vitest + React Testing Library (web), Vitest + Supertest (server) | fast, TS-native |

## Deployment topology

**Assumption (please confirm or override):** single Render web service running the Node server
(serving API + WS + built frontend) plus a Render-managed PostgreSQL instance. Rationale: one
deploy target, free tier covers both, WebSocket support works out of the box, minimal DevOps
for a time-boxed assignment. Alternatives considered: Railway (near-identical fit), Fly.io (more
manual config for comparable result), split Vercel (frontend) + separate host (backend) — rejected
here since it reintroduces CORS/cross-origin WS complexity for no real benefit at this scale.

## Environments

- **Local dev**: `docker compose` for Postgres only (or a local Postgres install); `npm run dev`
  runs Vite dev server (web) with proxy to the Fastify server, both with hot reload.
- **Production**: single build step produces `apps/server/dist` (compiled Node) that serves
  `apps/web/dist` (built static assets) and runs the API/WS.

## Open questions / assumptions to confirm

1. Hosting target — defaulting to Render (see above).
2. Scope/priority — defaulting to "implement all stories, cut offline sync then realtime first
   if time-constrained" (see [00-overview.md](00-overview.md)).
