import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function LandingPage() {
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listsQuery = useQuery({ queryKey: ['lists'], queryFn: api.getLists });

  const deleteList = useMutation({
    mutationFn: (listId: string) => api.deleteList(listId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lists'] }),
  });

  function handleDeleteList(id: string, listTitle: string) {
    if (!window.confirm(`Delete "${listTitle}" and everything in it? This can't be undone.`)) return;
    deleteList.mutate(id);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const { list } = await api.createList({ title: title.trim() });
      navigate(`/list/${list.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create list');
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">New list</h1>
        <p className="mt-1 text-sm text-slate-500">Give your list a name to get started.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="List title"
            disabled={submitting}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {listsQuery.data && listsQuery.data.lists.length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-6">
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Existing lists
            </h2>
            <ul className="mt-3 flex flex-col gap-1">
              {listsQuery.data.lists.map((list) => (
                <li key={list.id} className="group flex items-center gap-1">
                  <Link
                    to={`/list/${list.id}`}
                    className="block flex-1 truncate rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
                  >
                    {list.title}
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDeleteList(list.id, list.title)}
                    disabled={deleteList.isPending}
                    className="shrink-0 rounded px-1 text-xs text-slate-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
