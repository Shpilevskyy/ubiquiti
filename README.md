# Ubiquiti Todo

A realtime, offline-capable shared todo app.

**Live: https://ubiquiti-635h.onrender.com/** — no sign-up; create a list and open its URL in a
second browser to see realtime sync and presence. (Free Render instance, so the first request
after an idle period can take a few seconds to wake.)

The design notes behind the implementation live in [specs/](specs/) — of those,
[01-architecture.md](specs/01-architecture.md), [05-sync-conflict-resolution.md](specs/05-sync-conflict-resolution.md)
and [06-offline-sync.md](specs/06-offline-sync.md) cover the parts worth reading first.
[PROGRESS.md](PROGRESS.md) is the running build log, and [tasks/](tasks/) the backlog it worked
through.

## Techstack
Language: TypeScript
Framework: React
Backend: Node


## Running locally

**Prerequisites:** [Node.js](https://nodejs.org/) 22+, [Docker](https://www.docker.com/) (for a
local Postgres instance).

Fastest path — from the repo root:

```bash
./scripts/setup.sh   # installs deps, starts Postgres, writes apps/server/.env, runs migrations
npm run dev           # starts the API (port 3001) and web app (port 5173)
```

Then open http://localhost:5173.

<details>
<summary>What the setup script does (manual equivalent)</summary>

```bash
npm install
docker-compose up -d                                  # Postgres on localhost:5432
cp apps/server/.env.example apps/server/.env           # matches the docker-compose defaults as-is
npm run db:migrate -w @ubiquiti-todo/server             # applies Prisma migrations
```

</details>

`npm run dev` builds `packages/shared`, then runs the Fastify API and the Vite dev server
together; Vite proxies `/api` and `/socket.io` to the API, so only one origin
(http://localhost:5173) needs to be opened. The API also exposes a `GET /healthz` readiness
check at http://localhost:3001/healthz, handy for confirming it can reach Postgres.

Other useful scripts (see [package.json](package.json) at the root and in each workspace):

| Command | Description |
| --- | --- |
| `npm run build` | Production build of every workspace |
| `npm run typecheck` | Type-checks server and web without emitting |
| `npm run lint` / `npm run format` | Biome lint / format |
| `npm run format:check` | Biome format check, no writes (what CI runs) |
| `npm run start` | Runs the production server (applies pending migrations, then serves API + built web app from one process) |
| `npm run db:migrate -w @ubiquiti-todo/server` | Create/apply a Prisma migration in dev |

**Troubleshooting:** if `npm run dev` can't reach the database, confirm the `postgres` container
is up (`docker-compose ps`) and that nothing else on the machine is already bound to port 5432.


## Running tests

```bash
npm test          # both projects, once
npm run test:watch
```

Also runnable per workspace (`npm run test -w @ubiquiti-todo/server`, `-w @ubiquiti-todo/web`).
See [specs/11-testing-strategy.md](specs/11-testing-strategy.md) and
[tasks/23-testing.md](tasks/23-testing.md) for what's covered and why.

The `web` project (jsdom + `fake-indexeddb`) needs no setup beyond `npm install`. The `server`
project's integration tests use a **real, separate** Postgres database —
`ubiquiti_todo_test` — on the same docker-compose instance `npm run dev` uses, truncated between
tests rather than mocked, since the interesting bugs here (the P2002 create race, the
`$transaction` conflict check, FK→404 mapping) are exactly what an ORM mock would hide.
`./scripts/setup.sh` creates and migrates it automatically; the manual equivalent:

```bash
docker-compose exec postgres psql -U ubiquiti -d ubiquiti_todo -c 'CREATE DATABASE ubiquiti_todo_test'
cd apps/server && DATABASE_URL="postgresql://ubiquiti:ubiquiti@localhost:5432/ubiquiti_todo_test" \
  npx prisma migrate deploy
```

(`migrate deploy`, not the `db:migrate` script above — that's `prisma migrate dev`, which prompts
interactively on a checksum mismatch and isn't what CI or this test setup uses.)

(Re-run the migrate step after pulling new migrations — `npm test` doesn't do this for you.) CI
runs the same migration against a fresh Postgres service container on every push, per
[.github/workflows/ci.yml](.github/workflows/ci.yml).


## User stories:
* I as a user can create to-do items, such as a grocery list.

* I as a user can collaborate in real-time with other users - so that we can (for
example) edit our family shopping-list together.

* I as a user can be sure that my to-dos will be persisted so that important
information is not lost when the server restarts.

* I as a user can keep editing the list even when I lose internet connection, and can
expect it to sync up with BE as I regain connection.

* I as a user can mark to-do items as 'done' - so that I can avoid clutter and focus on things that are still pending.

* I as a user can change the order of tasks via drag & drop.

* I as a user can add sub-tasks to my to-do items - so that I could make logical groups of
tasks and see their overall progress.

* I as a user can specify cost/price for a task or a subtask - so that I can track my
expenses/project cost.

* I as a user can add sub-descriptions of tasks in Markdown and view them as rich
text while I'm not editing the descriptions.

* I as a user can share my to-do list via a unique link - so that others can view or
collaborate on it.


## Rules:
It's all right to use libraries that make your life easier, but please avoid anything that handles the core challenge