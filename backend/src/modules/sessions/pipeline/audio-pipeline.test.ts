import { describe, expect, it, vi } from 'vitest';
import { DemoAnalysisProvider } from '@scamtrap/analysis-core';
import type { SessionEvent, Speaker } from '@scamtrap/contracts';
import { AudioPipeline } from './audio-pipeline.js';
import type { ScribeCallbacks, ScribeProvider, ScribeSession } from './types.js';

class MockScribeSession implements ScribeSession {
  constructor(
    readonly speaker: Speaker,
    readonly callbacks: ScribeCallbacks,
  ) {}

  sendAudioChunk(_chunk: string): void {}
  commit(): void {}
  close(): void {
    this.callbacks.onClose?.();
  }

  // Helper for test to trigger events
  emitPartial(text: string) {
    this.callbacks.onPartial(text);
  }

  emitCommitted(text: string) {
    this.callbacks.onCommitted(text);
  }

  emitError(err: Error) {
    this.callbacks.onError(err);
  }
}

class MockScribeProvider implements ScribeProvider {
  readonly name = 'mock-scribe';
  readonly sessions: MockScribeSession[] = [];
  shouldFail = false;

  async createSession(speaker: Speaker, callbacks: ScribeCallbacks): Promise<ScribeSession> {
    if (this.shouldFail) {
      throw new Error('Provider connection failed');
    }
    const session = new MockScribeSession(speaker, callbacks);
    this.sessions.push(session);
    return session;
  }
}

describe('AudioPipeline', () => {
  it('manages partial and committed transcripts, only analyzing on committed caller utterances', async () => {
    const events: SessionEvent[] = [];
    const analysisProvider = new DemoAnalysisProvider();
    const analyzeSpy = vi.spyOn(analysisProvider, 'analyzeText');
    const scribeProvider = new MockScribeProvider();

    const pipeline = new AudioPipeline({
      sessionId: 'session-123',
      caseId: 'case-123',
      scribeProvider,
      analysisProvider,
      onEvent: (event) => events.push(event),
    });

    // Ingest audio chunk for caller to establish session
    await pipeline.ingestAudioChunk({
      speaker: 'caller',
      audioBase64: 'AAAA',
      timestampMs: 1000,
    });

    expect(scribeProvider.sessions).toHaveLength(1);
    const callerSession = scribeProvider.sessions[0]!;
    expect(callerSession.speaker).toBe('caller');

    // 1. Partial transcript should emit transcript.partial but NOT trigger analysis
    callerSession.emitPartial('สวัสดีครับ ผมเป็น');
    expect(events.some((e) => e.type === 'transcript.partial')).toBe(true);
    expect(analyzeSpy).not.toHaveBeenCalled();

    // 2. Committed transcript for caller SHOULD trigger analysis and emit risk.updated
    callerSession.emitCommitted('ผมเป็นเจ้าหน้าที่ตำรวจ ให้โอนเงินมาตรวจสอบทันทีและห้ามบอกใคร');
    // Wait microtask for async analysis
    await new Promise((r) => setTimeout(r, 50));

    expect(analyzeSpy).toHaveBeenCalledTimes(1);
    const riskEvent = events.find((e) => e.type === 'risk.updated');
    expect(riskEvent).toBeDefined();
    if (riskEvent && riskEvent.type === 'risk.updated') {
      expect(riskEvent.score).toBeGreaterThanOrEqual(70);
      expect(riskEvent.reasons.length).toBeGreaterThan(0);
    }

    // 3. Ingest chunk for user
    await pipeline.ingestAudioChunk({
      speaker: 'user',
      audioBase64: 'BBBB',
      timestampMs: 2000,
    });

    expect(scribeProvider.sessions).toHaveLength(2);
    const userSession = scribeProvider.sessions[1]!;
    expect(userSession.speaker).toBe('user');

    analyzeSpy.mockClear();

    // User speaks: "เดี๋ยวฉันไปแจ้งความที่สถานีตำรวจเองค่ะ"
    // User mentioning police should NOT be analyzed as a caller scam threat
    userSession.emitCommitted('เดี๋ยวฉันไปแจ้งความที่สถานีตำรวจเองค่ะ');
    await new Promise((r) => setTimeout(r, 50));

    expect(analyzeSpy).not.toHaveBeenCalled();

    // Verify snapshot reflects state
    const snapshot = pipeline.getSnapshot();
    expect(snapshot.sessionId).toBe('session-123');
    expect(snapshot.utterances).toHaveLength(2);
    expect(snapshot.utterances[0]!.speaker).toBe('caller');
    expect(snapshot.utterances[1]!.speaker).toBe('user');
    expect(snapshot.latestRisk?.score).toBeGreaterThan(0);
  });

  it('records AI decoy utterances with speaker = ai', () => {
    const events: SessionEvent[] = [];
    const pipeline = new AudioPipeline({
      sessionId: 'session-handoff',
      caseId: 'case-handoff',
      scribeProvider: new MockScribeProvider(),
      analysisProvider: new DemoAnalysisProvider(),
      onEvent: (event) => events.push(event),
    });

    pipeline.setState('ai_active');
    const aiUtterance = pipeline.addAiUtterance('ขอทราบเลขอ้างอิงคดีเพื่อนำไปตรวจสอบก่อนค่ะ');

    expect(aiUtterance.speaker).toBe('ai');
    expect(aiUtterance.transcriptState).toBe('committed');

    const lastEvent = events[events.length - 1];
    expect(lastEvent?.type).toBe('transcript.committed');
    if (lastEvent?.type === 'transcript.committed') {
      expect(lastEvent.utterance.speaker).toBe('ai');
    }
  });

  it('handles provider errors by emitting service.degraded without crashing', async () => {
    const events: SessionEvent[] = [];
    const scribeProvider = new MockScribeProvider();

    const pipeline = new AudioPipeline({
      sessionId: 'session-error',
      caseId: 'case-error',
      scribeProvider,
      analysisProvider: new DemoAnalysisProvider(),
      onEvent: (event) => events.push(event),
    });

    await pipeline.ingestAudioChunk({
      speaker: 'caller',
      audioBase64: 'CCCC',
      timestampMs: 3000,
    });

    const session = scribeProvider.sessions[0]!;
    session.emitError(new Error('Scribe WebSocket disconnected unexpectedly'));

    const degradedEvent = events.find((e) => e.type === 'service.degraded');
    expect(degradedEvent).toBeDefined();
    if (degradedEvent && degradedEvent.type === 'service.degraded') {
      expect(degradedEvent.service).toContain('elevenlabs_scribe');
      expect(degradedEvent.message).toContain('disconnected unexpectedly');
    }

    pipeline.close();
  });
});
