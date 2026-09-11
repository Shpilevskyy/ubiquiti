import { z } from 'zod';

export interface HelloResponse {
  message: string;
  timestamp: string;
}

export const SOCKET_EVENTS = {
  HELLO: 'hello',
  LIST_JOIN: 'list:join',
  LIST_LEAVE: 'list:leave',
  LIST_UPDATED: 'list:updated',
  TODO_CREATED: 'todo:created',
  TODO_UPDATED: 'todo:updated',
  TODO_DELETED: 'todo:deleted',
  SUBTASK_CREATED: 'subtask:created',
  SUBTASK_UPDATED: 'subtask:updated',
  SUBTASK_DELETED: 'subtask:deleted',
  PRESENCE_UPDATE: 'presence:update',
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

export const CreateTodoBodySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  position: z.number(),
  costCents: z.number().int().nullable().optional(),
  descriptionMd: z.string().nullable().optional(),
});
export type CreateTodoBody = z.infer<typeof CreateTodoBodySchema>;

export const UpdateTodoBodySchema = z.object({
  title: z.string().min(1).optional(),
  done: z.boolean().optional(),
  position: z.number().optional(),
  costCents: z.number().int().nullable().optional(),
  descriptionMd: z.string().nullable().optional(),
  // The `version` the client last saw for this row — see specs/05-sync-conflict-resolution.md.
  // Omitting it just skips the conflict check; the write still applies either way.
  baseVersion: z.number().int().optional(),
});
export type UpdateTodoBody = z.infer<typeof UpdateTodoBodySchema>;

export const CreateSubTaskBodySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  position: z.number(),
  costCents: z.number().int().nullable().optional(),
});
export type CreateSubTaskBody = z.infer<typeof CreateSubTaskBodySchema>;

export const UpdateSubTaskBodySchema = z.object({
  title: z.string().min(1).optional(),
  done: z.boolean().optional(),
  position: z.number().optional(),
  costCents: z.number().int().nullable().optional(),
  // See UpdateTodoBodySchema.baseVersion above.
  baseVersion: z.number().int().optional(),
});
export type UpdateSubTaskBody = z.infer<typeof UpdateSubTaskBodySchema>;

export interface GetListResponse {
  list: List;
  todos: Todo[];
}

// The header a client sends on every mutation request so the server can exclude that client's
// socket(s) from the realtime broadcast for that mutation — see specs/04-realtime-protocol.md.
export const CLIENT_ID_HEADER = 'x-client-id';

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export interface ListJoinPayload {
  listId: string;
  member: Member;
}
export interface ListLeavePayload {
  listId: string;
}
export interface PresenceUpdatePayload {
  members: Member[];
}
export interface TodoDeletedPayload {
  todoId: string;
}
export interface SubTaskCreatedPayload {
  todoId: string;
  subtask: SubTask;
}
export interface SubTaskUpdatedPayload {
  todoId: string;
  subtask: SubTask;
}
export interface SubTaskDeletedPayload {
  todoId: string;
  subtaskId: string;
}

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
