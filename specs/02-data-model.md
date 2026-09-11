# 02 — Data Model

## Entities

**List** — the unit of persistence, sharing, and realtime collaboration.
- `id` (uuid, PK) — also the share-link identifier and Socket.IO room name
- `title` (string)
- `createdAt`, `updatedAt`

**Todo** — top-level item on a list.
- `id` (uuid, PK) — client-generated at creation time (see [03-api-rest.md](03-api-rest.md) for why)
- `listId` (FK → List)
- `title` (string)
- `done` (boolean, default false)
- `position` (float) — ordering key, see [08-drag-and-drop.md](08-drag-and-drop.md)
- `costCents` (int, nullable) — stored as integer cents to avoid float rounding on money
- `descriptionMd` (text, nullable) — raw markdown, see [09-markdown-descriptions.md](09-markdown-descriptions.md)
- `version` (int, default 0) — incremented on every update, see [05-sync-conflict-resolution.md](05-sync-conflict-resolution.md)
- `createdAt`, `updatedAt`

**SubTask** — child of a Todo.
- `id` (uuid, PK) — client-generated
- `todoId` (FK → Todo)
- `title` (string)
- `done` (boolean, default false)
- `position` (float)
- `costCents` (int, nullable)
- `version` (int, default 0)
- `createdAt`, `updatedAt`

Sub-tasks do not have their own description field (descriptions live on the parent Todo only —
scope decision to limit surface area; see [00-overview.md](00-overview.md)).

## Derived values (not stored)

- **Sub-task progress** on a Todo (`doneCount / totalCount`) — computed on read, both server
  hydration payload and client render. Not persisted, so it can never drift from the source rows.
- **List total cost** — sum of all `costCents` across todos and sub-tasks — computed on read for
  the same reason.

## Prisma schema sketch

```prisma
model List {
  id        String   @id @default(uuid())
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  todos     Todo[]
}

model Todo {
  id            String    @id
  listId        String
  list          List      @relation(fields: [listId], references: [id], onDelete: Cascade)
  title         String
  done          Boolean   @default(false)
  position      Float
  costCents     Int?
  descriptionMd String?
  version       Int       @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  subtasks      SubTask[]

  @@index([listId])
}

model SubTask {
  id        String   @id
  todoId    String
  todo      Todo     @relation(fields: [todoId], references: [id], onDelete: Cascade)
  title     String
  done      Boolean  @default(false)
  position  Float
  costCents Int?
  version   Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([todoId])
}
```

Note: primary keys are `String` with no `@default(uuid())` on Todo/SubTask because the client
generates the id at creation time (needed for idempotent offline replay — see
[03-api-rest.md](03-api-rest.md) and [06-offline-sync.md](06-offline-sync.md)). `List.id` is
server-generated since list creation isn't a case that needs offline support (you can't share a
link to a list that doesn't exist on the server yet).

## Cascade behavior

Deleting a List deletes its Todos (cascade); deleting a Todo deletes its SubTasks (cascade).

## Prisma models vs. shared zod schemas — no codegen

`packages/shared` hand-declares `List`/`Todo`/`SubTask` as zod schemas (wire/API shapes) separate
from the Prisma models (DB shapes) in this file, rather than generating one from the other via a
tool like `zod-prisma-types`.

Rejected: a generator would only cover the *read* shapes, and would produce `z.date()` for
timestamps where the wire format needs `z.string()` (JSON has no native date type) — request
body schemas (`CreateListBodySchema`, `UpdateListBodySchema`) intentionally exclude fields like
`id`/`version`/`createdAt` and would still need to be hand-written regardless. At 3 models the
generator's dependency and generator-step overhead outweighs the boilerplate it would save.

This is also safer than plain duplication would suggest: the server's serializers
(`serializeList`/`serializeTodo`/`serializeSubTask` in `apps/server/src/routes/lists.ts`) map
from the actual Prisma-generated field types, so renaming or removing a DB column fails the
build immediately. A new Prisma field silently *not* appearing on the wire type is the one gap —
treated as correct behavior (a field should be opted into the public API deliberately, not leak
onto the wire by default).

Revisit if the schema grows substantially (many more models/fields) and the hand-written
read-shape boilerplate becomes the bulk of the diff on schema changes.
