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

  const createSubTask = useMutation({
    mutationFn: ({ todoId, title }: { todoId: string; title: string }) =>
      // Same Date.now() placeholder ordering key as createTodo — see the comment there.
      api.createSubTask(listId!, todoId, { id: crypto.randomUUID(), title, position: Date.now() }),
    onSuccess: invalidate,
  });

  const toggleSubTask = useMutation({
    mutationFn: ({ todoId, subtaskId, done }: { todoId: string; subtaskId: string; done: boolean }) =>
      api.updateSubTask(listId!, todoId, subtaskId, { done }),
    onSuccess: invalidate,
  });

  const deleteSubTask = useMutation({
    mutationFn: ({ todoId, subtaskId }: { todoId: string; subtaskId: string }) =>
      api.deleteSubTask(listId!, todoId, subtaskId),
    onSuccess: invalidate,
  });

  return {
    listQuery,
    createTodo,
    toggleTodo,
    deleteTodo,
    createSubTask,
    toggleSubTask,
    deleteSubTask,
  };
}
