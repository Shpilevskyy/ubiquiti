-- Step 2/2 of the Float -> fractional-index-string migration (tasks/18). Requires
-- apps/server/scripts/backfillPositionKeys.ts to have already populated "positionKey" for every
-- row. Running this before the backfill would rename an all-NULL column into place, destroying
-- the only copy of the real ordering -- and since this app auto-deploys via `prisma migrate
-- deploy` on every push (PROGRESS.md), that sequencing mistake has to be prevented by the
-- migration itself, not just by a comment someone has to remember to read. So: hard abort, not a
-- warning, if any row is still unbackfilled. A failed deploy (app doesn't start) is the safe
-- failure mode here, not a silent data-destroying one.
DO $$
DECLARE
  missing_todos INT;
  missing_subtasks INT;
BEGIN
  SELECT count(*) INTO missing_todos FROM "Todo" WHERE "positionKey" IS NULL;
  SELECT count(*) INTO missing_subtasks FROM "SubTask" WHERE "positionKey" IS NULL;
  IF missing_todos > 0 OR missing_subtasks > 0 THEN
    RAISE EXCEPTION 'tasks/18 finalize migration aborted: % Todo row(s) and % SubTask row(s) still have a null positionKey. Run apps/server/scripts/backfillPositionKeys.ts against this database first (see PROGRESS.md).', missing_todos, missing_subtasks;
  END IF;
END $$;

-- Dropping "position" (the old float column) also drops the composite (listId, position) /
-- (todoId, position) indexes from tasks/15, since they're defined on that column -- recreated
-- below against the renamed column so that composite index isn't silently lost. The renamed
-- column keeps the COLLATE "C" it was created with in the previous migration; RENAME COLUMN only
-- changes the name.
ALTER TABLE "Todo" DROP COLUMN "position";
ALTER TABLE "Todo" RENAME COLUMN "positionKey" TO "position";
ALTER TABLE "Todo" ALTER COLUMN "position" SET NOT NULL;
CREATE INDEX "Todo_listId_position_idx" ON "Todo"("listId", "position");

ALTER TABLE "SubTask" DROP COLUMN "position";
ALTER TABLE "SubTask" RENAME COLUMN "positionKey" TO "position";
ALTER TABLE "SubTask" ALTER COLUMN "position" SET NOT NULL;
CREATE INDEX "SubTask_todoId_position_idx" ON "SubTask"("todoId", "position");
