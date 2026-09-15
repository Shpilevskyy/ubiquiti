import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// apps/web's tsconfig has no Node types (it's a browser app) — this file runs under Vitest's
// Node process, where the real Node global genuinely exists (see the comment on
// flushRealMacrotasks below), so this just tells the type checker about it rather than pulling in
// all of @types/node's globals (process, Buffer, ...) for one function.
declare const setImmediate: (callback: () => void) => void;

// Keeps the real HttpError class (outboxSync's retry policy branches on `instanceof HttpError`
// and `.status`) while stubbing sendOp itself — see tasks/23-testing.md's Tooling table.
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, sendOp: vi.fn() };
});

// fake-indexeddb schedules its request callbacks via the *real* setImmediate (confirmed by
// reading node_modules/fake-indexeddb/build/esm/lib/scheduling.js directly, not assumed) — a
// distinct global from setTimeout/setInterval. Faking only the latter two lets outboxSync's
// actual backoff/poll timers be driven deterministically via vi.advanceTimersByTimeAsync()
// without also freezing every IndexedDB operation underneath it.
function useOutboxSyncTimers() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
}

// Lets any pending real (unfaked) macrotasks — fake-indexeddb's setImmediate-scheduled request
// callbacks, and the promise chains inside flush() awaiting them — settle before an assertion.
// Cheap and fast in real time; unrelated to the long fake-timer delays under test.
async function flushRealMacrotasks(ticks = 20) {
  for (let i = 0; i < ticks; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function loadFresh() {
  const outbox = await import('./outbox');
  const outboxSync = await import('./outboxSync');
  const api = await import('./api');
  const { connectionStatus } = await import('./connectionStatus');
  return { outbox, outboxSync, api, connectionStatus };
}

describe('outboxSync', () => {
  beforeEach(() => {
    // Module-level state (outboxSync's `states` Map, connectionStatus's `status`/listeners) is
    // set up as an import side effect and would otherwise leak between tests — see
    // tasks/23-testing.md's Hazards section. Fresh instances via resetModules() + dynamic
    // import(), not a test-only reset hook added to production code.
    vi.resetModules();
    useOutboxSyncTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('replays queued ops in FIFO order, each awaited before the next is sent', async () => {
    const { outbox, outboxSync, api } = await loadFresh();
    const listId = crypto.randomUUID();
    await outbox.enqueue(listId, { method: 'POST', path: '/a', body: {} });
    await outbox.enqueue(listId, { method: 'POST', path: '/b', body: {} });

    const sentOrder: string[] = [];
    let resolveA: (() => void) | undefined;
    vi.mocked(api.sendOp).mockImplementation(async (op) => {
      sentOrder.push(op.path);
      if (op.path === '/a') {
        // Held open deliberately: if `/b` were sent before this resolves, "await before next"
        // would be broken and sentOrder would already contain both entries at this point.
        await new Promise<void>((resolve) => {
          resolveA = resolve;
        });
      }
      return {};
    });

    const stop = outboxSync.start(listId, { onNotice: vi.fn(), onInvalidate: vi.fn() });
    await flushRealMacrotasks();
    expect(sentOrder).toEqual(['/a']);

    resolveA?.();
    await flushRealMacrotasks();
    expect(sentOrder).toEqual(['/a', '/b']);
    expect(await outbox.getQueue(listId)).toEqual([]);
    stop();
  });

  it('dequeues on success and marks connectionStatus online', async () => {
    const { outbox, outboxSync, api, connectionStatus } = await loadFresh();
    connectionStatus.markOffline();
    const listId = crypto.randomUUID();
    await outbox.enqueue(listId, { method: 'POST', path: '/a', body: {} });
    vi.mocked(api.sendOp).mockResolvedValue({});

    const stop = outboxSync.start(listId, { onNotice: vi.fn(), onInvalidate: vi.fn() });
    await flushRealMacrotasks();

    expect(await outbox.getQueue(listId)).toEqual([]);
    // A successful send is itself evidence of reachability — self-heals a pill left stuck
    // offline by a browser that never fired a real `online` event.
    expect(connectionStatus.getStatus()).toBe('online');
    stop();
  });

  it('a 404 dequeues, notices, and does not block the op queued behind it', async () => {
    const { outbox, outboxSync, api } = await loadFresh();
    const listId = crypto.randomUUID();
    await outbox.enqueue(listId, { method: 'PATCH', path: '/gone', body: {} });
    await outbox.enqueue(listId, { method: 'POST', path: '/b', body: {} });

    vi.mocked(api.sendOp).mockImplementation(async (op) => {
      if (op.path === '/gone') throw new api.HttpError(404, 'Not found');
      return {};
    });

    const onNotice = vi.fn();
    const stop = outboxSync.start(listId, { onNotice, onInvalidate: vi.fn() });
    await flushRealMacrotasks();

    expect(onNotice).toHaveBeenCalledWith('This item no longer exists');
    expect(await outbox.getQueue(listId)).toEqual([]);
    expect(api.sendOp).toHaveBeenCalledTimes(2); // '/b' was still attempted, not blocked
    stop();
  });

  it('any other 4xx is permanent: dequeues, notices as discarded, continues', async () => {
    const { outbox, outboxSync, api } = await loadFresh();
    const listId = crypto.randomUUID();
    await outbox.enqueue(listId, { method: 'PATCH', path: '/bad', body: {} });
    await outbox.enqueue(listId, { method: 'POST', path: '/b', body: {} });

    vi.mocked(api.sendOp).mockImplementation(async (op) => {
      if (op.path === '/bad') throw new api.HttpError(400, 'Invalid body');
      return {};
    });

    const onNotice = vi.fn();
    const stop = outboxSync.start(listId, { onNotice, onInvalidate: vi.fn() });
    await flushRealMacrotasks();

    expect(onNotice).toHaveBeenCalledWith('A change could not be saved and was discarded');
    expect(await outbox.getQueue(listId)).toEqual([]);
    expect(api.sendOp).toHaveBeenCalledTimes(2); // '/b' was still attempted, not blocked
    stop();
  });

  it('a network/5xx failure leaves the op queued and does not touch the ops behind it', async () => {
    const { outbox, outboxSync, api } = await loadFresh();
    const listId = crypto.randomUUID();
    await outbox.enqueue(listId, { method: 'POST', path: '/a', body: {} });
    await outbox.enqueue(listId, { method: 'POST', path: '/b', body: {} });
    vi.mocked(api.sendOp).mockRejectedValue(new api.HttpError(500, 'boom'));

    const stop = outboxSync.start(listId, { onNotice: vi.fn(), onInvalidate: vi.fn() });
    await flushRealMacrotasks();

    expect(api.sendOp).toHaveBeenCalledTimes(1); // only the head op was attempted
    const queue = await outbox.getQueue(listId);
    expect(queue.map((op) => op.path)).toEqual(['/a', '/b']); // both still queued, in order
    expect(queue[0].attempts).toBe(1);
    // A retry is scheduled (the backoff timer) alongside the already-running poll interval.
    expect(vi.getTimerCount()).toBe(2);
    stop();
  });

  it('backs off with a doubling delay from 2s up to a 30s ceiling', async () => {
    const { outbox, outboxSync, api } = await loadFresh();
    const listId = crypto.randomUUID();
    await outbox.enqueue(listId, { method: 'POST', path: '/a', body: {} });
    vi.mocked(api.sendOp).mockRejectedValue(new api.HttpError(500, 'boom'));

    const stop = outboxSync.start(listId, { onNotice: vi.fn(), onInvalidate: vi.fn() });
    await flushRealMacrotasks();
    expect(api.sendOp).toHaveBeenCalledTimes(1); // attempt 1, the mount-time flush

    // Each round advances by exactly the expected next delay in a single
    // advanceTimersByTimeAsync call and checks exactly one more attempt happened. (Splitting
    // each round into a "just under" and "+1" pair of separate advance calls, tried first,
    // produced a false failure here: the outbox's own 15s poll — a second, independent timer
    // running throughout — shares the isFlushing guard with the retry timer, so two due timers
    // processed together in *one* batch correctly collapse to a single attempt, but splitting
    // into several smaller awaited advances gives the poll's due moment its own separate,
    // unguarded turn once the prior attempt has already finished. Real, correct behavior; just
    // not what a hand-rolled "and not a moment before" check can observe without conflating the
    // two timers, so this test doesn't attempt that check.)
    const expectedDelays = [2000, 4000, 8000, 16000, 30000, 30000];
    for (const [i, delay] of expectedDelays.entries()) {
      await vi.advanceTimersByTimeAsync(delay);
      await flushRealMacrotasks();
      expect(api.sendOp).toHaveBeenCalledTimes(i + 2);
    }
    stop();
  });

  it('drops an op after its 10th failed attempt instead of retrying forever', async () => {
    const { outbox, outboxSync, api } = await loadFresh();
    const listId = crypto.randomUUID();
    await outbox.enqueue(listId, { method: 'POST', path: '/a', body: {} });
    vi.mocked(api.sendOp).mockRejectedValue(new api.HttpError(500, 'boom'));

    const onNotice = vi.fn();
    const stop = outboxSync.start(listId, { onNotice, onInvalidate: vi.fn() });
    await flushRealMacrotasks(); // attempt 1

    // One retry per delay in the schedule confirmed by the backoff test above — attempts 2
    // through 9, all still under the 10-attempt cap.
    const delaysUpToNinthAttempt = [2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000];
    for (const delay of delaysUpToNinthAttempt) {
      await vi.advanceTimersByTimeAsync(delay);
      await flushRealMacrotasks();
    }
    expect(await outbox.getQueue(listId)).toHaveLength(1); // attempt 9 just failed, still queued

    // The 10th failure trips MAX_FLUSH_ATTEMPTS.
    await vi.advanceTimersByTimeAsync(30000);
    await flushRealMacrotasks();

    expect(await outbox.getQueue(listId)).toHaveLength(0);
    expect(onNotice).toHaveBeenCalledWith('A change could not be saved and was discarded');
    stop();
  });

  it('the isFlushing guard prevents two overlapping triggers from double-sending the head op', async () => {
    const { outbox, outboxSync, api, connectionStatus } = await loadFresh();
    const listId = crypto.randomUUID();
    await outbox.enqueue(listId, { method: 'POST', path: '/a', body: {} });

    let resolveSend: (() => void) | undefined;
    vi.mocked(api.sendOp).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = () => resolve({});
        }),
    );

    const stop = outboxSync.start(listId, { onNotice: vi.fn(), onInvalidate: vi.fn() });
    await flushRealMacrotasks(); // the mount-time flush is now in-flight, awaiting sendOp

    // A second trigger while the first is still pending must be a no-op, not a second send.
    connectionStatus.markOffline();
    connectionStatus.markOnline();
    await flushRealMacrotasks();
    expect(api.sendOp).toHaveBeenCalledTimes(1);

    resolveSend?.();
    await flushRealMacrotasks();
    expect(await outbox.getQueue(listId)).toEqual([]);
    stop();
  });

  it('aggregates hadConflict into one notice per flush, not one per op', async () => {
    const { outbox, outboxSync, api } = await loadFresh();
    const listId = crypto.randomUUID();
    await outbox.enqueue(listId, { method: 'PATCH', path: '/a', body: {} });
    await outbox.enqueue(listId, { method: 'PATCH', path: '/b', body: {} });
    vi.mocked(api.sendOp).mockResolvedValue({ hadConflict: true });

    const onNotice = vi.fn();
    const stop = outboxSync.start(listId, { onNotice, onInvalidate: vi.fn() });
    await flushRealMacrotasks();

    const conflictNotices = onNotice.mock.calls.filter(
      ([message]) => message === 'Some changes were also edited elsewhere',
    );
    expect(conflictNotices).toHaveLength(1);
    stop();
  });

  it('reconcile:true invalidates even when the queue was empty', async () => {
    const { outboxSync, connectionStatus } = await loadFresh();
    const listId = crypto.randomUUID();
    // Queue intentionally left empty.

    const onInvalidate = vi.fn();
    const stop = outboxSync.start(listId, { onNotice: vi.fn(), onInvalidate });
    await flushRealMacrotasks();
    // The mount-time flush (reconcile: false) found nothing to send and nothing to reconcile.
    expect(onInvalidate).not.toHaveBeenCalled();

    // The reconnect trigger always requests reconcile:true — this is the missed-broadcast fix
    // (tasks/05): without it, a network blip with nothing queued would resync nothing at all.
    connectionStatus.markOffline();
    connectionStatus.markOnline();
    await flushRealMacrotasks();

    expect(onInvalidate).toHaveBeenCalledTimes(1);
    stop();
  });

  it('ref-counts start() callers: one shared poller, torn down only after the last stop()', async () => {
    const { outbox, outboxSync, api } = await loadFresh();
    const listId = crypto.randomUUID();
    await outbox.enqueue(listId, { method: 'POST', path: '/a', body: {} });
    vi.mocked(api.sendOp).mockResolvedValue({});

    const callerA = { onNotice: vi.fn(), onInvalidate: vi.fn() };
    const callerB = { onNotice: vi.fn(), onInvalidate: vi.fn() };
    const stopA = outboxSync.start(listId, callerA);
    const stopB = outboxSync.start(listId, callerB);
    await flushRealMacrotasks();

    // The mount-time flush ran once, shared — not once per start() call — and both registered
    // callers heard about it.
    expect(api.sendOp).toHaveBeenCalledTimes(1);
    expect(callerA.onInvalidate).toHaveBeenCalledTimes(1);
    expect(callerB.onInvalidate).toHaveBeenCalledTimes(1);

    // Stopping one of two callers must not tear the shared loop down for the other.
    stopA();
    expect(vi.getTimerCount()).toBe(1); // the poll interval is still alive

    await outbox.enqueue(listId, { method: 'POST', path: '/b', body: {} });
    await vi.advanceTimersByTimeAsync(15000); // the shared poll interval fires
    await flushRealMacrotasks();
    expect(callerB.onInvalidate).toHaveBeenCalledTimes(2);
    expect(callerA.onInvalidate).toHaveBeenCalledTimes(1); // already unregistered, hears nothing new

    // The last stop() clears both the poll interval and any pending retry timeout.
    stopB();
    expect(vi.getTimerCount()).toBe(0);
  });
});
