import type { ScamTactic } from "@scamtrap/contracts";
import { tacticWeights } from "./risk.js";

export interface ScamRule {
  tactic: ScamTactic;
  pattern: RegExp;
  weight: number;
  explanation: string;
  ignoredWhen?: RegExp;
}

export const scamRules: readonly ScamRule[] = [
  {
    tactic: "authority_impersonation",
    pattern: /(ตำรวจ|ธนาคาร|กรมสอบสวน|เจ้าหน้าที่|ศาล|police|bank officer)/iu,
    weight: tacticWeights.authority_impersonation,
    explanation:
      "มีการอ้างถึงหน่วยงานหรือผู้มีอำนาจ ควรตรวจสอบผ่านช่องทางทางการ",
  },
  {
    tactic: "threat_or_fear",
    pattern: /(ฟอกเงิน|หมายจับ|ดำเนินคดี|อายัดบัญชี|ถูกจับ|arrest|lawsuit)/iu,
    weight: tacticWeights.threat_or_fear,
    explanation: "มีข้อความสร้างความกลัวหรือข่มขู่ให้รีบทำตาม",
  },
  {
    tactic: "urgency",
    pattern: /(ทันที|เดี๋ยวนี้|ภายในวันนี้|ห้ามวางสาย|urgent|immediately)/iu,
    weight: tacticWeights.urgency,
    explanation: "มีการเร่งรัดหรือลดเวลาที่ผู้ใช้จะตรวจสอบข้อมูล",
  },
  {
    tactic: "money_transfer_request",
    pattern:
      /(โอน(?:เงิน)?(?:มา|ให้|เข้า|ไป)|ชำระเงินเข้าบัญชี|transfer (?:the )?money)/iu,
    weight: tacticWeights.money_transfer_request,
    explanation: "มีคำขอให้โอนหรือชำระเงิน",
    ignoredWhen: /(อย่า|ห้าม|ไม่ควร|never|do not).{0,24}(โอน|transfer)/iu,
  },
  {
    tactic: "secret_request",
    pattern:
      /((?:บอก|ส่ง|อ่าน|แจ้ง).{0,18}(?:otp|รหัสผ่าน|pin)|(?:otp|pin).{0,18}(?:บอก|ส่ง|อ่าน|แจ้ง))/iu,
    weight: tacticWeights.secret_request,
    explanation: "มีคำขอข้อมูลลับที่ไม่ควรเปิดเผย",
    ignoredWhen:
      /(อย่า|ห้าม|ไม่ควร|never|do not).{0,24}(บอก|ส่ง|อ่าน|แจ้ง|otp|pin)/iu,
  },
  {
    tactic: "isolation",
    pattern: /(ห้ามบอกใคร|อย่าคุยกับใคร|เก็บเป็นความลับ|do not tell anyone)/iu,
    weight: tacticWeights.isolation,
    explanation: "พยายามแยกผู้ใช้ออกจากคนที่ช่วยตรวจสอบได้",
  },
  {
    tactic: "remote_access_request",
    pattern:
      /(ติดตั้ง|โหลด|ดาวน์โหลด).{0,24}(แอป|โปรแกรม).{0,24}(ควบคุม|รีโมต|anydesk|teamviewer)|(?:anydesk|teamviewer).{0,24}(ติดตั้ง|โหลด|ดาวน์โหลด)/iu,
    weight: tacticWeights.remote_access_request,
    explanation:
      "มีคำขอให้ติดตั้งเครื่องมือที่อาจเปิดทางให้ควบคุมอุปกรณ์จากระยะไกล",
  },
  {
    tactic: "guaranteed_return",
    pattern:
      /(รับประกัน(?:ผลตอบแทน|กำไร)|กำไรแน่นอน|ผลตอบแทนสูง.{0,18}(ไม่มีความเสี่ยง|รับประกัน))/iu,
    weight: tacticWeights.guaranteed_return,
    explanation:
      "มีการรับประกันผลตอบแทนหรือกำไร ซึ่งเป็นคำกล่าวอ้างที่ควรตรวจสอบ",
  },
] as const;
