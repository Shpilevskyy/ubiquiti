
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
| `npm run start` | Runs the production server (applies pending migrations, then serves API + built web app from one process) |
| `npm run db:migrate -w @ubiquiti-todo/server` | Create/apply a Prisma migration in dev |

**Troubleshooting:** if `npm run dev` can't reach the database, confirm the `postgres` container
is up (`docker-compose ps`) and that nothing else on the machine is already bound to port 5432.


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