import { useEffect, useState } from 'react';
import type { IncidentReport, ShareProposal, Utterance } from '@scamtrap/contracts';
import {
  analyzeCase,
  correctSessionUtterance,
  createShareProposal,
  getCaseReport,
  getSessionSnapshot,
  withdrawCase,
} from '../../lib/api';

interface ReportPlaceholderProps {
  caseId: string;
  sessionId?: string | null;
  refreshKey?: number;
}

export const ReportPlaceholder = ({
  caseId,
  sessionId,
  refreshKey = 0,
}: ReportPlaceholderProps) => {
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [proposal, setProposal] = useState<ShareProposal | null>(null);
  const [timeline, setTimeline] = useState<Utterance[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'pending' | 'empty' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setMessage('');
    setReport(null);
    setTimeline([]);

    const reportRequest = getCaseReport(caseId);
    const timelineRequest = sessionId
      ? getSessionSnapshot(sessionId).then((snapshot) => snapshot.utterances)
      : Promise.resolve([] as Utterance[]);

    void Promise.allSettled([reportRequest, timelineRequest]).then(([reportResult, timelineResult]) => {
      if (cancelled) return;

      if (timelineResult.status === 'fulfilled') {
        setTimeline(timelineResult.value);
      }

      if (reportResult.status === 'fulfilled') {
        setReport(reportResult.value);
        setStatus('ready');
        return;
      }

      const errorMessage = reportResult.reason instanceof Error
        ? reportResult.reason.message
        : 'โหลดรายงานไม่สำเร็จ';
      setMessage(errorMessage);
      setStatus(
        /analy|analysis|วิเคราะห์/iu.test(errorMessage)
          ? 'pending'
          : 'error',
      );
    });

    return () => {
      cancelled = true;
    };
  }, [caseId, sessionId, refreshKey, manualRefreshKey]);

  const toggleEntity = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const submitShare = async () => {
    if (!report || !consentConfirmed || selectedIds.length === 0) return;
    const created = await createShareProposal(report.caseId, selectedIds);
    setProposal(created);
  };

  const removeCase = async () => {
    if (!report || !window.confirm('ลบเหตุการณ์และถอนข้อเสนอแบ่งปันทั้งหมดหรือไม่?')) return;
    await withdrawCase(report.caseId, 'ผู้ใช้ถอนข้อมูลจากหน้ารายงาน');
    if (window.localStorage.getItem('scamtrap:lastCaseId') === report.caseId) {
      window.localStorage.removeItem('scamtrap:lastCaseId');
      window.localStorage.removeItem('scamtrap:lastSessionId');
    }
    setReport(null);
    setStatus('empty');
  };

  const correctUtterance = async (utterance: Utterance) => {
    if (!sessionId) return;
    const correctedText = window.prompt('แก้ไขข้อความถอดเสียง', utterance.text)?.trim();
    if (!correctedText || correctedText === utterance.text) return;
    const corrected = await correctSessionUtterance(sessionId, utterance.id, correctedText);
    setTimeline((current) => current.map((item) => item.id === corrected.id ? corrected : item));
  };

  const reanalyzeTranscript = async () => {
    setIsReanalyzing(true);
    try {
      await analyzeCase(caseId);
      setManualRefreshKey((current) => current + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'วิเคราะห์บทสนทนาใหม่ไม่สำเร็จ');
      setStatus('error');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const timelineSection = (
    <section className="report-section">
      <h2>ลำดับการสนทนา</h2>
      {timeline.length === 0 ? <p>รายงานนี้ไม่มีบทสนทนาสด</p> : (
        <ol className="timeline-list">
          {timeline.map((utterance) => (
            <li key={utterance.id}>
              <strong>{utterance.speaker}</strong>
              <span>{new Date(utterance.startedAtMs).toLocaleTimeString()}</span>
              <p>{utterance.text}</p>
              {sessionId && (
                <button className="secondary-button" onClick={() => void correctUtterance(utterance)}>
                  แก้ข้อความถอดเสียง
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );

  if (status === 'loading') {
    return <main className="placeholder-page"><p>กำลังประกอบรายงาน…</p></main>;
  }
  if (status === 'empty') {
    return (
      <main className="placeholder-page">
        <span className="eyebrow">Incident report</span>
        <h1>ยังไม่มีรายงาน</h1>
        <p>วิเคราะห์ข้อความหรือเริ่ม Live Session ก่อน แล้วกลับมาที่หน้านี้</p>
      </main>
    );
  }
  if (status === 'pending') {
    return (
      <main className="report-page">
        <header className="report-heading">
          <div>
            <span className="eyebrow">Live session · {caseId}</span>
            <h1>รายงานยังไม่พร้อม</h1>
            <p>ระบบจะวิเคราะห์และสร้างสรุปจากบทสนทนาที่บันทึกไว้หลังจบสาย</p>
          </div>
          <button className="secondary-button" onClick={() => setManualRefreshKey((current) => current + 1)}>
            โหลดรายงานอีกครั้ง
          </button>
        </header>
        <div className="warning-banner">
          <strong>ยังไม่พบผลวิเคราะห์ของเคสนี้</strong>
          <p>หากสายยังดำเนินอยู่ ให้กดวางสายก่อน แล้วกลับมาหน้านี้อีกครั้ง</p>
        </div>
        {timelineSection}
      </main>
    );
  }
  if (status === 'error' || !report) {
    return (
      <main className="placeholder-page">
        <h1>เปิดรายงานไม่ได้</h1>
        <p>{message}</p>
        <button className="secondary-button" onClick={() => setManualRefreshKey((current) => current + 1)}>
          ลองอีกครั้ง
        </button>
      </main>
    );
  }

  const committedUtteranceCount = timeline.filter(
    (utterance) => utterance.transcriptState === 'committed',
  ).length;
  const isLiveSessionReport = report.inputs.some((input) => input.source.startsWith('live_session:'));

  return (
    <main className="report-page">
      <header className="report-heading">
        <div>
          <span className="eyebrow">Incident report · version {report.version}</span>
          <h1>รายงานเหตุการณ์</h1>
          <p>{new Date(report.generatedAt).toLocaleString()}</p>
        </div>
        <div className="report-actions">
          {sessionId && (
            <button
              className="secondary-button"
              disabled={isReanalyzing}
              onClick={() => void reanalyzeTranscript()}
            >
              {isReanalyzing ? 'กำลังวิเคราะห์…' : 'วิเคราะห์ transcript ใหม่'}
            </button>
          )}
          <button className="secondary-button" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</button>
          <button className="danger-button" onClick={removeCase}>ลบเหตุการณ์</button>
        </div>
      </header>

      {report.isDemo && <div className="warning-banner"><strong>ข้อมูลจำลอง</strong><p>รายงานนี้ไม่ถูกนำไปกล่าวหาบุคคลจริง</p></div>}

      <section className="report-section">
        <h2>สรุปผล</h2>
        <p style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
          {isLiveSessionReport
            ? `สรุปโดยระบบวิเคราะห์จาก transcript ที่บันทึกหลังจบสาย ${committedUtteranceCount} ช่วง โดยแยกผู้โทร (caller) ออกจากผู้รับสายและ AI Decoy`
            : `สรุปโดยระบบวิเคราะห์จากข้อมูลที่แนบกับเคสนี้ ${report.inputs.length} รายการ`}
        </p>
        <p>{report.summary}</p>
        <p><strong>คำแนะนำ:</strong> {report.recommendation}</p>
      </section>

      {timelineSection}

      <section className="report-section">
        <h2>เหตุผลและข้อความอ้างอิง</h2>
        {report.evidence.length === 0 ? <p>ยังไม่มีหลักฐานเพียงพอ</p> : (
          <ol className="evidence-list">
            {report.evidence.map((item) => <li key={item.id}><q>{item.quote}</q><p>{item.explanation}</p></li>)}
          </ol>
        )}
      </section>

      <section className="report-section">
        <h2>ผลตรวจแหล่งภายนอก</h2>
        {report.threatChecks.length === 0 ? <p>ยังไม่ได้ตรวจหรือไม่มีตัวบ่งชี้ที่รองรับ</p> : (
          <ul>{report.threatChecks.map((check, index) => <li key={`${check.provider}-${index}`}>{check.provider}: {check.status} · {check.message ?? 'ไม่มีรายละเอียดเพิ่ม'}</li>)}</ul>
        )}
      </section>

      <section className="report-section">
        <h2>ข้อจำกัด</h2>
        <ul>{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section className="report-section share-panel">
        <h2>เสนอข้อมูลเพื่อแบ่งปัน</h2>
        <p>เลือกเฉพาะตัวบ่งชี้ที่ต้องการส่งเข้าคิวตรวจทาน ไม่มีการแบ่งปันอัตโนมัติ</p>
        {report.entities.length === 0 ? <p>รายงานนี้ไม่มีตัวบ่งชี้ที่แบ่งปันได้</p> : (
          <div className="share-options">
            {report.entities.map((entity) => (
              <label key={entity.id}>
                <input type="checkbox" checked={selectedIds.includes(entity.id)} onChange={() => toggleEntity(entity.id)} />
                <span>{entity.type}: {entity.value}</span>
              </label>
            ))}
          </div>
        )}
        <label className="consent-check">
          <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} />
          ฉันยืนยันให้ส่งเฉพาะรายการที่เลือกเข้าสู่คิวตรวจทาน
        </label>
        <button className="primary-button" disabled={!consentConfirmed || selectedIds.length === 0 || Boolean(proposal)} onClick={submitShare}>
          {proposal ? `ส่งแล้ว · ${proposal.status}` : 'เสนอข้อมูลเพื่อแบ่งปัน'}
        </button>
      </section>
    </main>
  );
};
