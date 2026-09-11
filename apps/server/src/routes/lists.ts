import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  CLIENT_ID_HEADER,
  CreateListBodySchema,
  SOCKET_EVENTS,
  UpdateListBodySchema,
  type GetListResponse,
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

  app.get<{ Params: { listId: string } }>('/api/lists/:listId', async (request, reply) => {
    const list = await prisma.list.findUnique({
      where: { id: request.params.listId },
      include: { todos: { include: { subtasks: true }, orderBy: { position: 'asc' } } },
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

    try {
      const list = await prisma.list.update({
        where: { id: request.params.listId },
        data: body.data,
      });
      const serialized = serializeList(list);
      app.broadcaster.broadcastToList(
        list.id,
        request.headers[CLIENT_ID_HEADER] as string | undefined,
        SOCKET_EVENTS.LIST_UPDATED,
        { list: serialized },
      );
      return { list: serialized };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return reply.code(404).send({ error: { code: 'not_found', message: 'List not found' } });
      }
      throw err;
    }
  });
}
