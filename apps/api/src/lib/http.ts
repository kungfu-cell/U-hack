import type { FastifyReply } from 'fastify';
import type { ZodError } from 'zod';

export const sendValidationError = (reply: FastifyReply, error: ZodError) =>
  reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: error.issues.map((issue) => issue.message).join(', '),
    },
  });

export const sendNotFound = (reply: FastifyReply, resource = 'Resource') =>
  reply.status(404).send({
    error: { code: 'NOT_FOUND', message: `${resource} not found` },
  });

export const sendForbidden = (reply: FastifyReply) =>
  reply.status(403).send({
    error: { code: 'FORBIDDEN', message: 'You do not have access to this resource' },
  });
