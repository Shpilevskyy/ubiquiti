import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  CLIENT_ID_HEADER,
  CreateTodoBodySchema,
  SOCKET_EVENTS,
  UpdateTodoBodySchema,
  type TodoDeletedPayload,
} from '@ubiquiti-todo/shared';
import { prisma } from '../prisma.js';
import { detectConflict } from '../conflict.js';
import { serializeTodo } from '../serializers.js';

export async function todosRoutes(app: FastifyInstance) {
  app.post<{ Params: { listId: string } }>('/api/lists/:listId/todos', async (request, reply) => {
    const body = CreateTodoBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: 'invalid_body', message: body.error.message } });
    }

    const list = await prisma.list.findUnique({ where: { id: request.params.listId } });
    if (!list) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'List not found' } });
    }

    const existing = await prisma.todo.findUnique({
      where: { id: body.data.id },
      include: { subtasks: { orderBy: { position: 'asc' } } },
    });
    if (existing) {
      return { todo: serializeTodo(existing) };
    }

    const todo = await prisma.todo.create({
      data: {
        id: body.data.id,
        listId: request.params.listId,
        title: body.data.title,
        position: body.data.position,
        costCents: body.data.costCents ?? null,
        descriptionMd: body.data.descriptionMd ?? null,
      },
      include: { subtasks: { orderBy: { position: 'asc' } } },
    });
    const serialized = serializeTodo(todo);
    app.broadcaster.broadcastToList(
      request.params.listId,
      request.headers[CLIENT_ID_HEADER] as string | undefined,
      SOCKET_EVENTS.TODO_CREATED,
      { todo: serialized },
    );
    return { todo: serialized };
  });

  app.patch<{ Params: { listId: string; todoId: string } }>(
    '/api/lists/:listId/todos/:todoId',
    async (request, reply) => {
      const body = UpdateTodoBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: { code: 'invalid_body', message: body.error.message } });
      }

      const { base, ...updateData } = body.data;

      try {
        // Read + write in one transaction, both scoped to the parent listId: a mismatched listId
        // must 404 rather than mutate the row and broadcast to the wrong room (tasks/04 bug 1),
        // and wrapping both statements together means the conflict comparison and the write see
        // the same snapshot — a plain findUnique-then-update let another write land in between
        // and get compared against already-stale values (tasks/04 bug 2).
        const result = await prisma.$transaction(async (tx) => {
          const current = await tx.todo.findFirst({
            where: { id: request.params.todoId, listId: request.params.listId },
          });
          if (!current) return null;

          const hadConflict = detectConflict(current, base);
          const todo = await tx.todo.update({
            where: { id: request.params.todoId },
            data: { ...updateData, version: { increment: 1 } },
            include: { subtasks: { orderBy: { position: 'asc' } } },
          });
          return { todo, hadConflict };
        });

        if (!result) {
          return reply.code(404).send({ error: { code: 'not_found', message: 'Todo not found' } });
        }

        const serialized = serializeTodo(result.todo);
        app.broadcaster.broadcastToList(
          request.params.listId,
          request.headers[CLIENT_ID_HEADER] as string | undefined,
          SOCKET_EVENTS.TODO_UPDATED,
          { todo: serialized },
        );
        return { todo: serialized, hadConflict: result.hadConflict };
      } catch (err) {
        // Still possible even inside the transaction: a concurrent delete landing between the
        // findFirst and the update (read-committed isolation doesn't serialize across statements).
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.code(404).send({ error: { code: 'not_found', message: 'Todo not found' } });
        }
        throw err;
      }
    },
  );

  app.delete<{ Params: { listId: string; todoId: string } }>(
    '/api/lists/:listId/todos/:todoId',
    async (request, reply) => {
      // A todo that exists under a *different* list is a genuine mismatch (tasks/04 bug 1) and
      // 404s rather than silently no-op'ing; a todo that doesn't exist at all is a legitimate
      // idempotent delete-retry and still 204s, per specs/03-api-rest.md's idempotency contract —
      // the two are indistinguishable from a single scoped deleteMany's count alone.
      const existing = await prisma.todo.findUnique({ where: { id: request.params.todoId } });
      if (existing && existing.listId !== request.params.listId) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Todo not found' } });
      }

      const { count } = await prisma.todo.deleteMany({
        where: { id: request.params.todoId, listId: request.params.listId },
      });
      if (count > 0) {
        const payload: TodoDeletedPayload = { todoId: request.params.todoId };
        app.broadcaster.broadcastToList(
          request.params.listId,
          request.headers[CLIENT_ID_HEADER] as string | undefined,
          SOCKET_EVENTS.TODO_DELETED,
          payload,
        );
      }
      return reply.code(204).send();
    },
  );
}
