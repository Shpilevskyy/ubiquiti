-- DropIndex
DROP INDEX "SubTask_todoId_idx";

-- DropIndex
DROP INDEX "Todo_listId_idx";

-- CreateIndex
CREATE INDEX "SubTask_todoId_position_idx" ON "SubTask"("todoId", "position");

-- CreateIndex
CREATE INDEX "Todo_listId_position_idx" ON "Todo"("listId", "position");
