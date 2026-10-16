import { AgentGuardrail } from "./agent-guardrail.js";
import type { AgentClient, AgentContextPacket, AgentReply } from "./types.js";
import WebSocket from "ws";

const ttsCache = new Map<string, string>();

const repeatedOpeningGreeting =
  /^(?:\s*\[[^\]\r\n]{1,30}\]\s*)*(?:(?:สวัสดี|หวัดดี)(?:ค่ะ|คะ|ครับ)?|(?:hello|hi|hey)(?:\s+there)?|good\s+(?:morning|afternoon|evening))[\s,!.:;–—-]*/iu;

export function removeRepeatedOpeningGreeting(
  text: string,
  hasPriorAgentTurn: boolean,
): string {
  const trimmed = text.trim();
  if (!hasPriorAgentTurn) return trimmed;

  const withoutGreeting = trimmed.replace(repeatedOpeningGreeting, "").trim();
  return withoutGreeting || trimmed;
}

export async function fetchElevenLabsTts(
  apiKey: string,
  text: string,
  voiceId = "cjVigY5qzO86Huf0OWal",
): Promise<string> {
  const cacheKey = `${voiceId}:${text.trim()}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) return cached;

  if (!apiKey) return "";
  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_16000`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.55,
            similarity_boost: 0.8,
          },
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (ttsRes.ok) {
      const arrayBuffer = await ttsRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      if (base64) {
        ttsCache.set(cacheKey, base64);
        return base64;
      }
    }
  } catch {
    // Graceful fallback
  }
  return "";
}

export class DemoAgentAdapter implements AgentClient {
  readonly name = "demo-decoy-agent-v1";

