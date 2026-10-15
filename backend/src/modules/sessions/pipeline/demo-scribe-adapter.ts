import type { Speaker } from '@scamtrap/contracts';
import type { ScribeCallbacks, ScribeProvider, ScribeSession } from './types.js';

const DEMO_CALLER_SCRIPTS = [
  'สวัสดีครับ ผมร้อยตำรวจเอก สมชาย จากสถานีตำรวจภูธรเมือง',
  'ตรวจสอบพบว่าคุณมีส่วนเกี่ยวข้องกับคดีฟอกเงินและมีหมายจับออกในชื่อของคุณ',
  'เพื่อแสดงความบริสุทธิ์ใจ คุณต้องโอนเงินทั้งหมดในบัญชีมาให้ทางเราตรวจสอบทันที และห้ามบอกใครเด็ดขาด',
  'แจ้งรหัส OTP 6 หลักที่เพิ่งได้รับทาง SMS มาให้เจ้าหน้าที่บันทึกเข้าระบบเดี๋ยวนี้',
  'หากคุณไม่ให้ความร่วมมือ เจ้าหน้าที่จะเข้าควบคุมตัวที่บ้านของคุณภายในหนึ่งชั่วโมงนี้',
  'อย่าเพิ่งวางสายเด็ดขาด การตัดสายถือว่าเป็นการขัดขืนคำสั่งเจ้าพนักงาน',
];

const DEMO_USER_SCRIPTS = [
  'สวัสดีค่ะ จากหน่วยงานไหนนะคะ ขอทราบชื่ออีกทีค่ะ',
  'ตกใจมากค่ะ ฉันไม่เคยไปยุ่งเกี่ยวกับเรื่องฟอกเงินเลยนะคะ',
  'ทำไมต้องโอนเงินด้วยคะ ขอโทรปรึกษาครอบครัวก่อนได้ไหม',
  'เดี๋ยวขอจดชื่อและเบอร์ติดต่อกลับเพื่อโทรเช็คกับสถานีตำรวจก่อนนะคะ',
  'ทำไมต้องขอรหัส OTP ด้วยคะ ธนาคารบอกว่าห้ามบอกใครเด็ดขาด',
  'ขอดูหมายจับหรือเอกสารราชการทางไลน์ก่อนได้ไหมคะ',
];

export class DemoScribeSession implements ScribeSession {
  private scriptIndex = 0;
  private chunkCount = 0;
  private isClosed = false;
  private isStreaming = false;
  private activeTimers: NodeJS.Timeout[] = [];
  private activeVoiceChunks = 0;

  constructor(
    readonly speaker: Speaker,
    private readonly callbacks: ScribeCallbacks,
    private readonly shouldAutoAdvance = true,
  ) {}

  sendAudioChunk(chunkBase64: string): void {
    if (this.isClosed) return;
    this.chunkCount++;

    // Calculate audio RMS to detect real speech activity
    let isVoiceActive = false;
    try {
      const buffer = Buffer.from(chunkBase64, 'base64');
      const numSamples = Math.floor(buffer.length / 2);
      if (numSamples > 0) {
        let sumSquares = 0;
        for (let i = 0; i < buffer.length - 1; i += 2) {
          const sample = buffer.readInt16LE(i);
          sumSquares += (sample / 32768) * (sample / 32768);
        }
        const rms = Math.sqrt(sumSquares / numSamples);
        isVoiceActive = rms > 0.015;
      }
    } catch {
      isVoiceActive = false;
    }

    if (isVoiceActive) {
      this.activeVoiceChunks++;
    }

    // Trigger transcript when actual voice activity is sustained (not when silent)
    if (this.shouldAutoAdvance && !this.isStreaming && this.activeVoiceChunks >= 4) {
      this.activeVoiceChunks = 0;
      const scripts = this.speaker === 'caller' ? DEMO_CALLER_SCRIPTS : DEMO_USER_SCRIPTS;
      const text = scripts[this.scriptIndex % scripts.length]!;
      this.scriptIndex++;
      void this.simulateStream(text);
    }
  }

  commit(): void {
    // no-op for demo
  }


  simulateStream(fullText: string, wordsPerStep = 2, stepIntervalMs = 60): Promise<void> {
    if (this.isClosed) return Promise.resolve();
    this.isStreaming = true;

    return new Promise((resolve) => {
      const words = fullText.split(' ');
      let currentWordIndex = 0;

      const step = () => {
        if (this.isClosed) {
          this.isStreaming = false;
          resolve();
          return;
        }

        currentWordIndex += wordsPerStep;
        if (currentWordIndex < words.length) {
          const partial = words.slice(0, currentWordIndex).join(' ');
          this.callbacks.onPartial(partial);
          const timer = setTimeout(step, stepIntervalMs);
          this.activeTimers.push(timer);
        } else {
          // Final partial before commit
          this.callbacks.onPartial(fullText);
          const finalTimer = setTimeout(() => {
            this.isStreaming = false;
            if (!this.isClosed) {
              this.callbacks.onCommitted(fullText);
            }
            resolve();
          }, stepIntervalMs);
          this.activeTimers.push(finalTimer);
        }
      };

      step();
    });
  }

  close(): void {
    this.isClosed = true;
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers = [];
    this.callbacks.onClose?.();
  }
}

export class DemoScribeProvider implements ScribeProvider {
  readonly name = 'demo-scribe-simulator';
  private activeSessions = new Set<DemoScribeSession>();

  constructor(private readonly autoAdvance = true) {}

  async createSession(speaker: Speaker, callbacks: ScribeCallbacks): Promise<ScribeSession> {

    const session = new DemoScribeSession(speaker, callbacks, this.autoAdvance);
    this.activeSessions.add(session);
    return session;
  }

  getActiveSessions(): DemoScribeSession[] {
    return Array.from(this.activeSessions);
  }
}
