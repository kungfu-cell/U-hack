import { randomUUID } from "node:crypto";
import type { AnalysisResult } from "@scamtrap/contracts";
import { extractEntities } from "./entity-extractor.js";
import type { AnalysisProvider, AnalyzeTextCommand } from "./ports.js";
import { detectRuleEvidence } from "./rule-engine.js";
import { SCORE_VERSION, toRiskLevel } from "./risk.js";

export class DemoAnalysisProvider implements AnalysisProvider {
  readonly name = "deterministic-demo-v1";

  async analyzeText(command: AnalyzeTextCommand): Promise<AnalysisResult> {
    const { evidence, rawScore } = detectRuleEvidence(
      command.text,
      command.sourceId,
    );
    const score = Math.min(rawScore, 100);
    const level = toRiskLevel(score);

    return {
      id: randomUUID(),
      status: "completed",
      score,
      level,
      scoreVersion: SCORE_VERSION,
      verificationStatus: "unverified",
      secretRequestDetected: evidence.some(
        (item) => item.tactic === "secret_request",
      ),
      summary:
        evidence.length > 0
          ? `พบสัญญาณที่ควรตรวจสอบ ${evidence.length} รายการ`
          : "ยังไม่พบสัญญาณความเสี่ยงจากกฎทดสอบ แต่ไม่ได้หมายความว่าปลอดภัย",
      recommendation:
        level === "high" || level === "critical"
          ? "หยุดให้ข้อมูลหรือทำธุรกรรม และติดต่อหน่วยงานผ่านช่องทางทางการด้วยตนเอง"
          : "ตรวจสอบผู้ติดต่อและปลายทางก่อนดำเนินการต่อ",
      evidence,
      entities: extractEntities(command.text, command.sourceId),
      threatChecks: [],
      modelVersion: this.name,
      createdAt: new Date().toISOString(),
      isDemo: true,
      limitations: [
        "ผลนี้มาจากกฎทดสอบสำหรับพัฒนา UI ไม่ใช่โมเดลวิเคราะห์จริง",
        "การไม่พบสัญญาณไม่ได้ยืนยันว่าข้อมูลปลอดภัย",
        "ยังไม่ได้ตรวจข้อมูลกับฐานภัยคุกคามภายนอก",
      ],
    };
  }
}
