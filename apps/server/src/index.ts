import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { Server as SocketIOServer } from 'socket.io';
import { CLIENT_ID_HEADER, type HelloResponse } from '@ubiquiti-todo/shared';
import { listsRoutes } from './routes/lists.js';
import { todosRoutes } from './routes/todos.js';
import { subtasksRoutes } from './routes/subtasks.js';
import { registerErrorHandling } from './errorHandler.js';
import { registerSocketHandlers } from './socket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
const isProduction = process.env.NODE_ENV === 'production';

const app = Fastify({ logger: true });

// Must run before any routes are registered: Fastify bakes the current error/not-found
// handlers into each route's context at registration time, so routes added earlier would
// otherwise keep the default handlers instead of ours.
registerErrorHandling(app, { isProduction });

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

app.get('/healthz', async () => 'ok');

app.get('/api/hello', async (): Promise<HelloResponse> => ({
  message: 'Hello from the server 👋',
  timestamp: new Date().toISOString(),
}));

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
