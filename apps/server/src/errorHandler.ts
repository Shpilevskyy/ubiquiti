import type { FastifyError, FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';

// Every non-5xx used to map to this one code regardless of actual status (e.g. a 413 read as
// "bad_request"), which was wrong — see tasks/09. Extend as new statuses start reaching this
// handler; unlisted 4xx codes fall back to 'bad_request' below.
const STATUS_TO_CODE: Record<number, string> = {
  400: 'invalid_body',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'too_many_requests',
};

export function registerErrorHandling(app: FastifyInstance, options: { isProduction: boolean }) {
  app.setNotFoundHandler((request, reply) => {
    if (options.isProduction && request.raw.method === 'GET' && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // A row disappearing between a scoped read and its write — read-committed isolation doesn't
    // serialize across a transaction's own statements, so tasks/04's TOCTOU fix narrows but
    // doesn't eliminate the race — is the one Prisma error every mutating route can throw.
    // Centralized here instead of a near-identical try/catch in every route handler (tasks/09).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
    }

    // The create routes (tasks/19) upsert directly on a client-generated id instead of checking
    // the parent exists first — a missing parent (deleted list/todo) surfaces as a foreign-key
    // violation on the insert rather than a row that fails to be found beforehand.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
    }

    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      request.log.error(error);
      return reply
        .code(500)
        .send({ error: { code: 'internal_error', message: 'Something went wrong' } });
    }

    return reply.code(statusCode).send({
      error: { code: STATUS_TO_CODE[statusCode] ?? 'bad_request', message: error.message },
    });
  });
}
