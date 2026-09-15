import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, createList, truncateAll } from './test/harness.js';

// Cross-cutting error-shape guarantees (specs/03-api-rest.md) that aren't specific to one
// resource's routes — the per-route 400/404 cases already covered incidentally by
// lists.test.ts/todos.test.ts/subtasks.test.ts.
describe('unified error shape', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('413s a body over the 256KB cap, in the unified shape', async () => {
    await truncateAll();
    const res = await app.inject({
      method: 'POST',
      url: '/api/lists',
      payload: { title: 'x'.repeat(257 * 1024) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('payload_too_large');
  });

  it('an unmatched route 404s in the unified shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
  });

  it('an unexpected error 500s without leaking the underlying message', async () => {
    // No app-reachable route actually 500s (that's the point of the validation/P2025/P2003
    // handling covered elsewhere) — a dedicated throwaway app + route exercises the *same*
    // registered error handler's generic branch directly, since Fastify won't accept new routes
    // on an instance that has already served a request (it locks on first `.ready()`).
    const { app: throwawayApp } = await buildTestApp();
    const secretMessage = 'raw internal detail: connection string, stack frame, etc.';
    throwawayApp.get('/__test/throw', async () => {
      throw new Error(secretMessage);
    });

    const res = await throwawayApp.inject({ method: 'GET', url: '/__test/throw' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong' },
    });
    expect(res.body).not.toContain(secretMessage);

    await throwawayApp.close();
  });

  it('deleting a list then PATCHing it exercises the real Prisma P2025 path (not an app-level check)', async () => {
    // lists.ts's PATCH has no explicit not-found lookup, unlike todos/subtasks — its 404 only
    // exists because a P2025 from Prisma's own update() propagates to the central handler.
    await truncateAll();
    const list = await createList(app);
    await app.inject({ method: 'DELETE', url: `/api/lists/${list.id}` });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/lists/${list.id}`,
      payload: { title: 'too late' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
  });
});
