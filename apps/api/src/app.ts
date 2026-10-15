import cors from '@fastify/cors';
import { DemoAnalysisProvider } from '@scamtrap/analysis-core';
import Fastify from 'fastify';
import { env } from './config/env.js';
import { InMemoryCaseRepository } from './modules/cases/case.repository.js';
import { registerCaseRoutes } from './modules/cases/case.routes.js';
import { CaseService } from './modules/cases/case.service.js';
import { registerSessionRoutes } from './modules/sessions/session.routes.js';
import { SessionService } from './modules/sessions/session.service.js';

export const buildApp = async () => {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  await app.register(cors, { origin: env.WEB_ORIGIN });

  app.get('/health', async () => ({
    status: 'ok',
    mode: env.USE_DEMO_ADAPTERS ? 'demo' : 'provider',
    timestamp: new Date().toISOString(),
  }));

  const caseService = new CaseService(
    new InMemoryCaseRepository(),
    new DemoAnalysisProvider(),
  );
  const sessionService = new SessionService();

  await registerCaseRoutes(app, caseService);
  await registerSessionRoutes(app, sessionService);

  return app;
};
