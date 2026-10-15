import { z } from "zod";

export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const scamTacticSchema = z.enum([
  "authority_impersonation",
  "threat_or_fear",
  "urgency",
  "money_transfer_request",
  "secret_request",
  "isolation",
  "remote_access_request",
  "guaranteed_return",
]);
export type ScamTactic = z.infer<typeof scamTacticSchema>;

export const verificationStatusSchema = z.enum([
  "unverified",
  "corroborated",
  "technically_validated",
  "partner_verified",
  "rejected",
]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const analysisStatusSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "unavailable",
]);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const evidenceSchema = z.object({
  id: z.string(),
  quote: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  tactic: scamTacticSchema,
  explanation: z.string(),
  sourceId: z.string(),
  confidence: z.number().min(0).max(1),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const entityTypeSchema = z.enum([
  "url",
  "phone",
  "bank_account",
  "bank_name",
  "account_holder",
  "line_id",
  "email",
  "money_amount",
  "otp",
  "other",
]);

export const entityMentionSchema = z.object({
  id: z.string(),
  type: entityTypeSchema,
  value: z.string(),
  normalizedValue: z.string(),
  sourceId: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  speaker: z.enum(["user", "caller", "ai", "unknown"]),
  confidence: z.number().min(0).max(1),
  verified: z.boolean(),
});
export type EntityMention = z.infer<typeof entityMentionSchema>;

export const threatCheckSchema = z.object({
  provider: z.string(),
  status: z.enum(["match", "not_found", "unavailable", "not_checked"]),
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
  scoreVersion: z.string(),
  verificationStatus: verificationStatusSchema,
  secretRequestDetected: z.boolean(),
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
