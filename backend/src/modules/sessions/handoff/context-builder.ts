import type { Utterance } from '@scamtrap/contracts';
import type { AgentContextPacket } from './types.js';

export class ContextBuilder {
  static build(sessionId: string, utterances: Utterance[]): AgentContextPacket {
    const callerUtterances = utterances.filter((u) => u.speaker === 'caller');
    const combinedCallerText = callerUtterances.map((u) => u.text).join(' ');

    const callerClaims: string[] = [];
    const unresolvedQuestions: string[] = [];

    // 1. Analyze claims
    if (/(ตำรวจ|ผู้หมวด|ร้อยตำรวจ|สภ\.|สน\.|ศาล|d篩|police)/iu.test(combinedCallerText)) {
      callerClaims.push('คู่สนทนากล่าวอ้างว่าเป็นเจ้าหน้าที่ตำรวจหรือผู้มีอำนาจ');
      unresolvedQuestions.push('ขอทราบชื่อ-ยศ และสถานีตำรวจที่สังกัดอย่างเป็นทางการ');
    }

    if (/(ธนาคาร|เจ้าหน้าที่ธนาคาร|กรุงไทย|กสิกร|ไทยพาณิชย์|bank)/iu.test(combinedCallerText)) {
      callerClaims.push('คู่สนทนากล่าวอ้างว่าเป็นเจ้าหน้าที่ธนาคาร');
      unresolvedQuestions.push('ขอทราบชื่อสาขาและหมายเลขประจำตัวพนักงานธนาคาร');
    }

    if (/(ฟอกเงิน|หมายจับ|คดีอาญา|อายัด|ดำเนินคดี)/iu.test(combinedCallerText)) {
      callerClaims.push('คู่สนทนาสร้างความกลัวเรื่องคดีฟอกเงินหรือหมายจับ');
      unresolvedQuestions.push('ขอทราบเลขที่เอกสารหมายจับหรือรหัสอ้างอิงสำนวนคดี');
    }

    if (/(โอนเงิน|ชำระ|ยอดเงิน|เงินในบัญชี)/iu.test(combinedCallerText)) {
      callerClaims.push('คู่สนทนากดดันให้โอนเงินเพื่อตรวจสอบ');
      unresolvedQuestions.push('ขอทราบชื่อบัญชีปลายทางและหน่วยงานที่เปิดบัญชีรองรับ');
    }

    if (/(otp|รหัสผ่าน|pin)/iu.test(combinedCallerText)) {
      callerClaims.push('คู่สนทนาพยายามขอรหัส OTP หรือรหัสลับ');
      unresolvedQuestions.push('แจ้งว่ายังไม่ได้รับรหัส SMS หรือระบบเตือนห้ามแจ้งคนอื่น');
    }

    // Fallback if no specific claims detected yet
    if (unresolvedQuestions.length === 0) {
      unresolvedQuestions.push('ขอทราบชื่อ-นามสกุล และเรื่องที่ติดต่อมาอย่างชัดเจนอีกครั้ง');
    }

    // 2. Extract known entities (phone, urls, names)
    const knownEntities: { type: string; value: string }[] = [];
    const phoneMatches = combinedCallerText.match(/(?:\+66|0)\d{8,9}/g);
    if (phoneMatches) {
      for (const phone of phoneMatches) {
        knownEntities.push({ type: 'phone', value: phone });
      }
    }

    // 3. Select last 6 dialogue turns for prompt context
    const recentDialogue = utterances.slice(-6).map((u) => ({
      speaker: u.speaker,
      text: u.text,
    }));

    // 4. Formulate System Prompt
    const systemPrompt = [
      'คุณคือ AI Decoy (ตัวแทนรับสายช่วยเหลือผู้ใช้) ของระบบ ScamTrap AI',
      'ภารกิจ: รับช่วงสนทนาแทนผู้ใช้ โดยทำทีเป็นประชาชนทั่วไปที่สุภาพ สับสนเล็กน้อย และยินดีให้ความร่วมมือ แต่ต้องการความชัดเจน',
      'เป้าหมายการพูดคุย:',
      '1. ถ่วงเวลาอย่างเป็นธรรมชาติ พูดจาสุภาพด้วยคำลงท้าย (ค่ะ/คะ)',
      '2. สอบถามข้อมูลยืนยันตัวตนของอีกฝ่ายอย่างสุภาพ (เช่น: ' + unresolvedQuestions.join(', ') + ')',
      '3. ไม่ยอมโอนเงินทันที โดยอ้างว่าต้องขอตรวจสอบกับสมุดบัญชีก่อน',
      '',
      'กฎเหล็กด้านความปลอดภัย (STRICT SAFETY RULES):',
      '- ห้ามบอกรหัส OTP, PIN, หรือรหัสผ่านเด็ดขาด ถ้าถูกทวงให้ตอบว่า "ยังไม่มี SMS เข้ามาเลยค่ะ" หรือ "หน้าจอมันขึ้นเตือนว่าห้ามบอกใคร"',
      '- ห้ามเปิดเผยเลขบัตรประชาชน หรือข้อมูลส่วนตัวจริง หากจำเป็นให้ใช้ตัวแทนทดสอบ เช่น TEST-ACCOUNT-A',
      '- ห้ามยอมรับว่าเป็นมิจฉาชีพ และห้ามด่าทอหรือกล่าวหาคู่สนทนาตรงๆ',
    ].join('\n');

    return {
      sessionId,
      callerClaims,
      knownEntities,
      unresolvedQuestions,
      recentDialogue,
      systemPrompt,
    };
  }
}
