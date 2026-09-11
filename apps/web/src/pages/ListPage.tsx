import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useList } from '../hooks/useList';

export function ListPage() {
  const { listId } = useParams<{ listId: string }>();
  const [newTodoTitle, setNewTodoTitle] = useState('');

  const { listQuery, createTodo, toggleTodo, deleteTodo } = useList(listId);

  if (!listId) return null;
  if (listQuery.isLoading) return <p>Loading…</p>;
  if (listQuery.isError) {
    return <p>Failed to load list: {(listQuery.error as Error).message}</p>;
  }

  const { list, todos } = listQuery.data!;

  function handleAddTodo(event: FormEvent) {
    event.preventDefault();
    if (!newTodoTitle.trim()) return;
    createTodo.mutate(newTodoTitle.trim());
    setNewTodoTitle('');
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 480 }}>
      <h1>{list.title}</h1>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {todos.map((todo) => (
          <li key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => toggleTodo.mutate({ todoId: todo.id, done: !todo.done })}
            />
            <span style={{ textDecoration: todo.done ? 'line-through' : 'none', flex: 1 }}>
              {todo.title}
            </span>
            <button onClick={() => deleteTodo.mutate(todo.id)}>Delete</button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAddTodo}>
        <input
          value={newTodoTitle}
          onChange={(event) => setNewTodoTitle(event.target.value)}
          placeholder="New todo"
        />
        <button type="submit" disabled={!newTodoTitle.trim()}>
          Add
        </button>
      </form>
    </main>
  );
}
