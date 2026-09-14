import { get, update } from 'idb-keyval';

// The persistent queue half of the outbox pattern (specs/06-offline-sync.md) — IndexedDB used
// purely as a storage primitive, no sync logic here. One ordered array per list, keyed so
// operations for different lists never interleave.
export interface QueuedOp {
  opId: string; // uuid, for local dedupe/logging only — REST idempotency is via the todo/subtask id
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string; // e.g. /lists/:listId/todos/:todoId — no /api prefix, see api.ts's sendOp
  body?: unknown;
  createdAt: number;
  // Bumped on each failed retryable (network/5xx) send; flushOutbox drops the op past a cap as a
  // safety net bounding any failure mode not already treated as permanent — see tasks/03.
  attempts: number;
}

function storageKey(listId: string): string {
  return `outbox:${listId}`;
}

export async function getQueue(listId: string): Promise<QueuedOp[]> {
  return (await get<QueuedOp[]>(storageKey(listId))) ?? [];
}

// enqueue/dequeue/recordAttempt all go through idb-keyval's update(), which performs the read and
// the write inside a single readwrite transaction. A plain get()-then-set() here raced two
// concurrent callers (e.g. two quick offline mutations, or an enqueue racing a flush's dequeue)
// into silently clobbering each other's write — see tasks/03.
export async function enqueue(
  listId: string,
  op: Omit<QueuedOp, 'opId' | 'createdAt' | 'attempts'>,
): Promise<QueuedOp> {
  const queued: QueuedOp = { ...op, opId: crypto.randomUUID(), createdAt: Date.now(), attempts: 0 };
  await update<QueuedOp[]>(storageKey(listId), (queue = []) => [...queue, queued]);
  return queued;
}

export async function dequeue(listId: string, opId: string): Promise<void> {
  await update<QueuedOp[]>(storageKey(listId), (queue = []) =>
    queue.filter((op) => op.opId !== opId),
  );
}

// Returns the op's new attempts count so the caller can compare it against its cap without a
// separate read. A no-op (returns 0) if the op was already dequeued by a concurrent caller.
export async function recordAttempt(listId: string, opId: string): Promise<number> {
  let attempts = 0;
  await update<QueuedOp[]>(storageKey(listId), (queue = []) =>
    queue.map((op) => {
      if (op.opId !== opId) return op;
      attempts = (op.attempts ?? 0) + 1;
      return { ...op, attempts };
    }),
  );
  return attempts;
}
