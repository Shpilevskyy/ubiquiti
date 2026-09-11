import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server as SocketIOServer } from 'socket.io';
import { SOCKET_EVENTS, type HelloResponse } from '@ubiquiti-todo/shared';
import { listsRoutes } from './routes/lists.js';
import { todosRoutes } from './routes/todos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
const isProduction = process.env.NODE_ENV === 'production';

const app = Fastify({ logger: true });

app.get('/healthz', async () => 'ok');

app.get('/api/hello', async (): Promise<HelloResponse> => ({
  message: 'Hello from the server 👋',
  timestamp: new Date().toISOString(),
}));

await app.register(listsRoutes);
await app.register(todosRoutes);

if (isProduction) {
  await app.register(fastifyStatic, {
    root: webDist,
    wildcard: false,
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.raw.method === 'GET' && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
  });
}

const port = Number(process.env.PORT) || 3001;

await app.listen({ port, host: '0.0.0.0' });

const io = new SocketIOServer(app.server, {
  cors: isProduction ? undefined : { origin: 'http://localhost:5173' },
});

io.on('connection', (socket) => {
  app.log.info(`socket connected: ${socket.id}`);
  socket.emit(SOCKET_EVENTS.HELLO, {
    message: 'Hello over WebSocket 👋',
    timestamp: new Date().toISOString(),
  });

  socket.on('disconnect', () => {
    app.log.info(`socket disconnected: ${socket.id}`);
  });
});
