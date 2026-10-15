import { useState, type FormEvent } from 'react';
import type { AnalysisResult } from '@scamtrap/contracts';
import { RiskGauge } from '../../components/RiskGauge';
import { addCaseInput, analyzeCase, createCase } from '../../lib/api';

const sample =
  'ผมเป็นเจ้าหน้าที่ธนาคาร บัญชีคุณเกี่ยวข้องกับคดีฟอกเงิน ห้ามวางสาย ให้โอนเงินมาตรวจสอบทันที';

export const QuickAnalysis = () => {
  const [text, setText] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;

    setStatus('loading');
    setError('');
    try {
      const created = await createCase();
      await addCaseInput(created.id, {
        type: text.trim().startsWith('http') ? 'url' : 'text',
        content: text.trim(),
        source: 'quick_analysis',
      });
      const analyzed = await analyzeCase(created.id);
      setResult(analyzed.latestAnalysis);
      setStatus('idle');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ไม่สามารถเชื่อมต่อระบบวิเคราะห์ได้');
      setStatus('error');
    }
  };

  return (
    <main className="page-grid">
      <section className="hero-panel">
        <span className="eyebrow">Quick analysis</span>
        <h1>เห็นความเสี่ยง<br />ก่อนตัดสินใจ</h1>
        <p>
          วางข้อความหรือลิงก์ที่น่าสงสัย ระบบจะแสดงเหตุผลและช่วงข้อความที่ควรระวัง
          โดยไม่สรุปว่าบุคคลใดเป็นมิจฉาชีพแน่นอน
        </p>
        <div className="privacy-note">
          <span aria-hidden="true">◆</span>
          <div>
            <strong>โหมดต้นแบบ</strong>
            <p>ผลลัพธ์หน้านี้มาจากกฎทดสอบ และยังไม่ได้ตรวจฐานภัยคุกคามจริง</p>
          </div>
        </div>
      </section>

      <section className="workspace-panel">
        <form onSubmit={submit}>
          <div className="field-heading">
            <label htmlFor="analysis-text">ข้อความที่ต้องการตรวจสอบ</label>
            <button type="button" className="text-button" onClick={() => setText(sample)}>
              ใส่ข้อความตัวอย่าง
            </button>
          </div>
          <textarea
            id="analysis-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="วางข้อความสนทนา หรือ URL ที่นี่..."
            rows={8}
            maxLength={50_000}
          />
          <div className="form-footer">
            <span>{text.length.toLocaleString()} / 50,000</span>
            <button className="primary-button" type="submit" disabled={status === 'loading' || !text.trim()}>
              {status === 'loading' ? 'กำลังวิเคราะห์…' : 'เริ่มตรวจสอบ'}
            </button>
          </div>
        </form>

        {status === 'error' && (
          <div className="error-box" role="alert">
            <strong>ตรวจสอบไม่ได้ในขณะนี้</strong>
            <p>{error}</p>
          </div>
        )}

        {result && (
          <article className="result-panel" aria-live="polite">
            <div className="demo-ribbon">DEMO RESULT</div>
            <RiskGauge score={result.score} level={result.level} />
            <p className="result-summary">{result.summary}</p>
            <div className="recommendation">
              <span className="eyebrow">คำแนะนำ</span>
              <p>{result.recommendation}</p>
            </div>
            <h3>เหตุผลที่พบ</h3>
            {result.evidence.length === 0 ? (
              <p className="muted">ยังไม่พบหลักฐานจากกฎทดสอบ — ไม่ได้แปลว่าปลอดภัย</p>
            ) : (
              <ol className="evidence-list">
                {result.evidence.map((item) => (
                  <li key={item.id}>
                    <q>{item.quote}</q>
                    <p>{item.explanation}</p>
                  </li>
                ))}
              </ol>
            )}
            <details>
              <summary>ข้อจำกัดของผลวิเคราะห์</summary>
              <ul>
                {result.limitations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
          </article>
        )}
      </section>
    </main>
  );
};
