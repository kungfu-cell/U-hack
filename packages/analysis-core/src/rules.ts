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
    pattern:
      /(ฟอกเงิน|หมายจับ|ดำเนินคดี|อายัดบัญชี|ถูกจับ|ติดคุก|จำคุก|ยึดทรัพย์|หมายศาล|ความผิดอาญา|arrest|lawsuit|warrant|freeze account)/iu,
    weight: tacticWeights.threat_or_fear,
    explanation: "มีข้อความสร้างความกลัวหรือข่มขู่ให้รีบทำตาม",
    ignoredWhen:
      /(?:ไม่|ไม่ได้|มิได้|ไม่มีส่วน).{0,14}(?:เกี่ยวข้อง|กระทำ|ทำผิด)|(?:ข่าว|รายงานข่าว)/iu,
  },
  {
    tactic: "urgency",
    pattern:
      /(ทันที|เดี๋ยวนี้|ภายในวันนี้|ด่วนที่สุด|ห้ามวางสาย|ภายใน\s*\d+\s*(?:นาที|ชั่วโมง)|ก่อนหมดเวลา|urgent|immediately|asap)/iu,
    weight: tacticWeights.urgency,
    explanation: "มีการเร่งรัดหรือลดเวลาที่ผู้ใช้จะตรวจสอบข้อมูล",
    ignoredWhen: /(ไม่รีบ|ไม่ด่วน|สะดวกตอนไหน|เมื่อไหร่ก็ได้)/iu,
  },
  {
    tactic: "money_transfer_request",
    pattern:
      /(โอน(?:เงิน|ยอด)?(?:มา|ให้|เข้า|ไป)|ชำระ(?:เงิน|ค่าธรรมเนียม)?เข้าบัญชี|ฝากเงินเข้าบัญชี|โอนเงินตรวจสอบ|transfer (?:the )?money|send money)/iu,
    weight: tacticWeights.money_transfer_request,
    explanation: "มีคำขอให้โอนหรือชำระเงิน",
    ignoredWhen:
      /(?:(?:อย่า|ห้าม|ไม่ควร|never|do not).{0,4}|(?:ไม่มีนโยบาย|ระวัง|เตือน).{0,16})(?:โอน|transfer|ชำระ)/iu,
  },
  {
    tactic: "secret_request",
    pattern:
      /((?:บอก|ส่ง|อ่าน|แจ้ง|ขอ|กรอก|ใส่|ยืนยัน).{0,18}(?:otp|รหัสผ่าน|pin|รหัสยืนยัน|verification code|password)|(?:otp|pin|รหัสผ่าน|รหัสยืนยัน|verification code|password).{0,18}(?:บอก|ส่ง|อ่าน|แจ้ง|ขอ|กรอก|ใส่|ยืนยัน))/iu,
    weight: tacticWeights.secret_request,
    explanation: "มีคำขอข้อมูลลับที่ไม่ควรเปิดเผย",
    ignoredWhen:
      /(?:(?:อย่า|ห้าม|ไม่ควร|never|do not).{0,4}|(?:ไม่มีนโยบาย|ระวัง|เตือน).{0,16})(?:บอก|ส่ง|อ่าน|แจ้ง|ขอ|กรอก|ใส่|ยืนยัน|otp|pin|รหัส)/iu,
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
