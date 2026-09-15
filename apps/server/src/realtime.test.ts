import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SOCKET_EVENTS } from '@ubiquiti-todo/shared';
import { buildApp } from './app.js';
import { registerSocketHandlers, type SocketBroadcaster } from './socket.js';
import { createList, truncateAll } from './test/harness.js';

// The spy broadcaster used everywhere else (test/harness.ts) proves each route *asks* for the
// right broadcast — this file is the one place that proves it actually gets *delivered*: a real
// listening server, a real Socket.IO server attached to it, and two real socket.io-client
// connections. Deliberately just one test (per tasks/23-testing.md step 7) — it needs a real port
// and real async timing, the flakiest thing in the suite, so everything cheaper belongs in step 6.
describe('realtime delivery (one real end-to-end test)', () => {
  let app: FastifyInstance;
  let io: SocketIOServer;
  let baseUrl: string;
  let clientA: ClientSocket;
  let clientB: ClientSocket;

  beforeAll(async () => {
    // Mirrors index.ts's own resolution of the app.server/io/broadcaster construction cycle
    // (buildApp() needs a broadcaster to decorate, but the real one needs app.server, which
    // buildApp() itself creates) — see app.ts's and index.ts's comments for why this shim exists.
    let realBroadcaster: SocketBroadcaster | undefined;
    const broadcaster: SocketBroadcaster = {
      broadcastToList: (...args) => realBroadcaster?.broadcastToList(...args),
    };
    app = await buildApp({ broadcaster, isProduction: false, logger: false });

    io = new SocketIOServer(app.server, { cors: { origin: '*' } });
    realBroadcaster = registerSocketHandlers(io, app.log);

    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    clientA?.disconnect();
    clientB?.disconnect();
    await io.close();
    await app.close();
  });

  function connect(): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  function waitForEvent<T>(
    socket: ClientSocket,
    event: string,
    predicate: (payload: T) => boolean = () => true,
    timeoutMs = 2000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for "${event}"`)),
        timeoutMs,
      );
      function onEvent(payload: T) {
        if (!predicate(payload)) return;
        clearTimeout(timer);
        socket.off(event, onEvent);
        resolve(payload);
      }
      socket.on(event, onEvent);
    });
  }

  it('delivers a REST mutation to another viewer, excludes the sender, and updates presence', async () => {
    await truncateAll();
    const list = await createList(app, 'Realtime test list');

    clientA = await connect();
    clientB = await connect();

    const memberA = { id: 'member-a', name: 'A', color: '#111' };
    const memberB = { id: 'member-b', name: 'B', color: '#222' };

    // clientA joins first (which broadcasts presence with just A — not what this waits for);
    // clientB joining afterward should broadcast an updated member list, with both present, back
    // to clientA.
    const presenceAfterBJoins = waitForEvent<{ members: unknown[] }>(
      clientA,
      SOCKET_EVENTS.PRESENCE_UPDATE,
      (payload) => payload.members.length === 2,
    );
    clientA.emit(SOCKET_EVENTS.LIST_JOIN, { listId: list.id, member: memberA });
    clientB.emit(SOCKET_EVENTS.LIST_JOIN, { listId: list.id, member: memberB });

    const presenceUpdate = await presenceAfterBJoins;
    expect(presenceUpdate.members).toHaveLength(2);

    // A REST mutation from clientA's member id (as the X-Client-Id header) should reach clientB
    // and *not* be echoed back to clientA itself.
    const bReceivesUpdate = waitForEvent<{ list: { title: string } }>(
      clientB,
      SOCKET_EVENTS.LIST_UPDATED,
    );
    let aReceivedOwnUpdate = false;
    clientA.once(SOCKET_EVENTS.LIST_UPDATED, () => {
      aReceivedOwnUpdate = true;
    });

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/lists/${list.id}`,
      headers: { 'x-client-id': memberA.id },
      payload: { title: 'Renamed via REST' },
    });
    expect(patchRes.statusCode).toBe(200);

    const updatePayload = await bReceivesUpdate;
    expect(updatePayload.list.title).toBe('Renamed via REST');
    // A brief wait to let a (wrongly) self-delivered event have a chance to arrive before
    // asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(aReceivedOwnUpdate).toBe(false);

    // clientB disconnecting should broadcast presence again, leaving only clientA.
    const presenceAfterBLeaves = waitForEvent<{ members: { id: string }[] }>(
      clientA,
      SOCKET_EVENTS.PRESENCE_UPDATE,
      (payload) => payload.members.length === 1,
    );
    clientB.disconnect();
    const finalPresence = await presenceAfterBLeaves;
    expect(finalPresence.members).toEqual([expect.objectContaining({ id: memberA.id })]);
  });
});
