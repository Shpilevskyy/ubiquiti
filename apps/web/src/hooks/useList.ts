import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { produce } from 'immer';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GetListResponse, SubTask, Todo } from '@ubiquiti-todo/shared';
import { api, HttpError, sendOp } from '../lib/api';
import { connectionStatus } from '../lib/connectionStatus';
import { dequeue, enqueue, getQueue, recordAttempt, type QueuedOp } from '../lib/outbox';

const FLUSH_RETRY_BASE_MS = 2000;
const FLUSH_RETRY_MAX_MS = 30000;
// Safety net beyond the specific permanent-failure cases (404, other 4xx) enumerated below: bounds
// *any* failure mode that would otherwise retry forever, including ones introduced later.
const MAX_FLUSH_ATTEMPTS = 10;
const DISCARDED_MESSAGE = 'A change could not be saved and was discarded';
// Belt-and-braces beyond the spec's two triggers: browsers are inconsistent about firing the
// online/offline DOM events for a *real* network change (as opposed to devtools-simulated
// offline) — Chrome in particular can miss them, so a queued op could otherwise sit stuck until
// the user manually reloads. Polling regardless of what connectionStatus currently believes makes
// this self-healing without depending on any single event actually firing.
const FLUSH_POLL_MS = 15000;

const CONFLICT_MESSAGE = 'This item was also edited elsewhere';
const FLUSH_CONFLICT_MESSAGE = 'Some changes were also edited elsewhere';
const now = () => new Date().toISOString();

type MutateResult<T> = { sent: true; response: T } | { sent: false };

// Reconciling a successful mutation's response into the cache in place (tasks/05), instead of
// invalidating and refetching the whole list. Pure functions on GetListResponse — no closure over
// listId/queryClient needed, unlike the outbox helpers below.
function replaceTodo(old: GetListResponse | undefined, todo: Todo): GetListResponse | undefined {
  return (
    old &&
    produce(old, (draft) => {
      const index = draft.todos.findIndex((t) => t.id === todo.id);
      if (index !== -1) draft.todos[index] = todo;
    })
  );
}

