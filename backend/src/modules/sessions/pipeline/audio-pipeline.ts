import { randomUUID } from 'node:crypto';
import type { AnalysisProvider } from '@scamtrap/analysis-core';
import type {
  HandoffState,
  SessionEvent,
  SessionSnapshot,
  Speaker,
  Utterance,
} from '@scamtrap/contracts';
import { DemoAgentAdapter } from '../handoff/agent-client.js';
import { ContextBuilder } from '../handoff/context-builder.js';
import { HandoffStateMachine } from '../handoff/handoff-state-machine.js';
import type { AgentClient } from '../handoff/types.js';
import type { AudioPipelineOptions, ScribeProvider, ScribeSession } from './types.js';

export class AudioPipeline {
  readonly sessionId: string;
  readonly caseId: string;
  private readonly scribeProvider: ScribeProvider;
  private readonly analysisProvider: AnalysisProvider;
  private readonly agentClient: AgentClient;
  private readonly onEvent: (event: SessionEvent) => void;
  private readonly stateMachine: HandoffStateMachine;

  private utterances: Utterance[] = [];
  private activePartialUtterance: Record<string, Utterance | null> = {
    user: null,
    caller: null,
    ai: null,
  };

  private latestRisk: { score: number; reasons: string[] } | null = null;
  private speakerSessions = new Map<Speaker, ScribeSession>();
  private audioBuffers = new Map<Speaker, string[]>();
  private isReconnecting = new Map<Speaker, boolean>();
  private reconnectAttempts = new Map<Speaker, number>();

  constructor(options: AudioPipelineOptions) {
    this.sessionId = options.sessionId;
    this.caseId = options.caseId;
    this.scribeProvider = options.scribeProvider;
    this.analysisProvider = options.analysisProvider;
    this.agentClient = options.agentClient ?? new DemoAgentAdapter();
    this.onEvent = options.onEvent;
    this.stateMachine = new HandoffStateMachine('human_active');
  }

  setState(state: HandoffState): void {
    const prevState = this.stateMachine.getState();
    this.stateMachine.forceState(state);

    // If moving away from ai_active, cancel pending agent audio
    if (prevState === 'ai_active' && state !== 'ai_active') {
      this.onEvent({
        type: 'agent.interrupted',
        sessionId: this.sessionId,
        occurredAt: new Date().toISOString(),
      });
    }

    this.onEvent({
      type: 'session.state_changed',
      sessionId: this.sessionId,
      state,
      occurredAt: new Date().toISOString(),
    });
  }

  getState(): HandoffState {
    return this.stateMachine.getState();
  }


  getSnapshot(): SessionSnapshot {
    return {
      sessionId: this.sessionId,
      state: this.getState(),
      utterances: [...this.utterances],
      latestRisk: this.latestRisk ? { ...this.latestRisk } : null,
    };
  }

  async ingestAudioChunk(chunk: {
    speaker: 'user' | 'caller';
    audioBase64: string;
    sampleRate?: number;
    timestampMs: number;
  }): Promise<void> {
    const { speaker, audioBase64 } = chunk;

    let session = this.speakerSessions.get(speaker);
    if (!session) {
      if (this.isReconnecting.get(speaker)) {
        // Buffer while reconnecting (keep max 20 chunks)
        const buf = this.audioBuffers.get(speaker) ?? [];
        if (buf.length < 20) {
          buf.push(audioBase64);
          this.audioBuffers.set(speaker, buf);
        }
        return;
      }

      await this.initSpeakerSession(speaker);
      session = this.speakerSessions.get(speaker);
    }

    if (session) {
      session.sendAudioChunk(audioBase64);
    }
  }

