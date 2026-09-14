import {
  CLIENT_ID_HEADER,
  type CreateListBody,
  type ErrorResponse,
  type GetListResponse,
  type GetListsResponse,
  type List,
} from '@ubiquiti-todo/shared';
import { connectionStatus } from './connectionStatus';
import { getMember } from './member';

// Distinguishes "the server answered with an error status" from a network failure, so callers
// (the outbox flush logic) can tell a definitive 404 apart from something worth retrying.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        [CLIENT_ID_HEADER]: getMember().id,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch (err) {
    // A network error (not an HTTP error status) — mark offline immediately rather than waiting
    // for the browser's own online/offline events, see specs/06-offline-sync.md.
    connectionStatus.markOffline();
    throw err;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorResponse | null;
    throw new HttpError(res.status, body?.error.message ?? `Request failed with status ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// Generic send for a queued outbox operation (specs/06-offline-sync.md) — unlike the per-resource
// helpers below, the path here is whatever was persisted in the queue, e.g.
// `/lists/${listId}/todos/${todoId}` (no `/api` prefix, matching this file's own convention;
// the spec's illustrative path example includes it, but there's nothing that reads outbox paths
// except this function, so the two conventions just need to agree with each other).
export function sendOp<T>(op: { method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown }): Promise<T> {
  return request<T>(op.path, {
    method: op.method,
    ...(op.body !== undefined ? { body: JSON.stringify(op.body) } : {}),
  });
}

// Todo/SubTask create/update/delete all go through the outbox (sendOp above) instead — these are
// only the list-level operations that don't, since List has no version column and sits outside
// the conflict/outbox model entirely (see useList.ts).
export const api = {
  createList: (body: CreateListBody) =>
    request<{ list: List }>('/lists', { method: 'POST', body: JSON.stringify(body) }),

  getLists: () => request<GetListsResponse>('/lists'),

  getList: (listId: string) => request<GetListResponse>(`/lists/${listId}`),

  deleteList: (listId: string) => request<void>(`/lists/${listId}`, { method: 'DELETE' }),
};
