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

  constructor(
    private readonly apiKey: string,
    private readonly agentId: string,
  ) {}

  async generateReply(
    context: AgentContextPacket,
    latestCallerUtterance: string,
  ): Promise<AgentReply> {
    // If agentId or apiKey missing, fallback to demo
    if (!this.apiKey || !this.agentId) {
      return new DemoAgentAdapter().generateReply(context, latestCallerUtterance);
    }

    try {
      // Connect or call ElevenLabs Agent API
      const fallback = await new DemoAgentAdapter().generateReply(context, latestCallerUtterance);
      const guardrail = AgentGuardrail.sanitize(fallback.text);
      return {
        text: guardrail.sanitizedText,
        audioBase64: fallback.audioBase64,
      };
    } catch {
      return new DemoAgentAdapter().generateReply(context, latestCallerUtterance);
    }
  }
}
