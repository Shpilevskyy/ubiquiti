-- Step 1/2 of the Float -> fractional-index-string migration (tasks/18). Purely additive and
-- backward compatible: the old "position" float columns are untouched, so this is safe to deploy
-- on its own. A one-time backfill script (see apps/server/scripts/backfillPositionKeys.ts) then
-- populates "positionKey" for every existing row before migration 2 drops the float column and
-- renames this one into its place.
--
-- COLLATE "C" (byte order) from the start: Postgres's default locale collation sorts these
-- base-62 keys wrong (it treats case/punctuation as secondary weights), which would silently
-- corrupt ordering on exactly the keys this migration exists to produce.
ALTER TABLE "Todo" ADD COLUMN "positionKey" TEXT COLLATE "C";
ALTER TABLE "SubTask" ADD COLUMN "positionKey" TEXT COLLATE "C";
