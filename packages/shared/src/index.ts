import { z } from 'zod';

export const SOCKET_EVENTS = {
  LIST_JOIN: 'list:join',
  LIST_LEAVE: 'list:leave',
  LIST_UPDATED: 'list:updated',
  LIST_DELETED: 'list:deleted',
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

// The fields a PATCH is allowed to write. Declared once so `base` below can't drift out of
// lockstep with the set of fields that are actually writable.
const TodoMutableSchema = z.object({
  title: z.string().min(1),
  done: z.boolean(),
  position: z.number(),
  costCents: z.number().int().nullable(),
  descriptionMd: z.string().nullable(),
});
export type TodoMutableFields = z.infer<typeof TodoMutableSchema>;

export const UpdateTodoBodySchema = TodoMutableSchema.partial().extend({
  // The values this client last saw for the fields it is writing — see
  // specs/05-sync-conflict-resolution.md. The server compares them against the row's current
  // values to decide whether this write actually clobbered someone else's change. Omitting it
  // skips the check; the write applies either way.
  //
  // Deliberately *values*, not the row's `version`. A PATCH only writes the fields it names, so
  // a row-level counter reports a conflict for any concurrent edit to the row — including one to
  // a field this write never touches — and fires "also edited elsewhere" when nothing was lost.
  // `version` is still on the row, but its job is broadcast ordering (see
  // specs/04-realtime-protocol.md#ordering), not conflict detection.
  base: TodoMutableSchema.partial().optional(),
});
export type UpdateTodoBody = z.infer<typeof UpdateTodoBodySchema>;

export const CreateSubTaskBodySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  position: z.number(),
  costCents: z.number().int().nullable().optional(),
});
export type CreateSubTaskBody = z.infer<typeof CreateSubTaskBodySchema>;

const SubTaskMutableSchema = z.object({
  title: z.string().min(1),
  done: z.boolean(),
  position: z.number(),
  costCents: z.number().int().nullable(),
});
export type SubTaskMutableFields = z.infer<typeof SubTaskMutableSchema>;

export const UpdateSubTaskBodySchema = SubTaskMutableSchema.partial().extend({
  // See UpdateTodoBodySchema.base above.
  base: SubTaskMutableSchema.partial().optional(),
});
export type UpdateSubTaskBody = z.infer<typeof UpdateSubTaskBodySchema>;

// Route param schemas (tasks/09) — the body schemas above were always validated; :listId/:todoId/
// :subtaskId were typed as `string` and passed straight to Prisma with no format check at all.
export const ListParamsSchema = z.object({ listId: z.uuid() });
export type ListParams = z.infer<typeof ListParamsSchema>;

export const TodoParamsSchema = z.object({ listId: z.uuid(), todoId: z.uuid() });
export type TodoParams = z.infer<typeof TodoParamsSchema>;

export const SubTaskParamsSchema = z.object({ listId: z.uuid(), todoId: z.uuid(), subtaskId: z.uuid() });
export type SubTaskParams = z.infer<typeof SubTaskParamsSchema>;

export interface GetListResponse {
  list: List;
  todos: Todo[];
}

// GET /api/lists pagination (tasks/14): lists are public with no ownership, so this endpoint was
// unbounded and trivially abusable — anyone can create lists forever. Offset-based rather than
// cursor-based: simpler, and a "Show more" button (rather than infinite scroll) is all the UI
// needs, per the task's own framing.
export const LISTS_PAGE_SIZE = 50;

export const ListsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(LISTS_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListsQuery = z.infer<typeof ListsQuerySchema>;

export interface GetListsResponse {
  lists: List[];
  hasMore: boolean;
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
export interface ListDeletedPayload {
  listId: string;
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
