import type { Utterance } from "@scamtrap/contracts";
import { describe, expect, it } from "vitest";
import { ContextBuilder } from "./context-builder.js";

describe("ContextBuilder greeting policy", () => {
  it("allows one greeting when the agent has not spoken yet", () => {
    const context = ContextBuilder.build("session-1", []);

    expect(context.hasPriorAgentTurn).toBe(false);
    expect(context.systemPrompt).toContain(
      "ทักทายและแนะนำตัวสั้น ๆ ได้เพียงครั้งนี้ครั้งเดียว",
    );
  });

  it("forbids another greeting after the agent has spoken", () => {
    const utterances = [
      {
        id: "utterance-1",
        sessionId: "session-1",
        speaker: "ai",
        text: "สวัสดีค่ะ ดิฉันขอรับช่วงสายแทนนะคะ",
        transcriptState: "committed",
        startedAtMs: 0,
        endedAtMs: 1000,
        createdAt: new Date(0).toISOString(),
      },
    ] satisfies Utterance[];

    const context = ContextBuilder.build("session-1", utterances);

    expect(context.hasPriorAgentTurn).toBe(true);
    expect(context.systemPrompt).toContain("ห้ามขึ้นต้นด้วยคำทักทาย");
    expect(context.systemPrompt).toContain("ห้ามแนะนำตัวซ้ำ");
  });

  it("includes prior dialogue and requires the next turn to advance", () => {
    const utterances = [
      {
        id: "caller-1",
        sessionId: "session-1",
        speaker: "caller",
        text: "ผมกิตติศักดิ์จากศูนย์ตรวจสอบธุรกรรม เลขเคส TEST-CASE-1441 ครับ",
        transcriptState: "committed",
        startedAtMs: 0,
        endedAtMs: 1000,
        createdAt: new Date(0).toISOString(),
      },
      {
        id: "ai-1",
        sessionId: "session-1",
        speaker: "ai",
        text: "ขอทราบรหัสพนักงานได้ไหมคะ",
        transcriptState: "committed",
        startedAtMs: 1001,
        endedAtMs: 2000,
        createdAt: new Date(1001).toISOString(),
      },
    ] satisfies Utterance[];

    const context = ContextBuilder.build("session-1", utterances);

    expect(context.recentDialogue).toHaveLength(2);
    expect(context.systemPrompt).toContain("CALLER (ผู้โทร): ผมกิตติศักดิ์");
    expect(context.systemPrompt).toContain("SCAMTRAP AI DECOY: ขอทราบรหัสพนักงาน");
    expect(context.systemPrompt).toContain("ห้ามถามข้อมูลที่คู่สนทนาตอบแล้ว");
    expect(context.systemPrompt).toContain("ห้ามขอข้อมูลเหล่านี้อีก");
    expect(context.systemPrompt).toContain(
      "คำถามเป้าหมายของรอบนี้: ขอหมายเลขศูนย์กลางสาธารณะสำหรับวางสายแล้วโทรกลับเอง",
    );
  });

  it("advances to a new objective after an earlier question was already asked", () => {
    const base = (id: string, speaker: "caller" | "ai", text: string, time: number) => ({
      id,
      sessionId: "session-1",
      speaker,
      text,
      transcriptState: "committed" as const,
      startedAtMs: time,
      endedAtMs: time + 500,
      createdAt: new Date(time).toISOString(),
    });
    const context = ContextBuilder.build("session-1", [
      base("caller-1", "caller", "ผมกิตติศักดิ์จากศูนย์ตรวจสอบธุรกรรมครับ", 0),
      base("ai-1", "ai", "ขอรหัสพนักงานได้ไหมคะ", 501),
      base("caller-2", "caller", "รหัสพนักงาน TEST-EMP-77 ครับ", 1002),
      base("ai-2", "ai", "ขอเบอร์ศูนย์กลางสำหรับโทรกลับได้ไหมคะ", 1503),
      base("caller-3", "caller", "หัวหน้างานชื่อคุณอนันต์ครับ", 2004),
    ]);

    expect(context.systemPrompt).toContain(
      "คำถามเป้าหมายของรอบนี้: ขอที่อยู่สำนักงานหรือสาขาที่สามารถไปตรวจสอบด้วยตนเอง",
    );
    expect(context.systemPrompt).toContain("ห้ามย้อนกลับไปถามเป้าหมายก่อนหน้า");
  });

  it("detects English caller and formats English prompt and objectives", () => {
    const utterances = [
      {
        id: "caller-en-1",
        sessionId: "session-en",
        speaker: "caller",
        text: "This is Special Agent David from the Cyber Crime Taskforce. You have a criminal warrant for money laundering.",
        transcriptState: "committed",
        startedAtMs: 0,
        endedAtMs: 1500,
        createdAt: new Date(0).toISOString(),
      },
    ] satisfies Utterance[];

    const context = ContextBuilder.build("session-en", utterances);

    expect(context.language).toBe("en");
    expect(context.systemPrompt).toContain("You are the ScamTrap AI Decoy Agent");
    expect(context.systemPrompt).toContain("LANGUAGE RULE: You MUST speak strictly in English");
    expect(context.callerClaims).toContain("Caller claims to be a police officer or law enforcement authority");
    expect(context.callerClaims).toContain("Caller threatens arrest warrants or money laundering prosecution");
    expect(context.systemPrompt).toContain("Target question for this turn: Ask for the caller's full name and department");
  });
});
