/**
 * AudioProcessor captures an Audio MediaStream, downsamples it to 16,000 Hz 16-bit PCM mono,
 * and emits Base64-encoded chunks for Scribe STT.
 */
export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private isRunning = false;

  constructor(
    private readonly stream: MediaStream,
    private readonly onAudioChunk: (base64Data: string) => void,
    private readonly onVolume?: (rms: number) => void,
    private readonly targetSampleRate = 16000,
    private readonly bufferSize = 4096,
  ) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioContextClass();

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    // ScriptProcessor is widely supported across all modern browsers without worklet bundling hassles
    this.processorNode = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);

    this.processorNode.onaudioprocess = (event) => {
      if (!this.isRunning) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const inputSampleRate = this.audioContext?.sampleRate ?? 48000;

      // Measure volume RMS for visual feedback
      if (this.onVolume && inputData.length > 0) {
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          const val = inputData[i] ?? 0;
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / inputData.length);
        this.onVolume(rms);
      }

      // Downsample to target sample rate (16kHz)
      const downsampled = this.downsample(inputData, inputSampleRate, this.targetSampleRate);

      // Convert Float32Array to 16-bit PCM Int16Array
      const pcm16 = this.floatTo16BitPCM(downsampled);

      // Convert Int16Array to Base64
      const base64 = this.arrayBufferToBase64(pcm16.buffer);
      this.onAudioChunk(base64);
    };

    this.sourceNode.connect(this.processorNode);
    // Connect to destination to keep processor active (mute via gain 0 if needed)
    const silentGain = this.audioContext.createGain();
    silentGain.gain.value = 0;
    this.processorNode.connect(silentGain);
    silentGain.connect(this.audioContext.destination);
  }

  stop(): void {
    this.isRunning = false;
    try {
      this.processorNode?.disconnect();
      this.sourceNode?.disconnect();
      if (this.audioContext && this.audioContext.state !== 'closed') {
        void this.audioContext.close();
      }
    } catch {
      // ignore teardown errors
    }
    this.processorNode = null;
    this.sourceNode = null;
    this.audioContext = null;
  }

  private downsample(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
    if (outputRate === inputRate) {
      return buffer;
    }
    if (outputRate > inputRate) {
      return buffer;
    }

    const sampleRatio = inputRate / outputRate;
    const newLength = Math.round(buffer.length / sampleRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i]!;
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]!));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  private arrayBufferToBase64(buffer: ArrayBufferLike): string {
    let binary = '';
    const bytes = new Uint8Array(buffer as ArrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return window.btoa(binary);
  }

}
