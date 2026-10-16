import { describe, expect, it } from "vitest";
import { removeRepeatedOpeningGreeting } from "./agent-client.js";

describe("removeRepeatedOpeningGreeting", () => {
  it("keeps the greeting on the first agent turn", () => {
    const text = "[polite] สวัสดีค่ะ ดิฉันขอรับช่วงสายแทนนะคะ";

    expect(removeRepeatedOpeningGreeting(text, false)).toBe(text);
  });

  it("removes a Thai greeting from a follow-up turn", () => {
    expect(
      removeRepeatedOpeningGreeting(
        "[polite] สวัสดีค่ะ ขอทราบหมายเลขประจำตัวเจ้าหน้าที่ได้ไหมคะ",
        true,
      ),
    ).toBe("ขอทราบหมายเลขประจำตัวเจ้าหน้าที่ได้ไหมคะ");
  });

  it("removes an English greeting from a follow-up turn", () => {
    expect(
      removeRepeatedOpeningGreeting(
        "Hello there, could you repeat your badge number?",
        true,
      ),
    ).toBe("could you repeat your badge number?");
  });
});

describe("DemoAgentAdapter bilingual responses", () => {
  it("generates English reply when caller asks in English", async () => {
    const { DemoAgentAdapter } = await import("./agent-client.js");
    const adapter = new DemoAgentAdapter();
    const context = {
      sessionId: "session-en",
      hasPriorAgentTurn: false,
      callerClaims: [],
      knownEntities: [],
      unresolvedQuestions: [],
      recentDialogue: [],
      systemPrompt: "You are the ScamTrap AI Decoy Agent",
      language: "en" as const,
    };

    const otpReply = await adapter.generateReply(context, "Give me your OTP code right now!");
    expect(otpReply.text).toContain("I have not received any OTP code yet");

    const transferReply = await adapter.generateReply(context, "You must wire transfer funds to the safe account");
    expect(transferReply.text).toContain("All my funds are locked in a fixed-term deposit account");

    const generalReply = await adapter.generateReply(context, "Who is this?");
    expect(generalReply.text).toContain("Yes, I hear you clearly. Could you please repeat your name");
  });

  it("generates Thai reply when caller asks in Thai", async () => {
    const { DemoAgentAdapter } = await import("./agent-client.js");
    const adapter = new DemoAgentAdapter();
    const context = {
      sessionId: "session-th",
      hasPriorAgentTurn: false,
      callerClaims: [],
      knownEntities: [],
      unresolvedQuestions: [],
      recentDialogue: [],
      systemPrompt: "คุณคือ AI Decoy",
      language: "th" as const,
    };

    const otpReply = await adapter.generateReply(context, "ส่งรหัส OTP มาเดี๋ยวนี้เลย");
    expect(otpReply.text).toContain("รหัส OTP ยังไม่มี SMS ส่งเข้ามาเลยค่ะ");

    const transferReply = await adapter.generateReply(context, "ให้รีบโอนเงินมาตรวจสอบบัญชีกลาง");
    expect(transferReply.text).toContain("ตอนนี้เงินเก็บทั้งหมดอยู่ในบัญชีเงินฝากประจำค่ะ");

    const generalReply = await adapter.generateReply(context, "คุณคือใคร");
    expect(generalReply.text).toContain("ค่ะ ได้ยินแล้วค่ะ ขอรบกวนทวนชื่อเจ้าหน้าที่");
  });
});
