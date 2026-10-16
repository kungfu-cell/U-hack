import { describe, expect, it } from "vitest";
import { DemoAnalysisProvider } from "./demo-analyzer.js";
import { OpenAIAnalysisProvider } from "./openai-analyzer.js";
import { detectRuleEvidence } from "./rule-engine.js";

const demoProvider = new DemoAnalysisProvider();

describe("False Positive (กรณีเตือนผิด) Tests", () => {
  describe("Bank Security Awareness & Warnings (คำเตือนความปลอดภัยจากธนาคาร)", () => {
    it("does not flag secret_request when bank warns customers about OTP policies", async () => {
      const texts = [
        "ธนาคารไม่มีนโยบายขอรหัสผ่านหรือ OTP จากลูกค้าผ่านทางโทรศัพท์หรือ SMS",
        "โปรดระวังมิจฉาชีพ! อย่าบอก OTP หรือ PIN 6 หลักกับบุคคลอื่นเด็ดขาด",
        "เตือนภัย: เจ้าหน้าที่ธนาคารตัวจริงจะไม่มีนโยบายขอรหัสยืนยัน OTP ของท่าน",
        "Never share your OTP or password with anyone, bank will never ask for it",
      ];

      for (const text of texts) {
        const result = await demoProvider.analyzeText({
          sourceId: "bank-warning",
          text,
          isDemo: true,
        });

        expect(result.secretRequestDetected).toBe(false);
        expect(result.evidence.map((e) => e.tactic)).not.toContain("secret_request");
      }
    });

    it("does not flag money_transfer_request when warning users against transferring money", async () => {
      const texts = [
        "เตือนภัยมิจฉาชีพ! ห้ามโอนเงินไปยังบัญชีที่ไม่รู้จักหรือบัญชีม้า",
        "อย่าโอนเงินเด็ดขาดหากมีบุคคลอ้างเป็นเจ้าหน้าที่โทรมาข่มขู่",
        "โปรดระวังแก๊งคอลเซ็นเตอร์ ไม่ควรโอนเงินตรวจสอบตามที่ถูกขู่",
        "Do not transfer money to unverified accounts",
      ];

      for (const text of texts) {
        const result = await demoProvider.analyzeText({
          sourceId: "transfer-warning",
          text,
          isDemo: true,
        });

        expect(result.evidence.map((e) => e.tactic)).not.toContain(
          "money_transfer_request",
        );
      }
    });
  });

  describe("Normal Daily Conversations & E-Commerce (การสนทนาและซื้อขายทั่วไป)", () => {
    it("does not escalate normal payment confirmations to critical scam risk", async () => {
      const text = "โอนเงินเรียบร้อยแล้วค่ะ ยอด 350 บาท ส่งสลิปให้ในแชทแล้วนะคะ";
      const result = await demoProvider.analyzeText({
        sourceId: "receipt-chat",
        text,
        isDemo: true,
      });

      // Normal payment slip confirmation should not be high or critical risk
      expect(result.level).not.toBe("critical");
      expect(result.secretRequestDetected).toBe(false);
      expect(result.evidence.map((e) => e.tactic)).not.toContain("threat_or_fear");
      expect(result.evidence.map((e) => e.tactic)).not.toContain("secret_request");
    });

    it("does not flag threat_or_fear when user denies involvement in crimes", async () => {
      const text = "ฉันไม่มีส่วนเกี่ยวข้องกับคดีฟอกเงินนะคะ";
      const { evidence } = detectRuleEvidence(text, "denial-talk");

      expect(evidence.map((e) => e.tactic)).not.toContain("threat_or_fear");
    });

    it("does not treat casual scheduling urgency as scam urgency", async () => {
      const text = "ไม่รีบนะ สะดวกตอนไหนค่อยส่งเอกสารมาให้ดูเมื่อไหร่ก็ได้";
      const result = await demoProvider.analyzeText({
        sourceId: "casual-chat",
        text,
        isDemo: true,
      });

      expect(result.evidence.map((e) => e.tactic)).not.toContain("urgency");
      expect(result.score).toBe(0);
      expect(result.level).toBe("low");
    });

    it("does not flag friendly birthday secret as isolation scam tactic", async () => {
      const text = "อย่าบอกใครนะ เดี๋ยวพรุ่งนี้จะจัดงานเซอร์ไพรส์วันเกิดเพื่อนที่ออฟฟิศ";
      const result = await demoProvider.analyzeText({
        sourceId: "birthday-surprise",
        text,
        isDemo: true,
      });

      expect(result.level).toBe("low");
      expect(result.secretRequestDetected).toBe(false);
    });
  });

  describe("Semantic LLM Adapter False Positive Handling", () => {
    it("handles benign customer support conversation gracefully", async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              summary: "การสอบถามข้อมูลการจัดส่งสินค้าทั่วไป ไม่พบพฤติกรรมหลอกลวง",
              recommendation: "สื่อสารได้ตามปกติ ไม่พบความเสี่ยง",
              findings: [],
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );

      const provider = new OpenAIAnalysisProvider({
        apiKey: "test-openai-key",
        fetchImpl: mockFetch,
      });

      const result = await provider.analyzeText({
        sourceId: "order-inquiry",
        text: "สวัสดีค่ะ ติดต่อจากร้านค้า สอบถามเรื่องเสื้อผ้าที่สั่งซื้อไว้ จัดส่งให้พรุ่งนี้นะคะ",
        isDemo: false,
      });

      expect(result.score).toBe(0);
      expect(result.level).toBe("low");
      expect(result.evidence).toEqual([]);
      expect(result.secretRequestDetected).toBe(false);
    });
  });
});
