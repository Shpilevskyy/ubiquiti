import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';

const CONFLICT_MESSAGE = 'This item was also edited elsewhere';

export function useList(listId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['list', listId];
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey,
    queryFn: () => api.getList(listId!),
    enabled: Boolean(listId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  // See specs/05-sync-conflict-resolution.md's stale-write indicator: the server always applies
  // the write and just tells us whether it clobbered a change we hadn't seen yet. Soft signal
  // only — nothing here blocks or undoes anything.
  const noteConflict = (hadConflict: boolean) => {
    if (!hadConflict) return;
    setConflictNotice(CONFLICT_MESSAGE);
    window.setTimeout(() => setConflictNotice(null), 4000);
  };

  const createTodo = useMutation({
    mutationFn: (title: string) =>
      // Date.now() is a placeholder ordering key; proper position allocation for drag-and-drop
      // reordering is specs/08-drag-and-drop.md's concern, not this task's.
      api.createTodo(listId!, { id: crypto.randomUUID(), title, position: Date.now() }),
    onSuccess: invalidate,
  });

  const toggleTodo = useMutation({
    mutationFn: ({ todoId, done, baseVersion }: { todoId: string; done: boolean; baseVersion: number }) =>
      api.updateTodo(listId!, todoId, { done, baseVersion }),
    onSuccess: (data) => {
      invalidate();
      noteConflict(data.hadConflict);
    },
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
    mutationFn: ({
      todoId,
      subtaskId,
      done,
      baseVersion,
    }: {
      todoId: string;
      subtaskId: string;
      done: boolean;
      baseVersion: number;
    }) => api.updateSubTask(listId!, todoId, subtaskId, { done, baseVersion }),
    onSuccess: (data) => {
      invalidate();
      noteConflict(data.hadConflict);
    },
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
    conflictNotice,
    dismissConflictNotice: () => setConflictNotice(null),
  };
}
