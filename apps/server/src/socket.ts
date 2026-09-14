import type { Server as SocketIOServer } from 'socket.io';
import type { FastifyBaseLogger } from 'fastify';
import {
  MemberSchema,
  SOCKET_EVENTS,
  type ListJoinPayload,
  type ListLeavePayload,
  type PresenceUpdatePayload,
} from '@ubiquiti-todo/shared';
import { PresenceStore } from './presence.js';

function listRoom(listId: string) {
  return `list:${listId}`;
}

export function registerSocketHandlers(io: SocketIOServer, log: FastifyBaseLogger) {
  const presence = new PresenceStore();

  function broadcastPresence(listId: string) {
    const payload: PresenceUpdatePayload = { members: presence.getMembers(listId) };
    io.to(listRoom(listId)).emit(SOCKET_EVENTS.PRESENCE_UPDATE, payload);
  }

  io.on('connection', (socket) => {
    log.info(`socket connected: ${socket.id}`);

    socket.on(SOCKET_EVENTS.LIST_JOIN, (payload: ListJoinPayload) => {
      const member = MemberSchema.safeParse(payload?.member);
      if (!member.success || typeof payload?.listId !== 'string') return;

      socket.join(listRoom(payload.listId));
      presence.join(socket.id, payload.listId, member.data);
      broadcastPresence(payload.listId);
    });

    socket.on(SOCKET_EVENTS.LIST_LEAVE, (payload: ListLeavePayload) => {
      if (typeof payload?.listId !== 'string') return;
      socket.leave(listRoom(payload.listId));
      const listId = presence.leave(socket.id);
      if (listId) broadcastPresence(listId);
    });

    socket.on('disconnect', () => {
      log.info(`socket disconnected: ${socket.id}`);
      const listId = presence.leave(socket.id);
      if (listId) broadcastPresence(listId);
    });
  });

  return {
    // Broadcasts a change event to everyone viewing the list, excluding the sockets of the
    // member whose REST call caused it (if known) — see
    // specs/04-realtime-protocol.md#connecting-the-mutations-rest-id-to-the-socket.
    broadcastToList(listId: string, excludeMemberId: string | undefined, event: string, payload: unknown) {
      const excludeSocketIds = excludeMemberId ? presence.getSocketIds(excludeMemberId) : [];
      io.to(listRoom(listId)).except(excludeSocketIds).emit(event, payload);
    },
  };
}

export type SocketBroadcaster = ReturnType<typeof registerSocketHandlers>;
