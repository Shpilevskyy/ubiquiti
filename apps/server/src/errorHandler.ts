import type { FastifyError, FastifyInstance } from 'fastify';

export function registerErrorHandling(app: FastifyInstance, options: { isProduction: boolean }) {
  app.setNotFoundHandler((request, reply) => {
    if (options.isProduction && request.raw.method === 'GET' && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      request.log.error(error);
      return reply.code(500).send({ error: { code: 'internal_error', message: 'Something went wrong' } });
    }

    return reply.code(statusCode).send({ error: { code: 'bad_request', message: error.message } });
  });
}
