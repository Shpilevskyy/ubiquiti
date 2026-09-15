import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  createList,
  createTodo,
  newPosition,
  truncateAll,
  type SpyBroadcaster,
} from '../test/harness.js';

describe('todos routes', () => {
  let app: FastifyInstance;
  let broadcaster: SpyBroadcaster;

  beforeAll(async () => {
    ({ app, broadcaster } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();
    broadcaster.broadcastToList.mockClear();
  });

  describe('idempotent create (tasks/19)', () => {
    it('POSTing the same client-generated id twice sequentially returns the same row, 200 both times', async () => {
      const list = await createList(app);
      const id = randomUUID();
      const body = { id, title: 'Buy milk', position: newPosition() };

      const first = await app.inject({
        method: 'POST',
        url: `/api/lists/${list.id}/todos`,
        payload: body,
      });
      const second = await app.inject({
        method: 'POST',
        url: `/api/lists/${list.id}/todos`,
        payload: body,
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(first.json().todo.id).toBe(id);
      expect(second.json().todo.id).toBe(id);

      const listRes = await app.inject({ method: 'GET', url: `/api/lists/${list.id}` });
      expect(listRes.json().todos).toHaveLength(1); // not duplicated
    });

    it('POSTing the same id concurrently still produces exactly one row (the actual regression)', async () => {
      // The bug this guards: prisma.todo.upsert looked atomic but wasn't (verified via query
      // logging, tasks/19) — two concurrent inserts for the same id raced into one 200 and one
      // unhandled P2002-turned-500. A bare create() racing on the DB's own unique constraint,
      // with the loser catching P2002 and re-fetching, is what's actually atomic.
      const list = await createList(app);
      const id = randomUUID();
      const body = { id, title: 'Buy milk', position: newPosition() };

      const [first, second] = await Promise.all([
        app.inject({ method: 'POST', url: `/api/lists/${list.id}/todos`, payload: body }),
        app.inject({ method: 'POST', url: `/api/lists/${list.id}/todos`, payload: body }),
      ]);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const listRes = await app.inject({ method: 'GET', url: `/api/lists/${list.id}` });
      expect(listRes.json().todos).toHaveLength(1);
    });

    it('POSTing to a nonexistent list 404s (FK violation, not a 500)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/lists/00000000-0000-0000-0000-000000000000/todos',
        payload: { id: randomUUID(), title: 'x', position: newPosition() },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
    });

    it('broadcasts TODO_CREATED, including on the idempotent-retry path', async () => {
      const list = await createList(app);
      const id = randomUUID();
      const body = { id, title: 'Buy milk', position: newPosition() };

      await app.inject({
        method: 'POST',
        url: `/api/lists/${list.id}/todos`,
        headers: { 'x-client-id': 'client-a' },
        payload: body,
      });
      expect(broadcaster.broadcastToList).toHaveBeenCalledWith(
        list.id,
        'client-a',
        'todo:created',
        { todo: expect.objectContaining({ id }) },
      );

      broadcaster.broadcastToList.mockClear();
      await app.inject({
        method: 'POST',
        url: `/api/lists/${list.id}/todos`,
        headers: { 'x-client-id': 'client-b' },
        payload: body,
      });
      expect(broadcaster.broadcastToList).toHaveBeenCalledTimes(1); // still broadcast, not skipped
    });
  });

  describe('conflict signaling (specs/05-sync-conflict-resolution.md)', () => {
    it('a PATCH whose base disagrees with the current row reports hadConflict:true and still applies', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id, { title: 'Buy milk' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}`,
        payload: { done: true, base: { title: 'Buy oat milk' } }, // stale: real title is 'Buy milk'
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().hadConflict).toBe(true);
      expect(res.json().todo.done).toBe(true); // whole-record LWW: the write still applies
    });

    it('a PATCH whose base matches the current row reports hadConflict:false', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id, { title: 'Buy milk' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}`,
        payload: { done: true, base: { title: 'Buy milk', done: false } },
      });

      expect(res.json().hadConflict).toBe(false);
    });

    it('a concurrent edit to a different field than base names does not report a conflict', async () => {
      // The exact regression this was rewritten to fix: the old row-version check compared the
      // whole row, so any concurrent write — even to a field this PATCH never touches — reported
      // a false conflict.
      const list = await createList(app);
      const todo = await createTodo(app, list.id, { title: 'Buy milk' });

      // A concurrent write changes `costCents`, a field this PATCH's `base` doesn't mention.
      await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}`,
        payload: { costCents: 500 },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}`,
        payload: { done: true, base: { title: 'Buy milk', done: false } },
      });

      expect(res.json().hadConflict).toBe(false);
    });
  });

  describe('route scoping (tasks/04)', () => {
    it('PATCH with the wrong listId 404s, leaves the row unmutated, and broadcasts nothing', async () => {
      const ownList = await createList(app);
      const otherList = await createList(app);
      const todo = await createTodo(app, ownList.id, { title: 'Original' });
      broadcaster.broadcastToList.mockClear(); // the create above already broadcast once

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/lists/${otherList.id}/todos/${todo.id}`,
        payload: { title: 'Hijacked' },
      });

      expect(res.statusCode).toBe(404);
      expect(broadcaster.broadcastToList).not.toHaveBeenCalled();

      const check = await app.inject({ method: 'GET', url: `/api/lists/${ownList.id}` });
      expect(check.json().todos[0].title).toBe('Original');
    });

    it('DELETE with the wrong listId 404s and does not delete the row', async () => {
      const ownList = await createList(app);
      const otherList = await createList(app);
      const todo = await createTodo(app, ownList.id);
      broadcaster.broadcastToList.mockClear(); // the create above already broadcast once

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/lists/${otherList.id}/todos/${todo.id}`,
      });

      expect(res.statusCode).toBe(404);
      expect(broadcaster.broadcastToList).not.toHaveBeenCalled();

      const check = await app.inject({ method: 'GET', url: `/api/lists/${ownList.id}` });
      expect(check.json().todos).toHaveLength(1); // still there
    });

    it('correct-parent PATCH/DELETE still work', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id);

      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}`,
        payload: { title: 'Updated' },
      });
      expect(patch.statusCode).toBe(200);

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/lists/${list.id}/todos/${todo.id}`,
      });
      expect(del.statusCode).toBe(204);
    });
  });

  describe('delete idempotency', () => {
    it('deleting an already-gone todo is still a 204, distinct from the wrong-parent 404 above', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id);

      const first = await app.inject({
        method: 'DELETE',
        url: `/api/lists/${list.id}/todos/${todo.id}`,
      });
      const second = await app.inject({
        method: 'DELETE',
        url: `/api/lists/${list.id}/todos/${todo.id}`,
      });

      expect(first.statusCode).toBe(204);
      expect(second.statusCode).toBe(204);
    });

    it('broadcasts TODO_UPDATED/TODO_DELETED with the sender excluded via x-client-id', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id);
      broadcaster.broadcastToList.mockClear();

      await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}`,
        headers: { 'x-client-id': 'client-a' },
        payload: { done: true },
      });
      expect(broadcaster.broadcastToList).toHaveBeenCalledWith(
        list.id,
        'client-a',
        'todo:updated',
        { todo: expect.objectContaining({ id: todo.id, done: true }) },
      );

      await app.inject({
        method: 'DELETE',
        url: `/api/lists/${list.id}/todos/${todo.id}`,
        headers: { 'x-client-id': 'client-b' },
      });
      expect(broadcaster.broadcastToList).toHaveBeenCalledWith(
        list.id,
        'client-b',
        'todo:deleted',
        { todoId: todo.id },
      );
    });
  });
});
