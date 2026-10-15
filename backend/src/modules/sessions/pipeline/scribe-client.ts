import WebSocket from 'ws';
import type { Speaker } from '@scamtrap/contracts';
import type { ScribeCallbacks, ScribeProvider, ScribeSession } from './types.js';

export class ElevenLabsScribeSession implements ScribeSession {
  private ws: WebSocket | null = null;
  private isClosed = false;

  constructor(
    readonly speaker: Speaker,
    private readonly apiKey: string,
    private readonly callbacks: ScribeCallbacks,
    private readonly modelId = 'scribe_v2_realtime',
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=${encodeURIComponent(this.modelId)}`;
      this.ws = new WebSocket(url, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      let opened = false;

      this.ws.on('open', () => {
        opened = true;
        resolve();
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.message_type === 'partial_transcript') {
            this.callbacks.onPartial(payload.text ?? '');
          } else if (payload.message_type === 'committed_transcript') {
            this.callbacks.onCommitted(payload.text ?? '');
          } else if (payload.message_type === 'error') {
            this.callbacks.onError(new Error(payload.message || 'ElevenLabs Scribe error'));
          }
        } catch (err) {
          // ignore unparseable keep-alives or non-json frames
        }
      });

      this.ws.on('error', (err) => {
        if (!opened) {
          reject(err);
        } else {
          this.callbacks.onError(err);
        }
      });

      this.ws.on('close', () => {
        if (!this.isClosed) {
          this.callbacks.onClose?.();
        }
      });
    });
  }

  sendAudioChunk(chunkBase64: string): void {
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
    const session = new ElevenLabsScribeSession(speaker, this.apiKey, callbacks);
    await session.connect();
    return session;
  }
}
