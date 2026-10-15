import { z } from 'zod';

export const handoffStateSchema = z.enum([
  'ready',
  'human_active',
  'preparing_ai',
  'ai_active',
  'stopping_ai',
  'paused_safe',
  'waiting_for_user',
  'ended',
  'failed',
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

export const audioChunkMessageSchema = z.object({
  type: z.literal('audio.chunk'),
  sessionId: z.string(),
  speaker: z.enum(['user', 'caller']),
  audioBase64: z.string(),
  sampleRate: z.number().int().default(16000),
  timestampMs: z.number().int().nonnegative(),
});
export type AudioChunkMessage = z.infer<typeof audioChunkMessageSchema>;

export const sessionSyncRequestSchema = z.object({
  type: z.literal('session.sync'),
  sessionId: z.string(),
  lastUtteranceId: z.string().optional(),
});
export type SessionSyncRequest = z.infer<typeof sessionSyncRequestSchema>;

export const pingMessageSchema = z.object({
  type: z.literal('ping'),
  timestamp: z.number(),
});
export type PingMessage = z.infer<typeof pingMessageSchema>;

export const clientSpeechMessageSchema = z.object({
  type: z.literal('transcript.client_speech'),
  sessionId: z.string(),
  speaker: z.enum(['user', 'caller']),
  text: z.string(),
  isFinal: z.boolean(),
});
export type ClientSpeechMessage = z.infer<typeof clientSpeechMessageSchema>;

export const clientMessageSchema = z.discriminatedUnion('type', [
  audioChunkMessageSchema,
  sessionSyncRequestSchema,
  pingMessageSchema,
  clientSpeechMessageSchema,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const sessionSnapshotSchema = z.object({
  sessionId: z.string(),
  state: handoffStateSchema,
  utterances: z.array(utteranceSchema),
  latestRisk: z
    .object({
      score: z.number().int().min(0).max(100),
      reasons: z.array(z.string()),
    })
    .nullable(),
});
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;

export const sessionEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.state_changed'),
    sessionId: z.string(),
    state: handoffStateSchema,
    occurredAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('session.sync_response'),
    sessionId: z.string(),
    snapshot: sessionSnapshotSchema,
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
  z.object({
    type: z.literal('agent.audio_chunk'),
    sessionId: z.string(),
    audioBase64: z.string(),
    sampleRate: z.number().int().default(16000),
    occurredAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('agent.interrupted'),
    sessionId: z.string(),
    occurredAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('pong'),
    timestamp: z.number(),
  }),
]);
export type SessionEvent = z.infer<typeof sessionEventSchema>;


