import type { GuardrailResult } from './types.js';

export class AgentGuardrail {
  private static readonly OTP_PATTERN = /\b\d{6}\b/g;
  private static readonly BANK_ACCOUNT_PATTERN = /\b\d{10,12}\b/g;
  private static readonly CARD_PATTERN = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g;
  private static readonly CONFIRM_TRANSFER_PATTERN =
    /(ตกลงโอนเงิน|โอนเงินไปแล้ว|โอนเงินให้เรียบร้อย|ยินยอมโอนเงิน|กดยืนยันการโอน|กดโอนเงิน)/giu;

  static sanitize(text: string): GuardrailResult {
    let sanitizedText = text;
    const blockedPatterns: string[] = [];
    let safe = true;
    let violationReason: string | undefined;

    // 1. Guard against OTP disclosure
    if (this.OTP_PATTERN.test(sanitizedText)) {
      safe = false;
      blockedPatterns.push('otp_disclosure');
      violationReason = 'ตรวจพบความพยายามเปิดเผยรหัส OTP 6 หลัก';
      sanitizedText = sanitizedText.replace(
        this.OTP_PATTERN,
        'ยังไม่ได้รับรหัส SMS เลยค่ะ ขอโทรเช็คกับธนาคารก่อนนะคะ',
      );
    }

    // 2. Guard against bank account disclosure
    if (this.BANK_ACCOUNT_PATTERN.test(sanitizedText)) {
      safe = false;
      blockedPatterns.push('bank_account_leak');
      violationReason = 'ตรวจพบเลขบัญชีธนาคาร';
      sanitizedText = sanitizedText.replace(this.BANK_ACCOUNT_PATTERN, 'TEST-ACCOUNT-A');
    }

    // 3. Guard against credit card numbers
    if (this.CARD_PATTERN.test(sanitizedText)) {
      safe = false;
      blockedPatterns.push('card_number_leak');
      violationReason = 'ตรวจพบหมายเลขบัตรเครดิต';
      sanitizedText = sanitizedText.replace(this.CARD_PATTERN, '[REDACTED_CARD]');
    }

    // 4. Guard against confirming wire transfers
    if (this.CONFIRM_TRANSFER_PATTERN.test(sanitizedText)) {
      safe = false;
      blockedPatterns.push('transfer_approval_leak');
      violationReason = 'ตรวจพบคำยินยอมโอนเงิน';
      sanitizedText = sanitizedText.replace(
        this.CONFIRM_TRANSFER_PATTERN,
        'ขอไปติดต่อยืนยันตัวตนที่สาขาธนาคารด้วยตนเองก่อนค่ะ',
      );
    }

    return {
      safe,
      sanitizedText,
      blockedPatterns,
      violationReason,
    };
  }
}
