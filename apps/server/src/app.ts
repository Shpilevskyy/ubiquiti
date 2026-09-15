import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { CLIENT_ID_HEADER } from '@ubiquiti-todo/shared';
import { listsRoutes } from './routes/lists.js';
import { todosRoutes } from './routes/todos.js';
import { subtasksRoutes } from './routes/subtasks.js';
import { registerErrorHandling } from './errorHandler.js';
import { prisma } from './prisma.js';
import type { SocketBroadcaster } from './socket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');

// Side-effect-free: no listen(), no signal handlers. Lets tasks/23's route/integration tests
// build a real app instance with `app.inject()` instead of importing index.ts, which starts a
// real server on module load (tasks/23-testing.md, step 2).
//
// The broadcaster is a parameter rather than being constructed here so route tests can pass a spy
// object and assert "this PATCH broadcast TODO_UPDATED to list:<id> excluding <clientId>" with no
// sockets or ports involved. index.ts still builds and injects the real Socket.IO-backed one.
export async function buildApp(options: {
  broadcaster: SocketBroadcaster;
  isProduction: boolean;
}): Promise<FastifyInstance> {
  const { broadcaster, isProduction } = options;

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

  app.decorate('broadcaster', broadcaster);

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

  return app;
}
