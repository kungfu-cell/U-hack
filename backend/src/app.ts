import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import {
  DemoAnalysisProvider,
  GoogleSafeBrowsingProvider,
  OpenAIAnalysisProvider,
  type AnalysisProvider,
} from '@scamtrap/analysis-core';
import Fastify from 'fastify';
import { database, TranscriptRepository } from '@scamtrap/database';
import { env } from './config/env.js';
import { InMemoryCaseRepository } from './modules/cases/case.repository.js';
import { PrismaCaseRepository } from './modules/cases/prisma-case.repository.js';
import { registerCaseRoutes } from './modules/cases/case.routes.js';
import { CaseService } from './modules/cases/case.service.js';
import { LiveSessionManager } from './modules/sessions/live-session-manager.js';
import type { AgentClient } from './modules/sessions/handoff/types.js';
import { DemoScribeProvider } from './modules/sessions/pipeline/demo-scribe-adapter.js';
import { ElevenLabsScribeProvider } from './modules/sessions/pipeline/scribe-client.js';
import { DemoAgentAdapter, ElevenLabsAgentClient } from './modules/sessions/handoff/agent-client.js';
import type { ScribeProvider } from './modules/sessions/pipeline/types.js';
import { registerSessionRoutes } from './modules/sessions/session.routes.js';
import { SessionService } from './modules/sessions/session.service.js';

export const buildApp = async (options?: {
  scribeProvider?: ScribeProvider;
  persistenceMode?: 'memory' | 'postgres';
  reviewerApiKey?: string;
  analysisProvider?: AnalysisProvider;
  agentClient?: AgentClient;
}) => {
  const persistenceMode = options?.persistenceMode ?? env.PERSISTENCE_MODE;
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : [env.WEB_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  });
  await app.register(websocket);

  app.get('/health', async () => ({
    status: 'ok',
    mode: env.USE_DEMO_ADAPTERS ? 'demo' : 'provider',
    providers: {
      analysis: env.USE_DEMO_ADAPTERS || !env.OPENAI_API_KEY ? 'demo' : 'openai',
      threatIntel:
        env.USE_DEMO_ADAPTERS || !env.GOOGLE_SAFE_BROWSING_API_KEY
          ? 'not_checked'
          : 'google_safe_browsing',
      speechToText:
        env.USE_DEMO_ADAPTERS || !env.ELEVENLABS_API_KEY ? 'demo' : 'elevenlabs_scribe',
      agent:
        env.USE_DEMO_ADAPTERS || !env.ELEVENLABS_API_KEY || !env.ELEVENLABS_AGENT_ID
          ? 'demo'
          : 'elevenlabs_agent',
      persistence: persistenceMode,
    },
    timestamp: new Date().toISOString(),
  }));

  const analysisProvider =
    options?.analysisProvider ?? (!env.USE_DEMO_ADAPTERS && Boolean(env.OPENAI_API_KEY)
      ? new OpenAIAnalysisProvider({
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL,
          ...(env.GOOGLE_SAFE_BROWSING_API_KEY
            ? {
                threatIntelProvider: new GoogleSafeBrowsingProvider(
                  env.GOOGLE_SAFE_BROWSING_API_KEY,
                ),
              }
            : {}),
        })
      : new DemoAnalysisProvider());
  const caseService = new CaseService(
    persistenceMode === 'postgres'
      ? new PrismaCaseRepository(database)
      : new InMemoryCaseRepository(),
    analysisProvider,
    persistenceMode === 'postgres' ? database : undefined,
  );
  const sessionService = new SessionService();
  const transcriptRepository =
    persistenceMode === 'postgres' ? new TranscriptRepository(database) : undefined;

  const scribeProvider: ScribeProvider =
    options?.scribeProvider ??
    (!env.USE_DEMO_ADAPTERS && env.ELEVENLABS_API_KEY
      ? new ElevenLabsScribeProvider(env.ELEVENLABS_API_KEY)
      : new DemoScribeProvider(true));

  const agentClient =
    options?.agentClient ??
    (!env.USE_DEMO_ADAPTERS && env.ELEVENLABS_API_KEY && env.ELEVENLABS_AGENT_ID
      ? new ElevenLabsAgentClient(env.ELEVENLABS_API_KEY, env.ELEVENLABS_AGENT_ID)
      : new DemoAgentAdapter());

  const liveSessionManager = new LiveSessionManager(
    scribeProvider,
    analysisProvider,
    sessionService,
    agentClient,
    transcriptRepository,
  );

  await registerCaseRoutes(app, caseService, options?.reviewerApiKey ?? env.REVIEWER_API_KEY);
  await registerSessionRoutes(
    app,
    sessionService,
    liveSessionManager,
    caseService,
    transcriptRepository,
  );

  return app;
};
