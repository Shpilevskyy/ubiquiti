import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetListResponse, List, Todo } from '@ubiquiti-todo/shared';
import { useList } from './useList';
import { api, sendOp } from '../lib/api';
import { connectionStatus } from '../lib/connectionStatus';
import { getQueue } from '../lib/outbox';

// Keeps the real HttpError class (mutateWithOutbox branches on `instanceof HttpError`/`.status`,
// same as outboxSync's retry policy) while stubbing sendOp and the three `api.*` methods useList
// itself calls — see tasks/23-testing.md's Tooling table.
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    sendOp: vi.fn(),
    api: { ...actual.api, getList: vi.fn(), deleteList: vi.fn(), updateList: vi.fn() },
  };
});

// The background flush/poll loop is exhaustively covered by outboxSync.test.ts (step 5); mocked
// here to a no-op so these tests exercise only useList's own *foreground* mutateWithOutbox path
// (the immediate send attempt), undisturbed by a concurrent background poll racing the same
// mocked sendOp.
//
// Deliberately NOT using outboxSync.test.ts's vi.resetModules()-per-test pattern here: that reset
// would also tear down React's own module instance (imported statically below, the same instance
// @testing-library/react's renderHook uses), breaking hooks entirely. Isolation instead comes
// from a fresh QueryClient and a fresh, random listId per test (so outbox/IndexedDB state — keyed
// by listId — never collides), plus an explicit connectionStatus.markOnline() reset, which is the
// only piece of cross-test module state useList's own code path actually touches.
vi.mock('../lib/outboxSync', () => ({
  start: () => () => {},
}));

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    listId: 'list-1',
    title: 'Buy milk',
    done: false,
    position: 'a0',
    costCents: null,
    descriptionMd: null,
    version: 1,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    subtasks: [],
    ...overrides,
  };
}

function makeListResponse(listId: string, todos: Todo[]): GetListResponse {
  const list: List = {
    id: listId,
    title: 'Test list',
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
  };
  return { list, todos };
}

function renderUseList(listId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  const rendered = renderHook(() => useList(listId), { wrapper });
  return { ...rendered, queryClient };
}

describe('useList', () => {
  beforeEach(() => {
    connectionStatus.markOnline();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('a toggle updates the cache immediately, then reconciles from the server response with no revert', async () => {
    const listId = crypto.randomUUID();
    const todo = makeTodo({ id: 'todo-1', done: false });
    const seed = makeListResponse(listId, [todo]);
    vi.mocked(api.getList).mockResolvedValue(seed);

    let resolveSend: ((value: unknown) => void) | undefined;
    vi.mocked(sendOp).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    const { result, queryClient } = renderUseList(listId);
    await waitFor(() => expect(result.current.listQuery.data).toEqual(seed));

    // Records every value the cache takes on, to prove `done` never reverts to false again after
    // the optimistic write below — not just that the *final* state is eventually correct.
    const doneHistory: boolean[] = [];
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey.join() !== ['list', listId].join()) return;
      const done = (event.query.state.data as GetListResponse | undefined)?.todos[0]?.done;
      if (done !== undefined) doneHistory.push(done);
    });

    act(() => {
      result.current.toggleTodo.mutate({ todoId: 'todo-1', done: true });
    });

    // The optimistic update lands before sendOp's promise has resolved — it's held open above.
    await waitFor(() => {
      const cached = queryClient.getQueryData<GetListResponse>(['list', listId]);
      expect(cached?.todos[0].done).toBe(true);
    });
    expect(sendOp).toHaveBeenCalledTimes(1);

    // Now the server responds — `version` only the server would set, so the assertion below can
    // only pass if the response was actually reconciled in, not just left at the optimistic guess.
    resolveSend?.({ todo: { ...todo, done: true, version: 99 }, hadConflict: false });
    await waitFor(() => {
      const cached = queryClient.getQueryData<GetListResponse>(['list', listId]);
      expect(cached?.todos[0].version).toBe(99);
    });

    unsubscribe();
    expect(doneHistory.length).toBeGreaterThan(0);
    expect(doneHistory.every((done) => done === true)).toBe(true); // never reverted to false
  });

  it('a 404 drops the queued op and invalidates the list', async () => {
    const listId = crypto.randomUUID();
    const todo = makeTodo({ id: 'todo-1' });
    const seed = makeListResponse(listId, [todo]);
    vi.mocked(api.getList).mockResolvedValue(seed);

    const { HttpError } = await vi.importActual<typeof import('../lib/api')>('../lib/api');
    vi.mocked(sendOp).mockRejectedValue(new HttpError(404, 'gone'));

    const { result } = renderUseList(listId);
    await waitFor(() => expect(result.current.listQuery.data).toEqual(seed));

    act(() => {
      result.current.toggleTodo.mutate({ todoId: 'todo-1', done: true });
    });

    await waitFor(async () => {
      expect(await getQueue(listId)).toEqual([]); // dropped, not left queued
    });
    // invalidateQueries() on an active query triggers a refetch — the mount fetch plus this one.
    await waitFor(() => expect(api.getList).toHaveBeenCalledTimes(2));
  });

  it('a network error leaves the op queued rather than dropping it', async () => {
    const listId = crypto.randomUUID();
    const todo = makeTodo({ id: 'todo-1' });
    const seed = makeListResponse(listId, [todo]);
    vi.mocked(api.getList).mockResolvedValue(seed);
    vi.mocked(sendOp).mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderUseList(listId);
    await waitFor(() => expect(result.current.listQuery.data).toEqual(seed));

    act(() => {
      result.current.toggleTodo.mutate({ todoId: 'todo-1', done: true });
    });

    await waitFor(() => expect(sendOp).toHaveBeenCalledTimes(1));
    await waitFor(async () => {
      const queue = await getQueue(listId);
      expect(queue).toHaveLength(1);
      expect(queue[0].path).toBe(`/lists/${listId}/todos/todo-1`);
    });
  });

  it('deleteList fails fast with a notice while offline, without attempting the request', async () => {
    const listId = crypto.randomUUID();
    vi.mocked(api.getList).mockResolvedValue(makeListResponse(listId, []));
    connectionStatus.markOffline();

    const { result } = renderUseList(listId);
    await waitFor(() => expect(result.current.listQuery.data).toBeDefined());

    act(() => {
      result.current.deleteList.mutate();
    });

    await waitFor(() => expect(result.current.conflictNotice).toBe("Can't delete while offline"));
    expect(api.deleteList).not.toHaveBeenCalled();
  });

  it('updateListTitle fails fast with a notice while offline, without attempting the request', async () => {
    const listId = crypto.randomUUID();
    vi.mocked(api.getList).mockResolvedValue(makeListResponse(listId, []));
    connectionStatus.markOffline();

    const { result } = renderUseList(listId);
    await waitFor(() => expect(result.current.listQuery.data).toBeDefined());

    act(() => {
      result.current.updateListTitle.mutate('New title');
    });

    await waitFor(() => expect(result.current.conflictNotice).toBe("Can't rename while offline"));
    expect(api.updateList).not.toHaveBeenCalled();
  });
});
