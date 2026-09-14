import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
  const { toggleTodo, updateTodoDescription, updateTodoCost, deleteTodo, reorderSubTask } = useListActions();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
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
    <li ref={setNodeRef} style={style} className={`rounded-lg py-2 ${isDragging ? 'opacity-50' : ''}`}>
      <div className="group flex items-center gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab touch-none text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        >
          ⠿
        </button>
        <input
          type="checkbox"
          checked={todo.done}
          onChange={() => toggleTodo.mutate({ todoId: todo.id, done: !todo.done })}
          className="h-4 w-4 shrink-0 accent-indigo-600"
        />
        <span className={`flex-1 text-sm text-slate-900 ${todo.done ? 'text-slate-400 line-through' : ''}`}>
          {todo.title}
        </span>
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
          className="text-xs text-slate-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
        >
          Delete
        </button>
      </div>

      <div className="ml-7 pl-4">
        <TodoDescription
          descriptionMd={todo.descriptionMd}
          onSave={(descriptionMd) =>
            updateTodoDescription.mutate({ todoId: todo.id, descriptionMd, baseDescriptionMd: todo.descriptionMd })
          }
        />
      </div>

      <DndContext sensors={subtaskSensors} collisionDetection={closestCenter} onDragEnd={handleSubTaskDragEnd}>
        <SortableContext
          items={todo.subtasks.map((subtask) => subtask.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="ml-7 mt-1 flex flex-col gap-1 border-l border-slate-200 pl-4">
            {todo.subtasks.map((subtask) => (
              <SubtaskItem key={subtask.id} subtask={subtask} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {todo.subtasks.length > 0 && (
        <p className="ml-7 mt-1 pl-4 text-xs text-slate-400">Subtotal: {formatCents(subtaskSubtotalCents(todo))}</p>
      )}

      <AddSubtaskForm todoId={todo.id} />
    </li>
  );
}
