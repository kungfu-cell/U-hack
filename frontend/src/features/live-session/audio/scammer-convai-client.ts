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
  onAudioChunkReceived?: () => void;
  onPlaybackFinished?: () => void;
}

export interface ScammerConvAiOptions {
  language?: 'th' | 'en';
}

export class ScammerConvAiClient {
  private ws: WebSocket | null = null;
  private audioPlayer: AgentAudioPlayer | null = null;
  private status: ScammerConvAiStatus = 'idle';
  private pingInterval: NodeJS.Timeout | null = null;
  private syntheticTextQueue: string[] = [];
  private isDisposed = false;
  private outputSampleRate = 16000;

  constructor(
    private readonly signedUrl: string,
    private readonly callbacks: ScammerConvAiCallbacks = {},
    private readonly options: ScammerConvAiOptions = {},
  ) {}

  getStatus(): ScammerConvAiStatus {
    return this.status;
  }

  isSpeaking(): boolean {
    return this.status === 'speaking' || (this.audioPlayer?.isPlaying() ?? false);
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
        // Complete the ElevenLabs handshake so the outbound scammer owns the
        // first turn and delivers its configured opening line immediately.
        this.ws?.send(JSON.stringify({ type: 'conversation_initiation_client_data' }));
        this.setStatus('connected');
        // Do not send a synthetic user message here: the configured agent owns
        // the opening line and a second trigger would produce overlapping replies.
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
            const outputFormat = data.conversation_initiation_metadata_event?.agent_output_audio_format;
            const sampleRateMatch = typeof outputFormat === 'string' ? /^pcm_(\d+)$/i.exec(outputFormat) : null;
            const advertisedSampleRate = sampleRateMatch ? Number(sampleRateMatch[1]) : 16000;
            this.outputSampleRate =
              Number.isFinite(advertisedSampleRate) && advertisedSampleRate >= 8000 && advertisedSampleRate <= 96000
                ? advertisedSampleRate
                : 16000;
            this.setStatus('listening');
            this.flushSyntheticTextQueue();
          } else if (data.type === 'audio') {
            // Audio chunk event
            const audioChunk = data.audio_event?.audio_base_64;
            if (audioChunk) {
              this.setStatus('speaking');
              this.callbacks.onAudioChunkReceived?.();
              const playback = this.audioPlayer?.enqueueAudioChunk(audioChunk, this.outputSampleRate);
              if (playback) {
                void playback.then(() => {
                  if (
                    !this.isDisposed &&
                    this.status === 'speaking' &&
                    !this.audioPlayer?.isPlaying()
                  ) {
                  this.setStatus('listening');
                    this.callbacks.onPlaybackFinished?.();
                  this.flushSyntheticTextQueue();
                }
                });
              }
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
    // The custom PCM transport has no browser-level echo reference. Keep the
    // conversation half-duplex while agent audio is playing so the agent does
    // not transcribe its own loudspeaker output as the citizen.
    if (this.isSpeaking()) return;

    this.sendAudioChunk(base64Pcm);
  }

  /** Sends the ScamTrap decoy turn directly into the scammer conversation. */
  sendSyntheticUserMessage(text: string): void {
    const cleanText = text.trim();
    if (!cleanText || this.isDisposed) return;
    if (this.isSpeaking() || this.ws?.readyState !== WebSocket.OPEN) {
      this.syntheticTextQueue.push(cleanText);
      if (this.syntheticTextQueue.length > 8) this.syntheticTextQueue.shift();
      return;
    }
    this.ws.send(JSON.stringify({ type: 'user_message', text: cleanText }));
  }

  private sendAudioChunk(base64Pcm: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN || this.isDisposed) return;
    this.ws.send(JSON.stringify({ user_audio_chunk: base64Pcm }));
  }

  private flushSyntheticTextQueue(): void {
    if (this.isSpeaking() || this.ws?.readyState !== WebSocket.OPEN || this.isDisposed) return;
    const messages = this.syntheticTextQueue.splice(0);
    for (const text of messages) {
      this.ws.send(JSON.stringify({ type: 'user_message', text }));
    }
  }

  /**
   * Injects transcribed speech text directly into ElevenLabs ConvAI for guaranteed understanding and immediate response.
   */
  sendUserMessage(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN && !this.isDisposed) {
      this.ws.send(
        JSON.stringify({
          type: 'user_message',
          text: text.trim(),
        }),
      );
    }
  }

  private cleanUpResources() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.syntheticTextQueue = [];
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
