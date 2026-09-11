import { z } from 'zod';

export interface HelloResponse {
  message: string;
  timestamp: string;
}

export const SOCKET_EVENTS = {
  HELLO: 'hello',
} as const;

export const ListSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type List = z.infer<typeof ListSchema>;

export const SubTaskSchema = z.object({
  id: z.uuid(),
  todoId: z.uuid(),
  title: z.string(),
  done: z.boolean(),
  position: z.number(),
  costCents: z.number().int().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SubTask = z.infer<typeof SubTaskSchema>;

export const TodoSchema = z.object({
  id: z.uuid(),
  listId: z.uuid(),
  title: z.string(),
  done: z.boolean(),
  position: z.number(),
  costCents: z.number().int().nullable(),
  descriptionMd: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  subtasks: z.array(SubTaskSchema),
});
export type Todo = z.infer<typeof TodoSchema>;

export const CreateListBodySchema = z.object({
  title: z.string().min(1),
});
export type CreateListBody = z.infer<typeof CreateListBodySchema>;

export const UpdateListBodySchema = z.object({
  title: z.string().min(1).optional(),
});
export type UpdateListBody = z.infer<typeof UpdateListBodySchema>;

export interface GetListResponse {
  list: List;
  todos: Todo[];
}

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
