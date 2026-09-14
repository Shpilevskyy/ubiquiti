import type { SocketBroadcaster } from '../socket.js';

declare module 'fastify' {
  interface FastifyInstance {
    broadcaster: SocketBroadcaster;
  }
  interface FastifyRequest {
    // Set once by an onRequest hook (index.ts) from the X-Client-Id header — see
    // tasks/09-server-route-boilerplate.md. Replaces the identical
    // `request.headers[CLIENT_ID_HEADER] as string | undefined` cast that used to appear at every
    // broadcast call site.
    clientId: string | undefined;
  }
}
