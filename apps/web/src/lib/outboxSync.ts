import { HttpError, sendOp } from './api';
import { connectionStatus } from './connectionStatus';
import { dequeue, getQueue, recordAttempt } from './outbox';

// The background half of the outbox pattern (specs/06-offline-sync.md) — a plain module, no React.
// It's a timer/queue/retry-policy loop that happens to serve React components, not a React concern
// itself: it used to live inside useList's effect, which meant a second useList() call site for
// the same list would start a second, independently-racing poller/flush loop over the same
// IndexedDB queue (tasks/07). Reference-counted start/stop below means N callers share exactly one
// loop per listId.

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
const FLUSH_CONFLICT_MESSAGE = 'Some changes were also edited elsewhere';

export interface OutboxSyncCallbacks {
  onNotice: (message: string) => void;
  // Called once a flush batch has fully drained (or immediately, if reconcile was requested and
  // nothing needed sending) — the caller's job is to refetch/resync its view of the list.
  onInvalidate: () => void;
}

interface SyncState {
  refCount: number;
  callbacks: Set<OutboxSyncCallbacks>;
  // flush has four triggers (initial start, connectionStatus, the poll, its own backoff timer)
  // with no natural mutual exclusion. Without this guard, two overlapping runs both read the
  // queue, both send the same head-of-queue op, and race each other's dequeue — this is also what
  // made the outbox.ts atomicity bug (tasks/03) reachable in practice, not just enqueue-vs-flush.
  isFlushing: boolean;
  retryDelay: number;
  retryTimeout: ReturnType<typeof setTimeout> | undefined;
  pollInterval: ReturnType<typeof setInterval> | undefined;
  unsubscribeConnection: (() => void) | undefined;
}

const states = new Map<string, SyncState>();

function notifyNotice(state: SyncState, message: string) {
  state.callbacks.forEach((cb) => {
    cb.onNotice(message);
  });
}

function notifyInvalidate(state: SyncState) {
  state.callbacks.forEach((cb) => {
    cb.onInvalidate();
  });
}

