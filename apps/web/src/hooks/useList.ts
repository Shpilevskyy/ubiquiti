import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useList(listId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['list', listId];

  const listQuery = useQuery({
    queryKey,
    queryFn: () => api.getList(listId!),
    enabled: Boolean(listId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createTodo = useMutation({
    mutationFn: (title: string) =>
      // Date.now() is a placeholder ordering key; proper position allocation for drag-and-drop
      // reordering is specs/08-drag-and-drop.md's concern, not this task's.
      api.createTodo(listId!, { id: crypto.randomUUID(), title, position: Date.now() }),
    onSuccess: invalidate,
  });

  const toggleTodo = useMutation({
    mutationFn: ({ todoId, done }: { todoId: string; done: boolean }) =>
      api.updateTodo(listId!, todoId, { done }),
    onSuccess: invalidate,
  });

  const deleteTodo = useMutation({
    mutationFn: (todoId: string) => api.deleteTodo(listId!, todoId),
    onSuccess: invalidate,
  });

  return { listQuery, createTodo, toggleTodo, deleteTodo };
}
