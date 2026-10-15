import { z } from 'zod';
import { evidenceSchema, entityMentionSchema, threatCheckSchema } from './analysis.js';
import { caseInputSchema } from './cases.js';

export const incidentReportSchema = z.object({
  caseId: z.string(),
  version: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  isDemo: z.boolean(),
  summary: z.string(),
  recommendation: z.string(),
  inputs: z.array(caseInputSchema),
  evidence: z.array(evidenceSchema),
  entities: z.array(entityMentionSchema),
  threatChecks: z.array(threatCheckSchema),
  limitations: z.array(z.string()),
});
export type IncidentReport = z.infer<typeof incidentReportSchema>;

export const createShareProposalRequestSchema = z.object({
  indicatorIds: z.array(z.string()).min(1),
  consentConfirmed: z.literal(true),
});

export const shareProposalSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  indicatorIds: z.array(z.string()),
  status: z.enum(['pending', 'approved', 'rejected', 'withdrawn']),
  isDemo: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ShareProposal = z.infer<typeof shareProposalSchema>;