  async speakText(
    text: string,
    voiceId = "cjVigY5qzO86Huf0OWal",
  ): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return "";
    return fetchElevenLabsTts(apiKey, text, voiceId);
  }

  async generateReply(
    context: AgentContextPacket,
    latestCallerUtterance: string,
  ): Promise<AgentReply> {
    const rawText = latestCallerUtterance.trim();
    const text = rawText.toLowerCase();

    // Determine language based on utterance character frequencies and context fallback
    const thaiCount = (rawText.match(/[\u0E00-\u0E7F]/g) || []).length;
    const englishCount = (rawText.match(/[a-zA-Z]/g) || []).length;

    let language: 'th' | 'en';
    if (englishCount > thaiCount && englishCount >= 3) {
      language = 'en';
    } else if (thaiCount > englishCount && thaiCount >= 3) {
      language = 'th';
    } else if (context.language) {
      language = context.language;
    } else if (thaiCount > 0) {
      language = 'th';
    } else if (englishCount > 0) {
      language = 'en';
    } else {
      language = 'th';
    }

    let proposedText = "";

    if (language === "th") {
      // Thai Decoy Stalling & Counter-Interrogation
      if (/(otp|รหัส|pin|sms)/iu.test(text)) {
        proposedText =
          "รหัส OTP ยังไม่มี SMS ส่งเข้ามาเลยค่ะ หน้าจอแอปมันขึ้นเตือนสีแดงว่าห้ามแจ้งรหัสนี้แก่เจ้าหน้าที่ทุกกรณี เดี๋ยวขอโทรเช็คกับคอลเซ็นเตอร์ธนาคารก่อนนะคะ";
      } else if (
        /(โอนเงิน|โอนมา|บัญชีกลาง|ชำระ|ตรวจสอบเงิน|ฝาก)/iu.test(text)
      ) {
        proposedText =
          "ตอนนี้เงินเก็บทั้งหมดอยู่ในบัญชีเงินฝากประจำค่ะ ถ้าจะโอนต้องนำสมุดบัญชีไปเบิกที่สาขา ขอทราบชื่อบัญชีปลายทางและหน่วยงานที่รองรับอย่างเป็นทางการก่อนได้ไหมคะ";
      } else if (
        /(ตำรวจ|ผู้หมวด|สารวัตร|หมายจับ|ฟอกเงิน|คดี|ศาล|อัยการ)/iu.test(text)
      ) {
        proposedText =
          "ตกใจมากเลยค่ะคุณตำรวจ รบกวนขอทราบชื่อ-ยศเต็ม และสถานีตำรวจภูธรที่สังกัดได้ไหมคะ พอดีจะให้ผู้ใหญ่บ้านช่วยโทรประสานงานไปที่โรงพักค่ะ";
      } else if (
        /(ห้ามบอกใคร|ด่วน|เดี๋ยวนี้|ทันที|วางสาย|ปิดเงียบ)/iu.test(text)
      ) {
        proposedText =
          "อย่าเพิ่งเร่งเลยนะคะ หัวใจจะวายแล้วค่ะ ขอเวลานั่งเปิดเอกสารดูสักครู่หนึ่งนะคะ เอกสารหมายศาลเลขที่เท่าไหร่คะ";
      } else {
        proposedText =
          "ค่ะ ได้ยินแล้วค่ะ ขอรบกวนทวนชื่อเจ้าหน้าที่และหน่วยงานที่ติดต่อมาอีกครั้งได้ไหมคะ พอดีจะจดบันทึกไว้ค่ะ";
      }
    } else if (language === "en") {
      // English Decoy Stalling & Counter-Interrogation
      if (/(otp|code|pin|password|sms|verification)/iu.test(text)) {
        proposedText =
          "I have not received any OTP code yet. My banking app displays an explicit alert never to share security codes with anyone over the phone. Let me verify this with my bank fraud department first.";
      } else if (
        /(transfer|wire|safe account|deposit|pay|payment|funds|routing|freeze)/iu.test(
          text,
        )
      ) {
        proposedText =
          "All my funds are locked in a fixed-term deposit account. Any wire transfer requires an in-person branch verification with my passbook. Could you provide your official badge number, case reference, and registered agency details first?";
      } else if (
        /(police|officer|fbi|interpol|warrant|arrest|court|prosecutor|money laundering|criminal|illegal)/iu.test(
          text,
        )
      ) {
        proposedText =
          "This sounds very serious, Officer. Could you please state your full legal name, badge ID, and the exact station or agency you are calling from? I will have my attorney immediately cross-check this with the precinct.";
      } else if (
        /(urgent|immediately|right now|hurry|secret|don't hang up|do not tell|emergency)/iu.test(
          text,
        )
      ) {
        proposedText =
          "Please do not rush me. I need a moment to review this carefully. What is the formal case docket number and court jurisdiction for this matter?";
      } else {
        proposedText =
          "Yes, I hear you clearly. Could you please repeat your name and the department you represent so that I can document it for my records?";
      }
    } else {
      // Non-Thai and non-English unsupported language
      proposedText =
        "ระบบ ScamTrap รองรับการสนทนาเฉพาะภาษาไทยและภาษาอังกฤษเท่านั้นค่ะ / ScamTrap decoy system only supports Thai and English language communications.";
    }

    // Always sanitize through AgentGuardrail
    const guardrail = AgentGuardrail.sanitize(proposedText);

    let audioBase64: string | undefined;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (apiKey && process.env.NODE_ENV !== "test") {
      const isThaiReply = /[\u0E00-\u0E7F]/.test(guardrail.sanitizedText);
      const decoyVoiceId = isThaiReply ? "nealpwJT5tCyJFKDzEq8" : "cjVigY5qzO86Huf0OWal";
      const audio = await fetchElevenLabsTts(
        apiKey,
        guardrail.sanitizedText,
        decoyVoiceId,
      );
      if (audio) audioBase64 = audio;
    }

    return {
      text: guardrail.sanitizedText,
      ...(audioBase64 ? { audioBase64 } : {}),
    };
  }
}

export class ElevenLabsAgentClient implements AgentClient {
  readonly name = "elevenlabs-convai-v1";
  private readonly voiceId: string = "cjVigY5qzO86Huf0OWal"; // ScamTrap Assistant agent voice

