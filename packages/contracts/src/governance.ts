import { z } from 'zod';

export const recordConsentRequestSchema = z.object({
  scope: z.string().min(1).max(100),
  noticeVersion: z.string().min(1).max(50),
});

export const consentSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  subjectId: z.string(),
  scope: z.string(),
  noticeVersion: z.string(),
  grantedAt: z.string().datetime(),
  withdrawnAt: z.string().datetime().nullable(),
});

export const dataWithdrawalRequestSchema = z.object({
  reason: z.string().max(500).optional(),
  maskInputs: z.boolean().default(true),
});

export const reviewIndicatorRequestSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export const reviewIndicatorSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  type: z.string(),
  maskedValue: z.string(),
  status: z.enum(['private', 'pending', 'approved', 'rejected', 'withdrawn']),
  createdAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  withdrawnAt: z.string().datetime().nullable(),
});

export const correctUtteranceRequestSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
});

export type RecordConsentRequest = z.infer<typeof recordConsentRequestSchema>;
export type ConsentRecord = z.infer<typeof consentSchema>;
export type DataWithdrawalRequest = z.infer<typeof dataWithdrawalRequestSchema>;
export type ReviewIndicatorRequest = z.infer<typeof reviewIndicatorRequestSchema>;
export type ReviewIndicator = z.infer<typeof reviewIndicatorSchema>;
