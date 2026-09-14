import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Prisma } from '@prisma/client';
import {
  CreateTodoBodySchema,
  ListParamsSchema,
  SOCKET_EVENTS,
  TodoParamsSchema,
  UpdateTodoBodySchema,
  type TodoDeletedPayload,
} from '@ubiquiti-todo/shared';
import { prisma } from '../prisma.js';
import { detectConflict } from '../conflict.js';
import { serializeTodo } from '../serializers.js';

export async function todosRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    '/api/lists/:listId/todos',
    { schema: { params: ListParamsSchema, body: CreateTodoBodySchema } },
    async (request) => {
      // Replaces three sequential queries (parent-exists check, idempotency check, create) with
      // one attempt at the create — see tasks/19. `prisma.todo.upsert` looked like the obvious fix
      // here but turned out not to be atomic: verified by query-logging it, it compiles to
      // BEGIN; SELECT id; INSERT; COMMIT rather than a native `INSERT ... ON CONFLICT`, so it still
      // raced under genuine concurrency (confirmed by firing two real concurrent requests — the
      // loser got Prisma's own P2002, not the idempotent 200). A bare `create` racing on the
      // database's own unique constraint is what's actually atomic: exactly one of two concurrent
      // inserts for the same id can succeed, full stop, so the loser's catch below is guaranteed to
      // find the winner's row already committed. A deleted/nonexistent list surfaces as a
      // foreign-key violation (P2003), mapped to 404 centrally in errorHandler.ts.
      const todoInclude = { subtasks: { orderBy: { position: 'asc' as const } } };
      const todo = await prisma.todo
        .create({
          data: {
            id: request.body.id,
            listId: request.params.listId,
            title: request.body.title,
            position: request.body.position,
            costCents: request.body.costCents ?? null,
            descriptionMd: request.body.descriptionMd ?? null,
          },
          include: todoInclude,
        })
        .catch((error) => {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
            throw error;
          }
          return prisma.todo.findUniqueOrThrow({
            where: { id: request.body.id },
            include: todoInclude,
          });
        });
      const serialized = serializeTodo(todo);
      // Broadcasting on the idempotent-retry path too (not just a genuine create) is harmless:
      // useListSocket's TODO_CREATED handler already dedupes by id before applying.
      app.broadcaster.broadcastToList(
        request.params.listId,
        request.clientId,
        SOCKET_EVENTS.TODO_CREATED,
        {
          todo: serialized,
        },
      );
      return { todo: serialized };
    },
  );

  server.patch(
    '/api/lists/:listId/todos/:todoId',
    { schema: { params: TodoParamsSchema, body: UpdateTodoBodySchema } },
    async (request, reply) => {
      const { base, ...updateData } = request.body;

      // Read + write in one transaction, both scoped to the parent listId: a mismatched listId
      // must 404 rather than mutate the row and broadcast to the wrong room (tasks/04 bug 1), and
      // wrapping both statements together means the conflict comparison and the write see the
      // same snapshot — a plain findUnique-then-update let another write land in between and get
      // compared against already-stale values (tasks/04 bug 2). A concurrent delete landing
      // between the findFirst and the update below (read-committed isolation doesn't serialize
      // across a transaction's own statements) throws Prisma's P2025, mapped to 404 centrally in
      // errorHandler.ts (tasks/09) rather than a try/catch here.
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
        request.clientId,
        SOCKET_EVENTS.TODO_UPDATED,
        {
          todo: serialized,
        },
      );
      return { todo: serialized, hadConflict: result.hadConflict };
    },
  );

  server.delete(
    '/api/lists/:listId/todos/:todoId',
    { schema: { params: TodoParamsSchema } },
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
          request.clientId,
          SOCKET_EVENTS.TODO_DELETED,
          payload,
        );
      }
      return reply.code(204).send();
    },
  );
}
