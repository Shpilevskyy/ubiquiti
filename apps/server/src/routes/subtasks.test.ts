import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  createList,
  createSubTask,
  createTodo,
  newPosition,
  truncateAll,
  type SpyBroadcaster,
} from '../test/harness.js';

describe('subtasks routes', () => {
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
    it('POSTing the same id twice sequentially returns the same row, 200 both times', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id);
      const id = randomUUID();
      const body = { id, title: 'Whole milk', position: newPosition() };
      const url = `/api/lists/${list.id}/todos/${todo.id}/subtasks`;

      const first = await app.inject({ method: 'POST', url, payload: body });
      const second = await app.inject({ method: 'POST', url, payload: body });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const listRes = await app.inject({ method: 'GET', url: `/api/lists/${list.id}` });
      expect(listRes.json().todos[0].subtasks).toHaveLength(1);
    });

    it('POSTing the same id concurrently still produces exactly one row', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id);
      const id = randomUUID();
      const body = { id, title: 'Whole milk', position: newPosition() };
      const url = `/api/lists/${list.id}/todos/${todo.id}/subtasks`;

      const [first, second] = await Promise.all([
        app.inject({ method: 'POST', url, payload: body }),
        app.inject({ method: 'POST', url, payload: body }),
      ]);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const listRes = await app.inject({ method: 'GET', url: `/api/lists/${list.id}` });
      expect(listRes.json().todos[0].subtasks).toHaveLength(1);
    });

    it('POSTing to a nonexistent todo 404s (FK violation, not a 500)', async () => {
      const list = await createList(app);
      const res = await app.inject({
        method: 'POST',
        url: `/api/lists/${list.id}/todos/00000000-0000-0000-0000-000000000000/subtasks`,
        payload: { id: randomUUID(), title: 'x', position: newPosition() },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
    });
  });

  describe('conflict signaling', () => {
    it('a PATCH whose base disagrees reports hadConflict:true and still applies the write', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id);
      const subtask = await createSubTask(app, list.id, todo.id, { title: 'Whole milk' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}/subtasks/${subtask.id}`,
        payload: { done: true, base: { title: 'Oat milk' } },
      });

      expect(res.json().hadConflict).toBe(true);
      expect(res.json().subtask.done).toBe(true);
    });

    it('a concurrent edit to a different field does not report a conflict', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id);
      const subtask = await createSubTask(app, list.id, todo.id, { title: 'Whole milk' });

      await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}/subtasks/${subtask.id}`,
        payload: { costCents: 500 },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}/subtasks/${subtask.id}`,
        payload: { done: true, base: { title: 'Whole milk', done: false } },
      });

      expect(res.json().hadConflict).toBe(false);
    });
  });

  describe('route scoping (tasks/04, one level deeper: both ancestors checked)', () => {
    it('PATCH under the correct todo but the wrong list 404s and does not mutate the row', async () => {
      const ownList = await createList(app);
      const otherList = await createList(app);
      const todo = await createTodo(app, ownList.id);
      const subtask = await createSubTask(app, ownList.id, todo.id, { title: 'Original' });
      broadcaster.broadcastToList.mockClear();

      const res = await app.inject({
        method: 'PATCH',
        // Right todoId, but a listId that doesn't own it.
        url: `/api/lists/${otherList.id}/todos/${todo.id}/subtasks/${subtask.id}`,
        payload: { title: 'Hijacked' },
      });

      expect(res.statusCode).toBe(404);
      expect(broadcaster.broadcastToList).not.toHaveBeenCalled();

      const check = await app.inject({ method: 'GET', url: `/api/lists/${ownList.id}` });
      expect(check.json().todos[0].subtasks[0].title).toBe('Original');
    });

    it('PATCH under the wrong todo entirely 404s', async () => {
      const listA = await createList(app);
      const listB = await createList(app);
      const todoA = await createTodo(app, listA.id);
      const todoB = await createTodo(app, listB.id);
      const subtask = await createSubTask(app, listA.id, todoA.id);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/lists/${listA.id}/todos/${todoB.id}/subtasks/${subtask.id}`,
        payload: { title: 'Hijacked' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('DELETE under the correct todo but the wrong list 404s and does not delete the row', async () => {
      const ownList = await createList(app);
      const otherList = await createList(app);
      const todo = await createTodo(app, ownList.id);
      const subtask = await createSubTask(app, ownList.id, todo.id);
      broadcaster.broadcastToList.mockClear();

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/lists/${otherList.id}/todos/${todo.id}/subtasks/${subtask.id}`,
      });

      expect(res.statusCode).toBe(404);
      expect(broadcaster.broadcastToList).not.toHaveBeenCalled();

      const check = await app.inject({ method: 'GET', url: `/api/lists/${ownList.id}` });
      expect(check.json().todos[0].subtasks).toHaveLength(1);
    });

    it('correct-parent PATCH/DELETE still work', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id);
      const subtask = await createSubTask(app, list.id, todo.id);

      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}/subtasks/${subtask.id}`,
        payload: { title: 'Updated' },
      });
      expect(patch.statusCode).toBe(200);

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/lists/${list.id}/todos/${todo.id}/subtasks/${subtask.id}`,
      });
      expect(del.statusCode).toBe(204);
    });
  });

  describe('delete idempotency and broadcasts', () => {
    it('deleting an already-gone subtask is still a 204', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id);
      const subtask = await createSubTask(app, list.id, todo.id);
      const url = `/api/lists/${list.id}/todos/${todo.id}/subtasks/${subtask.id}`;

      const first = await app.inject({ method: 'DELETE', url });
      const second = await app.inject({ method: 'DELETE', url });

      expect(first.statusCode).toBe(204);
      expect(second.statusCode).toBe(204);
    });

    it('broadcasts SUBTASK_CREATED/UPDATED/DELETED with the sender excluded', async () => {
      const list = await createList(app);
      const todo = await createTodo(app, list.id);
      broadcaster.broadcastToList.mockClear();

      const createRes = await app.inject({
        method: 'POST',
        url: `/api/lists/${list.id}/todos/${todo.id}/subtasks`,
        headers: { 'x-client-id': 'client-a' },
        payload: { id: randomUUID(), title: 'Whole milk', position: newPosition() },
      });
      const subtaskId = createRes.json().subtask.id;
      expect(broadcaster.broadcastToList).toHaveBeenCalledWith(
        list.id,
        'client-a',
        'subtask:created',
        { todoId: todo.id, subtask: expect.objectContaining({ id: subtaskId }) },
      );

      await app.inject({
        method: 'PATCH',
        url: `/api/lists/${list.id}/todos/${todo.id}/subtasks/${subtaskId}`,
        headers: { 'x-client-id': 'client-b' },
        payload: { done: true },
      });
      expect(broadcaster.broadcastToList).toHaveBeenCalledWith(
        list.id,
        'client-b',
        'subtask:updated',
        { todoId: todo.id, subtask: expect.objectContaining({ id: subtaskId, done: true }) },
      );

      await app.inject({
        method: 'DELETE',
        url: `/api/lists/${list.id}/todos/${todo.id}/subtasks/${subtaskId}`,
        headers: { 'x-client-id': 'client-c' },
      });
      expect(broadcaster.broadcastToList).toHaveBeenCalledWith(
        list.id,
        'client-c',
        'subtask:deleted',
        { todoId: todo.id, subtaskId },
      );
    });
  });
});
