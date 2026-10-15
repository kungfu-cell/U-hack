import type { AnalysisProvider } from '@scamtrap/analysis-core';
import {
  clientMessageSchema,
  type ClientMessage,
  type SessionEvent,
} from '@scamtrap/contracts';
import type { WebSocket } from 'ws';
import { AudioPipeline } from './pipeline/audio-pipeline.js';
import type { ScribeProvider } from './pipeline/types.js';
import type { SessionRecord, SessionService } from './session.service.js';


import type { AgentClient } from './handoff/types.js';

export class LiveSessionManager {
  private pipelines = new Map<string, AudioPipeline>();
  private subscribers = new Map<string, Set<WebSocket>>();

  constructor(
    private readonly scribeProvider: ScribeProvider,
    private readonly analysisProvider: AnalysisProvider,
    private readonly sessionService: SessionService,
    private readonly agentClient?: AgentClient,
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
        onEvent: (event) => this.broadcast(sessionId, event),
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

  getPipeline(sessionId: string): AudioPipeline | undefined {
    return this.pipelines.get(sessionId);
  }

  handleClientConnection(sessionId: string, socket: WebSocket): void {
    let subs = this.subscribers.get(sessionId);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(sessionId, subs);
    }
    subs.add(socket);

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

    socket.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        const validated = clientMessageSchema.safeParse(parsed);
        if (!validated.success) return;

        this.handleClientMessage(sessionId, socket, validated.data);
      } catch {
        // ignore non-json frames
      }
    });

    socket.on('close', () => {
      subs?.delete(socket);
      if (subs?.size === 0) {
        this.subscribers.delete(sessionId);
      }
    });
  }

  private handleClientMessage(sessionId: string, socket: WebSocket, message: ClientMessage): void {
    const pipeline = this.pipelines.get(sessionId);

    if (message.type === 'audio.chunk') {
      if (pipeline) {
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
      if (pipeline) {
        void pipeline.handleLiveTranscript(message.speaker, message.text, message.isFinal);
      }
    } else if (message.type === 'ping') {
      this.send(socket, {
        type: 'pong',
        timestamp: message.timestamp,
      });
    }
  }

  broadcast(sessionId: string, event: SessionEvent): void {
    const subs = this.subscribers.get(sessionId);
    if (!subs || subs.size === 0) return;

    const data = JSON.stringify(event);
    for (const ws of subs) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
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
      for (const ws of subs) {
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
