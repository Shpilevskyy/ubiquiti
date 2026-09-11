import type { FormEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Todo } from '@ubiquiti-todo/shared';
import { computeReorderPosition } from '../lib/position';
import { TodoItem } from './TodoItem';

interface TodoListProps {
  todos: Todo[];
  onToggleTodo: (todoId: string, done: boolean, baseVersion: number) => void;
  onDeleteTodo: (todoId: string) => void;
  onReorderTodo: (todoId: string, position: number) => void;
  onToggleSubTask: (todoId: string, subtaskId: string, done: boolean, baseVersion: number) => void;
  onDeleteSubTask: (todoId: string, subtaskId: string) => void;
  onReorderSubTask: (todoId: string, subtaskId: string, position: number) => void;
  newSubTaskTitles: Record<string, string>;
  onSubTaskTitleChange: (todoId: string, value: string) => void;
  onAddSubTask: (event: FormEvent, todoId: string) => void;
}

export function TodoList({
  todos,
  onToggleTodo,
  onDeleteTodo,
  onReorderTodo,
  onToggleSubTask,
  onDeleteSubTask,
  onReorderSubTask,
  newSubTaskTitles,
  onSubTaskTitleChange,
  onAddSubTask,
}: TodoListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const position = computeReorderPosition(todos, String(active.id), String(over.id));
    onReorderTodo(String(active.id), position);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={todos.map((todo) => todo.id)} strategy={verticalListSortingStrategy}>
        <ul className="mt-6 flex flex-col gap-1">
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => onToggleTodo(todo.id, !todo.done, todo.version)}
              onDelete={() => onDeleteTodo(todo.id)}
              onToggleSubTask={(subtaskId, done, baseVersion) =>
                onToggleSubTask(todo.id, subtaskId, done, baseVersion)
              }
              onDeleteSubTask={(subtaskId) => onDeleteSubTask(todo.id, subtaskId)}
              onReorderSubTask={(subtaskId, position) => onReorderSubTask(todo.id, subtaskId, position)}
              newSubTaskTitle={newSubTaskTitles[todo.id] ?? ''}
              onSubTaskTitleChange={(value) => onSubTaskTitleChange(todo.id, value)}
              onAddSubTask={(event) => onAddSubTask(event, todo.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
