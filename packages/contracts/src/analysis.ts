import { z } from 'zod';

export const riskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const analysisStatusSchema = z.enum([
  'pending',
  'completed',
  'failed',
  'unavailable',
]);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const evidenceSchema = z.object({
  id: z.string(),
  quote: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  tactic: z.string(),
  explanation: z.string(),
  sourceId: z.string(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const entityTypeSchema = z.enum([
  'url',
  'phone',
  'bank_account',
  'line_id',
  'email',
  'otp',
  'other',
]);

export const entityMentionSchema = z.object({
  id: z.string(),
  type: entityTypeSchema,
  value: z.string(),
  normalizedValue: z.string(),
  sourceId: z.string(),
  speaker: z.enum(['user', 'caller', 'ai', 'unknown']),
  confidence: z.number().min(0).max(1),
  verified: z.boolean(),
});
export type EntityMention = z.infer<typeof entityMentionSchema>;

export const threatCheckSchema = z.object({
  provider: z.string(),
  status: z.enum(['match', 'not_found', 'unavailable', 'not_checked']),
  checkedAt: z.string().datetime(),
  indicator: z.string(),
  threatType: z.string().optional(),
  message: z.string().optional(),
  isDemo: z.boolean(),
});
export type ThreatCheck = z.infer<typeof threatCheckSchema>;

export const analysisResultSchema = z.object({
  id: z.string(),
  status: analysisStatusSchema,
  score: z.number().int().min(0).max(100),
  level: riskLevelSchema,
  summary: z.string(),
  recommendation: z.string(),
  evidence: z.array(evidenceSchema),
  entities: z.array(entityMentionSchema),
  threatChecks: z.array(threatCheckSchema),
  modelVersion: z.string(),
  createdAt: z.string().datetime(),
  isDemo: z.boolean(),
  limitations: z.array(z.string()),
});
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
