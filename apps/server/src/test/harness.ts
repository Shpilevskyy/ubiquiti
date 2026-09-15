import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { generateKeyBetween } from 'fractional-indexing';
import { vi } from 'vitest';
import type { List, SubTask, Todo } from '@ubiquiti-todo/shared';
import { buildApp } from '../app.js';
import { prisma } from '../prisma.js';
import type { SocketBroadcaster } from '../socket.js';

// buildApp() (tasks/23-testing.md step 2) is what makes any of this possible: a side-effect-free
// Fastify instance with no listen()/signal handlers, driven entirely through app.inject() below —
// no sockets, no ports.

export interface SpyBroadcaster extends SocketBroadcaster {
  broadcastToList: ReturnType<typeof vi.fn<SocketBroadcaster['broadcastToList']>>;
}

// A spy in place of the real Socket.IO-backed broadcaster (tasks/23-testing.md step 2's whole
// point) — lets a route test assert "this PATCH broadcast TODO_UPDATED to <listId> excluding
// <clientId>" with no sockets or ports, distinct from the one real end-to-end socket test in
// step 7.
export function createSpyBroadcaster(): SpyBroadcaster {
  return { broadcastToList: vi.fn<SocketBroadcaster['broadcastToList']>() };
}

export async function buildTestApp(): Promise<{
  app: FastifyInstance;
  broadcaster: SpyBroadcaster;
}> {
  const broadcaster = createSpyBroadcaster();
  const app = await buildApp({ broadcaster, isProduction: false, logger: false });
  return { app, broadcaster };
}

// The routes wrap their read + write in prisma.$transaction (tasks/04), so the usual
// wrap-each-test-in-a-transaction-and-roll-back isolation trick doesn't work here — TRUNCATE
// instead, per tasks/23-testing.md's Hazards section. Table order doesn't matter: CASCADE follows
// the FK relationships (SubTask -> Todo -> List) regardless of which table is named first.
export async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "SubTask", "Todo", "List" RESTART IDENTITY CASCADE',
  );
}

// A valid fractional-indexing key with no relationship to any sibling — good enough for tests
// that don't care about ordering, which is exercised separately by position.test.ts (step 4).
export function newPosition(): string {
  return generateKeyBetween(null, null);
}

export async function createList(app: FastifyInstance, title = 'Test list'): Promise<List> {
  const res = await app.inject({ method: 'POST', url: '/api/lists', payload: { title } });
  return res.json().list;
}

export async function createTodo(
  app: FastifyInstance,
  listId: string,
  overrides: Partial<{ id: string; title: string; position: string }> = {},
): Promise<Todo> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/lists/${listId}/todos`,
    payload: {
      id: overrides.id ?? randomUUID(),
      title: overrides.title ?? 'Test todo',
      position: overrides.position ?? newPosition(),
    },
  });
  return res.json().todo;
}

export async function createSubTask(
  app: FastifyInstance,
  listId: string,
  todoId: string,
  overrides: Partial<{ id: string; title: string; position: string }> = {},
): Promise<SubTask> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/lists/${listId}/todos/${todoId}/subtasks`,
    payload: {
      id: overrides.id ?? randomUUID(),
      title: overrides.title ?? 'Test subtask',
      position: overrides.position ?? newPosition(),
    },
  });
  return res.json().subtask;
}
