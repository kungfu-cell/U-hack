/**
 * BrowserSpeechRecognizer uses the Web Speech API (webkitSpeechRecognition)
 * to transcribe the user's real spoken voice in Thai/English in real-time,
 * emitting interim partial transcripts and committed final segments.
 */
export class BrowserSpeechRecognizer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private isListening = false;
  private autoRestartTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly onTranscript: (text: string, isFinal: boolean) => void,
    private readonly lang: string = 'th-TH',
  ) {}

  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    );
  }

  start(): boolean {
    if (!this.isSupported()) return false;
    if (this.isListening) return true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    try {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.lang;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const text = res[0]?.transcript?.trim();
          if (text) {
            this.onTranscript(text, Boolean(res.isFinal));
          }
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          this.isListening = false;
        }
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          this.autoRestartTimeout = setTimeout(() => {
            if (this.isListening) {
              try {
                this.recognition?.start();
              } catch {
                // ignore
              }
            }
          }, 200);
        }
      };

      this.isListening = true;
      this.recognition.start();
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.isListening = false;
    if (this.autoRestartTimeout) {
      clearTimeout(this.autoRestartTimeout);
      this.autoRestartTimeout = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = null;
    }
  }
}
