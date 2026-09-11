import { get, set } from 'idb-keyval';

// The persistent queue half of the outbox pattern (specs/06-offline-sync.md) — IndexedDB used
// purely as a storage primitive, no sync logic here. One ordered array per list, keyed so
// operations for different lists never interleave. Not wired into any mutation flow yet; that's
// the next step (optimistic updates + enqueue-on-mutate), and flushing after that.
export interface QueuedOp {
  opId: string; // uuid, for local dedupe/logging only — REST idempotency is via the todo/subtask id
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string; // e.g. /api/lists/:listId/todos/:todoId
  body?: unknown;
  createdAt: number;
}

function storageKey(listId: string): string {
  return `outbox:${listId}`;
}

export async function getQueue(listId: string): Promise<QueuedOp[]> {
  return (await get<QueuedOp[]>(storageKey(listId))) ?? [];
}

export async function enqueue(
  listId: string,
  op: Omit<QueuedOp, 'opId' | 'createdAt'>,
): Promise<QueuedOp> {
  const queued: QueuedOp = { ...op, opId: crypto.randomUUID(), createdAt: Date.now() };
  const queue = await getQueue(listId);
  await set(storageKey(listId), [...queue, queued]);
  return queued;
}

export async function dequeue(listId: string, opId: string): Promise<void> {
  const queue = await getQueue(listId);
  await set(
    storageKey(listId),
    queue.filter((op) => op.opId !== opId),
  );
}
