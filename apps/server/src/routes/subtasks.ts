import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  CLIENT_ID_HEADER,
  CreateSubTaskBodySchema,
  SOCKET_EVENTS,
  UpdateSubTaskBodySchema,
  type SubTaskCreatedPayload,
  type SubTaskDeletedPayload,
  type SubTaskUpdatedPayload,
} from '@ubiquiti-todo/shared';
import { prisma } from '../prisma.js';
import { detectConflict } from '../conflict.js';
import { serializeSubTask } from '../serializers.js';

export async function subtasksRoutes(app: FastifyInstance) {
  app.post<{ Params: { listId: string; todoId: string } }>(
    '/api/lists/:listId/todos/:todoId/subtasks',
    async (request, reply) => {
      const body = CreateSubTaskBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: { code: 'invalid_body', message: body.error.message } });
      }

      const todo = await prisma.todo.findUnique({ where: { id: request.params.todoId } });
      if (!todo) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Todo not found' } });
      }

      const existing = await prisma.subTask.findUnique({ where: { id: body.data.id } });
      if (existing) {
        return { subtask: serializeSubTask(existing) };
      }

      const subtask = await prisma.subTask.create({
        data: {
          id: body.data.id,
          todoId: request.params.todoId,
          title: body.data.title,
          position: body.data.position,
          costCents: body.data.costCents ?? null,
        },
      });
      const serialized = serializeSubTask(subtask);
      const payload: SubTaskCreatedPayload = { todoId: request.params.todoId, subtask: serialized };
      app.broadcaster.broadcastToList(
        request.params.listId,
        request.headers[CLIENT_ID_HEADER] as string | undefined,
        SOCKET_EVENTS.SUBTASK_CREATED,
        payload,
      );
      return { subtask: serialized };
    },
  );

  app.patch<{ Params: { listId: string; todoId: string; subtaskId: string } }>(
    '/api/lists/:listId/todos/:todoId/subtasks/:subtaskId',
    async (request, reply) => {
      const body = UpdateSubTaskBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: { code: 'invalid_body', message: body.error.message } });
      }

      const { base, ...updateData } = body.data;

      try {
        // See the identical comment in todos.ts's PATCH handler: one transaction scoped to the
        // parent todoId fixes both the wrong-room broadcast (tasks/04 bug 1) and the TOCTOU
        // conflict check (tasks/04 bug 2).
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
        app.broadcaster.broadcastToList(
          request.params.listId,
          request.headers[CLIENT_ID_HEADER] as string | undefined,
          SOCKET_EVENTS.SUBTASK_UPDATED,
          payload,
        );
        return { subtask: serialized, hadConflict: result.hadConflict };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return reply.code(404).send({ error: { code: 'not_found', message: 'SubTask not found' } });
        }
        throw err;
      }
    },
  );

  app.delete<{ Params: { listId: string; todoId: string; subtaskId: string } }>(
    '/api/lists/:listId/todos/:todoId/subtasks/:subtaskId',
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
          request.headers[CLIENT_ID_HEADER] as string | undefined,
          SOCKET_EVENTS.SUBTASK_DELETED,
          payload,
        );
      }
      return reply.code(204).send();
    },
  );
}
