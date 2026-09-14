import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TodoList } from '../components/TodoList';
import { ListProvider, useListContext } from '../context/ListContext';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { useListSocket } from '../hooks/useListSocket';
import { formatCents, listTotalCents } from '../lib/cost';

export function ListPage() {
  const { listId } = useParams<{ listId: string }>();
  if (!listId) return null;

  return (
    <ListProvider listId={listId}>
      <ListPageContent listId={listId} />
    </ListProvider>
  );
}

function ListPageContent({ listId }: { listId: string }) {
  const [newTodoTitle, setNewTodoTitle] = useState('');

  const others = useListSocket(listId);
  const connectionStatus = useConnectionStatus();

  const { listQuery, createTodo, deleteList, conflictNotice, dismissConflictNotice } = useListContext();

  // `data` is checked before `isError`, not after: TanStack's 'error' action (query-core's
  // #dispatch) sets `status: 'error'` on ANY failed fetch — including a background refetch on an
  // already-successful query — without clearing the existing `data`. Checking `isError` first
  // would hide perfectly good cached data behind an error screen the instant that background
  // fetch fails, which is now the *common* case, not an edge case: tasks/13's persisted query
  // cache (piece 2) means a cold offline mount always has persisted `data` and always fails its
  // mount-time fetch (networkMode: 'always') while offline — exactly the scenario persistence
  // exists to serve. `isError` is only reachable now when there's truly no data to fall back on
  // (first-ever load of a list, e.g. a bad link, failing before anything was cached).
  if (!listQuery.data) {
    if (listQuery.isError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-sm text-red-600">
            Failed to load list: {(listQuery.error as Error).message}
          </p>
        </main>
      );
    }
    // Defensive, not just belt-and-braces: a non-null assertion on query data is never safe
    // across every TanStack state (tasks/06) — isLoading/isError can both be false with data
    // still undefined, and asserting past that crashed this page with a blank screen.
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  const { list, todos } = listQuery.data;
  const totalCents = listTotalCents(todos);

  function handleAddTodo(event: FormEvent) {
    event.preventDefault();
    if (!newTodoTitle.trim()) return;
    createTodo.mutate(newTodoTitle.trim());
    setNewTodoTitle('');
  }

  function handleDeleteList() {
    if (!window.confirm(`Delete "${list.title}" and everything in it? This can't be undone.`)) return;
    deleteList.mutate();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <span aria-hidden="true">←</span> Back to lists
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="min-w-0 truncate text-xl font-semibold text-slate-900">{list.title}</h1>
            {totalCents > 0 && <span className="text-sm text-slate-400">Total: {formatCents(totalCents)}</span>}
          </div>

          <div className="flex items-center gap-3">
            {connectionStatus === 'offline' && (
              <span
                role="status"
                className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
              >
                Offline
              </span>
            )}
            {others.length > 0 && (
              <div className="flex -space-x-2">
                {others.map((member) => (
                  <span
                    key={member.id}
                    role="img"
                    title={`${member.name} is viewing`}
                    aria-label={`${member.name} is viewing`}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white ring-2 ring-white"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name[0]?.toUpperCase()}
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={handleDeleteList}
              disabled={deleteList.isPending}
              className="text-xs text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete list
            </button>
          </div>
        </div>

        <TodoList todos={todos} />

        <form onSubmit={handleAddTodo} className="mt-6 flex gap-2 border-t border-slate-200 pt-6">
          <input
            value={newTodoTitle}
            onChange={(event) => setNewTodoTitle(event.target.value)}
            placeholder="New todo"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <button
            type="submit"
            disabled={!newTodoTitle.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>

      {conflictNotice && (
        // `role="status"` is a live-region role — ARIA treats it as non-interactive, so it can't
        // also take tabIndex/keyboard focus (tasks/16-accessibility.md's own "quick wins" note:
        // the role is already correct, leave it). Click-to-dismiss stays as a mouse convenience;
        // it isn't a reachability gap, since this toast auto-dismisses on its own after 4s either
        // way — nothing is only reachable through it.
        // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
        <div
          role="status"
          onClick={dismissConflictNotice}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {conflictNotice}
        </div>
      )}
    </main>
  );
}
