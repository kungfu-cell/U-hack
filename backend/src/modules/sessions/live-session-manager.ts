import type { AnalysisProvider } from '@scamtrap/analysis-core';
import type { SessionState, TranscriptRepository } from '@scamtrap/database';
import {
  clientMessageSchema,
  type ClientMessage,
  type ParticipantRole,
  type SessionEvent,
} from '@scamtrap/contracts';
import type { WebSocket } from 'ws';
import { AudioPipeline } from './pipeline/audio-pipeline.js';
import type { ScribeProvider } from './pipeline/types.js';
import type { SessionRecord, SessionService } from './session.service.js';


import type { AgentClient } from './handoff/types.js';

export class LiveSessionManager {
  private pipelines = new Map<string, AudioPipeline>();
  private subscribers = new Map<string, Map<WebSocket, ParticipantRole>>();

  constructor(
    private readonly scribeProvider: ScribeProvider,
    private readonly analysisProvider: AnalysisProvider,
    private readonly sessionService: SessionService,
    readonly agentClient?: AgentClient,
    private readonly transcriptRepository?: TranscriptRepository,
  ) {}

  getOrCreatePipeline(sessionId: string, caseId: string): AudioPipeline {
    let pipeline = this.pipelines.get(sessionId);
    if (!pipeline) {
      pipeline = new AudioPipeline({
        sessionId,
        caseId,
        scribeProvider: this.scribeProvider,
        analysisProvider: this.analysisProvider,
        agentClient: this.agentClient,
        onEvent: (event) => this.handlePipelineEvent(sessionId, event),
      });


      // Synchronize with existing session state in sessionService
      const session = this.sessionService.get(sessionId);
      if (session) {
        pipeline.setState(session.state);
      }

      this.pipelines.set(sessionId, pipeline);
    }
    return pipeline;
  }

  private handlePipelineEvent(sessionId: string, event: SessionEvent): void {
    this.broadcast(sessionId, event);
    if (!this.transcriptRepository) return;

    const persist = async () => {
      if (event.type === 'transcript.committed') {
        await this.transcriptRepository!.appendUtterance({
          id: event.utterance.id,
          sessionId,
          speaker: event.utterance.speaker,
          text: event.utterance.text,
          transcriptState: 'COMMITTED',
          startedAtMs: event.utterance.startedAtMs,
          endedAtMs: event.utterance.endedAtMs,
        });
      } else if (event.type === 'session.state_changed') {
        const stateMap: Record<typeof event.state, SessionState> = {
          ready: 'HUMAN_ACTIVE',
          human_active: 'HUMAN_ACTIVE',
          preparing_ai: 'PREPARING_AI',
          ai_active: 'AI_ACTIVE',
          stopping_ai: 'STOPPING_AI',
          paused_safe: 'WAITING_FOR_USER',
          waiting_for_user: 'WAITING_FOR_USER',
          ended: 'ENDED',
          failed: 'WAITING_FOR_USER',
        };
        await this.transcriptRepository!.updateSessionState(
          sessionId,
          stateMap[event.state],
          event.state === 'ended' ? new Date(event.occurredAt) : undefined,
        );
      }
    };

    void persist().catch(() => {
      // Realtime delivery must continue if persistence is temporarily unavailable.
    });
  }

  getPipeline(sessionId: string): AudioPipeline | undefined {
    return this.pipelines.get(sessionId);
  }

