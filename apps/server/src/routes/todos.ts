import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { CreateTodoBodySchema, UpdateTodoBodySchema } from '@ubiquiti-todo/shared';
import { prisma } from '../prisma.js';
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
      include: { subtasks: true },
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
      include: { subtasks: true },
    });
    return { todo: serializeTodo(todo) };
  });

  app.patch<{ Params: { listId: string; todoId: string } }>(
    '/api/lists/:listId/todos/:todoId',
    async (request, reply) => {
      const body = UpdateTodoBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: { code: 'invalid_body', message: body.error.message } });
      }

      try {
        const todo = await prisma.todo.update({
          where: { id: request.params.todoId },
          data: { ...body.data, version: { increment: 1 } },
          include: { subtasks: true },
        });
        return { todo: serializeTodo(todo) };
      } catch (err) {
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
      await prisma.todo.deleteMany({ where: { id: request.params.todoId } });
      return reply.code(204).send();
    },
  );
}
