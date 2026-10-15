import { AgentGuardrail } from './agent-guardrail.js';
import type { AgentClient, AgentContextPacket, AgentReply } from './types.js';

export class DemoAgentAdapter implements AgentClient {
  readonly name = 'demo-decoy-agent-v1';

  async generateReply(
    context: AgentContextPacket,
    latestCallerUtterance: string,
  ): Promise<AgentReply> {
    const text = latestCallerUtterance.toLowerCase();
    let proposedText = '';

    if (/(otp|รหัส|pin)/iu.test(text)) {
      proposedText =
        'รหัส OTP ยังไม่มี SMS ส่งเข้ามาเลยค่ะ หน้าจอแอปมันขึ้นเตือนสีแดงว่าห้ามแจ้งรหัสนี้แก่เจ้าหน้าที่ทุกกรณี เดี๋ยวขอโทรเช็คกับคอลเซ็นเตอร์ธนาคารก่อนนะคะ';
    } else if (/(โอนเงิน|โอนมา|บัญชีกลาง|ชำระ)/iu.test(text)) {
      proposedText =
        'ตอนนี้เงินเก็บทั้งหมดอยู่ในบัญชีเงินฝากประจำค่ะ ถ้าจะโอนต้องนำสมุดบัญชีไปเบิกที่สาขา ขอทราบชื่อบัญชีปลายทางและหน่วยงานที่รองรับอย่างเป็นทางการก่อนได้ไหมคะ';
    } else if (/(ตำรวจ|ผู้หมวด|สารวัตร|หมายจับ|ฟอกเงิน|คดี)/iu.test(text)) {
      proposedText =
        'ตกใจมากเลยค่ะคุณตำรวจ รบกวนขอทราบชื่อ-ยศเต็ม และสถานีตำรวจภูธรที่สังกัดได้ไหมคะ พอดีจะให้ผู้ใหญ่บ้านช่วยโทรประสานงานไปที่โรงพักค่ะ';
    } else if (/(ห้ามบอกใคร|ด่วน|เดี๋ยวนี้|ทันที)/iu.test(text)) {
      proposedText =
        'อย่าเพิ่งเร่งเลยนะคะ หัวใจจะวายแล้วค่ะ ขอเวลานั่งเปิดเอกสารดูสักครู่หนึ่งนะคะ เอกสารหมายศาลเลขที่เท่าไหร่คะ';
    } else {
      proposedText =
        'ค่ะ ได้ยินแล้วค่ะ ขอรบกวนทวนชื่อเจ้าหน้าที่และหน่วยงานที่ติดต่อมาอีกครั้งได้ไหมคะ พอดีจะจดบันทึกไว้ค่ะ';
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
              text: textToSpeak,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
              },
            }),
            signal: AbortSignal.timeout(6000),
          },
        );
        if (ttsRes.ok) {
          const arrayBuffer = await ttsRes.arrayBuffer();
          audioBase64 = Buffer.from(arrayBuffer).toString('base64');
        }
      } catch {
        // Fallback to demo audio on network timeout
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