  handleClientConnection(sessionId: string, socket: WebSocket, role: ParticipantRole): void {
    let subs = this.subscribers.get(sessionId);
    if (!subs) {
      subs = new Map();
      this.subscribers.set(sessionId, subs);
    }
    const existingRoles = [...subs.values()];
    subs.set(socket, role);

    const session = this.sessionService.get(sessionId);
    const caseId = session?.caseId ?? sessionId;
    const pipeline = this.getOrCreatePipeline(sessionId, caseId);

    // Send immediate snapshot upon connection for fast recovery/hydration
    const snapshot = pipeline.getSnapshot();
    this.send(socket, {
      type: 'session.sync_response',
      sessionId,
      snapshot,
      occurredAt: new Date().toISOString(),
    });

    for (const existingRole of existingRoles) {
      this.send(socket, {
        type: 'peer.joined',
        sessionId,
        role: existingRole,
        occurredAt: new Date().toISOString(),
      });
    }
    this.broadcastExcept(sessionId, socket, {
      type: 'peer.joined',
      sessionId,
      role,
      occurredAt: new Date().toISOString(),
    });

    socket.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        const validated = clientMessageSchema.safeParse(parsed);
        if (!validated.success) return;

        if ('sessionId' in validated.data && validated.data.sessionId !== sessionId) return;
        this.handleClientMessage(sessionId, socket, role, validated.data);
      } catch {
        // ignore non-json frames
      }
    });

    socket.on('close', () => {
      subs?.delete(socket);
      this.broadcast(sessionId, {
        type: 'peer.left',
        sessionId,
        role,
        occurredAt: new Date().toISOString(),
      });
      if (subs?.size === 0) {
        this.subscribers.delete(sessionId);
      }
    });
  }

  private handleClientMessage(
    sessionId: string,
    socket: WebSocket,
    role: ParticipantRole,
    message: ClientMessage,
  ): void {
    const pipeline = this.pipelines.get(sessionId);
    const expectedSpeaker = role === 'owner' ? 'user' : 'caller';

    if (message.type === 'audio.chunk') {
      if (pipeline && message.speaker === expectedSpeaker) {
        void pipeline.ingestAudioChunk({
          speaker: message.speaker,
          audioBase64: message.audioBase64,
          sampleRate: message.sampleRate,
          timestampMs: message.timestampMs,
        });
      }
    } else if (message.type === 'session.sync') {
      if (pipeline) {
        this.send(socket, {
          type: 'session.sync_response',
          sessionId,
          snapshot: pipeline.getSnapshot(),
          occurredAt: new Date().toISOString(),
        });
      }
    } else if (message.type === 'transcript.client_speech') {
      if (pipeline && message.speaker === expectedSpeaker) {
        void pipeline.handleLiveTranscript(message.speaker, message.text, message.isFinal);
      }
    } else if (message.type === 'ping') {
      this.send(socket, {
        type: 'pong',
        timestamp: message.timestamp,
      });
    } else if (message.type === 'signal.offer' || message.type === 'signal.answer') {
      this.broadcastExcept(sessionId, socket, {
        type: message.type,
        sessionId,
        sdp: message.sdp,
        fromRole: role,
        occurredAt: new Date().toISOString(),
      });
    } else if (message.type === 'signal.ice') {
      this.broadcastExcept(sessionId, socket, {
        type: 'signal.ice',
        sessionId,
        candidate: message.candidate,
        fromRole: role,
        occurredAt: new Date().toISOString(),
      });
    }
  }

  broadcast(sessionId: string, event: SessionEvent): void {
    const subs = this.subscribers.get(sessionId);
    if (!subs || subs.size === 0) return;

    const data = JSON.stringify(event);
    for (const ws of subs.keys()) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  private broadcastExcept(sessionId: string, excluded: WebSocket, event: SessionEvent): void {
    const subs = this.subscribers.get(sessionId);
    if (!subs) return;
    const data = JSON.stringify(event);
    for (const ws of subs.keys()) {
      if (ws !== excluded && ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  private send(socket: WebSocket, event: SessionEvent): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }

  closeSession(sessionId: string): void {
    const pipeline = this.pipelines.get(sessionId);
    if (pipeline) {
      pipeline.close();
      this.pipelines.delete(sessionId);
    }

    const subs = this.subscribers.get(sessionId);
    if (subs) {
      for (const ws of subs.keys()) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
      this.subscribers.delete(sessionId);
    }
  }
}
