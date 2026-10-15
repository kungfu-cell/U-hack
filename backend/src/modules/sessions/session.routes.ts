import type { FastifyInstance, FastifyRequest } from 'fastify';
import { correctUtteranceRequestSchema } from '@scamtrap/contracts';
import type { TranscriptRepository } from '@scamtrap/database';
import { z } from 'zod';
import { sendForbidden, sendNotFound, sendValidationError } from '../../lib/http.js';
import type { LiveSessionManager } from './live-session-manager.js';
import type { SessionRecord, SessionService } from './session.service.js';
import type { CaseService } from '../cases/case.service.js';
import { ContextBuilder } from './handoff/context-builder.js';
import { env } from '../../config/env.js';

const createSchema = z.object({ caseId: z.string().uuid() });
const joinSchema = z.object({ joinCode: z.string().min(6).max(12) });
const paramsSchema = z.object({ id: z.string().uuid() });
const utteranceParamsSchema = z.object({ id: z.string().uuid(), utteranceId: z.string() });
const wsQuerySchema = z.object({ token: z.string().uuid() });
const simulateSchema = z.object({
  speaker: z.enum(['user', 'caller']),
  text: z.string().min(1),
});
const scammerSignedUrlQuerySchema = z.object({
  lang: z.string().optional(),
});
const getOwnerId = (request: FastifyRequest) => String(request.headers['x-user-id'] ?? 'demo-user');
const toOwnerSession = (session: SessionRecord) => {
  const { callerToken: _callerToken, ...safeSession } = session;
  return safeSession;
};

