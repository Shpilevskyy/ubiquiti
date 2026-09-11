import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { produce } from 'immer';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GetListResponse, SubTask, Todo } from '@ubiquiti-todo/shared';
import { api, HttpError, sendOp } from '../lib/api';
import { connectionStatus } from '../lib/connectionStatus';
import { dequeue, enqueue, type QueuedOp } from '../lib/outbox';

const CONFLICT_MESSAGE = 'This item was also edited elsewhere';
const now = () => new Date().toISOString();

type MutateResult<T> = { sent: true; response: T } | { sent: false };

export function useList(listId: string | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const queryKey = ['list', listId];
  const [notice, setNotice] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey,
    queryFn: () => api.getList(listId!),
    enabled: Boolean(listId),
    // A missing list is permanent (deleted, or a bad link) — retrying it like a transient network
    // error just delays the "not found" state by several seconds of default backoff.
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  };

  // See specs/05-sync-conflict-resolution.md's stale-write indicator: the server always applies
  // the write and just tells us whether it clobbered a change we hadn't seen yet. Soft signal
  // only — nothing here blocks or undoes anything.
  const noteConflict = (hadConflict: boolean) => {
    if (hadConflict) showNotice(CONFLICT_MESSAGE);
  };

  // The outbox pattern (specs/06-offline-sync.md): apply the change to the cache immediately (so
  // the UI never waits on the network), persist it to IndexedDB, then try to actually send it if
  // we believe we're online. What happens next depends on the outcome:
  //  - success: dequeue, then refetch to reconcile the optimistic guess with server truth
  //    (real timestamps/version/etc) — cheap since we know we're online.
  //  - the parent was deleted elsewhere (404): drop the op (retrying it can never succeed) and
  //    tell the user, per spec.
  //  - offline, or the send itself fails (network/5xx): leave it queued. The failed-fetch path in
  //    api.ts already flips the connectivity signal; flushing this queue on reconnect is step 4,
  //    not yet built — so a page reload before that lands will refetch from the server and not
  //    show still-queued optimistic changes, even though they're safely persisted in the outbox.
  async function mutateWithOutbox<T>(
    op: Pick<QueuedOp, 'method' | 'path' | 'body'>,
    applyOptimistic: (old: GetListResponse | undefined) => GetListResponse | undefined,
  ): Promise<MutateResult<T>> {
    queryClient.setQueryData<GetListResponse>(queryKey, applyOptimistic);
    const queued = await enqueue(listId!, op);

    if (connectionStatus.getStatus() !== 'online') {
      return { sent: false };
    }

    try {
      const response = await sendOp<T>(queued);
      await dequeue(listId!, queued.opId);
      invalidate();
      return { sent: true, response };
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        await dequeue(listId!, queued.opId);
        showNotice('This item no longer exists');
        invalidate();
      }
      // Otherwise (network error, 5xx): stays queued for the eventual flush.
      return { sent: false };
    }
  }

  // TanStack Query has its own network-awareness — by default (networkMode: 'online') it pauses
  // a mutation and never calls mutationFn at all while it believes the browser is offline
  // (via its own onlineManager, listening to the same window online/offline events
  // connectionStatus does). That's a *different, competing* offline strategy from the outbox
  // above, and it would silently swallow every offline mutation before mutateWithOutbox got a
  // chance to run. 'always' hands control entirely to our own connectivity check.
  const OFFLINE_AWARE = { networkMode: 'always' as const };

  const createTodo = useMutation({
    ...OFFLINE_AWARE,
    mutationFn: (title: string) => {
      const id = crypto.randomUUID();
      // Date.now() is a placeholder ordering key; proper position allocation for drag-and-drop
      // reordering is specs/08-drag-and-drop.md's concern, not this task's.
      const position = Date.now();
      const optimisticTodo: Todo = {
        id,
        listId: listId!,
        title,
        done: false,
        position,
        costCents: null,
        descriptionMd: null,
        version: 0,
        createdAt: now(),
        updatedAt: now(),
        subtasks: [],
      };
      return mutateWithOutbox(
        { method: 'POST', path: `/lists/${listId}/todos`, body: { id, title, position } },
        (old) =>
          old &&
          produce(old, (draft) => {
            draft.todos.push(optimisticTodo);
          }),
      );
    },
  });

  const toggleTodo = useMutation({
    ...OFFLINE_AWARE,
    mutationFn: ({ todoId, done, baseVersion }: { todoId: string; done: boolean; baseVersion: number }) =>
      mutateWithOutbox<{ hadConflict: boolean }>(
        { method: 'PATCH', path: `/lists/${listId}/todos/${todoId}`, body: { done, baseVersion } },
        (old) =>
          old &&
          produce(old, (draft) => {
            const todo = draft.todos.find((t) => t.id === todoId);
            if (todo) {
              todo.done = done;
              todo.updatedAt = now();
            }
          }),
      ),
    onSuccess: (result) => {
      if (result.sent) noteConflict(result.response.hadConflict);
    },
  });

  const deleteTodo = useMutation({
    ...OFFLINE_AWARE,
    mutationFn: (todoId: string) =>
      mutateWithOutbox({ method: 'DELETE', path: `/lists/${listId}/todos/${todoId}` }, (old) =>
        old &&
        produce(old, (draft) => {
          draft.todos = draft.todos.filter((t) => t.id !== todoId);
        }),
      ),
  });

  const createSubTask = useMutation({
    ...OFFLINE_AWARE,
    mutationFn: ({ todoId, title }: { todoId: string; title: string }) => {
      const id = crypto.randomUUID();
      // Same Date.now() placeholder ordering key as createTodo — see the comment there.
      const position = Date.now();
      const optimisticSubTask: SubTask = {
        id,
        todoId,
        title,
        done: false,
        position,
        costCents: null,
        version: 0,
        createdAt: now(),
        updatedAt: now(),
      };
      return mutateWithOutbox(
        { method: 'POST', path: `/lists/${listId}/todos/${todoId}/subtasks`, body: { id, title, position } },
        (old) =>
          old &&
          produce(old, (draft) => {
            const todo = draft.todos.find((t) => t.id === todoId);
            if (todo) todo.subtasks.push(optimisticSubTask);
          }),
      );
    },
  });

  const toggleSubTask = useMutation({
    ...OFFLINE_AWARE,
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
    }) =>
      mutateWithOutbox<{ hadConflict: boolean }>(
        {
          method: 'PATCH',
          path: `/lists/${listId}/todos/${todoId}/subtasks/${subtaskId}`,
          body: { done, baseVersion },
        },
        (old) =>
          old &&
          produce(old, (draft) => {
            const subtask = draft.todos.find((t) => t.id === todoId)?.subtasks.find((s) => s.id === subtaskId);
            if (subtask) {
              subtask.done = done;
              subtask.updatedAt = now();
            }
          }),
      ),
    onSuccess: (result) => {
      if (result.sent) noteConflict(result.response.hadConflict);
    },
  });

  const deleteSubTask = useMutation({
    ...OFFLINE_AWARE,
    mutationFn: ({ todoId, subtaskId }: { todoId: string; subtaskId: string }) =>
      mutateWithOutbox(
        { method: 'DELETE', path: `/lists/${listId}/todos/${todoId}/subtasks/${subtaskId}` },
        (old) =>
          old &&
          produce(old, (draft) => {
            const todo = draft.todos.find((t) => t.id === todoId);
            if (todo) todo.subtasks = todo.subtasks.filter((s) => s.id !== subtaskId);
          }),
      ),
  });

  // Deleting the whole list isn't routed through the outbox — it's destructive/irreversible, and
  // (unlike Todo/SubTask) List has no version column, so it sits outside the conflict/outbox
  // model entirely. Requires being online, same as before.
  const deleteList = useMutation({
    mutationFn: () => api.deleteList(listId!),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey });
      navigate('/');
    },
  });

  return {
    listQuery,
    createTodo,
    toggleTodo,
    deleteTodo,
    createSubTask,
    toggleSubTask,
    deleteSubTask,
    deleteList,
    conflictNotice: notice,
    dismissConflictNotice: () => setNotice(null),
  };
}