function replaceSubTask(old: GetListResponse | undefined, subtask: SubTask): GetListResponse | undefined {
  return (
    old &&
    produce(old, (draft) => {
      const todo = draft.todos.find((t) => t.id === subtask.todoId);
      const index = todo?.subtasks.findIndex((s) => s.id === subtask.id) ?? -1;
      if (todo && index !== -1) todo.subtasks[index] = subtask;
    })
  );
}

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
    // These both default to true and both fire off the *same* window online/reconnect signal
    // flushOutbox below listens to. Left enabled, a refetch could win the race against the flush
    // and silently overwrite a still-queued optimistic change with (stale) server truth before it
    // ever gets sent — flushOutbox's own invalidate() is the only refetch this query should get.
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
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
  //  - success: dequeue, then merge the server's returned row into the cache in place
  //    (applyResponse) — replaces the optimistic guess with real timestamps/version/etc without
  //    refetching the whole list. tasks/05: a per-mutation full-list GET doesn't scale with list
  //    size, and — the more important half — a *later* mutation's optimistic update could land
  //    while an earlier mutation's refetch was still in flight, which would then resolve with a
  //    stale snapshot and clobber it. cancelQueries below removes that race at its source rather
  //    than papering over it.
  //  - the parent was deleted elsewhere (404), or any other 4xx: drop the op (retrying it can
  //    never succeed) and tell the user. Falls back to a full invalidate() here specifically —
  //    there's no successful response to reconcile from, and the local optimistic state is now
  //    known to be wrong, not just stale.
  //  - offline, or the send itself fails (network/5xx): leave it queued. The failed-fetch path in
  //    api.ts already flips the connectivity signal; flushOutbox below is what eventually sends
  //    this once we're back online.
  async function mutateWithOutbox<T>(
    op: Pick<QueuedOp, 'method' | 'path' | 'body'>,
    applyOptimistic: (old: GetListResponse | undefined) => GetListResponse | undefined,
    applyResponse?: (old: GetListResponse | undefined, response: T) => GetListResponse | undefined,
  ): Promise<MutateResult<T>> {
    // Cancel any in-flight refetch for this list first — otherwise it can resolve after this
    // optimistic write with a snapshot taken before it, and silently overwrite it (tasks/05).
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData<GetListResponse>(queryKey, applyOptimistic);
    const queued = await enqueue(listId!, op);

    if (connectionStatus.getStatus() !== 'online') {
      return { sent: false };
    }

    try {
      const response = await sendOp<T>(queued);
      await dequeue(listId!, queued.opId);
      if (applyResponse) {
        queryClient.setQueryData<GetListResponse>(queryKey, (old) => applyResponse(old, response));
      }
      return { sent: true, response };
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        await dequeue(listId!, queued.opId);
        showNotice('This item no longer exists');
        invalidate();
      } else if (err instanceof HttpError && err.status < 500) {
        // Any other 4xx (e.g. a rejected body) is a permanent failure, not a transient one —
        // retrying it would just fail again. Drop it here rather than letting it sit queued for
        // flushOutbox to reach the same conclusion later.
        await dequeue(listId!, queued.opId);
        showNotice(DISCARDED_MESSAGE);
        invalidate();
      }
      // Otherwise (network error, 5xx): stays queued for the eventual flush.
      return { sent: false };
    }
  }

  // Flushing the outbox (specs/06-offline-sync.md): replay queued ops for this list in FIFO
  // order, awaiting each response before sending the next (preserves the order they were made
  // in, and means a create always lands before a PATCH/DELETE that depends on it). Triggered by
  // connectionStatus going online (aggregating the spec's two triggers — Socket.IO
  // connect/reconnect and the browser online event) for promptness, once on mount for a queue
  // left over from a previous session, and by a periodic poll (see FLUSH_POLL_MS) as a fallback
  // for when neither event fires. Deliberately doesn't gate on connectionStatus's belief that
  // we're online — a failed sendOp already means "leave it queued," so attempting when we might
  // actually be offline just costs one wasted request rather than something worth guarding
  // against, and not gating on it is what makes the poll fallback work at all.
  const flushRetryDelayRef = useRef(FLUSH_RETRY_BASE_MS);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // flushOutbox has four triggers (mount, connectionStatus, the poll, its own backoff timer) with
  // no natural mutual exclusion. Without this guard, two overlapping runs both read the queue,
  // both send the same head-of-queue op, and race each other's dequeue — this is also what makes
  // the outbox.ts atomicity bug (tasks/03) reachable in practice, not just enqueue-vs-flush.
  const isFlushingRef = useRef(false);

  // `reconcile` forces the closing invalidate() even when the queue was empty. Needed on
  // reconnect: while the socket was down this client missed every broadcast for the list, and
  // disabling refetchOnReconnect/refetchOnWindowFocus above (correctly, to stop them racing this
  // flush) removed the refetch that used to repair that. Without this, a network blip with
  // nothing queued leaves the client silently stale until it remounts.
  async function flushOutbox({ reconcile = false }: { reconcile?: boolean } = {}) {
    if (!listId || isFlushingRef.current) return;
    isFlushingRef.current = true;
    // Whatever triggered this run supersedes any backoff retry scheduled by a previous run — at
    // most one timer should ever be outstanding, and this run's own outcome (success, or a fresh
    // schedule below) is the only one that should matter from here.
    clearTimeout(flushTimeoutRef.current);
    flushTimeoutRef.current = undefined;

    try {
      let sentAny = false;
      // flushOutbox otherwise ignores sendOp's response entirely, so a queued PATCH that comes
      // back hadConflict: true during a reconnect replay never surfaced the toast a live edit
      // would've gotten (tasks/05). One op per notice would be noisy for a whole backlog replaying
      // at once, so this aggregates to a single notice for the flush instead.
      let hadConflictAny = false;
      while (true) {
        const [op] = await getQueue(listId);
        if (!op) break;

        try {
          const response = await sendOp<{ hadConflict?: boolean }>(op);
          await dequeue(listId, op.opId);
          sentAny = true;
          if (response?.hadConflict) hadConflictAny = true;
          // A successful request is the strongest possible evidence we're online — feeds back
          // into the belief connectionStatus tracks (and the "Offline" pill reads), so a
          // successful poll fallback flush also self-heals a pill left stuck offline by a browser
          // that never fired the online event in the first place.
          connectionStatus.markOnline();
        } catch (err) {
          if (err instanceof HttpError && err.status === 404) {
            await dequeue(listId, op.opId);
            showNotice('This item no longer exists');
            continue;
          }
          if (err instanceof HttpError && err.status < 500) {
            // Any other 4xx (e.g. a rejected body) is permanent, not transient — retrying it
            // every poll would head-of-line-block every op queued behind it forever.
            await dequeue(listId, op.opId);
            showNotice(DISCARDED_MESSAGE);
            continue;
          }
          // Network error / 5xx: worth retrying, but capped so a failure mode not enumerated
          // above still can't retry forever.
          const attempts = await recordAttempt(listId, op.opId);
          if (attempts >= MAX_FLUSH_ATTEMPTS) {
            await dequeue(listId, op.opId);
            showNotice(DISCARDED_MESSAGE);
            continue;
          }
          // Stop here, leave the rest queued, retry the whole flush later with backoff rather
          // than looping tightly against a server/connection that's down.
          flushTimeoutRef.current = setTimeout(() => flushOutbox({ reconcile }), flushRetryDelayRef.current);
          flushRetryDelayRef.current = Math.min(flushRetryDelayRef.current * 2, FLUSH_RETRY_MAX_MS);
          if (sentAny) invalidate();
          if (hadConflictAny) showNotice(FLUSH_CONFLICT_MESSAGE);
          return;
        }
      }

      flushRetryDelayRef.current = FLUSH_RETRY_BASE_MS;
      // Ordering matters: the invalidate only runs once the queue has drained, so a refetch can
      // never overwrite a still-unsent optimistic change.
      if (sentAny || reconcile) invalidate();
      if (hadConflictAny) showNotice(FLUSH_CONFLICT_MESSAGE);
    } finally {
      isFlushingRef.current = false;
    }
  }

  useEffect(() => {
    if (!listId) return;
    flushOutbox();
    const unsubscribe = connectionStatus.subscribe(() => {
      // Coming back online: flush anything queued, then resync regardless, since broadcasts sent
      // while we were disconnected are gone for good.
      if (connectionStatus.getStatus() === 'online') flushOutbox({ reconcile: true });
    });
    const pollId = setInterval(() => flushOutbox(), FLUSH_POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(pollId);
      clearTimeout(flushTimeoutRef.current);
    };
    // Deliberately keyed on listId alone: flushOutbox always reads listId fresh (not
    // stale-closure-sensitive here), and re-keying on it would tear down and re-subscribe/
    // re-poll on every render instead of just when the list actually changes.
  }, [listId]);

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
      return mutateWithOutbox<{ todo: Todo }>(
        { method: 'POST', path: `/lists/${listId}/todos`, body: { id, title, position } },
        (old) =>
          old &&
          produce(old, (draft) => {
            draft.todos.push(optimisticTodo);
          }),
        (old, response) => replaceTodo(old, response.todo),
      );
    },
  });

  const toggleTodo = useMutation({
    ...OFFLINE_AWARE,
    // `base` is what this client last saw for the field it's writing — for a toggle that's
    // definitionally the negation of the new value, so callers don't have to pass it.
    mutationFn: ({ todoId, done }: { todoId: string; done: boolean }) =>
      mutateWithOutbox<{ todo: Todo; hadConflict: boolean }>(
        { method: 'PATCH', path: `/lists/${listId}/todos/${todoId}`, body: { done, base: { done: !done } } },
        (old) =>
          old &&
          produce(old, (draft) => {
            const todo = draft.todos.find((t) => t.id === todoId);
            if (todo) {
              todo.done = done;
              todo.updatedAt = now();
            }
          }),
        (old, response) => replaceTodo(old, response.todo),
      ),
    onSuccess: (result) => {
      if (result.sent) noteConflict(result.response.hadConflict);
    },
  });

  // Markdown descriptions (specs/09-markdown-descriptions.md): same PATCH/outbox/conflict path
  // as toggleTodo, just a different field. The "don't yank text mid-edit" behavior it also
  // requires needs no extra wiring here — TodoDescription only reads descriptionMd from the
  // cache when *entering* edit mode, so a realtime update landing mid-edit is invisible to the
  // open textarea and only shows up (via the normal prop) once the user exits edit mode.
  const updateTodoDescription = useMutation({
    ...OFFLINE_AWARE,
    mutationFn: ({
      todoId,
      descriptionMd,
      baseDescriptionMd,
    }: {
      todoId: string;
      descriptionMd: string;
      baseDescriptionMd: string | null;
    }) =>
      mutateWithOutbox<{ todo: Todo; hadConflict: boolean }>(
        {
          method: 'PATCH',
          path: `/lists/${listId}/todos/${todoId}`,
          body: { descriptionMd, base: { descriptionMd: baseDescriptionMd } },
        },
        (old) =>
          old &&
          produce(old, (draft) => {
            const todo = draft.todos.find((t) => t.id === todoId);
            if (todo) {
              todo.descriptionMd = descriptionMd;
              todo.updatedAt = now();
            }
          }),
        (old, response) => replaceTodo(old, response.todo),
      ),
    onSuccess: (result) => {
      if (result.sent) noteConflict(result.response.hadConflict);
    },
  });

  // Cost tracking (tasks/01-cost-tracking-ui.md): same PATCH/outbox/conflict path as
  // updateTodoDescription, just a different field.
  const updateTodoCost = useMutation({
    ...OFFLINE_AWARE,
    mutationFn: ({
      todoId,
      costCents,
      baseCostCents,
    }: {
      todoId: string;
      costCents: number | null;
      baseCostCents: number | null;
    }) =>
      mutateWithOutbox<{ todo: Todo; hadConflict: boolean }>(
        {
          method: 'PATCH',
          path: `/lists/${listId}/todos/${todoId}`,
          body: { costCents, base: { costCents: baseCostCents } },
        },
        (old) =>
          old &&
          produce(old, (draft) => {
            const todo = draft.todos.find((t) => t.id === todoId);
            if (todo) {
              todo.costCents = costCents;
              todo.updatedAt = now();
            }
          }),
        (old, response) => replaceTodo(old, response.todo),
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

  // Reordering (specs/08-drag-and-drop.md): the dragged-to position is computed client-side
  // (lib/position.ts) before this is called. Optimistically re-sorting by position after setting
  // it (rather than splicing the array to the drop index) keeps this consistent with how the
  // server always returns todos — ordered by position — so a later refetch/broadcast never
  // visually jumps the item elsewhere.
  const reorderTodo = useMutation({
    ...OFFLINE_AWARE,
    mutationFn: ({ todoId, position }: { todoId: string; position: number }) =>
      mutateWithOutbox<{ todo: Todo; hadConflict: boolean }>(
        { method: 'PATCH', path: `/lists/${listId}/todos/${todoId}`, body: { position } },
        (old) =>
          old &&
          produce(old, (draft) => {
            const todo = draft.todos.find((t) => t.id === todoId);
            if (!todo) return;
            todo.position = position;
            draft.todos.sort((a, b) => a.position - b.position);
          }),
        // The response's position is the exact value just sent (server doesn't recompute it), so
        // the order the optimistic sort above already settled on stays correct — no need to
        // re-sort again here, just swap the row in place like every other reconciliation.
        (old, response) => replaceTodo(old, response.todo),
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
      return mutateWithOutbox<{ subtask: SubTask }>(
        { method: 'POST', path: `/lists/${listId}/todos/${todoId}/subtasks`, body: { id, title, position } },
        (old) =>
          old &&
          produce(old, (draft) => {
            const todo = draft.todos.find((t) => t.id === todoId);
            if (todo) todo.subtasks.push(optimisticSubTask);
          }),
        (old, response) => replaceSubTask(old, response.subtask),
      );
    },
  });

  const toggleSubTask = useMutation({
    ...OFFLINE_AWARE,
    // See toggleTodo on why `base` is derived rather than passed.
    mutationFn: ({ todoId, subtaskId, done }: { todoId: string; subtaskId: string; done: boolean }) =>
      mutateWithOutbox<{ subtask: SubTask; hadConflict: boolean }>(
        {
          method: 'PATCH',
          path: `/lists/${listId}/todos/${todoId}/subtasks/${subtaskId}`,
          body: { done, base: { done: !done } },
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
        (old, response) => replaceSubTask(old, response.subtask),
      ),
    onSuccess: (result) => {
      if (result.sent) noteConflict(result.response.hadConflict);
    },
  });

  // See updateTodoCost above — same idea, one level down.
  const updateSubTaskCost = useMutation({
    ...OFFLINE_AWARE,
    mutationFn: ({
      todoId,
      subtaskId,
      costCents,
      baseCostCents,
    }: {
      todoId: string;
      subtaskId: string;
      costCents: number | null;
      baseCostCents: number | null;
    }) =>
      mutateWithOutbox<{ subtask: SubTask; hadConflict: boolean }>(
        {
          method: 'PATCH',
          path: `/lists/${listId}/todos/${todoId}/subtasks/${subtaskId}`,
          body: { costCents, base: { costCents: baseCostCents } },
        },
        (old) =>
          old &&
          produce(old, (draft) => {
            const subtask = draft.todos.find((t) => t.id === todoId)?.subtasks.find((s) => s.id === subtaskId);
            if (subtask) {
              subtask.costCents = costCents;
              subtask.updatedAt = now();
            }
          }),
        (old, response) => replaceSubTask(old, response.subtask),
      ),
    onSuccess: (result) => {
      if (result.sent) noteConflict(result.response.hadConflict);
    },
  });

  // See reorderTodo above — same idea, one level down.
  const reorderSubTask = useMutation({
    ...OFFLINE_AWARE,
    mutationFn: ({ todoId, subtaskId, position }: { todoId: string; subtaskId: string; position: number }) =>
      mutateWithOutbox<{ subtask: SubTask; hadConflict: boolean }>(
        { method: 'PATCH', path: `/lists/${listId}/todos/${todoId}/subtasks/${subtaskId}`, body: { position } },
        (old) =>
          old &&
          produce(old, (draft) => {
            const todo = draft.todos.find((t) => t.id === todoId);
            const subtask = todo?.subtasks.find((s) => s.id === subtaskId);
            if (!todo || !subtask) return;
            subtask.position = position;
            todo.subtasks.sort((a, b) => a.position - b.position);
          }),
        (old, response) => replaceSubTask(old, response.subtask),
      ),
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
    updateTodoDescription,
    updateTodoCost,
    deleteTodo,
    reorderTodo,
    createSubTask,
    toggleSubTask,
    updateSubTaskCost,
    reorderSubTask,
    deleteSubTask,
    deleteList,
    conflictNotice: notice,
    dismissConflictNotice: () => setNotice(null),
  };
}