  private async initSpeakerSession(speaker: Speaker): Promise<void> {
    try {
      const session = await this.scribeProvider.createSession(speaker, {
        onPartial: (text) => this.handlePartial(speaker, text),
        onCommitted: (text) => void this.handleCommitted(speaker, text),
        onError: (err) => this.handleProviderError(speaker, err),
        onClose: () => this.handleSessionClose(speaker),
      });

      this.speakerSessions.set(speaker, session);
      this.reconnectAttempts.set(speaker, 0);

      // Flush any buffered chunks
      const buffered = this.audioBuffers.get(speaker) ?? [];
      this.audioBuffers.delete(speaker);
      for (const chunk of buffered) {
        session.sendAudioChunk(chunk);
      }
    } catch (error) {
      this.handleProviderError(speaker, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handlePartial(speaker: Speaker, text: string): void {
    if (!text.trim()) return;

    const existing = this.activePartialUtterance[speaker];
    const now = Date.now();
    const utterance: Utterance = {
      id: existing?.id ?? randomUUID(),
      sessionId: this.sessionId,
      speaker,
      text,
      transcriptState: 'partial',
      startedAtMs: existing?.startedAtMs ?? now,
      endedAtMs: now,
      createdAt: existing?.createdAt ?? new Date(now).toISOString(),
    };

    this.activePartialUtterance[speaker] = utterance;

    // Interruption / barge-in: If caller speaks while AI is active, cancel pending agent speech
    if (speaker === 'caller' && this.getState() === 'ai_active') {
      this.onEvent({
        type: 'agent.interrupted',
        sessionId: this.sessionId,
        occurredAt: new Date().toISOString(),
      });
    }

    this.onEvent({
      type: 'transcript.partial',
      sessionId: this.sessionId,
      utterance,
      occurredAt: new Date().toISOString(),
    });
  }

  private async handleCommitted(speaker: Speaker, text: string): Promise<void> {
    if (!text.trim()) return;

    const existing = this.activePartialUtterance[speaker];
    const now = Date.now();
    const utterance: Utterance = {
      id: existing?.id ?? randomUUID(),
      sessionId: this.sessionId,
      speaker,
      text,
      transcriptState: 'committed',
      startedAtMs: existing?.startedAtMs ?? now - 2000,
      endedAtMs: now,
      createdAt: new Date().toISOString(),
    };

    this.activePartialUtterance[speaker] = null;
    this.utterances.push(utterance);

    this.onEvent({
      type: 'transcript.committed',
      sessionId: this.sessionId,
      utterance,
      occurredAt: new Date().toISOString(),
    });

    // Feed committed transcript to Analysis Engine
    // Rules: Caller speech is evaluated for scam tactics and risk scoring.
    if (speaker === 'caller') {
      await this.runAnalysisOnUtterance(utterance);

      // When AI is active, trigger Decoy Agent response
      if (this.getState() === 'ai_active') {
        await this.triggerAgentDecoyReply(utterance.text);
      }
    }
  }

  private async triggerAgentDecoyReply(callerText: string): Promise<void> {
    try {
      const context = ContextBuilder.build(this.sessionId, this.utterances);
      const reply = await this.agentClient.generateReply(context, callerText);

      if (this.getState() === 'ai_active') {
        this.addAiUtterance(reply.text);

        if (reply.audioBase64) {
          this.onEvent({
            type: 'agent.audio_chunk',
            sessionId: this.sessionId,
            audioBase64: reply.audioBase64,
            sampleRate: 16000,
            occurredAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      this.onEvent({
        type: 'service.degraded',
        sessionId: this.sessionId,
        service: 'decoy_agent',
        message: err instanceof Error ? err.message : 'Agent response generation failed',
        occurredAt: new Date().toISOString(),
      });
    }
  }


  private async runAnalysisOnUtterance(callerUtterance: Utterance): Promise<void> {
    try {
      // Analyze recent conversation context (accumulated caller statements + recent context)
      const callerStatements = this.utterances
        .filter((u) => u.speaker === 'caller')
        .map((u) => u.text)
        .join('\n');

      const result = await this.analysisProvider.analyzeText({
        sourceId: callerUtterance.id,
        text: callerStatements,
        isDemo: true,
      });

      const reasons = result.evidence.map((e) => e.explanation);
      this.latestRisk = {
        score: result.score,
        reasons,
      };

      this.onEvent({
        type: 'risk.updated',
        sessionId: this.sessionId,
        score: result.score,
        reasons,
        occurredAt: new Date().toISOString(),
      });
    } catch (err) {
      // Gracefully catch analysis errors without crashing audio pipeline
      this.onEvent({
        type: 'service.degraded',
        sessionId: this.sessionId,
        service: 'analysis_engine',
        message: err instanceof Error ? err.message : 'Analysis failed',
        occurredAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Directly ingests real-time partial or committed transcript from client-side speech recognition.
   */
  async handleLiveTranscript(speaker: Speaker, text: string, isFinal: boolean): Promise<void> {
    if (isFinal) {
      await this.handleCommitted(speaker, text);
    } else {
      this.handlePartial(speaker, text);
    }
  }

  /**
   * Simulates real-time speech streaming for automated testing or demo triggers.
   */
  async simulateSpeech(speaker: Speaker, fullText: string): Promise<void> {
    const session = this.speakerSessions.get(speaker);
    if (session && 'simulateStream' in session && typeof (session as { simulateStream?: unknown }).simulateStream === 'function') {
      await (session as { simulateStream: (text: string) => Promise<void> }).simulateStream(fullText);
    } else {
      const words = fullText.split(' ');
      let current = '';
      for (let i = 0; i < words.length; i++) {
        current += (i > 0 ? ' ' : '') + words[i];
        this.handlePartial(speaker, current);
        await new Promise((r) => setTimeout(r, 60));
      }
      await this.handleCommitted(speaker, fullText);
    }
  }

  /**
   * Records committed utterance spoken by the AI decoy during handoff.
   */
  addAiUtterance(text: string): Utterance {

    const now = Date.now();
    const utterance: Utterance = {
      id: randomUUID(),
      sessionId: this.sessionId,
      speaker: 'ai',
      text,
      transcriptState: 'committed',
      startedAtMs: now - 1500,
      endedAtMs: now,
      createdAt: new Date().toISOString(),
    };

    this.utterances.push(utterance);
    this.onEvent({
      type: 'transcript.committed',
      sessionId: this.sessionId,
      utterance,
      occurredAt: new Date().toISOString(),
    });

    return utterance;
  }

  private handleProviderError(speaker: Speaker, error: Error): void {
    this.onEvent({
      type: 'service.degraded',
      sessionId: this.sessionId,
      service: `elevenlabs_scribe_${speaker}`,
      message: error.message || 'Speech-to-text provider encountered an error',
      occurredAt: new Date().toISOString(),
    });

    this.scheduleReconnect(speaker);
  }

  private handleSessionClose(speaker: Speaker): void {
    this.speakerSessions.delete(speaker);
  }

  private scheduleReconnect(speaker: Speaker): void {
    if (this.isReconnecting.get(speaker)) return;

    const attempts = this.reconnectAttempts.get(speaker) ?? 0;
    if (attempts >= 5) {
      // Exceeded max retries
      this.isReconnecting.set(speaker, false);
      return;
    }

    this.isReconnecting.set(speaker, true);
    this.reconnectAttempts.set(speaker, attempts + 1);

    // Exponential backoff: 500ms, 1000ms, 2000ms, ...
    const delay = Math.min(500 * Math.pow(2, attempts), 5000);

    setTimeout(() => {
      this.isReconnecting.set(speaker, false);
      this.speakerSessions.delete(speaker);
      void this.initSpeakerSession(speaker);
    }, delay);
  }

  close(): void {
    for (const session of this.speakerSessions.values()) {
      session.close();
    }
    this.speakerSessions.clear();
    this.audioBuffers.clear();
  }
}
