import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Prisma } from '@prisma/client';
import {
  CreateSubTaskBodySchema,
  SOCKET_EVENTS,
  SubTaskParamsSchema,
  TodoParamsSchema,
  UpdateSubTaskBodySchema,
  type SubTaskCreatedPayload,
  type SubTaskDeletedPayload,
  type SubTaskUpdatedPayload,
} from '@ubiquiti-todo/shared';
import { prisma } from '../prisma.js';
import { detectConflict } from '../conflict.js';
import { serializeSubTask } from '../serializers.js';

export async function subtasksRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    '/api/lists/:listId/todos/:todoId/subtasks',
    { schema: { params: TodoParamsSchema, body: CreateSubTaskBodySchema } },
    async (request) => {
      // Same fix as todos.ts's POST, including the same upsert-isn't-actually-atomic finding —
      // see tasks/19 and the comment there. A bare `create` racing on the database's own unique
      // constraint on `id`, with the loser catching P2002 and re-fetching, is what's genuinely
      // atomic. A deleted/nonexistent todo surfaces as a foreign-key violation (P2003), mapped to
      // 404 centrally in errorHandler.ts.
      const subtask = await prisma.subTask
        .create({
          data: {
            id: request.body.id,
            todoId: request.params.todoId,
            title: request.body.title,
            position: request.body.position,
            costCents: request.body.costCents ?? null,
          },
        })
        .catch((error) => {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
            throw error;
          }
          return prisma.subTask.findUniqueOrThrow({ where: { id: request.body.id } });
        });
      const serialized = serializeSubTask(subtask);
      // Broadcasting on the idempotent-retry path too is harmless: useListSocket's
      // SUBTASK_CREATED handler already dedupes by id before applying.
      const payload: SubTaskCreatedPayload = { todoId: request.params.todoId, subtask: serialized };
      app.broadcaster.broadcastToList(
        request.params.listId,
        request.clientId,
        SOCKET_EVENTS.SUBTASK_CREATED,
        payload,
      );
      return { subtask: serialized };
    },
  );

  server.patch(
    '/api/lists/:listId/todos/:todoId/subtasks/:subtaskId',
    { schema: { params: SubTaskParamsSchema, body: UpdateSubTaskBodySchema } },
    async (request, reply) => {
      const { base, ...updateData } = request.body;

      // See the identical comment in todos.ts's PATCH handler: one transaction scoped to the
      // parent todoId fixes both the wrong-room broadcast (tasks/04 bug 1) and the TOCTOU conflict
      // check (tasks/04 bug 2); a concurrent delete landing inside the transaction throws P2025,
      // mapped to 404 centrally in errorHandler.ts (tasks/09) rather than a try/catch here.
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.subTask.findFirst({
          where: { id: request.params.subtaskId, todoId: request.params.todoId },
        });
        if (!current) return null;

        const hadConflict = detectConflict(current, base);
        const subtask = await tx.subTask.update({
          where: { id: request.params.subtaskId },
          data: { ...updateData, version: { increment: 1 } },
        });
        return { subtask, hadConflict };
      });

      if (!result) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'SubTask not found' } });
      }

      const serialized = serializeSubTask(result.subtask);
      const payload: SubTaskUpdatedPayload = { todoId: request.params.todoId, subtask: serialized };
      app.broadcaster.broadcastToList(request.params.listId, request.clientId, SOCKET_EVENTS.SUBTASK_UPDATED, payload);
      return { subtask: serialized, hadConflict: result.hadConflict };
    },
  );

  server.delete(
    '/api/lists/:listId/todos/:todoId/subtasks/:subtaskId',
    { schema: { params: SubTaskParamsSchema } },
    async (request, reply) => {
      // See the identical comment in todos.ts's DELETE handler: a subtask under a *different*
      // todo 404s (tasks/04 bug 1); one that doesn't exist at all stays a 204 idempotent retry.
      const existing = await prisma.subTask.findUnique({ where: { id: request.params.subtaskId } });
      if (existing && existing.todoId !== request.params.todoId) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'SubTask not found' } });
      }

      const { count } = await prisma.subTask.deleteMany({
        where: { id: request.params.subtaskId, todoId: request.params.todoId },
      });
      if (count > 0) {
        const payload: SubTaskDeletedPayload = {
          todoId: request.params.todoId,
          subtaskId: request.params.subtaskId,
        };
        app.broadcaster.broadcastToList(
          request.params.listId,
          request.clientId,
          SOCKET_EVENTS.SUBTASK_DELETED,
          payload,
        );
      }
      return reply.code(204).send();
    },
  );
}
