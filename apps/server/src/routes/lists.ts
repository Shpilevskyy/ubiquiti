import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CreateListBodySchema,
  ListParamsSchema,
  ListsQuerySchema,
  SOCKET_EVENTS,
  UpdateListBodySchema,
  type GetListResponse,
  type GetListsResponse,
  type ListDeletedPayload,
} from '@ubiquiti-todo/shared';
import { prisma } from '../prisma.js';
import { serializeList, serializeTodo } from '../serializers.js';

export async function listsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post('/api/lists', { schema: { body: CreateListBodySchema } }, async (request) => {
    const list = await prisma.list.create({ data: { title: request.body.title } });
    return { list: serializeList(list) };
  });

  // No user accounts, so there's no concept of "your lists" — this just lists every list that
  // exists. Deliberately public: fine for a demo app, deviates from specs/00-overview.md's
  // access-by-link scoping, see PROGRESS.md.
  // Paginated (tasks/14): lists are publicly creatable with no ownership, so this grows without
  // limit otherwise. Fetches one extra row to learn `hasMore` without a separate COUNT query.
  // Ordered by createdAt, not updatedAt (tasks/15): nothing touches a List row when its todos or
  // subtasks change (Prisma's @updatedAt only fires on writes to that row itself), so ordering by
  // updatedAt implied a "most recently active" order this never actually delivered — in practice
  // it was creation order wearing a misleading label. createdAt is the honest version of the same
  // order, with no extra write on every todo/subtask mutation and no broadcast-semantics question
  // about whether other clients care that a list's timestamp moved.
  server.get('/api/lists', { schema: { querystring: ListsQuerySchema } }, async (request) => {
    const { limit, offset } = request.query;
    const lists = await prisma.list.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      skip: offset,
    });
    const response: GetListsResponse = {
      lists: lists.slice(0, limit).map(serializeList),
      hasMore: lists.length > limit,
    };
    return response;
  });

  server.get('/api/lists/:listId', { schema: { params: ListParamsSchema } }, async (request, reply) => {
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

  server.patch(
    '/api/lists/:listId',
    { schema: { params: ListParamsSchema, body: UpdateListBodySchema } },
    async (request) => {
      // A missing list surfaces as Prisma's P2025 and is mapped to 404 centrally in
      // errorHandler.ts (tasks/09) rather than a try/catch here.
      const list = await prisma.list.update({
        where: { id: request.params.listId },
        data: request.body,
      });
      const serialized = serializeList(list);
      app.broadcaster.broadcastToList(list.id, request.clientId, SOCKET_EVENTS.LIST_UPDATED, {
        list: serialized,
      });
      return { list: serialized };
    },
  );

  server.delete('/api/lists/:listId', { schema: { params: ListParamsSchema } }, async (request, reply) => {
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
