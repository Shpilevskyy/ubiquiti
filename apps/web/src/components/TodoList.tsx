import type { FormEvent } from 'react';
import type { Todo } from '@ubiquiti-todo/shared';
import { TodoItem } from './TodoItem';

interface TodoListProps {
  todos: Todo[];
  onToggleTodo: (todoId: string, done: boolean, baseVersion: number) => void;
  onDeleteTodo: (todoId: string) => void;
  onToggleSubTask: (todoId: string, subtaskId: string, done: boolean, baseVersion: number) => void;
  onDeleteSubTask: (todoId: string, subtaskId: string) => void;
  newSubTaskTitles: Record<string, string>;
  onSubTaskTitleChange: (todoId: string, value: string) => void;
  onAddSubTask: (event: FormEvent, todoId: string) => void;
}

export function TodoList({
  todos,
  onToggleTodo,
  onDeleteTodo,
  onToggleSubTask,
  onDeleteSubTask,
  newSubTaskTitles,
  onSubTaskTitleChange,
  onAddSubTask,
}: TodoListProps) {
  return (
    <ul className="mt-6 flex flex-col gap-1">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={() => onToggleTodo(todo.id, !todo.done, todo.version)}
          onDelete={() => onDeleteTodo(todo.id)}
          onToggleSubTask={(subtaskId, done, baseVersion) => onToggleSubTask(todo.id, subtaskId, done, baseVersion)}
          onDeleteSubTask={(subtaskId) => onDeleteSubTask(todo.id, subtaskId)}
          newSubTaskTitle={newSubTaskTitles[todo.id] ?? ''}
          onSubTaskTitleChange={(value) => onSubTaskTitleChange(todo.id, value)}
          onAddSubTask={(event) => onAddSubTask(event, todo.id)}
        />
      ))}
    </ul>
  );
}
