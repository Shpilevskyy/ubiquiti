import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { useList } from '../hooks/useList';
import { useListSocket } from '../hooks/useListSocket';

export function ListPage() {
  const { listId } = useParams<{ listId: string }>();
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newSubTaskTitles, setNewSubTaskTitles] = useState<Record<string, string>>({});

  const others = useListSocket(listId);
  const connectionStatus = useConnectionStatus();

  const {
    listQuery,
    createTodo,
    toggleTodo,
    deleteTodo,
    createSubTask,
    toggleSubTask,
    deleteSubTask,
    deleteList,
    conflictNotice,
    dismissConflictNotice,
  } = useList(listId);

  if (!listId) return null;
  if (listQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }
  if (listQuery.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-red-600">
          Failed to load list: {(listQuery.error as Error).message}
        </p>
      </main>
    );
  }

  const { list, todos } = listQuery.data!;

  function handleAddTodo(event: FormEvent) {
    event.preventDefault();
    if (!newTodoTitle.trim()) return;
    createTodo.mutate(newTodoTitle.trim());
    setNewTodoTitle('');
  }

  function handleAddSubTask(event: FormEvent, todoId: string) {
    event.preventDefault();
    const title = (newSubTaskTitles[todoId] ?? '').trim();
    if (!title) return;
    createSubTask.mutate({ todoId, title });
    setNewSubTaskTitles((titles) => ({ ...titles, [todoId]: '' }));
  }

  function handleDeleteList() {
    if (!window.confirm(`Delete "${list.title}" and everything in it? This can't be undone.`)) return;
    deleteList.mutate();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{list.title}</h1>

          <div className="flex items-center gap-3">
            {connectionStatus === 'offline' && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Offline
              </span>
            )}
            {others.length > 0 && (
              <div className="flex -space-x-2">
                {others.map((member) => (
                  <span
                    key={member.id}
                    title={`${member.name} is viewing`}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white ring-2 ring-white"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name[0]?.toUpperCase()}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={handleDeleteList}
              disabled={deleteList.isPending}
              className="text-xs text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete list
            </button>
          </div>
        </div>

        <ul className="mt-6 flex flex-col gap-1">
          {todos.map((todo) => (
            <li key={todo.id} className="rounded-lg py-2">
              <div className="group flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() =>
                    toggleTodo.mutate({ todoId: todo.id, done: !todo.done, baseVersion: todo.version })
                  }
                  className="h-4 w-4 shrink-0 accent-indigo-600"
                />
                <span
                  className={`flex-1 text-sm text-slate-900 ${todo.done ? 'text-slate-400 line-through' : ''}`}
                >
                  {todo.title}
                </span>
                <button
                  onClick={() => deleteTodo.mutate(todo.id)}
                  className="text-xs text-slate-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                >
                  Delete
                </button>
              </div>

              <ul className="ml-7 mt-1 flex flex-col gap-1 border-l border-slate-200 pl-4">
                {todo.subtasks.map((subtask) => (
                  <li key={subtask.id} className="group flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={subtask.done}
                      onChange={() =>
                        toggleSubTask.mutate({
                          todoId: todo.id,
                          subtaskId: subtask.id,
                          done: !subtask.done,
                          baseVersion: subtask.version,
                        })
                      }
                      className="h-3.5 w-3.5 shrink-0 accent-indigo-600"
                    />
                    <span
                      className={`flex-1 text-sm text-slate-600 ${subtask.done ? 'text-slate-400 line-through' : ''}`}
                    >
                      {subtask.title}
                    </span>
                    <button
                      onClick={() => deleteSubTask.mutate({ todoId: todo.id, subtaskId: subtask.id })}
                      className="text-xs text-slate-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>

              <form
                onSubmit={(event) => handleAddSubTask(event, todo.id)}
                className="ml-7 mt-1 flex gap-2 pl-4"
              >
                <input
                  value={newSubTaskTitles[todo.id] ?? ''}
                  onChange={(event) =>
                    setNewSubTaskTitles((titles) => ({ ...titles, [todo.id]: event.target.value }))
                  }
                  placeholder="New subtask"
                  className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <button
                  type="submit"
                  disabled={!(newSubTaskTitles[todo.id] ?? '').trim()}
                  className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add
                </button>
              </form>
            </li>
          ))}
        </ul>

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
