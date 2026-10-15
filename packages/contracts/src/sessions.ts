import { z } from 'zod';

export const handoffStateSchema = z.enum([
  'human_active',
  'preparing_ai',
  'ai_active',
  'stopping_ai',
  'waiting_for_user',
  'ended',
]);
export type HandoffState = z.infer<typeof handoffStateSchema>;

export const speakerSchema = z.enum(['user', 'caller', 'ai', 'system']);
export type Speaker = z.infer<typeof speakerSchema>;

export const utteranceSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  speaker: speakerSchema,
  text: z.string(),
  transcriptState: z.enum(['partial', 'committed', 'corrected']),
  startedAtMs: z.number().int().nonnegative(),
  endedAtMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type Utterance = z.infer<typeof utteranceSchema>;

export const sessionEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.state_changed'),
    sessionId: z.string(),
    state: handoffStateSchema,
    occurredAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('transcript.partial'),
    sessionId: z.string(),
    utterance: utteranceSchema,
    occurredAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('transcript.committed'),
    sessionId: z.string(),
    utterance: utteranceSchema,
    occurredAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('risk.updated'),
    sessionId: z.string(),
    score: z.number().int().min(0).max(100),
    reasons: z.array(z.string()),
    occurredAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('service.degraded'),
    sessionId: z.string(),
    service: z.string(),
    message: z.string(),
    occurredAt: z.string().datetime(),
  }),
]);
export type SessionEvent = z.infer<typeof sessionEventSchema>;
