import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useList } from '../hooks/useList';

export function ListPage() {
  const { listId } = useParams<{ listId: string }>();
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newSubTaskTitles, setNewSubTaskTitles] = useState<Record<string, string>>({});

  const {
    listQuery,
    createTodo,
    toggleTodo,
    deleteTodo,
    createSubTask,
    toggleSubTask,
    deleteSubTask,
  } = useList(listId);

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

  function handleAddSubTask(event: FormEvent, todoId: string) {
    event.preventDefault();
    const title = (newSubTaskTitles[todoId] ?? '').trim();
    if (!title) return;
    createSubTask.mutate({ todoId, title });
    setNewSubTaskTitles((titles) => ({ ...titles, [todoId]: '' }));
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 480 }}>
      <h1>{list.title}</h1>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {todos.map((todo) => (
          <li key={todo.id} style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggleTodo.mutate({ todoId: todo.id, done: !todo.done })}
              />
              <span style={{ textDecoration: todo.done ? 'line-through' : 'none', flex: 1 }}>
                {todo.title}
              </span>
              <button onClick={() => deleteTodo.mutate(todo.id)}>Delete</button>
            </div>

            <ul style={{ listStyle: 'none', padding: '0 0 0 1.75rem', margin: '0.25rem 0 0' }}>
              {todo.subtasks.map((subtask) => (
                <li
                  key={subtask.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <input
                    type="checkbox"
                    checked={subtask.done}
                    onChange={() =>
                      toggleSubTask.mutate({
                        todoId: todo.id,
                        subtaskId: subtask.id,
                        done: !subtask.done,
                      })
                    }
                  />
                  <span
                    style={{ textDecoration: subtask.done ? 'line-through' : 'none', flex: 1 }}
                  >
                    {subtask.title}
                  </span>
                  <button onClick={() => deleteSubTask.mutate({ todoId: todo.id, subtaskId: subtask.id })}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>

            <form
              onSubmit={(event) => handleAddSubTask(event, todo.id)}
              style={{ padding: '0.25rem 0 0 1.75rem' }}
            >
              <input
                value={newSubTaskTitles[todo.id] ?? ''}
                onChange={(event) =>
                  setNewSubTaskTitles((titles) => ({ ...titles, [todo.id]: event.target.value }))
                }
                placeholder="New subtask"
              />
              <button type="submit" disabled={!(newSubTaskTitles[todo.id] ?? '').trim()}>
                Add
              </button>
            </form>
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
