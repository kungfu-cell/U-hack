import { AgentGuardrail } from './agent-guardrail.js';
import type { AgentClient, AgentContextPacket, AgentReply } from './types.js';

export class DemoAgentAdapter implements AgentClient {
  readonly name = 'demo-decoy-agent-v1';

  async generateReply(
    context: AgentContextPacket,
    latestCallerUtterance: string,
  ): Promise<AgentReply> {
    const rawText = latestCallerUtterance.trim();
    const text = rawText.toLowerCase();

    // Check language: Thai or English strictly
    const hasThai = /[\u0E00-\u0E7F]/.test(rawText);
    const hasEnglish = /[a-zA-Z]/.test(rawText);

    let proposedText = '';

    if (hasThai) {
      // Thai Decoy Stalling & Counter-Interrogation
      if (/(otp|รหัส|pin|sms)/iu.test(text)) {
        proposedText =
          'รหัส OTP ยังไม่มี SMS ส่งเข้ามาเลยค่ะ หน้าจอแอปมันขึ้นเตือนสีแดงว่าห้ามแจ้งรหัสนี้แก่เจ้าหน้าที่ทุกกรณี เดี๋ยวขอโทรเช็คกับคอลเซ็นเตอร์ธนาคารก่อนนะคะ';
      } else if (/(โอนเงิน|โอนมา|บัญชีกลาง|ชำระ|ตรวจสอบเงิน|ฝาก)/iu.test(text)) {
        proposedText =
          'ตอนนี้เงินเก็บทั้งหมดอยู่ในบัญชีเงินฝากประจำค่ะ ถ้าจะโอนต้องนำสมุดบัญชีไปเบิกที่สาขา ขอทราบชื่อบัญชีปลายทางและหน่วยงานที่รองรับอย่างเป็นทางการก่อนได้ไหมคะ';
      } else if (/(ตำรวจ|ผู้หมวด|สารวัตร|หมายจับ|ฟอกเงิน|คดี|ศาล|อัยการ)/iu.test(text)) {
        proposedText =
          'ตกใจมากเลยค่ะคุณตำรวจ รบกวนขอทราบชื่อ-ยศเต็ม และสถานีตำรวจภูธรที่สังกัดได้ไหมคะ พอดีจะให้ผู้ใหญ่บ้านช่วยโทรประสานงานไปที่โรงพักค่ะ';
      } else if (/(ห้ามบอกใคร|ด่วน|เดี๋ยวนี้|ทันที|วางสาย|ปิดเงียบ)/iu.test(text)) {
        proposedText =
          'อย่าเพิ่งเร่งเลยนะคะ หัวใจจะวายแล้วค่ะ ขอเวลานั่งเปิดเอกสารดูสักครู่หนึ่งนะคะ เอกสารหมายศาลเลขที่เท่าไหร่คะ';
      } else {
        proposedText =
          'ค่ะ ได้ยินแล้วค่ะ ขอรบกวนทวนชื่อเจ้าหน้าที่และหน่วยงานที่ติดต่อมาอีกครั้งได้ไหมคะ พอดีจะจดบันทึกไว้ค่ะ';
      }
    } else if (hasEnglish) {
      // English Decoy Stalling & Counter-Interrogation
      if (/(otp|code|pin|password|sms|verification)/iu.test(text)) {
        proposedText =
          'I have not received any OTP code yet. My banking app displays an explicit alert never to share security codes with anyone over the phone. Let me verify this with my bank fraud department first.';
      } else if (/(transfer|wire|safe account|deposit|pay|payment|funds|routing|freeze)/iu.test(text)) {
        proposedText =
          'All my funds are locked in a fixed-term deposit account. Any wire transfer requires an in-person branch verification with my passbook. Could you provide your official badge number, case reference, and registered agency details first?';
      } else if (/(police|officer|fbi|interpol|warrant|arrest|court|prosecutor|money laundering|criminal|illegal)/iu.test(text)) {
        proposedText =
          'This sounds very serious, Officer. Could you please state your full legal name, badge ID, and the exact station or agency you are calling from? I will have my attorney immediately cross-check this with the precinct.';
      } else if (/(urgent|immediately|right now|hurry|secret|don't hang up|do not tell|emergency)/iu.test(text)) {
        proposedText =
          'Please do not rush me. I need a moment to review this carefully. What is the formal case docket number and court jurisdiction for this matter?';
      } else {
        proposedText =
          'Yes, I hear you clearly. Could you please repeat your name and the department you represent so that I can document it for my records?';
      }
    } else {
      // Non-Thai and non-English unsupported language
      proposedText =
        'ระบบ ScamTrap รองรับการสนทนาเฉพาะภาษาไทยและภาษาอังกฤษเท่านั้นค่ะ / ScamTrap decoy system only supports Thai and English language communications.';
    }

    // Always sanitize through AgentGuardrail
    const guardrail = AgentGuardrail.sanitize(proposedText);

    // Generate lightweight mock PCM audio chunk (16kHz 16-bit silence/soft tone)
    const mockPcmChunk = Buffer.alloc(3200).toString('base64'); // ~100ms frame

    return {
      text: guardrail.sanitizedText,
      audioBase64: mockPcmChunk,
    };
  }
}

export class ElevenLabsAgentClient implements AgentClient {
  readonly name = 'elevenlabs-convai-v1';
  private readonly voiceId: string = 'cjVigY5qzO86Huf0OWal'; // ScamTrap Assistant agent voice

  constructor(
    private readonly apiKey: string,
    private readonly agentId: string,
    voiceId?: string,
  ) {
    if (voiceId) this.voiceId = voiceId;
  }

  async speakText(text: string): Promise<string> {
    if (!this.apiKey) return '';
    try {
      const ttsRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=pcm_16000`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.55,
              similarity_boost: 0.8,
            },
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (ttsRes.ok) {
        const arrayBuffer = await ttsRes.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
      }
    } catch {
      // Fallback
    }
    return '';
  }

  async generateReply(
    context: AgentContextPacket,
    latestCallerUtterance: string,
  ): Promise<AgentReply> {
    if (!this.apiKey || !this.agentId) {
      return new DemoAgentAdapter().generateReply(context, latestCallerUtterance);
    }

    try {
      const demoReply = await new DemoAgentAdapter().generateReply(context, latestCallerUtterance);
      const guardrail = AgentGuardrail.sanitize(demoReply.text);
      const textToSpeak = guardrail.sanitizedText;

      let audioBase64 = demoReply.audioBase64;
      const liveAudio = await this.speakText(textToSpeak);
      if (liveAudio) {
        audioBase64 = liveAudio;
      }

      return {
        text: textToSpeak,
        audioBase64,
      };
    } catch {
      return new DemoAgentAdapter().generateReply(context, latestCallerUtterance);
    }
  }
}

