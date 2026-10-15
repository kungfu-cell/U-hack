import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendForbidden, sendNotFound, sendValidationError } from '../../lib/http.js';
import type { SessionRecord, SessionService } from './session.service.js';

const createSchema = z.object({ caseId: z.string().uuid() });
const paramsSchema = z.object({ id: z.string().uuid() });
const getOwnerId = (request: FastifyRequest) => String(request.headers['x-user-id'] ?? 'demo-user');

export const registerSessionRoutes = async (app: FastifyInstance, service: SessionService) => {
  app.post('/sessions', async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);
    return reply.status(201).send(service.create(getOwnerId(request), body.data.caseId));
  });

  const transition =
    (action: (session: SessionRecord) => SessionRecord) =>
    async (request: FastifyRequest, reply: Parameters<typeof sendNotFound>[0]) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return sendValidationError(reply, params.error);
      const session = service.get(params.data.id);
      if (!session) return sendNotFound(reply, 'Session');
      if (session.ownerId !== getOwnerId(request)) return sendForbidden(reply);
      try {
        return reply.send(action(session));
      } catch {
        return reply.status(409).send({
          error: {
            code: 'INVALID_SESSION_TRANSITION',
            message: `Cannot perform this action while session is ${session.state}`,
          },
        });
      }
    };

  app.post('/sessions/:id/handoff', transition((session) => service.requestHandoff(session)));
  app.post('/sessions/:id/resume-human', transition((session) => service.resumeHuman(session)));
  app.post('/sessions/:id/end', transition((session) => service.end(session)));
};
