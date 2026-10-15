import {
  addCaseInputRequestSchema,
  dataWithdrawalRequestSchema,
  createShareProposalRequestSchema,
  createCaseRequestSchema,
  recordConsentRequestSchema,
  reviewIndicatorRequestSchema,
} from '@scamtrap/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  sendForbidden,
  sendNotFound,
  sendValidationError,
} from '../../lib/http.js';
import { toCaseRecord } from './case.repository.js';
import type { CaseService } from './case.service.js';

const paramsSchema = z.object({ id: z.string().uuid() });
const consentParamsSchema = z.object({ id: z.string().uuid(), consentId: z.string() });
const indicatorParamsSchema = z.object({ indicatorId: z.string() });
const getOwnerId = (request: FastifyRequest) => String(request.headers['x-user-id'] ?? 'demo-user');

export const registerCaseRoutes = async (
  app: FastifyInstance,
  service: CaseService,
  reviewerApiKey?: string,
) => {
  app.post('/cases', async (request, reply) => {
    const parsed = createCaseRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const record = await service.create(getOwnerId(request), parsed.data);
    return reply.status(201).send(toCaseRecord(record));
  });

  app.get('/cases/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    return toCaseRecord(record);
  });

  app.post('/cases/:id/inputs', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = addCaseInputRequestSchema.safeParse(request.body);
    if (!params.success) return sendValidationError(reply, params.error);
    if (!body.success) return sendValidationError(reply, body.error);

    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);

    const updated = await service.addInput(record, body.data);
    return reply.status(201).send(toCaseRecord(updated));
  });

  app.post('/cases/:id/analyses', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);

    try {
      const updated = await service.analyze(record);
      return reply.status(200).send(toCaseRecord(updated));
    } catch (error) {
      if (error instanceof Error && error.message === 'CASE_HAS_NO_ANALYZABLE_INPUT') {
        return reply.status(409).send({
          error: { code: error.message, message: 'Add text or URL input before analysis' },
        });
      }
      throw error;
    }
  });

  app.get('/cases/:id/report', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    try {
      return reply.send(await service.getOrCreateReport(record));
    } catch {
      return reply.status(409).send({
        error: { code: 'CASE_HAS_NO_ANALYSIS', message: 'Analyze the case before generating a report' },
      });
    }
  });

  app.post('/cases/:id/report', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    try {
      return reply.status(201).send(await service.generateReport(record));
    } catch {
      return reply.status(409).send({
        error: { code: 'CASE_HAS_NO_ANALYSIS', message: 'Analyze the case before generating a report' },
      });
    }
  });

  app.post('/cases/:id/share-proposals', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = createShareProposalRequestSchema.safeParse(request.body);
    if (!params.success) return sendValidationError(reply, params.error);
    if (!body.success) return sendValidationError(reply, body.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    try {
      return reply.status(201).send(await service.proposeShare(record, body.data.indicatorIds));
    } catch {
      return reply.status(400).send({
        error: { code: 'INVALID_SHARE_INDICATOR', message: 'Select indicators from this report only' },
      });
    }
  });

  app.post('/cases/:id/consents', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = recordConsentRequestSchema.safeParse(request.body);
    if (!params.success) return sendValidationError(reply, params.error);
    if (!body.success) return sendValidationError(reply, body.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    try {
      return reply.status(201).send(
        await service.recordConsent(record, body.data.scope, body.data.noticeVersion),
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'PERSISTENCE_REQUIRED') {
        return reply.status(503).send({ error: { code: error.message, message: 'PostgreSQL persistence is required' } });
      }
      throw error;
    }
  });

  app.get('/cases/:id/consents', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    return service.listConsents(record);
  });

  app.delete('/cases/:id/consents/:consentId', async (request, reply) => {
    const params = consentParamsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    try {
      return await service.withdrawConsent(record, params.data.consentId);
    } catch (error) {
      if (error instanceof Error && error.message === 'CONSENT_NOT_FOUND') {
        return sendNotFound(reply, 'Consent');
      }
      throw error;
    }
  });

  app.get('/cases/:id/correlations', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    return service.correlate(record);
  });

  app.get('/cases/:id/audit', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    return service.listAudit(record);
  });

  app.post('/cases/:id/withdrawal', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = dataWithdrawalRequestSchema.safeParse(request.body ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    if (!body.success) return sendValidationError(reply, body.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    const result = await service.delete(
      record,
      getOwnerId(request),
      body.data.reason,
      body.data.maskInputs,
    );
    return reply.send(result);
  });

  const requireReviewer = (request: FastifyRequest, reply: Parameters<typeof sendForbidden>[0]) => {
    if (!reviewerApiKey) {
      reply.status(503).send({
        error: { code: 'REVIEWER_API_DISABLED', message: 'Configure REVIEWER_API_KEY to enable reviewer APIs' },
      });
      return false;
    }
    if (request.headers['x-reviewer-key'] !== reviewerApiKey) {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid reviewer key' } });
      return false;
    }
    return true;
  };

  app.get('/review/indicators', async (request, reply) => {
    if (!requireReviewer(request, reply)) return;
    return service.listReviewQueue();
  });

  app.patch('/review/indicators/:indicatorId', async (request, reply) => {
    if (!requireReviewer(request, reply)) return;
    const params = indicatorParamsSchema.safeParse(request.params);
    const body = reviewIndicatorRequestSchema.safeParse(request.body);
    if (!params.success) return sendValidationError(reply, params.error);
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      return await service.reviewIndicator(
        params.data.indicatorId,
        body.data.status,
        String(request.headers['x-reviewer-id'] ?? 'reviewer'),
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'INDICATOR_NOT_FOUND') {
        return sendNotFound(reply, 'Indicator');
      }
      throw error;
    }
  });

  app.delete('/cases/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const record = await service.get(params.data.id);
    if (!record) return sendNotFound(reply, 'Case');
    if (record.ownerId !== getOwnerId(request)) return sendForbidden(reply);
    await service.delete(record, getOwnerId(request));
    return reply.status(204).send();
  });
};
