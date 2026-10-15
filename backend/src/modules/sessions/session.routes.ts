import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendForbidden, sendNotFound, sendValidationError } from '../../lib/http.js';
import type { LiveSessionManager } from './live-session-manager.js';
import type { SessionRecord, SessionService } from './session.service.js';

const createSchema = z.object({ caseId: z.string().uuid() });
const paramsSchema = z.object({ id: z.string().uuid() });
const simulateSchema = z.object({
  speaker: z.enum(['user', 'caller']),
  text: z.string().min(1),
});
const getOwnerId = (request: FastifyRequest) => String(request.headers['x-user-id'] ?? 'demo-user');

export const registerSessionRoutes = async (
  app: FastifyInstance,
  service: SessionService,
  liveManager?: LiveSessionManager,
) => {
  app.post('/sessions', async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);
    const session = service.create(getOwnerId(request), body.data.caseId);
    if (liveManager) {
      liveManager.getOrCreatePipeline(session.id, session.caseId);
    }
    return reply.status(201).send(session);
  });

  app.get('/sessions/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const session = service.get(params.data.id);
    if (!session) return sendNotFound(reply, 'Session');
    return reply.send(session);
  });

  app.get('/sessions/:id/snapshot', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const session = service.get(params.data.id);
    if (!session) return sendNotFound(reply, 'Session');

    const pipeline = liveManager?.getOrCreatePipeline(session.id, session.caseId);
    return reply.send(pipeline?.getSnapshot() ?? {
      sessionId: session.id,
      state: session.state,
      utterances: [],
      latestRisk: null,
    });
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
        const updated = action(session);
        liveManager?.getPipeline(session.id)?.setState(updated.state);
        return reply.send(updated);
      } catch {
        return reply.status(409).send({
          error: {
            code: 'INVALID_SESSION_TRANSITION',
            message: `Cannot perform this action while session is ${session.state}`,
          },
        });
      }
    };

  app.post('/sessions/:id/handoff', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const session = service.get(params.data.id);
    if (!session) return sendNotFound(reply, 'Session');
    if (session.ownerId !== getOwnerId(request)) return sendForbidden(reply);

    try {
      const updated = service.requestHandoff(session);
      const pipeline = liveManager?.getOrCreatePipeline(session.id, session.caseId);
      pipeline?.setState(updated.state);
      void pipeline?.triggerInitialGreeting();

      return reply.send(updated);

    } catch {
      return reply.status(409).send({
        error: {
          code: 'INVALID_SESSION_TRANSITION',
          message: `Cannot perform this action while session is ${session.state}`,
        },
      });
    }
  });

  app.post('/sessions/:id/resume-human', transition((session) => service.resumeHuman(session)));
  app.post('/sessions/:id/end', transition((session) => service.end(session)));

  if (liveManager) {
    app.get('/sessions/:id/ws', { websocket: true }, (socket, request) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        socket.close(1008, 'Invalid session ID');
        return;
      }

      const session = service.get(params.data.id);
      if (!session) {
        socket.close(1008, 'Session not found');
        return;
      }

      liveManager.handleClientConnection(session.id, socket);
    });

    app.post('/sessions/:id/simulate-speech', async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return sendValidationError(reply, params.error);
      const body = simulateSchema.safeParse(request.body);
      if (!body.success) return sendValidationError(reply, body.error);

      const session = service.get(params.data.id);
      if (!session) return sendNotFound(reply, 'Session');

      const pipeline = liveManager.getOrCreatePipeline(session.id, session.caseId);
      // Trigger live progressive speech streaming
      void pipeline.simulateSpeech(body.data.speaker, body.data.text);

      return reply.send({ status: 'ok', simulated: body.data });
    });

    app.post('/sessions/speak-preview', async (request, reply) => {
      const body = z.object({ text: z.string().min(1) }).safeParse(request.body);
      if (!body.success) return sendValidationError(reply, body.error);

      if (liveManager?.agentClient) {
        const dummyContext = {
          sessionId: 'preview',
          channel: 'voice' as const,
          threatScore: 90,
          callerNumber: '+66812345678',
          detectedTactics: ['urgency' as const],
          extractedEntities: [],
          startedAt: new Date().toISOString(),
        };
        const res = await liveManager.agentClient.generateReply(dummyContext, body.data.text);
        return reply.send({
          text: res.text,
          audioBase64: res.audioBase64,
        });
      }
      return reply.send({ text: body.data.text, audioBase64: '' });
    });
  }
};


