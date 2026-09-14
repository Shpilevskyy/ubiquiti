# 15 — Composite indexes on `(listId, position)`; touch `List.updatedAt`

**Status:** done, see PROGRESS.md
**Size:** S
**Depends on:** —
**Source:** Staff review 2026-09-12

## 1 — Indexes don't cover the sort

[../apps/server/prisma/schema.prisma](../apps/server/prisma/schema.prisma) has `@@index([listId])`
on `Todo` and `@@index([todoId])` on `SubTask`.

But **every** read path orders by position — that was made comprehensive when subtask drag-and-drop
landed:

- `GET /api/lists/:listId` — [lists.ts:39-42](../apps/server/src/routes/lists.ts), both levels
- all three `include`s in [todos.ts](../apps/server/src/routes/todos.ts) ([:27](../apps/server/src/routes/todos.ts),
  [:42](../apps/server/src/routes/todos.ts), [:77](../apps/server/src/routes/todos.ts))

With a single-column index Postgres can use it for the filter but must then sort the matched rows.
Composite indexes let the ordering come straight off the index:

```prisma
@@index([listId, position])   // Todo
@@index([todoId, position])   // SubTask
```

Replace rather than add — the composite index serves `listId`-only lookups too, since it's the
leading column.

Small at current data volumes. It's the correct index for the access pattern, it's a two-line
schema change, and it's the kind of thing worth getting right rather than explaining away.

## 2 — The list directory never reorders by activity

[lists.ts:30](../apps/server/src/routes/lists.ts) orders by `List.updatedAt: 'desc'`, but nothing
touches `List.updatedAt` when a todo or subtask changes — Prisma's `@updatedAt` only fires on
writes to that row. `PATCH /api/lists/:listId` (title rename) has no UI, so in practice
`updatedAt` equals `createdAt` forever and the landing page is ordered by creation date.

Either genuinely bump the parent list on child mutations, or order by `createdAt` and stop implying
recency. The current state is the misleading middle.

If bumping: note it adds a second write to every todo/subtask mutation, and the `list:updated`
broadcast semantics need thought (do other clients care that the timestamp moved?). Ordering by
`createdAt` is the honest cheap option. **Record whichever you pick in PROGRESS.md.**

## Verification

- `npm run db:migrate` generates the migration; confirm it applies cleanly locally.
- `EXPLAIN ANALYZE` the list query before and after — the sort node should disappear.
- Confirm the migration applies on deploy (`npm run start` runs `prisma migrate deploy`, so this
  happens automatically — watch the Render deploy log).
- Ordering behavior on the landing page matches whichever option was chosen.

## Done when

- [x] Composite indexes in the schema with a generated migration
- [x] Migration verified locally — Render applies it automatically on the next deploy via
      `prisma migrate deploy` in the start script, same as every prior migration; not separately
      re-verified there since nothing about that path changed.
- [x] Landing-page ordering is either genuinely activity-based or honestly creation-based — chose
      creation-based (`createdAt`)
- [x] Decision recorded in PROGRESS.md