export const registerSessionRoutes = async (
  app: FastifyInstance,
  service: SessionService,
  liveManager?: LiveSessionManager,
  caseService?: CaseService,
  transcriptRepository?: TranscriptRepository,
) => {
  const previewRequests = new Map<string, number[]>();
  app.post('/sessions', async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);
    if (caseService) {
      const caseRecord = await caseService.get(body.data.caseId);
      if (!caseRecord) return sendNotFound(reply, 'Case');
      if (caseRecord.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    }
    const session = service.create(getOwnerId(request), body.data.caseId);
    await transcriptRepository?.createSession({
      id: session.id,
      caseId: session.caseId,
      state: 'HUMAN_ACTIVE',
      startedAt: new Date(session.createdAt),
    });
    if (liveManager) {
      liveManager.getOrCreatePipeline(session.id, session.caseId);
    }
    return reply.status(201).send(toOwnerSession(session));
  });

  app.post('/sessions/:id/join', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = joinSchema.safeParse(request.body);
    if (!params.success) return sendValidationError(reply, params.error);
    if (!body.success) return sendValidationError(reply, body.error);
    const participant = service.join(params.data.id, body.data.joinCode);
    if (!participant) return sendForbidden(reply);
    return reply.send(participant);
  });

  app.get('/sessions/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const session = service.get(params.data.id);
    if (!session) return sendNotFound(reply, 'Session');
    if (session.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    return reply.send(toOwnerSession(session));
  });

  app.get('/sessions/:id/snapshot', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const session = service.get(params.data.id);
    if (!session) return sendNotFound(reply, 'Session');
    if (session.ownerId !== getOwnerId(request)) return sendForbidden(reply);

    const pipeline = liveManager?.getOrCreatePipeline(session.id, session.caseId);
    return reply.send(pipeline?.getSnapshot() ?? {
      sessionId: session.id,
      state: session.state,
      utterances: [],
      latestRisk: null,
    });
  });

  app.get('/sessions/:id/utterances', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const session = service.get(params.data.id);
    if (!session) return sendNotFound(reply, 'Session');
    if (session.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    if (!transcriptRepository) {
      return liveManager?.getPipeline(session.id)?.getSnapshot().utterances ?? [];
    }
    const utterances = await transcriptRepository.getUtterances(session.id);
    return utterances.map((utterance) => ({
      id: utterance.id,
      sessionId: utterance.sessionId,
      speaker: utterance.speaker,
      text: utterance.text,
      transcriptState: utterance.transcriptState.toLowerCase(),
      startedAtMs: utterance.startedAtMs,
      endedAtMs: utterance.endedAtMs,
      version: utterance.version,
      createdAt: utterance.createdAt.toISOString(),
    }));
  });

  app.patch('/sessions/:id/utterances/:utteranceId', async (request, reply) => {
    const params = utteranceParamsSchema.safeParse(request.params);
    const body = correctUtteranceRequestSchema.safeParse(request.body);
    if (!params.success) return sendValidationError(reply, params.error);
    if (!body.success) return sendValidationError(reply, body.error);
    const session = service.get(params.data.id);
    if (!session) return sendNotFound(reply, 'Session');
    if (session.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    if (!transcriptRepository) {
      return reply.status(503).send({
        error: { code: 'PERSISTENCE_REQUIRED', message: 'PostgreSQL persistence is required' },
      });
    }
    const existing = (await transcriptRepository.getUtterances(session.id)).find(
      (item) => item.id === params.data.utteranceId,
    );
    if (!existing) return sendNotFound(reply, 'Utterance');
    const corrected = await transcriptRepository.correctUtterance(existing.id, body.data.text);
    return {
      id: corrected.id,
      sessionId: corrected.sessionId,
      speaker: corrected.speaker,
      text: corrected.text,
      transcriptState: corrected.transcriptState.toLowerCase(),
      startedAtMs: corrected.startedAtMs,
      endedAtMs: corrected.endedAtMs,
      version: corrected.version,
      createdAt: corrected.createdAt.toISOString(),
    };
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
      if (pipeline) {
        void pipeline.startHandoff().then((activated) => {
          const current = service.get(session.id);
          if (!current || current.state !== 'preparing_ai') return;
          if (activated) service.activateAi(current);
          else service.pauseSafe(current);
        });
      }

      return reply.status(202).send(toOwnerSession(updated));

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
  app.post('/sessions/:id/end', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const session = service.get(params.data.id);
    if (!session) return sendNotFound(reply, 'Session');
    if (session.ownerId !== getOwnerId(request)) return sendForbidden(reply);

    const pipeline = liveManager?.getPipeline(session.id);
    const snapshot = pipeline?.getSnapshot();
    if (caseService && snapshot && snapshot.utterances.length > 0) {
      const caseRecord = await caseService.get(session.caseId);
      if (caseRecord) {
        const transcript = snapshot.utterances
          .filter((utterance) => utterance.transcriptState === 'committed')
          .map((utterance) => `[${utterance.speaker}] ${utterance.text}`)
          .join('\n');
        if (transcript) {
          const updated = await caseService.addInput(caseRecord, {
            type: 'text',
            content: transcript.slice(0, 50_000),
            source: `live_session:${session.id}`,
          });
          await caseService.analyze(updated);
        }
      }
    }

    const ended = service.end(session);
    pipeline?.setState(ended.state);
    return reply.send(toOwnerSession(ended));
  });

  if (liveManager) {
    app.get('/sessions/:id/ws', { websocket: true, logLevel: 'silent' }, (socket, request) => {
      const params = paramsSchema.safeParse(request.params);
      const query = wsQuerySchema.safeParse(request.query);
      if (!params.success) {
        socket.close(1008, 'Invalid session ID');
        return;
      }
      if (!query.success) {
        socket.close(1008, 'Missing participant token');
        return;
      }

      const session = service.get(params.data.id);
      if (!session) {
        socket.close(1008, 'Session not found');
        return;
      }

      const role = service.authorizeParticipant(session, query.data.token);
      if (!role) {
        socket.close(1008, 'Invalid participant token');
        return;
      }

      liveManager.handleClientConnection(session.id, socket, role);
    });

    app.post('/sessions/:id/simulate-speech', async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return sendValidationError(reply, params.error);
      const body = simulateSchema.safeParse(request.body);
      if (!body.success) return sendValidationError(reply, body.error);

      const session = service.get(params.data.id);
      if (!session) return sendNotFound(reply, 'Session');
      if (session.ownerId !== getOwnerId(request)) return sendForbidden(reply);

      const pipeline = liveManager.getOrCreatePipeline(session.id, session.caseId);
      // Trigger live progressive speech streaming
      void pipeline.simulateSpeech(body.data.speaker, body.data.text);

      return reply.send({ status: 'ok', simulated: body.data });
    });

    app.get('/sessions/:id/scammer-signed-url', async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return sendValidationError(reply, params.error);
      const session = service.get(params.data.id);
      if (!session) return sendNotFound(reply, 'Session');

      const apiKey = env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({
          error: { code: 'ELEVENLABS_NOT_CONFIGURED', message: 'ElevenLabs API key is not configured' },
        });
      }

      const query = scammerSignedUrlQuerySchema.safeParse(request.query);
      const isEnglish = (query.success && query.data.lang?.toLowerCase().startsWith('en')) ?? false;
      const agentId = isEnglish
        ? (env.ELEVENLABS_SCAMMER_EN_AGENT_ID || 'agent_1701m50fbxptfb19rdyds35gqstc')
        : (env.ELEVENLABS_SCAMMER_AGENT_ID || 'agent_8401m506b9p0fnd88k4623jvfrqh');

      try {
        const upstream = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
          {
            headers: { 'xi-api-key': apiKey },
          },
        );

        if (!upstream.ok) {
          const detail = await upstream.text();
          return reply.status(upstream.status).send({
            error: { code: 'ELEVENLABS_UPSTREAM_ERROR', message: detail },
          });
        }

        const data = (await upstream.json()) as { signed_url: string };
        return reply.send({ signedUrl: data.signed_url, agentId, lang: isEnglish ? 'en' : 'th' });
      } catch (err) {
        return reply.status(500).send({
          error: {
            code: 'ELEVENLABS_FAILED',
            message: err instanceof Error ? err.message : 'Failed to obtain signed URL',
          },
        });
      }
    });

    app.post('/sessions/speak-preview', async (request, reply) => {
      const requester = request.headers['x-user-id'];
      if (typeof requester !== 'string' || !requester.trim()) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'x-user-id is required for the demo preview' },
        });
      }
      const now = Date.now();
      const recent = (previewRequests.get(requester) ?? []).filter(
        (timestamp) => now - timestamp < 60_000,
      );
      if (recent.length >= 60) {
        return reply.status(429).send({
          error: { code: 'RATE_LIMITED', message: 'Voice preview limit reached; retry in one minute' },
        });
      }
      recent.push(now);
      previewRequests.set(requester, recent);

      const body = z
        .object({
          text: z.string().min(1),
          directText: z.boolean().optional(),
          voiceRole: z.enum(['scammer', 'decoy']).optional(),
          voiceId: z.string().optional(),
        })
        .safeParse(request.body);
      if (!body.success) return sendValidationError(reply, body.error);

      // Scammer voice: George (JBFqnCBsd6RMkjVDRZzb - deep, stern, authoritative interrogator)
      // Decoy voice: Eric (cjVigY5qzO86Huf0OWal - polite, reassuring assistant)
      const targetVoice =
        body.data.voiceId ??
        (body.data.voiceRole === 'scammer' ? 'JBFqnCBsd6RMkjVDRZzb' : 'cjVigY5qzO86Huf0OWal');

      if (liveManager?.agentClient) {
        if (body.data.directText && 'speakText' in liveManager.agentClient) {
          const directSpeaker = liveManager.agentClient as {
            speakText: (t: string, v?: string) => Promise<string>;
          };
          const audio = await directSpeaker.speakText(body.data.text, targetVoice);
          return reply.send({
            text: body.data.text,
            audioBase64: audio,
            voiceRole: body.data.voiceRole ?? 'decoy',
          });
        }

        const dummyContext = ContextBuilder.build('preview', []);
        const res = await liveManager.agentClient.generateReply(dummyContext, body.data.text);
        return reply.send({
          text: res.text,
          audioBase64: res.audioBase64,
          voiceRole: body.data.voiceRole ?? 'decoy',
        });
      }
      return reply.send({ text: body.data.text, audioBase64: '', voiceRole: body.data.voiceRole ?? 'decoy' });
    });
  }
};


