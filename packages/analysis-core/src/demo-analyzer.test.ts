import { describe, expect, it } from 'vitest';
import { DemoAnalysisProvider } from './demo-analyzer.js';

const provider = new DemoAnalysisProvider();

describe('DemoAnalysisProvider', () => {
  it('flags an authority threat combined with an urgent transfer request', async () => {
    const result = await provider.analyzeText({
      sourceId: 'input-1',
      text: 'ผมเป็นเจ้าหน้าที่ตำรวจ บัญชีคุณเกี่ยวกับคดีฟอกเงิน ให้โอนเงินมาตรวจสอบทันที',
      isDemo: true,
    });

    expect(result.level).toBe('critical');
    expect(result.evidence.map((item) => item.tactic)).toContain('money_transfer_request');
  });

  it('does not treat an OTP safety warning as a request for the OTP', async () => {
    const result = await provider.analyzeText({
      sourceId: 'input-2',
      text: 'อย่าบอก OTP หรือรหัสผ่านกับใครเด็ดขาด',
      isDemo: true,
    });

    expect(result.evidence.map((item) => item.tactic)).not.toContain('secret_request');
  });

  it('extracts URLs without claiming they are safe', async () => {
    const result = await provider.analyzeText({
      sourceId: 'input-3',
      text: 'ตรวจสอบที่ https://example.test/path',
      isDemo: true,
    });

    expect(result.entities[0]?.type).toBe('url');
    expect(result.threatChecks).toEqual([]);
    expect(result.limitations.join(' ')).toContain('ไม่ได้ยืนยันว่าข้อมูลปลอดภัย');
  });
});
