import { AgentAudioPlayer } from './agent-audio-player';

export type ScammerConvAiStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'speaking'
  | 'listening'
  | 'closed'
  | 'error';

export interface ScammerConvAiCallbacks {
  onStatusChange?: (status: ScammerConvAiStatus, error?: string) => void;
  onAgentResponse?: (text: string) => void;
  onUserTranscript?: (text: string) => void;
  onInterrupted?: () => void;
}

export interface ScammerConvAiOptions {
  language?: 'th' | 'en';
}

export class ScammerConvAiClient {
  private ws: WebSocket | null = null;
  private audioPlayer: AgentAudioPlayer | null = null;
  private status: ScammerConvAiStatus = 'idle';
  private pingInterval: NodeJS.Timeout | null = null;
  private isDisposed = false;

  constructor(
    private readonly signedUrl: string,
    private readonly callbacks: ScammerConvAiCallbacks = {},
    private readonly options: ScammerConvAiOptions = {},
  ) {}

  getStatus(): ScammerConvAiStatus {
    return this.status;
  }

  private setStatus(status: ScammerConvAiStatus, error?: string) {
    this.status = status;
    this.callbacks.onStatusChange?.(status, error);
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isDisposed = false;
    this.setStatus('connecting');

    try {
      this.audioPlayer = new AgentAudioPlayer();
      void this.audioPlayer.resume();
      this.ws = new WebSocket(this.signedUrl);

      this.ws.onopen = () => {
        if (this.isDisposed) {
          this.disconnect();
          return;
        }
        this.setStatus('connected');
        // Trigger the AI scammer to immediately deliver its scenario speech
        const initialGreeting =
          this.options.language === 'en'
            ? 'Hello, who is calling?'
            : 'สวัสดีครับ ใครโทรมาครับ';
        this.ws?.send(
          JSON.stringify({
            type: 'user_message',
            text: initialGreeting,
          }),
        );
        // ElevenLabs ConvAI ping loop
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping', event_id: Date.now() }));
          }
        }, 8000);
      };

      this.ws.onmessage = (event) => {
        if (this.isDisposed) return;
        try {
          const data = JSON.parse(event.data as string);

          if (data.type === 'conversation_initiation_metadata') {
            this.setStatus('listening');
          } else if (data.type === 'audio') {
            // Audio chunk event
            const audioChunk = data.audio_event?.audio_base_64;
            if (audioChunk) {
              this.setStatus('speaking');
              void this.audioPlayer?.enqueueAudioChunk(audioChunk, 16000);
            }
          } else if (data.type === 'interruption') {
            // User interrupted scammer
            this.audioPlayer?.stopAndFlush();
            this.setStatus('listening');
            this.callbacks.onInterrupted?.();
          } else if (data.type === 'agent_response') {
            const text = data.agent_response_event?.agent_response;
            if (text && typeof text === 'string') {
              this.callbacks.onAgentResponse?.(text.trim());
            }
          } else if (data.type === 'user_transcript') {
            const text = data.user_transcription_event?.user_transcript;
            if (text && typeof text === 'string') {
              this.callbacks.onUserTranscript?.(text.trim());
            }
          } else if (data.type === 'ping') {
            const eventId = data.ping_event?.event_id;
            if (eventId && this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: 'pong', event_id: eventId }));
            }
          }
        } catch {
          // ignore parsing error
        }
      };

      this.ws.onerror = () => {
        if (!this.isDisposed) {
          const errMsg =
            this.options.language === 'en'
              ? 'Connection to ElevenLabs failed'
              : 'การเชื่อมต่อกับ ElevenLabs ล้มเหลว';
          this.setStatus('error', errMsg);
        }
      };

      this.ws.onclose = () => {
        this.cleanUpResources();
        if (!this.isDisposed) {
          this.setStatus('closed');
        }
      };
    } catch (err) {
      const defaultErr =
        this.options.language === 'en'
          ? 'Cannot connect to scammer simulation'
          : 'ไม่สามารถต่อสายมิจฉาชีพได้';
      this.setStatus('error', err instanceof Error ? err.message : defaultErr);
    }
  }

  /**
   * Forwards a 16kHz PCM base64 audio chunk from user's microphone to ElevenLabs ConvAI.
   */
  sendUserAudioChunk(base64Pcm: string): void {
    if (this.ws?.readyState === WebSocket.OPEN && !this.isDisposed) {
      this.ws.send(
        JSON.stringify({
          user_audio_chunk: base64Pcm,
        }),
      );
    }
  }

  private cleanUpResources() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.audioPlayer?.stopAndFlush();
    this.audioPlayer?.close();
    this.audioPlayer = null;
  }

  disconnect(): void {
    this.isDisposed = true;
    this.cleanUpResources();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setStatus('closed');
  }
}