  constructor(
    private readonly apiKey: string,
    private readonly agentId: string,
    voiceId?: string,
  ) {
    if (voiceId) this.voiceId = voiceId;
  }

  async speakText(text: string, voiceId?: string): Promise<string> {
    if (!this.apiKey) return "";
    return fetchElevenLabsTts(this.apiKey, text, voiceId || this.voiceId);
  }

  async generateReply(
    context: AgentContextPacket,
    latestCallerUtterance: string,
  ): Promise<AgentReply> {
    if (!this.apiKey || !this.agentId)
      throw new Error("ELEVENLABS_AGENT_NOT_CONFIGURED");

    const endpoint = new URL(
      "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
    );
    endpoint.searchParams.set("agent_id", this.agentId);
    const signedUrlResponse = await fetch(endpoint, {
      headers: { "xi-api-key": this.apiKey, accept: "application/json" },
    });
    if (!signedUrlResponse.ok) {
      throw new Error(`ELEVENLABS_SIGNED_URL_HTTP_${signedUrlResponse.status}`);
    }
    const payload = (await signedUrlResponse.json()) as { signed_url?: string };
    if (!payload.signed_url) throw new Error("ELEVENLABS_SIGNED_URL_MISSING");

    return new Promise<AgentReply>((resolve, reject) => {
      const socket = new WebSocket(payload.signed_url!);
      const audioChunks: Buffer[] = [];
      let responseText = "";
      let settled = false;
      let finishTimer: ReturnType<typeof setTimeout> | undefined;

      const timeout = setTimeout(
        () => finish(new Error("ELEVENLABS_AGENT_TIMEOUT")),
        20_000,
      );
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
          reject(new Error("ELEVENLABS_AGENT_EMPTY_RESPONSE"));
          return;
        }
        const guardrail = AgentGuardrail.sanitize(responseText);
        const normalizedText = removeRepeatedOpeningGreeting(
          guardrail.sanitizedText,
          context.hasPriorAgentTurn,
        );
        const audioMatchesText = normalizedText === responseText;
        resolve({
          text: normalizedText,
          ...(audioMatchesText && audioChunks.length > 0
            ? { audioBase64: Buffer.concat(audioChunks).toString("base64") }
            : {}),
        });
      };

      const scheduleFinish = () => {
        if (finishTimer) clearTimeout(finishTimer);
        finishTimer = setTimeout(() => finish(), 900);
      };

      socket.on("open", () => {
        socket.send(
          JSON.stringify({
            type: "contextual_update",
            text: context.systemPrompt,
          }),
        );
        socket.send(
          JSON.stringify({ type: "user_message", text: latestCallerUtterance }),
        );
      });

      socket.on("message", (raw) => {
        try {
          const event = JSON.parse(raw.toString()) as Record<string, any>;
          if (
            event.type === "ping" &&
            event.ping_event?.event_id !== undefined
          ) {
            socket.send(
              JSON.stringify({
                type: "pong",
                event_id: event.ping_event.event_id,
              }),
            );
          } else if (event.type === "agent_response") {
            responseText = String(
              event.agent_response_event?.agent_response ?? "",
            );
            scheduleFinish();
          } else if (
            event.type === "audio" &&
            event.audio_event?.audio_base_64
          ) {
            audioChunks.push(
              Buffer.from(String(event.audio_event.audio_base_64), "base64"),
            );
            if (responseText) scheduleFinish();
          } else if (event.type === "client_error") {
            finish(new Error(String(event.error ?? "ELEVENLABS_AGENT_ERROR")));
          }
        } catch {
          // Ignore keepalive or unknown events from the provider.
        }
      });
      socket.on("error", (error) => finish(error));
      socket.on("close", () => {
        if (!settled)
          finish(
            responseText ? undefined : new Error("ELEVENLABS_AGENT_CLOSED"),
          );
      });
    });
  }
}
