import { AgentGuardrail } from './agent-guardrail.js';
import type { AgentClient, AgentContextPacket, AgentReply } from './types.js';
import WebSocket from 'ws';

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

    return {
      text: guardrail.sanitizedText,
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
    if (!this.apiKey || !this.agentId) throw new Error('ELEVENLABS_AGENT_NOT_CONFIGURED');

    const endpoint = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');
    endpoint.searchParams.set('agent_id', this.agentId);
    const signedUrlResponse = await fetch(endpoint, {
      headers: { 'xi-api-key': this.apiKey, accept: 'application/json' },
    });
    if (!signedUrlResponse.ok) {
      throw new Error(`ELEVENLABS_SIGNED_URL_HTTP_${signedUrlResponse.status}`);
    }
    const payload = (await signedUrlResponse.json()) as { signed_url?: string };
    if (!payload.signed_url) throw new Error('ELEVENLABS_SIGNED_URL_MISSING');

    return new Promise<AgentReply>((resolve, reject) => {
      const socket = new WebSocket(payload.signed_url!);
      const audioChunks: Buffer[] = [];
      let responseText = '';
      let settled = false;
      let finishTimer: ReturnType<typeof setTimeout> | undefined;

      const timeout = setTimeout(() => finish(new Error('ELEVENLABS_AGENT_TIMEOUT')), 20_000);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (finishTimer) clearTimeout(finishTimer);
        try {
          socket.close();
        } catch {
          // Connection may already be closed.
        }
        if (error) {
          reject(error);
          return;
        }
        if (!responseText.trim()) {
          reject(new Error('ELEVENLABS_AGENT_EMPTY_RESPONSE'));
          return;
        }
        const guardrail = AgentGuardrail.sanitize(responseText);
        const audioWasSafe = guardrail.sanitizedText === responseText;
        resolve({
          text: guardrail.sanitizedText,
          ...(audioWasSafe && audioChunks.length > 0
            ? { audioBase64: Buffer.concat(audioChunks).toString('base64') }
            : {}),
        });
      };

      const scheduleFinish = () => {
        if (finishTimer) clearTimeout(finishTimer);
        finishTimer = setTimeout(() => finish(), 900);
      };

      socket.on('open', () => {
        socket.send(JSON.stringify({ type: 'contextual_update', text: context.systemPrompt }));
        socket.send(JSON.stringify({ type: 'user_message', text: latestCallerUtterance }));
      });

      socket.on('message', (raw) => {
        try {
          const event = JSON.parse(raw.toString()) as Record<string, any>;
          if (event.type === 'ping' && event.ping_event?.event_id !== undefined) {
            socket.send(JSON.stringify({ type: 'pong', event_id: event.ping_event.event_id }));
          } else if (event.type === 'agent_response') {
            responseText = String(event.agent_response_event?.agent_response ?? '');
            scheduleFinish();
          } else if (event.type === 'audio' && event.audio_event?.audio_base_64) {
            audioChunks.push(Buffer.from(String(event.audio_event.audio_base_64), 'base64'));
            if (responseText) scheduleFinish();
          } else if (event.type === 'client_error') {
            finish(new Error(String(event.error ?? 'ELEVENLABS_AGENT_ERROR')));
          }
        } catch {
          // Ignore keepalive or unknown events from the provider.
        }
      });
      socket.on('error', (error) => finish(error));
      socket.on('close', () => {
        if (!settled) finish(responseText ? undefined : new Error('ELEVENLABS_AGENT_CLOSED'));
      });
    });
  }
}
