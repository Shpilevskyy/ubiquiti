import { describe, expect, it } from 'vitest';
import { dequeue, enqueue, getQueue, recordAttempt, type QueuedOp } from './outbox';

function opInput(path = '/lists/list-1/todos'): Omit<QueuedOp, 'opId' | 'createdAt' | 'attempts'> {
  return { method: 'POST', path, body: { title: 'test' } };
}

describe('outbox queue atomicity (tasks/03 regression)', () => {
  it('two concurrent enqueue calls for the same list both survive', async () => {
    const listId = crypto.randomUUID();
    await Promise.all([enqueue(listId, opInput()), enqueue(listId, opInput())]);
    const queue = await getQueue(listId);
    expect(queue).toHaveLength(2);
    expect(new Set(queue.map((op) => op.opId)).size).toBe(2);
  });

  it('an enqueue racing a dequeue does not lose either write', async () => {
    const listId = crypto.randomUUID();
    const first = await enqueue(listId, opInput());
    await Promise.all([dequeue(listId, first.opId), enqueue(listId, opInput('/other'))]);
    const queue = await getQueue(listId);
    expect(queue).toHaveLength(1);
    expect(queue[0].opId).not.toBe(first.opId);
    expect(queue[0].path).toBe('/other');
  });

  it('recordAttempt increments and returns the new count', async () => {
    const listId = crypto.randomUUID();
    const queued = await enqueue(listId, opInput());
    expect(queued.attempts).toBe(0);

    expect(await recordAttempt(listId, queued.opId)).toBe(1);
    expect(await recordAttempt(listId, queued.opId)).toBe(2);

    const [current] = await getQueue(listId);
    expect(current.attempts).toBe(2);
  });

  it('recordAttempt on an already-dequeued op is a no-op returning 0', async () => {
    const listId = crypto.randomUUID();
    const queued = await enqueue(listId, opInput());
    await dequeue(listId, queued.opId);

    expect(await recordAttempt(listId, queued.opId)).toBe(0);
    expect(await getQueue(listId)).toHaveLength(0);
  });

  it('queues for two different listIds never interleave', async () => {
    const listX = crypto.randomUUID();
    const listY = crypto.randomUUID();
    await enqueue(listX, opInput('/x'));
    await enqueue(listY, opInput('/y'));

    const [queueX, queueY] = await Promise.all([getQueue(listX), getQueue(listY)]);
    expect(queueX).toHaveLength(1);
    expect(queueX[0].path).toBe('/x');
    expect(queueY).toHaveLength(1);
    expect(queueY[0].path).toBe('/y');
  });
});
