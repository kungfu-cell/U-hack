import { describe, expect, it } from "vitest";
import { analysisResultSchema } from "@scamtrap/contracts";
import { DemoAnalysisProvider } from "./demo-analyzer.js";

const provider = new DemoAnalysisProvider();

describe("DemoAnalysisProvider", () => {
  it("flags an authority threat combined with an urgent transfer request", async () => {
    const result = await provider.analyzeText({
      sourceId: "input-1",
      text: "ผมเป็นเจ้าหน้าที่ตำรวจ บัญชีคุณเกี่ยวกับคดีฟอกเงิน ให้โอนเงินมาตรวจสอบทันที",
      isDemo: true,
    });

    expect(result.level).toBe("critical");
    expect(analysisResultSchema.safeParse(result).success).toBe(true);
    expect(result.evidence.map((item) => item.tactic)).toContain(
      "money_transfer_request",
    );
  });

  it("does not treat an OTP safety warning as a request for the OTP", async () => {
    const result = await provider.analyzeText({
      sourceId: "input-2",
      text: "อย่าบอก OTP หรือรหัสผ่านกับใครเด็ดขาด",
      isDemo: true,
    });

    expect(result.evidence.map((item) => item.tactic)).not.toContain(
      "secret_request",
    );
  });

  it("flags an OTP request without storing the secret value as an entity", async () => {
    const result = await provider.analyzeText({
      sourceId: "input-secret",
      text: "ส่ง OTP 123456 มาให้เจ้าหน้าที่ทันที",
      isDemo: true,
    });

    expect(result.secretRequestDetected).toBe(true);
    expect(result.entities.some((entity) => entity.type === "otp")).toBe(false);
    expect(
      result.entities.some((entity) => entity.value.includes("123456")),
    ).toBe(false);
  });

  it("extracts URLs without claiming they are safe", async () => {
    const result = await provider.analyzeText({
      sourceId: "input-3",
      text: "ตรวจสอบที่ https://example.test/path",
      isDemo: true,
    });

    expect(result.entities[0]?.type).toBe("url");
    expect(result.threatChecks).toEqual([]);
    expect(result.limitations.join(" ")).toContain(
      "ไม่ได้ยืนยันว่าข้อมูลปลอดภัย",
    );
  });

  it("normalizes the URL host without changing a case-sensitive path", async () => {
    const result = await provider.analyzeText({
      sourceId: "input-url-case",
      text: "https://EXAMPLE.test/ResetToken?Code=AbC",
      isDemo: true,
    });

    expect(result.entities[0]?.normalizedValue).toBe(
      "https://example.test/ResetToken?Code=AbC",
    );
  });

  it("returns every evidence span in source order", async () => {
    const text = "เจ้าหน้าที่แจ้งว่ามีหมายจับ ห้ามบอกใคร และให้โอนเงินมาทันที";
    const result = await provider.analyzeText({
      sourceId: "input-4",
      text,
      isDemo: true,
    });

    expect(result.evidence.length).toBeGreaterThanOrEqual(5);
    expect(result.evidence.map((item) => item.start)).toEqual(
      [...result.evidence.map((item) => item.start)].sort(
        (left, right) => left - right,
      ),
    );
    for (const evidence of result.evidence) {
      expect(text.slice(evidence.start, evidence.end)).toBe(evidence.quote);
    }
  });

  it("scores a tactic once even when the same tactic appears repeatedly", async () => {
    const once = await provider.analyzeText({
      sourceId: "input-5",
      text: "ให้โอนเงินมา",
      isDemo: true,
    });
    const repeated = await provider.analyzeText({
      sourceId: "input-6",
      text: "ให้โอนเงินมา แล้วโอนเงินมาอีกครั้ง",
      isDemo: true,
    });

    expect(repeated.evidence.length).toBeGreaterThan(once.evidence.length);
    expect(repeated.score).toBe(once.score);
  });

  it("extracts and normalizes contact and payment indicators", async () => {
    const result = await provider.analyzeText({
      sourceId: "input-7",
      text: [
        "บัญชี 123-4-56789-0",
        "โทร +66 81 234 5678",
        "LINE ID: Scam.Test",
        "อีเมล Test@Example.com",
        "ธนาคารกสิกรไทย",
        "ชื่อบัญชี สมชาย ใจดี",
        "จำนวน 12,500.50 บาท",
      ].join(" "),
      isDemo: true,
    });

    expect(result.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "bank_account",
          normalizedValue: "1234567890",
        }),
        expect.objectContaining({
          type: "phone",
          normalizedValue: "0812345678",
        }),
        expect.objectContaining({
          type: "line_id",
          normalizedValue: "scam.test",
        }),
        expect.objectContaining({
          type: "email",
          normalizedValue: "test@example.com",
        }),
        expect.objectContaining({
          type: "bank_name",
          normalizedValue: "kasikornbank",
        }),
        expect.objectContaining({
          type: "account_holder",
          normalizedValue: "สมชาย ใจดี",
        }),
        expect.objectContaining({
          type: "money_amount",
          normalizedValue: "12500.50 THB",
        }),
      ]),
    );
  });

  it("does not classify a contextual bank account as a phone number", async () => {
    const result = await provider.analyzeText({
      sourceId: "input-8",
      text: "เลขบัญชี 0812345678",
      isDemo: true,
    });

    expect(result.entities.map((entity) => entity.type)).toEqual([
      "bank_account",
    ]);
  });
});
