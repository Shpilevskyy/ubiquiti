import type { SubTask } from '@ubiquiti-todo/shared';

interface SubtaskItemProps {
  subtask: SubTask;
  onToggle: () => void;
  onDelete: () => void;
}

export function SubtaskItem({ subtask, onToggle, onDelete }: SubtaskItemProps) {
  return (
    <li className="group flex items-center gap-3">
      <input
        type="checkbox"
        checked={subtask.done}
        onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0 accent-indigo-600"
      />
      <span className={`flex-1 text-sm text-slate-600 ${subtask.done ? 'text-slate-400 line-through' : ''}`}>
        {subtask.title}
      </span>
      <button
        onClick={onDelete}
        className="text-xs text-slate-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
      >
        Delete
      </button>
    </li>
  );
}
