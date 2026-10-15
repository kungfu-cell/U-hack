import { describe, expect, it } from "vitest";
import { analysisResultSchema } from "@scamtrap/contracts";
import { GoogleSafeBrowsingProvider } from "./google-safe-browsing.js";
import { OpenAIAnalysisProvider } from "./openai-analyzer.js";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("GoogleSafeBrowsingProvider", () => {
  it("checks the submitted URL without opening it", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      requestedUrl = input.toString();
      return jsonResponse({
        threats: [
          {
            url: "https://example.test/login",
            threatTypes: ["SOCIAL_ENGINEERING"],
          },
        ],
        cacheDuration: "300s",
      });
    };
    const provider = new GoogleSafeBrowsingProvider("test-key", fetchImpl);

    const result = await provider.checkIndicator("https://example.test/login");

    expect(result.status).toBe("match");
    expect(result.threatType).toBe("SOCIAL_ENGINEERING");
    expect(requestedUrl).toContain("urls=https%3A%2F%2Fexample.test%2Flogin");
    expect(requestedUrl).toContain("key=test-key");
  });

  it("does not describe an absent lookup result as safe", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({});
    const provider = new GoogleSafeBrowsingProvider("test-key", fetchImpl);

    const result = await provider.checkIndicator("https://example.test");

    expect(result.status).toBe("not_found");
    expect(result.message).toContain("ไม่ได้ยืนยัน");
  });

  it("decodes the protobuf response used by Safe Browsing v5", async () => {
    const urlBytes = new TextEncoder().encode("https://example.test/login");
    const threat = Uint8Array.from([10, urlBytes.length, ...urlBytes, 18, 2, 1, 2]);
    const fetchImpl: typeof fetch = async () =>
      new Response(Uint8Array.from([10, threat.length, ...threat]), {
        status: 200,
        headers: { "content-type": "application/x-protobuf" },
      });
    const provider = new GoogleSafeBrowsingProvider("test-key", fetchImpl);

    const result = await provider.checkIndicator("https://example.test/login");

    expect(result.status).toBe("match");
    expect(result.threatType).toBe("MALWARE,SOCIAL_ENGINEERING");
  });
});

describe("OpenAIAnalysisProvider", () => {
  it("redacts sensitive entities and accepts only exact source quotes", async () => {
    let requestBody = "";
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return jsonResponse({
        output_text: JSON.stringify({
          summary: "พบคำขอให้โอนเงิน",
          recommendation: "อย่าโอนเงินและตรวจสอบผ่านช่องทางทางการ",
          findings: [
            {
              tactic: "money_transfer_request",
              quote: "ให้โอนเงินทันที",
              explanation: "มีการขอให้ทำธุรกรรมอย่างเร่งด่วน",
            },
            {
              tactic: "urgency",
              quote: "ข้อความที่ไม่มีอยู่จริง",
              explanation: "หลักฐานนี้ต้องถูกปฏิเสธ",
            },
          ],
        }),
      });
    };
    const provider = new OpenAIAnalysisProvider({
      apiKey: "openai-test-key",
      fetchImpl,
    });
    const text = "บัญชี 123-4-56789-0 ให้โอนเงินทันที";

    const result = await provider.analyzeText({
      sourceId: "source-1",
      text,
      isDemo: false,
    });

    expect(requestBody).not.toContain("123-4-56789-0");
    expect(requestBody).toContain("[REDACTED_BANK_ACCOUNT_1]");
    expect(
      result.evidence.some((item) => item.quote === "ให้โอนเงินทันที"),
    ).toBe(true);
    expect(
      result.evidence.some((item) => item.quote === "ข้อความที่ไม่มีอยู่จริง"),
    ).toBe(false);
    expect(result.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "bank_account",
          normalizedValue: "1234567890",
        }),
      ]),
    );
    expect(result.scoreVersion).toBe("scamtrap-risk-v1");
  });

  it("falls back to deterministic rules when the semantic provider fails", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({}, 503);
    const provider = new OpenAIAnalysisProvider({
      apiKey: "test-key",
      fetchImpl,
    });

    const result = await provider.analyzeText({
      sourceId: "source-2",
      text: "ผมเป็นตำรวจ ให้โอนเงินทันที",
      isDemo: false,
    });

    expect(result.status).toBe("completed");
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.limitations.join(" ")).toContain("Semantic classifier");
  });

  it("keeps technical verification separate from the risk level", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({
        output_text: JSON.stringify({
          summary: "พบ URL สำหรับตรวจสอบ",
          recommendation: "อย่าเปิด URL จนกว่าจะตรวจสอบแหล่งที่มา",
          findings: [],
        }),
      });
    const provider = new OpenAIAnalysisProvider({
      apiKey: "test-key",
      fetchImpl,
      threatIntelProvider: {
        name: "test-threat-provider",
        checkIndicator: async () => ({
          status: "match",
          threatType: "SOCIAL_ENGINEERING",
        }),
      },
    });

    const result = await provider.analyzeText({
      sourceId: "source-3",
      text: "https://phishing.example/login",
      isDemo: false,
    });

    expect(result.verificationStatus).toBe("technically_validated");
    expect(analysisResultSchema.safeParse(result).success).toBe(true);
    expect(result.score).toBe(20);
    expect(result.level).toBe("low");
  });
});
