import type {
  List as PrismaList,
  SubTask as PrismaSubTask,
  Todo as PrismaTodo,
} from '@prisma/client';
import type { List, SubTask, Todo } from '@ubiquiti-todo/shared';

export function serializeList(list: PrismaList): List {
  return {
    id: list.id,
    title: list.title,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

export function serializeSubTask(subtask: PrismaSubTask): SubTask {
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

export function serializeTodo(todo: PrismaTodo & { subtasks: PrismaSubTask[] }): Todo {
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
