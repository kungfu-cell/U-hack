/**
 * AgentAudioPlayer plays AI agent audio chunks in sequence via Web Audio API,
 * exposes a MediaStreamTrack for WebRTC outgoing track replacement,
 * and supports immediate stopAndFlush() for caller barge-in interruptions.
 */
export class AgentAudioPlayer {
  private audioContext: AudioContext | null = null;
  private mediaDestination: MediaStreamAudioDestinationNode | null = null;
  private monitorGain: GainNode | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private nextPlayTime = 0;
  private isMutedForUser = false;

  constructor() {}

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.mediaDestination = this.audioContext.createMediaStreamDestination();

      // Monitor gain allows the human user to listen to the AI decoy speaking
      this.monitorGain = this.audioContext.createGain();
      this.monitorGain.gain.value = this.isMutedForUser ? 0 : 0.8;
      this.monitorGain.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    return this.audioContext;
  }

  /**
   * Returns the MediaStreamTrack transmitting the AI speech, suitable for WebRTC replaceTrack.
   */
  getAudioTrack(): MediaStreamTrack | null {
    this.getAudioContext();
    return this.mediaDestination?.stream.getAudioTracks()[0] ?? null;
  }

  /**
   * Enqueues and schedules a base64-encoded PCM or WAV audio chunk for playback.
   */
  async enqueueAudioChunk(audioBase64: string, sampleRate = 16000): Promise<void> {
    try {
      const ctx = this.getAudioContext();
      const binaryString = window.atob(audioBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      let audioBuffer: AudioBuffer;

      // Check if it's a WAV/RIFF container
      const isRiff =
        bytes.length >= 4 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46;

      if (isRiff) {
        audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      } else {
        // Assume raw 16-bit linear PCM mono
        const int16Array = new Int16Array(
          bytes.buffer,
          bytes.byteOffset,
          Math.floor(bytes.byteLength / 2),
        );
        audioBuffer = ctx.createBuffer(1, int16Array.length, sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < int16Array.length; i++) {
          const sample = int16Array[i] ?? 0;
          channelData[i] = sample / 32768.0;
        }
      }

      this.scheduleBuffer(audioBuffer);
    } catch {
      // Ignore playback errors on invalid frames
    }
  }

  private scheduleBuffer(buffer: AudioBuffer): void {
    if (!this.audioContext || !this.mediaDestination) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    // Send to WebRTC outgoing stream
    source.connect(this.mediaDestination);

    // Also send to local speaker monitor
    if (this.monitorGain) {
      source.connect(this.monitorGain);
    }

    const now = this.audioContext.currentTime;
    const startTime = Math.max(now, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + buffer.duration;

    this.activeSources.push(source);

    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) {
        this.activeSources.splice(idx, 1);
      }
    };
  }

  /**
   * Immediately aborts and flushes all queued/playing audio buffers (e.g. caller barge-in interruption).
   */
  stopAndFlush(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // ignore already stopped
      }
    }
    this.activeSources = [];
    this.nextPlayTime = 0;
  }

  /**
   * Toggles whether the local user hears the AI speech monitor.
   */
  setMonitorVolume(volume: number): void {
    if (this.monitorGain) {
      this.monitorGain.gain.value = volume;
    }
  }

  close(): void {
    this.stopAndFlush();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }
}
