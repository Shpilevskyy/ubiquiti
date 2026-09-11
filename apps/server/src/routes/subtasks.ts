import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { CreateSubTaskBodySchema, UpdateSubTaskBodySchema } from '@ubiquiti-todo/shared';
import { prisma } from '../prisma.js';
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
      return { subtask: serializeSubTask(subtask) };
    },
  );

  app.patch<{ Params: { listId: string; todoId: string; subtaskId: string } }>(
    '/api/lists/:listId/todos/:todoId/subtasks/:subtaskId',
    async (request, reply) => {
      const body = UpdateSubTaskBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: { code: 'invalid_body', message: body.error.message } });
      }

      try {
        const subtask = await prisma.subTask.update({
          where: { id: request.params.subtaskId },
          data: { ...body.data, version: { increment: 1 } },
        });
        return { subtask: serializeSubTask(subtask) };
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
      await prisma.subTask.deleteMany({ where: { id: request.params.subtaskId } });
      return reply.code(204).send();
    },
  );
}
