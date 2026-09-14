import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Todo } from '@ubiquiti-todo/shared';
import { useListActions } from '../context/ListContext';
import { formatCents, subtaskSubtotalCents } from '../lib/cost';
import { computeReorderPosition } from '../lib/position';
import { AddSubtaskForm } from './AddSubtaskForm';
import { CostInput } from './CostInput';
import { SubtaskItem } from './SubtaskItem';
import { SubtaskProgress } from './SubtaskProgress';
import { TodoDescription } from './TodoDescription';

interface TodoItemProps {
  todo: Todo;
}

export function TodoItem({ todo }: TodoItemProps) {
  const { toggleTodo, updateTodoDescription, updateTodoCost, deleteTodo, reorderSubTask } =
    useListActions();
  const subtotalCents = subtaskSubtotalCents(todo);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  // Subtasks get their own drag context — no cross-todo dragging, per specs/08-drag-and-drop.md.
  const subtaskSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleSubTaskDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const position = computeReorderPosition(todo.subtasks, String(active.id), String(over.id));
    reorderSubTask.mutate({ todoId: todo.id, subtaskId: String(active.id), position });
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-lg py-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="group flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="-ml-1 shrink-0 cursor-grab touch-none rounded p-1 text-slate-300 opacity-60 transition-opacity hover:text-slate-400 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 active:cursor-grabbing"
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="checkbox"
            checked={todo.done}
            onChange={() => toggleTodo.mutate({ todoId: todo.id, done: !todo.done })}
            className="h-4 w-4 shrink-0 accent-indigo-600"
          />
          <span
            className={`min-w-0 flex-1 truncate text-sm text-slate-900 ${todo.done ? 'text-slate-400 line-through' : ''}`}
          >
            {todo.title}
          </span>
        </label>
        <SubtaskProgress
          done={todo.subtasks.filter((subtask) => subtask.done).length}
          total={todo.subtasks.length}
        />
        <CostInput
          costCents={todo.costCents}
          onSave={(costCents) =>
            updateTodoCost.mutate({ todoId: todo.id, costCents, baseCostCents: todo.costCents })
          }
        />
        <button
          type="button"
          onClick={() => deleteTodo.mutate(todo.id)}
          className="shrink-0 rounded px-1.5 py-1 text-xs text-slate-400 opacity-60 transition-opacity hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          Delete
        </button>
      </div>

      <div className="ml-5 pl-3 sm:ml-7 sm:pl-4">
        <TodoDescription
          descriptionMd={todo.descriptionMd}
          onSave={(descriptionMd) =>
            updateTodoDescription.mutate({
              todoId: todo.id,
              descriptionMd,
              baseDescriptionMd: todo.descriptionMd,
            })
          }
        />
      </div>

      <DndContext
        sensors={subtaskSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSubTaskDragEnd}
      >
        <SortableContext
          items={todo.subtasks.map((subtask) => subtask.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="ml-5 mt-1 flex flex-col gap-1 border-l border-slate-200 pl-3 sm:ml-7 sm:pl-4">
            {todo.subtasks.map((subtask) => (
              <SubtaskItem key={subtask.id} subtask={subtask} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {/* Hidden at zero rather than whenever the todo has no subtasks: a todo with subtasks that
          nobody has priced showed "Subtotal: $0.00" on every row, which is noise, and it
          contradicted the list header's own total — that one already hides when zero, matching how
          this app treats every optional affordance (presence avatars, the Offline pill). */}
      {subtotalCents > 0 && (
        <p className="ml-5 mt-1 pl-3 text-xs text-slate-400 sm:ml-7 sm:pl-4">
          Subtotal: {formatCents(subtotalCents)}
        </p>
      )}

      <AddSubtaskForm todoId={todo.id} />
    </li>
  );
}
