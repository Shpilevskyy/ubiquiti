import {
  CLIENT_ID_HEADER,
  type CreateListBody,
  type CreateSubTaskBody,
  type CreateTodoBody,
  type ErrorResponse,
  type GetListResponse,
  type List,
  type SubTask,
  type Todo,
  type UpdateListBody,
  type UpdateSubTaskBody,
  type UpdateTodoBody,
} from '@ubiquiti-todo/shared';
import { getMember } from './member';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      [CLIENT_ID_HEADER]: getMember().id,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorResponse | null;
    throw new Error(body?.error.message ?? `Request failed with status ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  createList: (body: CreateListBody) =>
    request<{ list: List }>('/lists', { method: 'POST', body: JSON.stringify(body) }),

  getList: (listId: string) => request<GetListResponse>(`/lists/${listId}`),

  updateList: (listId: string, body: UpdateListBody) =>
    request<{ list: List }>(`/lists/${listId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  createTodo: (listId: string, body: CreateTodoBody) =>
    request<{ todo: Todo }>(`/lists/${listId}/todos`, { method: 'POST', body: JSON.stringify(body) }),

  updateTodo: (listId: string, todoId: string, body: UpdateTodoBody) =>
    request<{ todo: Todo }>(`/lists/${listId}/todos/${todoId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteTodo: (listId: string, todoId: string) =>
    request<void>(`/lists/${listId}/todos/${todoId}`, { method: 'DELETE' }),

  createSubTask: (listId: string, todoId: string, body: CreateSubTaskBody) =>
    request<{ subtask: SubTask }>(`/lists/${listId}/todos/${todoId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateSubTask: (listId: string, todoId: string, subtaskId: string, body: UpdateSubTaskBody) =>
    request<{ subtask: SubTask }>(`/lists/${listId}/todos/${todoId}/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteSubTask: (listId: string, todoId: string, subtaskId: string) =>
    request<void>(`/lists/${listId}/todos/${todoId}/subtasks/${subtaskId}`, {
      method: 'DELETE',
    }),
};
