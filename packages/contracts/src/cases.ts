import { z } from 'zod';
import { analysisResultSchema } from './analysis.js';

export const caseInputTypeSchema = z.enum(['text', 'url', 'audio']);
export type CaseInputType = z.infer<typeof caseInputTypeSchema>;

export const caseInputSchema = z.object({
  id: z.string(),
  type: caseInputTypeSchema,
  content: z.string(),
  source: z.string(),
  createdAt: z.string().datetime(),
});
export type CaseInput = z.infer<typeof caseInputSchema>;

export const createCaseRequestSchema = z.object({
  title: z.string().trim().min(1).max(120).default('Untitled case'),
  isDemo: z.boolean().default(true),
});
export type CreateCaseRequest = z.infer<typeof createCaseRequestSchema>;

export const addCaseInputRequestSchema = z.object({
  type: caseInputTypeSchema,
  content: z.string().trim().min(1).max(50_000),
  source: z.string().trim().min(1).max(80).default('user_submission'),
});
export type AddCaseInputRequest = z.infer<typeof addCaseInputRequestSchema>;

export const caseSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'ready', 'analyzing', 'completed', 'failed', 'deleted']),
  isDemo: z.boolean(),
  inputs: z.array(caseInputSchema),
  latestAnalysis: analysisResultSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CaseRecord = z.infer<typeof caseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
