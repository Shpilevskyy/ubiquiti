import { useState, type FormEvent } from 'react';
import { useListActions } from '../context/ListContext';

interface AddSubtaskFormProps {
  todoId: string;
}

// Owns its own input state (moved down from ListPage's newSubTaskTitles, tasks/08) so a keystroke
// here only re-renders this form, not every todo/subtask/DndContext on the page.
export function AddSubtaskForm({ todoId }: AddSubtaskFormProps) {
  const { createSubTask } = useListActions();
  const [title, setTitle] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    createSubTask.mutate({ todoId, title: trimmed });
    setTitle('');
  }

  return (
    <form onSubmit={handleSubmit} className="ml-7 mt-1 flex gap-2 pl-4">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="New subtask"
        className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      <button
        type="submit"
        disabled={!title.trim()}
        className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}