// Flushing the outbox (specs/06-offline-sync.md): replay queued ops for this list in FIFO order,
// awaiting each response before sending the next (preserves the order they were made in, and
// means a create always lands before a PATCH/DELETE that depends on it). Triggered by
// connectionStatus going online (aggregating the spec's two triggers — Socket.IO
// connect/reconnect and the browser online event) for promptness, once when the loop starts for a
// queue left over from a previous session, and by a periodic poll (FLUSH_POLL_MS) as a fallback
// for when neither event fires. Deliberately doesn't gate on connectionStatus's belief that we're
// online — a failed sendOp already means "leave it queued," so attempting when we might actually
// be offline just costs one wasted request rather than something worth guarding against, and not
// gating on it is what makes the poll fallback work at all.
//
// `reconcile` forces the closing invalidate even when the queue was empty. Needed on reconnect:
// while the socket was down this client missed every broadcast for the list, and
// refetchOnReconnect/refetchOnWindowFocus are disabled on the list query (to stop them racing this
// flush) — removing the refetch that used to repair that. Without this, a network blip with
// nothing queued leaves the client silently stale until it remounts.
async function flush(listId: string, { reconcile = false }: { reconcile?: boolean } = {}) {
  const state = states.get(listId);
  if (!state || state.isFlushing) return;
  state.isFlushing = true;
  // Whatever triggered this run supersedes any backoff retry scheduled by a previous run — at
  // most one timer should ever be outstanding, and this run's own outcome (success, or a fresh
  // schedule below) is the only one that should matter from here.
  clearTimeout(state.retryTimeout);
  state.retryTimeout = undefined;

  try {
    let sentAny = false;
    // Otherwise sendOp's response is ignored entirely, so a queued PATCH that comes back
    // hadConflict: true during a reconnect replay never surfaces the toast a live edit would've
    // gotten (tasks/05). One op per notice would be noisy for a whole backlog replaying at once,
    // so this aggregates to a single notice for the flush instead.
    let hadConflictAny = false;
    while (true) {
      const [op] = await getQueue(listId);
      if (!op) break;

      try {
        const response = await sendOp<{ hadConflict?: boolean }>(op);
        await dequeue(listId, op.opId);
        sentAny = true;
        if (response?.hadConflict) hadConflictAny = true;
        // A successful request is the strongest possible evidence we're online — feeds back into
        // the belief connectionStatus tracks (and the "Offline" pill reads), so a successful poll
        // fallback flush also self-heals a pill left stuck offline by a browser that never fired
        // the online event in the first place.
        connectionStatus.markOnline();
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) {
          await dequeue(listId, op.opId);
          notifyNotice(state, 'This item no longer exists');
          continue;
        }
        if (err instanceof HttpError && err.status < 500) {
          // Any other 4xx (e.g. a rejected body) is permanent, not transient — retrying it every
          // poll would head-of-line-block every op queued behind it forever.
          await dequeue(listId, op.opId);
          notifyNotice(state, DISCARDED_MESSAGE);
          continue;
        }
        // Network error / 5xx: worth retrying, but capped so a failure mode not enumerated above
        // still can't retry forever.
        const attempts = await recordAttempt(listId, op.opId);
        if (attempts >= MAX_FLUSH_ATTEMPTS) {
          await dequeue(listId, op.opId);
          notifyNotice(state, DISCARDED_MESSAGE);
          continue;
        }
        // Stop here, leave the rest queued, retry the whole flush later with backoff rather than
        // looping tightly against a server/connection that's down.
        state.retryTimeout = setTimeout(() => flush(listId, { reconcile }), state.retryDelay);
        state.retryDelay = Math.min(state.retryDelay * 2, FLUSH_RETRY_MAX_MS);
        if (sentAny) notifyInvalidate(state);
        if (hadConflictAny) notifyNotice(state, FLUSH_CONFLICT_MESSAGE);
        return;
      }
    }

    state.retryDelay = FLUSH_RETRY_BASE_MS;
    // Ordering matters: the invalidate only runs once the queue has drained, so a refetch can
    // never overwrite a still-unsent optimistic change.
    if (sentAny || reconcile) notifyInvalidate(state);
    if (hadConflictAny) notifyNotice(state, FLUSH_CONFLICT_MESSAGE);
  } finally {
    state.isFlushing = false;
  }
}

// Starts the flush loop for `listId` if this is the first caller, and always registers
// `callbacks` so this caller hears about notices/invalidations. Returns a function that
// unregisters this caller and, once the last one has stopped, tears the loop down entirely.
export function start(listId: string, callbacks: OutboxSyncCallbacks): () => void {
  let state = states.get(listId);
  if (!state) {
    state = {
      refCount: 0,
      callbacks: new Set(),
      isFlushing: false,
      retryDelay: FLUSH_RETRY_BASE_MS,
      retryTimeout: undefined,
      pollInterval: undefined,
      unsubscribeConnection: undefined,
    };
    states.set(listId, state);
  }

  state.refCount++;
  state.callbacks.add(callbacks);

  if (state.refCount === 1) {
    flush(listId);
    state.unsubscribeConnection = connectionStatus.subscribe(() => {
      // Coming back online: flush anything queued, then resync regardless, since broadcasts sent
      // while we were disconnected are gone for good.
      if (connectionStatus.getStatus() === 'online') flush(listId, { reconcile: true });
    });
    state.pollInterval = setInterval(() => flush(listId), FLUSH_POLL_MS);
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    stop(listId, callbacks);
  };
}

function stop(listId: string, callbacks: OutboxSyncCallbacks): void {
  const state = states.get(listId);
  if (!state) return;
  state.callbacks.delete(callbacks);
  state.refCount--;
  if (state.refCount <= 0) {
    state.unsubscribeConnection?.();
    clearInterval(state.pollInterval);
    clearTimeout(state.retryTimeout);
    states.delete(listId);
  }
}
