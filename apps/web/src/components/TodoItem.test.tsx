import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetListResponse, List, SubTask, Todo } from '@ubiquiti-todo/shared';
import { TodoItem } from './TodoItem';
import { ListProvider } from '../context/ListContext';
import { api, sendOp } from '../lib/api';
import { connectionStatus } from '../lib/connectionStatus';

// Same rationale as useList.test.tsx: sendOp/api are stubbed at the same seam, and outboxSync's
// background loop is a no-op here (already exhaustively covered by outboxSync.test.ts) so these
// tests exercise only the real ListProvider -> useList -> mutateWithOutbox path that a real click
// in this component actually triggers.
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    sendOp: vi.fn(),
    api: { ...actual.api, getList: vi.fn(), deleteList: vi.fn(), updateList: vi.fn() },
  };
});
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

function makeSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'sub-1',
    todoId: 'todo-1',
    title: 'subtask',
    done: false,
    position: 'a0',
    costCents: null,
    version: 1,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

function renderTodoItem(listId: string, todo: Todo) {
  const list: List = {
    id: listId,
    title: 'Test list',
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
  };
  const seed: GetListResponse = { list, todos: [todo] };
  vi.mocked(api.getList).mockResolvedValue(seed);

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ListProvider listId={listId}>
          {/* The real DndContext/SortableContext TodoList normally provides — useSortable
              requires being rendered inside one. */}
          <DndContext>
            <SortableContext items={[todo.id]}>
              <ul>
                <TodoItem todo={todo} />
              </ul>
            </SortableContext>
          </DndContext>
        </ListProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient };
}

describe('TodoItem', () => {
  beforeEach(() => {
    connectionStatus.markOnline();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and an unchecked checkbox for an incomplete todo', async () => {
    const todo = makeTodo({ title: 'Buy milk', done: false });
    renderTodoItem(crypto.randomUUID(), todo);

    expect(await screen.findByText('Buy milk')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('renders a checked checkbox and strikethrough styling for a completed todo', async () => {
    const todo = makeTodo({ title: 'Buy milk', done: true });
    renderTodoItem(crypto.randomUUID(), todo);

    await screen.findByText('Buy milk');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('clicking the checkbox sends the toggle PATCH with the right body', async () => {
    const user = userEvent.setup();
    const todo = makeTodo({ id: 'todo-1', title: 'Buy milk', done: false });
    const listId = crypto.randomUUID();
    renderTodoItem(listId, todo);

    await screen.findByText('Buy milk');
    await user.click(screen.getByRole('checkbox'));

    await waitFor(() => {
      expect(sendOp).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          path: `/lists/${listId}/todos/todo-1`,
          body: { done: true, base: { done: false } },
        }),
      );
    });
  });

  it('the checkbox label makes the title the accessible name (tasks/16-accessibility.md)', async () => {
    const todo = makeTodo({ title: 'Buy milk' });
    renderTodoItem(crypto.randomUUID(), todo);

    await screen.findByText('Buy milk');
    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeInTheDocument();
  });

  it('renders subtask progress and hides the subtotal when nothing is priced', async () => {
    const todo = makeTodo({
      title: 'Buy milk',
      subtasks: [makeSubTask({ id: 's1', title: 'Whole', done: true, costCents: null })],
    });
    renderTodoItem(crypto.randomUUID(), todo);

    await screen.findByText('Buy milk');
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.queryByText(/Subtotal/)).not.toBeInTheDocument();
  });
});
