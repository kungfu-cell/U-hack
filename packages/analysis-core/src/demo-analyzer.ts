import { randomUUID } from 'node:crypto';
import type {
  AnalysisResult,
  EntityMention,
  Evidence,
  RiskLevel,
} from '@scamtrap/contracts';
import type { AnalysisProvider, AnalyzeTextCommand } from './ports.js';

interface Rule {
  tactic: string;
  pattern: RegExp;
  weight: number;
  explanation: string;
  ignoredWhen?: RegExp;
}

const rules: Rule[] = [
  {
    tactic: 'authority_impersonation',
    pattern: /(ตำรวจ|ธนาคาร|กรมสอบสวน|เจ้าหน้าที่|ศาล|police|bank officer)/iu,
    weight: 18,
    explanation: 'มีการอ้างถึงหน่วยงานหรือผู้มีอำนาจ ควรตรวจสอบผ่านช่องทางทางการ',
  },
  {
    tactic: 'threat_or_fear',
    pattern: /(ฟอกเงิน|หมายจับ|ดำเนินคดี|อายัดบัญชี|ถูกจับ|arrest|lawsuit)/iu,
    weight: 26,
    explanation: 'มีข้อความสร้างความกลัวหรือข่มขู่ให้รีบทำตาม',
  },
  {
    tactic: 'urgency',
    pattern: /(ทันที|เดี๋ยวนี้|ภายในวันนี้|ห้ามวางสาย|urgent|immediately)/iu,
    weight: 20,
    explanation: 'มีการเร่งรัดหรือลดเวลาที่ผู้ใช้จะตรวจสอบข้อมูล',
  },
  {
    tactic: 'money_transfer_request',
    pattern: /(โอน(?:เงิน)?(?:มา|ให้|เข้า|ไป)|ชำระเงินเข้าบัญชี|transfer (?:the )?money)/iu,
    weight: 30,
    explanation: 'มีคำขอให้โอนหรือชำระเงิน',
    ignoredWhen: /(อย่า|ห้าม|ไม่ควร|never|do not).{0,24}(โอน|transfer)/iu,
  },
  {
    tactic: 'secret_request',
    pattern: /((?:บอก|ส่ง|อ่าน|แจ้ง).{0,18}(?:otp|รหัสผ่าน|pin)|(?:otp|pin).{0,18}(?:บอก|ส่ง|อ่าน|แจ้ง))/iu,
    weight: 38,
    explanation: 'มีคำขอข้อมูลลับที่ไม่ควรเปิดเผย',
    ignoredWhen: /(อย่า|ห้าม|ไม่ควร|never|do not).{0,24}(บอก|ส่ง|อ่าน|แจ้ง|otp|pin)/iu,
  },
  {
    tactic: 'isolation',
    pattern: /(ห้ามบอกใคร|อย่าคุยกับใคร|เก็บเป็นความลับ|do not tell anyone)/iu,
    weight: 24,
    explanation: 'พยายามแยกผู้ใช้ออกจากคนที่ช่วยตรวจสอบได้',
  },
];

const toLevel = (score: number): RiskLevel => {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
};

const findEvidence = (text: string, sourceId: string): { evidence: Evidence[]; score: number } => {
  const evidence: Evidence[] = [];
  let score = 0;

  for (const rule of rules) {
    if (rule.ignoredWhen?.test(text)) continue;
    const match = rule.pattern.exec(text);
    if (!match || match.index === undefined) continue;

    score += rule.weight;
    evidence.push({
      id: randomUUID(),
      quote: match[0],
      start: match.index,
      end: match.index + match[0].length,
      tactic: rule.tactic,
      explanation: rule.explanation,
      sourceId,
    });
  }

  if (evidence.length >= 3) score += 12;
  return { evidence, score: Math.min(score, 100) };
};

const extractEntities = (text: string, sourceId: string): EntityMention[] => {
  const entities: EntityMention[] = [];
  const urlPattern = /https?:\/\/[^\s<>()]+/giu;
  const phonePattern = /(?:\+66|0)\d{8,9}/gu;

  for (const match of text.matchAll(urlPattern)) {
    entities.push({
      id: randomUUID(),
      type: 'url',
      value: match[0],
      normalizedValue: match[0].toLowerCase(),
      sourceId,
      speaker: 'unknown',
      confidence: 0.98,
      verified: false,
    });
  }

  for (const match of text.matchAll(phonePattern)) {
    entities.push({
      id: randomUUID(),
      type: 'phone',
      value: match[0],
      normalizedValue: match[0].replace(/^\+66/, '0'),
      sourceId,
      speaker: 'unknown',
      confidence: 0.85,
      verified: false,
    });
  }

  return entities;
};

export class DemoAnalysisProvider implements AnalysisProvider {
  readonly name = 'deterministic-demo-v1';

  async analyzeText(command: AnalyzeTextCommand): Promise<AnalysisResult> {
    const { evidence, score } = findEvidence(command.text, command.sourceId);
    const level = toLevel(score);

    return {
      id: randomUUID(),
      status: 'completed',
      score,
      level,
      summary:
        evidence.length > 0
          ? `พบสัญญาณที่ควรตรวจสอบ ${evidence.length} รายการ`
          : 'ยังไม่พบสัญญาณความเสี่ยงจากกฎทดสอบ แต่ไม่ได้หมายความว่าปลอดภัย',
      recommendation:
        level === 'high' || level === 'critical'
          ? 'หยุดให้ข้อมูลหรือทำธุรกรรม และติดต่อหน่วยงานผ่านช่องทางทางการด้วยตนเอง'
          : 'ตรวจสอบผู้ติดต่อและปลายทางก่อนดำเนินการต่อ',
      evidence,
      entities: extractEntities(command.text, command.sourceId),
      threatChecks: [],
      modelVersion: this.name,
      createdAt: new Date().toISOString(),
      isDemo: true,
      limitations: [
        'ผลนี้มาจากกฎทดสอบสำหรับพัฒนา UI ไม่ใช่โมเดลวิเคราะห์จริง',
        'การไม่พบสัญญาณไม่ได้ยืนยันว่าข้อมูลปลอดภัย',
        'ยังไม่ได้ตรวจข้อมูลกับฐานภัยคุกคามภายนอก',
      ],
    };
  }
}
