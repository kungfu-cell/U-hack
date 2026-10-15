export interface AudioFileInput {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface AudioFileTranscript {
  text: string;
  provider: string;
}

export interface AudioFileTranscriber {
  transcribe(input: AudioFileInput): Promise<AudioFileTranscript>;
}

export class ElevenLabsAudioFileTranscriber implements AudioFileTranscriber {
  constructor(private readonly apiKey: string) {}

  async transcribe(input: AudioFileInput): Promise<AudioFileTranscript> {
    const audioBuffer = new ArrayBuffer(input.bytes.byteLength);
    new Uint8Array(audioBuffer).set(input.bytes);
    const form = new FormData();
    form.set('model_id', 'scribe_v1');
    form.set('tag_audio_events', 'false');
    form.set('diarize', 'true');
    form.set(
      'file',
      new Blob([audioBuffer], { type: input.mimeType }),
      input.fileName,
    );

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`ELEVENLABS_STT_FAILED:${response.status}:${detail}`);
    }

    const payload = await response.json() as { text?: unknown };
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text) throw new Error('ELEVENLABS_STT_EMPTY_TRANSCRIPT');
    return { text, provider: 'elevenlabs_scribe' };
  }
}
