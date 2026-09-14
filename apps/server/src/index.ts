import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { Server as SocketIOServer } from 'socket.io';
import { CLIENT_ID_HEADER } from '@ubiquiti-todo/shared';
import { listsRoutes } from './routes/lists.js';
import { todosRoutes } from './routes/todos.js';
import { subtasksRoutes } from './routes/subtasks.js';
import { registerErrorHandling } from './errorHandler.js';
import { registerSocketHandlers } from './socket.js';
import { prisma } from './prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
const isProduction = process.env.NODE_ENV === 'production';

const app = Fastify({
  logger: true,
  // Public, unauthenticated, internet-facing API with no per-field length limits in the shared
  // zod schemas yet — the largest legitimate payload here is a markdown description. 256KB is
  // generous for that and well below Fastify's 1MB default (tasks/14).
  bodyLimit: 256 * 1024,
});

// Must run before any routes are registered: Fastify bakes the current error/not-found
// handlers into each route's context at registration time, so routes added earlier would
// otherwise keep the default handlers instead of ours.
registerErrorHandling(app, { isProduction });

// Security headers (tasks/14). CSP's defaults (script-src/style-src/connect-src all falling back
// to default-src 'self') work unmodified here because everything is same-origin: the built JS is
// loaded via a same-origin <script src>, React's inline style={} attributes are covered by
// style-src's default 'unsafe-inline', and the Socket.IO client's XHR/WebSocket traffic goes to
// this same origin too. No directive overrides needed — verified against the production build,
// not just dev, since static files are only served through Fastify (and therefore only get this
// header) in production.
await app.register(fastifyHelmet);

// Global rate limit (tasks/14) — this is a public API with no auth, so nothing else bounds how
// fast one caller can hit it. The default error response is a plain `Error` with `.statusCode`
// set to 429, which flows through the same generic error handler as everything else
// (errorHandler.ts's STATUS_TO_CODE already maps 429), so no custom errorResponseBuilder is
// needed to keep the unified `{ error: { code, message } }` shape.
//
// The limit is per-IP and, being global, also covers the static assets served below — so the
// original 100/min was measuring the wrong thing: two browser tabs of one collaborating pair
// share an IP, every mutation is a request, and each cold page load spends several more on
// assets. That put a normal two-person demo within reach of a 429, which is a far worse failure
// than the abuse it was guarding against. 600/min still bounds a scripted caller to 10 req/s.
await app.register(fastifyRateLimit, { max: 600, timeWindow: '1 minute' });

// Lets routes declare `schema: { body, params }` using the zod schemas from packages/shared
// directly instead of a hand-rolled `Schema.safeParse` + manual 400 in every handler (tasks/09).
// A validation failure throws a standard Fastify validation error (statusCode 400), which falls
// through to the generic status→code mapping in errorHandler.ts above — no special-casing needed
// to keep the unified error shape.
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Reads the client-identity header once per request instead of every route handler repeating the
// same `request.headers[CLIENT_ID_HEADER] as string | undefined` cast (tasks/09).
app.decorateRequest('clientId', undefined);
app.addHook('onRequest', async (request) => {
  request.clientId = request.headers[CLIENT_ID_HEADER] as string | undefined;
});

// Attaches to app.server (the raw Node HTTP server), which exists before app.listen() — routes
// registered below can broadcast realtime events via app.broadcaster.
const io = new SocketIOServer(app.server, {
  cors: isProduction ? undefined : { origin: 'http://localhost:5173' },
});
app.decorate('broadcaster', registerSocketHandlers(io, app.log));

// Render's health check polls this to decide whether to route traffic here — a healthz that
// can't see the database is worse than useless (tasks/14): the Render Postgres is on the free
// tier and expires 30 days after creation (see Environment in PROGRESS.md), and without this
// check the app would report healthy right up until every request started 500ing.
app.get('/healthz', async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch (error) {
    app.log.error(error, 'healthz: database unreachable');
    return reply
      .code(503)
      .send({ error: { code: 'service_unavailable', message: 'Database unreachable' } });
  }
});

await app.register(listsRoutes);
await app.register(todosRoutes);
await app.register(subtasksRoutes);

if (isProduction) {
  await app.register(fastifyStatic, {
    root: webDist,
    wildcard: false,
  });
}

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
