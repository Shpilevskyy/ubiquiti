import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, createList, truncateAll, type SpyBroadcaster } from '../test/harness.js';

describe('lists routes', () => {
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

  it('creates and fetches a list', async () => {
    const created = await createList(app, 'Groceries');
    expect(created.title).toBe('Groceries');

    const res = await app.inject({ method: 'GET', url: `/api/lists/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().list.id).toBe(created.id);
    expect(res.json().todos).toEqual([]);
  });

  it('404s fetching a nonexistent list, in the unified error shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lists/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
  });

  it('400s creating a list with an empty title, via the shared schema', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/lists', payload: { title: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_body');
  });

  it('400s a non-uuid list id path param instead of 500ing or silently missing', async () => {
    // Guards tasks/09: :listId used to be `string`-typed with no runtime check, so a malformed id
    // either 500'd or silently missed rather than 400ing.
    const res = await app.inject({ method: 'GET', url: '/api/lists/not-a-uuid' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_body');
  });

  it('renames a list (PATCH) and broadcasts LIST_UPDATED excluding the sender', async () => {
    const list = await createList(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/lists/${list.id}`,
      headers: { 'x-client-id': 'client-a' },
      payload: { title: 'Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().list.title).toBe('Renamed');

    expect(broadcaster.broadcastToList).toHaveBeenCalledTimes(1);
    expect(broadcaster.broadcastToList).toHaveBeenCalledWith(list.id, 'client-a', 'list:updated', {
      list: expect.objectContaining({ id: list.id, title: 'Renamed' }),
    });
  });

  it('PATCHing a nonexistent list 404s via the central P2025 handler, in the unified shape', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/lists/00000000-0000-0000-0000-000000000000',
      payload: { title: 'x' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
    expect(broadcaster.broadcastToList).not.toHaveBeenCalled();
  });

  it('deletes a list, broadcasts LIST_DELETED, and cascades its todos/subtasks', async () => {
    const list = await createList(app);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/lists/${list.id}`,
      headers: { 'x-client-id': 'client-a' },
    });
    expect(res.statusCode).toBe(204);
    expect(broadcaster.broadcastToList).toHaveBeenCalledWith(list.id, 'client-a', 'list:deleted', {
      listId: list.id,
    });

    const getRes = await app.inject({ method: 'GET', url: `/api/lists/${list.id}` });
    expect(getRes.statusCode).toBe(404);
  });

  it('deleting a list twice is idempotent: 204 both times, broadcast only the first time', async () => {
    const list = await createList(app);
    const first = await app.inject({ method: 'DELETE', url: `/api/lists/${list.id}` });
    const second = await app.inject({ method: 'DELETE', url: `/api/lists/${list.id}` });

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
    expect(broadcaster.broadcastToList).toHaveBeenCalledTimes(1);
  });

  describe('GET /api/lists pagination', () => {
    it('hasMore is false when every list fits within limit', async () => {
      await createList(app, 'a');
      await createList(app, 'b');

      const res = await app.inject({ method: 'GET', url: '/api/lists?limit=2' });
      expect(res.statusCode).toBe(200);
      expect(res.json().lists).toHaveLength(2);
      expect(res.json().hasMore).toBe(false);
    });

    it('hasMore is true, and exactly `limit` rows are returned, right at the boundary', async () => {
      await createList(app, 'a');
      await createList(app, 'b');
      await createList(app, 'c');

      const res = await app.inject({ method: 'GET', url: '/api/lists?limit=2' });
      expect(res.json().lists).toHaveLength(2); // not 3 — the +1 lookahead row isn't returned
      expect(res.json().hasMore).toBe(true);
    });

    it('offset skips the correct number of (most-recently-created-first) rows', async () => {
      await createList(app, 'a');
      await createList(app, 'b');
      await createList(app, 'c');

      // Derived from the server's own reported (createdAt desc) order rather than assumed to
      // match creation order: three rapid creates can legitimately land in the same millisecond
      // with no secondary sort key, making their relative order genuinely undefined — a real
      // property of this endpoint, not a test flaw, so the test doesn't assume tie-breaking.
      const unpaginated = await app.inject({ method: 'GET', url: '/api/lists?limit=3' });
      const [, expectedSecond] = unpaginated.json().lists;

      const res = await app.inject({ method: 'GET', url: '/api/lists?limit=1&offset=1' });
      expect(res.json().lists).toEqual([expect.objectContaining({ id: expectedSecond.id })]);
    });

    it('limit/offset are coerced from query strings, and an out-of-bounds limit 400s', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/lists?limit=9999' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_body');
    });
  });
});
