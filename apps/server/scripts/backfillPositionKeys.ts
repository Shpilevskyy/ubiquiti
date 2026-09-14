// One-time data migration for tasks/18 (Float -> fractional-index-string `position`). Run once,
// against any database that has applied migration
// `20260914140000_add_position_key_columns` (adds nullable `positionKey` columns) but not yet
// `20260914140100_finalize_position_as_string` (drops the old float column and renames this one
// into its place) — locally that means right after `prisma migrate deploy` picks up the first
// migration; on Render it means running this once against the Render database before the deploy
// that ships the second migration.
//
// Deliberately raw SQL throughout, not the generated Prisma Client's typed `prisma.todo.*`
// methods: schema.prisma already declares `position String` (the final shape), so the typed
// client doesn't know about the transitional float `position` column or the `positionKey` column
// this script reads/writes. Idempotent and safe to re-run: it always recomputes every list's/
// todo's keys from the current float order, so re-running before the float column is dropped just
// regenerates the same keys in the same order.
import { PrismaClient } from '@prisma/client';
import { generateNKeysBetween } from 'fractional-indexing';

const prisma = new PrismaClient();

async function backfillTodos() {
  const lists = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "List"`;
  let updated = 0;
  for (const list of lists) {
    const todos = await prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Todo" WHERE "listId" = ${list.id} ORDER BY position ASC`;
    if (todos.length === 0) continue;
    const keys = generateNKeysBetween(null, null, todos.length);
    for (let i = 0; i < todos.length; i++) {
      await prisma.$executeRaw`UPDATE "Todo" SET "positionKey" = ${keys[i]} WHERE id = ${todos[i].id}`;
      updated++;
    }
  }
  return updated;
}

async function backfillSubTasks() {
  const todos = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Todo"`;
  let updated = 0;
  for (const todo of todos) {
    const subtasks = await prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "SubTask" WHERE "todoId" = ${todo.id} ORDER BY position ASC`;
    if (subtasks.length === 0) continue;
    const keys = generateNKeysBetween(null, null, subtasks.length);
    for (let i = 0; i < subtasks.length; i++) {
      await prisma.$executeRaw`UPDATE "SubTask" SET "positionKey" = ${keys[i]} WHERE id = ${subtasks[i].id}`;
      updated++;
    }
  }
  return updated;
}

async function main() {
  const todosUpdated = await backfillTodos();
  const subtasksUpdated = await backfillSubTasks();

  const [{ missing: missingTodos }] = await prisma.$queryRaw<
    { missing: bigint }[]
  >`SELECT count(*)::int AS missing FROM "Todo" WHERE "positionKey" IS NULL`;
  const [{ missing: missingSubtasks }] = await prisma.$queryRaw<
    { missing: bigint }[]
  >`SELECT count(*)::int AS missing FROM "SubTask" WHERE "positionKey" IS NULL`;

  console.log(`Backfilled ${todosUpdated} todo(s), ${subtasksUpdated} subtask(s).`);
  if (Number(missingTodos) > 0 || Number(missingSubtasks) > 0) {
    throw new Error(
      `Backfill incomplete: ${missingTodos} todo(s) and ${missingSubtasks} subtask(s) still have a null positionKey`,
    );
  }
  console.log('All rows have a positionKey. Safe to apply the finalize migration.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
