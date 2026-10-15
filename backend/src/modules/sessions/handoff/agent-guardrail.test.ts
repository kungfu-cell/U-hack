import { describe, expect, it } from 'vitest';
import { AgentGuardrail } from './agent-guardrail.js';

describe('AgentGuardrail', () => {
  it('allows safe decoy dialogue through unmodified', () => {
    const input = 'รบกวนขอทราบชื่อ-ยศ และสถานีตำรวจที่สังกัดได้ไหมคะ พอดีจะจดบันทึกไว้ค่ะ';
    const result = AgentGuardrail.sanitize(input);

    expect(result.safe).toBe(true);
    expect(result.sanitizedText).toBe(input);
    expect(result.blockedPatterns).toHaveLength(0);
  });

  it('redacts 6-digit OTP codes and replaces with safe stalling response', () => {
    const input = 'รหัส OTP ของฉันคือ 849201 ค่ะ ส่งให้แล้วนะคะ';
    const result = AgentGuardrail.sanitize(input);

    expect(result.safe).toBe(false);
    expect(result.sanitizedText).not.toContain('849201');
    expect(result.sanitizedText).toContain('OTP');
    expect(result.blockedPatterns).toContain('otp_disclosure');
  });

  it('redacts 10-digit bank account numbers', () => {
    const input = 'นี่คือหมายเลขบัญชีธนาคาร 0123456789 ค่ะ';
    const result = AgentGuardrail.sanitize(input);

    expect(result.safe).toBe(false);
    expect(result.sanitizedText).not.toContain('0123456789');
    expect(result.blockedPatterns).toContain('bank_account_leak');
  });

  it('redacts 16-digit credit/debit card numbers', () => {
    const input = 'เลขบัตรเครดิต 4111 2222 3333 4444 ค่ะ';
    const result = AgentGuardrail.sanitize(input);

    expect(result.safe).toBe(false);
    expect(result.sanitizedText).not.toContain('4111 2222 3333 4444');
    expect(result.blockedPatterns).toContain('card_number_leak');
  });

  it('redacts transfer or transaction approval phrases', () => {
    const input = 'ฉันกดโอนเงินให้เรียบร้อยแล้วค่ะ สลิปส่งไปในไลน์นะคะ';
    const result = AgentGuardrail.sanitize(input);

    expect(result.safe).toBe(false);
    expect(result.blockedPatterns).toContain('transfer_approval_leak');
    expect(result.sanitizedText).toContain('สาขา');
  });
});
