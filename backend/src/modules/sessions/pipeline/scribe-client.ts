import WebSocket from 'ws';
import type { Speaker } from '@scamtrap/contracts';
import { DemoScribeSession } from './demo-scribe-adapter.js';
import type { ScribeCallbacks, ScribeProvider, ScribeSession } from './types.js';

export class ElevenLabsScribeSession implements ScribeSession {
  private ws: WebSocket | null = null;
  private isClosed = false;
  private hasAuthError = false;
  private fallbackSession: DemoScribeSession | null = null;

  constructor(
    readonly speaker: Speaker,
    private readonly apiKey: string,
    private readonly callbacks: ScribeCallbacks,
    private readonly modelId = 'scribe_v2_realtime',
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve) => {
      const url = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=${encodeURIComponent(this.modelId)}&audio_format=pcm_16000&commit_strategy=vad`;
      this.ws = new WebSocket(url, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      let resolved = false;

      this.ws.on('open', () => {
        // Resolve after brief window for potential immediate auth error response
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }, 200);
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.message_type === 'auth_error' || payload.error) {
            const err = payload.error || payload.message || 'Authentication error';
            this.hasAuthError = true;
            this.initFallback();
            try {
              this.ws?.close();
            } catch {
              // ignore
            }
            this.callbacks.onError(new Error(`ElevenLabs API Key error: ${err}`));
            if (!resolved) {
              resolved = true;
              resolve();
            }
            return;
          }

          if (payload.message_type === 'partial_transcript') {
            this.callbacks.onPartial(payload.text ?? '');
          } else if (payload.message_type === 'committed_transcript') {
            this.callbacks.onCommitted(payload.text ?? '');
          } else if (payload.message_type === 'error') {
            this.callbacks.onError(new Error(payload.message || 'ElevenLabs Scribe error'));
          }
        } catch {
          // ignore unparseable keep-alives or non-json frames
        }
      });

      this.ws.on('error', (err) => {
        this.callbacks.onError(err);
        this.initFallback();
        if (!resolved) {
          resolved = true;
          resolve();
        }
      });

      this.ws.on('close', () => {
        if (!this.isClosed) {
          if (this.hasAuthError) {
            this.initFallback();
          } else {
            this.callbacks.onClose?.();
          }
        }
      });
    });
  }

  private initFallback(): void {
    if (!this.fallbackSession) {
      this.fallbackSession = new DemoScribeSession(this.speaker, this.callbacks, true);
    }
  }

  sendAudioChunk(chunkBase64: string): void {
    if (this.hasAuthError || this.fallbackSession) {
      this.initFallback();
      this.fallbackSession?.sendAudioChunk(chunkBase64);
      return;
    }

    if (this.isClosed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: chunkBase64,
        commit: false,
      }),
    );
  }

  commit(): void {
    if (this.fallbackSession) {
      this.fallbackSession.commit();
      return;
    }

    if (this.isClosed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(
      JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: '',
        commit: true,
      }),
    );
  }

  close(): void {
    this.isClosed = true;
    this.fallbackSession?.close();
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.close();
        }
      } catch {
        // ignore close error
      }
      this.ws = null;
    }
  }
}

export class ElevenLabsScribeProvider implements ScribeProvider {
  readonly name = 'elevenlabs-scribe-v2';

  constructor(private readonly apiKey: string) {}

  async createSession(speaker: Speaker, callbacks: ScribeCallbacks): Promise<ScribeSession> {
    try {
      const session = new ElevenLabsScribeSession(speaker, this.apiKey, callbacks);
      await session.connect();
      return session;
    } catch (err) {
      callbacks.onError(
        new Error(`ElevenLabs Scribe connection failed: ${err instanceof Error ? err.message : String(err)}`),
      );
      return new DemoScribeSession(speaker, callbacks, true);
    }
  }
}
