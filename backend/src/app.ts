import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import {
  DemoAnalysisProvider,
  GoogleWebRiskProvider,
  OpenAIAnalysisProvider,
} from '@scamtrap/analysis-core';
import Fastify from 'fastify';
import { env } from './config/env.js';
import { InMemoryCaseRepository } from './modules/cases/case.repository.js';
import { registerCaseRoutes } from './modules/cases/case.routes.js';
import { CaseService } from './modules/cases/case.service.js';
import { LiveSessionManager } from './modules/sessions/live-session-manager.js';
import { DemoScribeProvider } from './modules/sessions/pipeline/demo-scribe-adapter.js';
import { ElevenLabsScribeProvider } from './modules/sessions/pipeline/scribe-client.js';
import type { ScribeProvider } from './modules/sessions/pipeline/types.js';
import { registerSessionRoutes } from './modules/sessions/session.routes.js';
import { SessionService } from './modules/sessions/session.service.js';

export const buildApp = async (options?: { scribeProvider?: ScribeProvider }) => {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : [env.WEB_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  });
  await app.register(websocket);

  app.get('/health', async () => ({
    status: 'ok',
    mode: env.USE_DEMO_ADAPTERS ? 'demo' : 'provider',
    timestamp: new Date().toISOString(),
  }));

  const analysisProvider = env.USE_DEMO_ADAPTERS
    ? new DemoAnalysisProvider()
    : new OpenAIAnalysisProvider({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        threatIntelProvider: new GoogleWebRiskProvider(
          env.GOOGLE_WEB_RISK_API_KEY,
        ),
      });

  const caseService = new CaseService(
    new InMemoryCaseRepository(),
    analysisProvider,
  );
  const sessionService = new SessionService();

  const scribeProvider: ScribeProvider =
    options?.scribeProvider ??
    (!env.USE_DEMO_ADAPTERS && env.ELEVENLABS_API_KEY
      ? new ElevenLabsScribeProvider(env.ELEVENLABS_API_KEY)
      : new DemoScribeProvider(true));

  const liveSessionManager = new LiveSessionManager(
    scribeProvider,
    analysisProvider,
    sessionService,
  );

  await registerCaseRoutes(app, caseService);
  await registerSessionRoutes(app, sessionService, liveSessionManager);

  return app;
};
