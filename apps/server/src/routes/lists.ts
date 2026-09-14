import type { FastifyInstance } from 'fastify';
import {
  CreateListBodySchema,
  SOCKET_EVENTS,
  UpdateListBodySchema,
  type GetListResponse,
  type GetListsResponse,
  type ListDeletedPayload,
} from '@ubiquiti-todo/shared';
import { prisma } from '../prisma.js';
import { serializeList, serializeTodo } from '../serializers.js';

export async function listsRoutes(app: FastifyInstance) {
  app.post('/api/lists', async (request, reply) => {
    const body = CreateListBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: 'invalid_body', message: body.error.message } });
    }

    const list = await prisma.list.create({ data: { title: body.data.title } });
    return { list: serializeList(list) };
  });

  // No user accounts, so there's no concept of "your lists" — this just lists every list that
  // exists. Deliberately public: fine for a demo app, deviates from specs/00-overview.md's
  // access-by-link scoping, see PROGRESS.md.
  app.get('/api/lists', async () => {
    const lists = await prisma.list.findMany({ orderBy: { updatedAt: 'desc' } });
    const response: GetListsResponse = { lists: lists.map(serializeList) };
    return response;
  });

  app.get<{ Params: { listId: string } }>('/api/lists/:listId', async (request, reply) => {
    const list = await prisma.list.findUnique({
      where: { id: request.params.listId },
      include: {
        todos: {
          include: { subtasks: { orderBy: { position: 'asc' } } },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!list) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'List not found' } });
    }

    const response: GetListResponse = {
      list: serializeList(list),
      todos: list.todos.map(serializeTodo),
    };
    return response;
  });

  app.patch<{ Params: { listId: string } }>('/api/lists/:listId', async (request, reply) => {
    const body = UpdateListBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: 'invalid_body', message: body.error.message } });
    }

    // A missing list surfaces as Prisma's P2025 and is mapped to 404 centrally in
    // errorHandler.ts (tasks/09) rather than a try/catch here.
    const list = await prisma.list.update({
      where: { id: request.params.listId },
      data: body.data,
    });
    const serialized = serializeList(list);
    app.broadcaster.broadcastToList(list.id, request.clientId, SOCKET_EVENTS.LIST_UPDATED, {
      list: serialized,
    });
    return { list: serialized };
  });

  app.delete<{ Params: { listId: string } }>('/api/lists/:listId', async (request, reply) => {
    // deleteMany, not delete, so this is idempotent (deleting an already-gone list still 204s) —
    // same convention as the todo/subtask deletes, see specs/03-api-rest.md#idempotency-via-client-generated-ids.
    // Todos/SubTasks cascade via the schema's onDelete: Cascade, no manual cleanup needed.
    const { count } = await prisma.list.deleteMany({ where: { id: request.params.listId } });
    if (count > 0) {
      const payload: ListDeletedPayload = { listId: request.params.listId };
      app.broadcaster.broadcastToList(
        request.params.listId,
        request.clientId,
        SOCKET_EVENTS.LIST_DELETED,
        payload,
      );
    }
    return reply.code(204).send();
  });
}
