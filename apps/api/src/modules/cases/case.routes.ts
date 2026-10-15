import {
  addCaseInputRequestSchema,
  createCaseRequestSchema,
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
const getOwnerId = (request: FastifyRequest) => String(request.headers['x-user-id'] ?? 'demo-user');

export const registerCaseRoutes = async (app: FastifyInstance, service: CaseService) => {
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
};
