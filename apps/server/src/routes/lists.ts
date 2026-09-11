import type { FastifyInstance } from 'fastify';
import { Prisma, type List as PrismaList, type SubTask as PrismaSubTask, type Todo as PrismaTodo } from '@prisma/client';
import {
  CreateListBodySchema,
  UpdateListBodySchema,
  type GetListResponse,
  type List,
  type SubTask,
  type Todo,
} from '@ubiquiti-todo/shared';
import { prisma } from '../prisma.js';

function serializeList(list: PrismaList): List {
  return {
    id: list.id,
    title: list.title,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

function serializeSubTask(subtask: PrismaSubTask): SubTask {
  return {
    id: subtask.id,
    todoId: subtask.todoId,
    title: subtask.title,
    done: subtask.done,
    position: subtask.position,
    costCents: subtask.costCents,
    version: subtask.version,
    createdAt: subtask.createdAt.toISOString(),
    updatedAt: subtask.updatedAt.toISOString(),
  };
}

function serializeTodo(todo: PrismaTodo & { subtasks: PrismaSubTask[] }): Todo {
  return {
    id: todo.id,
    listId: todo.listId,
    title: todo.title,
    done: todo.done,
    position: todo.position,
    costCents: todo.costCents,
    descriptionMd: todo.descriptionMd,
    version: todo.version,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
    subtasks: todo.subtasks.map(serializeSubTask),
  };
}

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
      return { list: serializeList(list) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return reply.code(404).send({ error: { code: 'not_found', message: 'List not found' } });
      }
      throw err;
    }
  });
}
