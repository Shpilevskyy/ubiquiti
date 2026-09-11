import type { SocketBroadcaster } from '../socket.js';

declare module 'fastify' {
  interface FastifyInstance {
    broadcaster: SocketBroadcaster;
  }
}
