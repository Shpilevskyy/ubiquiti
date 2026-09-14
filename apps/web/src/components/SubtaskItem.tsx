import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SubTask } from '@ubiquiti-todo/shared';
import { useListActions } from '../context/ListContext';
import { CostInput } from './CostInput';

interface SubtaskItemProps {
  subtask: SubTask;
}

export function SubtaskItem({ subtask }: SubtaskItemProps) {
  const { toggleSubTask, deleteSubTask, updateSubTaskCost } = useListActions();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: subtask.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="cursor-grab touch-none text-xs text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 active:cursor-grabbing"
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <label className="flex flex-1 items-center gap-3">
        <input
          type="checkbox"
          checked={subtask.done}
          onChange={() =>
            toggleSubTask.mutate({ todoId: subtask.todoId, subtaskId: subtask.id, done: !subtask.done })
          }
          className="h-3.5 w-3.5 shrink-0 accent-indigo-600"
        />
        <span className={`flex-1 text-sm text-slate-600 ${subtask.done ? 'text-slate-400 line-through' : ''}`}>
          {subtask.title}
        </span>
      </label>
      <CostInput
        costCents={subtask.costCents}
        onSave={(costCents) =>
          updateSubTaskCost.mutate({
            todoId: subtask.todoId,
            subtaskId: subtask.id,
            costCents,
            baseCostCents: subtask.costCents,
          })
        }
      />
      <button
        type="button"
        onClick={() => deleteSubTask.mutate({ todoId: subtask.todoId, subtaskId: subtask.id })}
        className="rounded text-xs text-slate-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
      >
        Delete
      </button>
    </li>
  );
}
