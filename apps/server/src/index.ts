import { Server as SocketIOServer } from 'socket.io';
import { buildApp } from './app.js';
import { registerSocketHandlers, type SocketBroadcaster } from './socket.js';
import { prisma } from './prisma.js';

const isProduction = process.env.NODE_ENV === 'production';

// registerSocketHandlers() needs `io`, which needs `app.server` — which doesn't exist until the
// Fastify instance inside buildApp() is constructed. But buildApp() needs a broadcaster *parameter*
// to decorate onto the app. Routes only call `app.broadcaster.broadcastToList` at request time
// (well after app.listen() below, once this file has finished running top to bottom), so this thin
// forwarding shim can be handed to buildApp() immediately and pointed at the real broadcaster once
// `app.server` exists — see tasks/23-testing.md step 2 for why buildApp() takes it as a parameter.
let realBroadcaster: SocketBroadcaster | undefined;
const broadcaster: SocketBroadcaster = {
  broadcastToList: (...args) => realBroadcaster!.broadcastToList(...args),
};

const app = await buildApp({ broadcaster, isProduction });

// Attaches to app.server (the raw Node HTTP server), which exists once the Fastify instance above
// is built — routes can broadcast realtime events via app.broadcaster (wired above).
const io = new SocketIOServer(app.server, {
  cors: isProduction ? undefined : { origin: 'http://localhost:5173' },
});
realBroadcaster = registerSocketHandlers(io, app.log);

const port = Number(process.env.PORT) || 3001;

await app.listen({ port, host: '0.0.0.0' });

// Render sends SIGTERM on every deploy (this app auto-deploys on every push), so this runs far
// more often than "server crashed" — without it, every deploy would drop in-flight requests and
// open WebSocket connections abruptly and leave Prisma's connection pool undrained (tasks/14).
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} received, shutting down`);

  // A hung connection (or a client that never completes a WebSocket close handshake) shouldn't be
  // able to block shutdown forever — Render kills the process outright after its own grace period
  // regardless, so this just ensures a clean exit path is at least attempted first.
  const forceExit = setTimeout(() => {
    app.log.warn('shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    // io.close() first: it actively ends every open Socket.IO connection (not just stops
    // accepting new ones), which also closes the shared http.Server underneath it. app.close()
    // afterward still needs to run for Fastify's own plugin/route teardown — it tolerates the
    // server already being closed (swallows ERR_SERVER_NOT_RUNNING internally) — and, since it
    // waits for in-flight HTTP requests to finish, prisma.$disconnect() belongs after it so the
    // DB pool stays alive until requests that might use it are done.
    await io.close();
    await app.close();
    await prisma.$disconnect();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    app.log.error(error, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
