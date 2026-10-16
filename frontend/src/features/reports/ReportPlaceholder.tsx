import { useEffect, useState, useCallback } from 'react';
import type { IncidentReport, ShareProposal, Utterance } from '@scamtrap/contracts';
import {
  addCaseInput,
  analyzeCase,
  correctSessionUtterance,
  createShareProposal,
  getCaseReport,
  getSessionSnapshot,
  withdrawCase,
} from '../../lib/api';

export const ReportPlaceholder = () => {
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [proposal, setProposal] = useState<ShareProposal | null>(null);
  const [timeline, setTimeline] = useState<Utterance[]>([]);
  const [status, setStatus] = useState<'loading' | 'analyzing' | 'ready' | 'empty' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);

  const loadReport = useCallback(async (caseId: string, autoAnalyzeOnMissing = true) => {
    try {
      setStatus('loading');
      const nextReport = await getCaseReport(caseId);
      setReport(nextReport);
      setStatus('ready');

      const sessionId = window.localStorage.getItem('scamtrap:lastSessionId');
      if (sessionId) {
        try {
          const snapshot = await getSessionSnapshot(sessionId);
          if (snapshot.utterances && snapshot.utterances.length > 0) {
            setTimeline(snapshot.utterances);
          }
        } catch {
          // ignore
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ';
      if (
        autoAnalyzeOnMissing &&
        (errMsg.includes('CASE_HAS_NO_ANALYSIS') || errMsg.includes('Analyze the case'))
      ) {
        // Attempt automatic analysis recovery using session utterances if present
        await handleTriggerAnalysis(caseId);
      } else {
        setMessage(errMsg);
        setStatus('error');
      }
    }
  }, []);

  const handleTriggerAnalysis = async (targetCaseId?: string) => {
    const caseId = targetCaseId ?? currentCaseId ?? window.localStorage.getItem('scamtrap:lastCaseId');
    if (!caseId) return;

    setStatus('analyzing');
    try {
      const sessionId = window.localStorage.getItem('scamtrap:lastSessionId');
      let capturedUtterances: Utterance[] = timeline;

      if (sessionId && capturedUtterances.length === 0) {
        try {
          const snap = await getSessionSnapshot(sessionId);
          if (snap.utterances && snap.utterances.length > 0) {
            capturedUtterances = snap.utterances;
            setTimeline(snap.utterances);
          }
        } catch {
          // ignore
        }
      }

      // If we have utterances from the live session, push them as case input first
      if (capturedUtterances.length > 0) {
        const transcriptText = capturedUtterances
          .map((u) => `[${u.speaker.toUpperCase()}] ${u.text}`)
          .join('\n');

        try {
          await addCaseInput(caseId, {
            type: 'text',
            content: transcriptText.slice(0, 50000),
            source: sessionId ? `live_session:${sessionId}` : 'live_call_transcript',
          });
        } catch {
          // might already have inputs, proceed to analyze
        }
      }

      // Trigger AI analysis on the case
      await analyzeCase(caseId);

      // Fetch fresh report
      const updatedReport = await getCaseReport(caseId);
      setReport(updatedReport);
      setStatus('ready');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'วิเคราะห์สำนวนคดีไม่สำเร็จ');
      setStatus('error');
    }
  };

  useEffect(() => {
    const caseId = window.localStorage.getItem('scamtrap:lastCaseId');
    setCurrentCaseId(caseId);
    if (!caseId) {
      setStatus('empty');
      return;
    }
    void loadReport(caseId, true);
  }, [loadReport]);

  const toggleEntity = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const submitShare = async () => {
    if (!report || !consentConfirmed || selectedIds.length === 0) return;
    try {
      const created = await createShareProposal(report.caseId, selectedIds);
      setProposal(created);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ส่งข้อมูลแบ่งปันไม่สำเร็จ');
    }
  };

  const removeCase = async () => {
    if (!report || !window.confirm('ลบเหตุการณ์และถอนข้อเสนอแบ่งปันทั้งหมดหรือไม่?')) return;
    try {
      await withdrawCase(report.caseId, 'ผู้ใช้ถอนข้อมูลจากหน้ารายงาน');
      window.localStorage.removeItem('scamtrap:lastCaseId');
      setReport(null);
      setStatus('empty');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ลบเหตุการณ์ไม่สำเร็จ');
    }
  };

  const correctUtterance = async (utterance: Utterance) => {
    const sessionId = window.localStorage.getItem('scamtrap:lastSessionId');
    if (!sessionId) return;
    const correctedText = window.prompt('แก้ไขข้อความถอดเสียง', utterance.text)?.trim();
    if (!correctedText || correctedText === utterance.text) return;
    try {
      const corrected = await correctSessionUtterance(sessionId, utterance.id, correctedText);
      setTimeline((current) => current.map((item) => item.id === corrected.id ? corrected : item));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'แก้ไขข้อความไม่สำเร็จ');
    }
  };

  if (status === 'loading') {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              border: '3px solid rgba(16, 185, 129, 0.2)',
              borderTopColor: 'var(--emerald)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <h3 style={{ fontSize: 16, margin: 0, color: 'var(--fg)' }}>กำลังประกอบรายงานเหตุการณ์สด…</h3>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
            ดึงข้อมูลหลักฐาน ถอดเทปคำสนทนา และจัดเตรียมสำนวนเพื่อส่งต่อ
          </p>
        </div>
      </div>
    );
  }

  if (status === 'analyzing') {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              border: '3px solid rgba(16, 185, 129, 0.2)',
              borderTopColor: '#10b981',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <div>
            <h3 style={{ fontSize: 16, margin: '0 0 6px 0', color: '#10b981' }}>
              กำลังวิเคราะห์สำนวนคดีและตรวจสอบภัยคุกคามด้วย AI…
            </h3>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
              ตรวจจับพฤติกรรมหลอกลวง ดึงตัวบ่งชี้บัญชีม้า และประเมินความเสี่ยงอัตโนมัติ
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div
        className="card"
        style={{
          padding: 48,
          textAlign: 'center',
          background: 'var(--bg-surface)',
          border: '1px dashed var(--border)',
        }}
      >
        <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--fg-muted)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <span className="code-tag" style={{ fontSize: 11 }}>NO ACTIVE LIVE CASE</span>
          <h2 style={{ fontSize: 18, margin: 0 }}>ยังไม่มีรายงานเคสสด</h2>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>
            เริ่มการโทรทดสอบหรือโทรจริงในแท็บ <strong>&quot;ดักสกัดสายสด (Live Call Shield)&quot;</strong> เมื่อมีการบันทึกเสียง ระบบจะสร้างสำนวนคดีและรายงานสรุปที่นี่โดยอัตโนมัติ
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error' || !report) {
    return (
      <div
        className="card"
        style={{
          padding: 32,
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: 'var(--radius)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                display: 'inline-flex',
                padding: '4px 8px',
                borderRadius: 4,
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              คดียังไม่ได้รับการวิเคราะห์สรุปผล
            </span>
          </div>

          <h2 style={{ fontSize: 18, margin: 0, color: 'var(--fg)' }}>
            เคสสดนี้ยังไม่มีการประมวลผลสรุปสำนวน
          </h2>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>
            เกิดจากเซสชันโทรศัพท์ล่าสุดเพิ่งเริ่มสร้าง หรือยังไม่ได้รวบรวมข้อความถอดเสียงส่งให้ระบบ AI วิเคราะห์สรุปผล (ระบบตรวจพบรหัส: <code>{message}</code>)
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-action btn-action-primary"
              onClick={() => void handleTriggerAnalysis()}
              style={{ background: '#10b981', borderColor: '#10b981', color: '#000', fontWeight: 700 }}
            >
              ⚡ รวบรวมข้อมูลและวิเคราะห์สำนวนคดีด้วย AI ทันที
            </button>
            <button
              type="button"
              className="btn-action btn-action-ghost"
              onClick={() => currentCaseId && void loadReport(currentCaseId, false)}
            >
              🔄 ลองโหลดใหม่อีกครั้ง
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* HEADER CARD */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.08) 0%, rgba(9, 13, 22, 0.95) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="code-tag" style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                CASE ID: {report.caseId.slice(0, 18)}...
              </span>
              <span className="badge-sev badge-safe" style={{ fontSize: 10.5 }}>
                VERSION {report.version}
              </span>
              {report.isDemo && (
                <span className="badge-sev badge-warning" style={{ fontSize: 10.5 }}>
                  DEMO ENVIRONMENT
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 20, margin: '6px 0 2px 0', fontWeight: 700 }}>
              รายงานสำนวนเหตุการณ์สด (Incident Dossier)
            </h1>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              บันทึกเมื่อ: {new Date(report.generatedAt).toLocaleString('th-TH')}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-action btn-action-ghost"
              onClick={() => void handleTriggerAnalysis()}
              title="วิเคราะห์ซ้ำด้วยข้อมูลบทสนทนาล่าสุด"
              style={{ fontSize: 12 }}
            >
              ⚡ วิเคราะห์ซ้ำ (Re-Analyze)
            </button>
            <button
              type="button"
              className="btn-action btn-action-ghost"
              onClick={() => window.print()}
              style={{ fontSize: 12 }}
            >
              🖨️ พิมพ์ / PDF
            </button>
            <button
              type="button"
              className="btn-action btn-action-ghost"
              onClick={removeCase}
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', fontSize: 12 }}
            >
              🗑️ ลบสำนวน
            </button>
          </div>
        </div>
      </div>

      {/* SUMMARY & RECOMMENDATION */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>บทสรุปการประเมินภัยคุกคาม (Executive Threat Summary)</span>
        </h3>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--fg)', margin: '0 0 14px 0' }}>
          {report.summary}
        </p>
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            background: 'rgba(16, 185, 129, 0.08)',
            borderLeft: '4px solid var(--emerald)',
          }}
        >
          <strong style={{ fontSize: 12.5, color: 'var(--emerald)' }}>คำแนะนำการปฏิบัติการ:</strong>
          <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
            {report.recommendation}
          </p>
        </div>
      </div>

      {/* TIMELINE */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>ลำดับถอดเทปเสียงสนทนา (Voice Intercept Timeline)</span>
            <span className="code-tag" style={{ fontSize: 10 }}>{timeline.length} รายการ</span>
          </h3>
        </div>

        {timeline.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
            ไม่มีบทสนทนาสดที่บันทึกไว้ในเซสชันนี้
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {timeline.map((u) => {
              const isUser = u.speaker === 'user';
              return (
                <div
                  key={u.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    background: isUser ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                    border: `1px solid ${isUser ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        className="badge-sev"
                        style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          background: isUser ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: isUser ? '#10b981' : '#ef4444',
                        }}
                      >
                        {isUser ? 'CITIZEN (เหยื่อ/ผู้ใช้)' : 'CALLER / SCAMMER (สายมิจฉาชีพ)'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                        {new Date(u.startedAtMs).toLocaleTimeString('th-TH')}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--fg)', lineHeight: 1.5 }}>
                      {u.text}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    onClick={() => void correctUtterance(u)}
                    style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
                  >
                    ✏️ แก้ไข
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* EVIDENCE & MENTIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* EVIDENCE */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px 0' }}>
            🚩 ประเด็นข้อความที่เข้าข่ายหลอกลวง (Extracted Evidence)
          </h3>
          {report.evidence.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: 0 }}>
              ยังไม่พบข้อความที่บ่งชี้การหลอกลวงเด่นชัด
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.evidence.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: 10,
                    borderRadius: 6,
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <q style={{ fontSize: 12.5, color: '#f59e0b', fontStyle: 'italic', display: 'block', marginBottom: 4 }}>
                    &quot;{item.quote}&quot;
                  </q>
                  <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{item.explanation}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* EXTERNAL THREAT CHECKS */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px 0' }}>
            🌐 ผลตรวจค้นฐานข้อมูลภายนอก (Threat Intel Checks)
          </h3>
          {report.threatChecks.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: 0 }}>
              ไม่มีตัวบ่งชี้ภายนอกที่ต้องส่งตรวจค้น
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {report.threatChecks.map((check, index) => (
                <div
                  key={`${check.provider}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 4,
                    background: 'var(--bg)',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--fg)' }}>{check.provider}</strong>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{check.message ?? 'ไม่มีรายละเอียดเพิ่มเติม'}</div>
                  </div>
                  <span
                    className={`badge-sev ${
                      check.status === 'match'
                        ? 'badge-critical'
                        : check.status === 'not_found'
                          ? 'badge-safe'
                          : 'badge-info'
                    }`}
                    style={{ fontSize: 10 }}
                  >
                    {check.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SHARE / REPORT PANEL */}
      <div className="card" style={{ padding: 20, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px 0' }}>
          📤 เสนอข้อมูลเพื่อแบ่งปันเข้าสู่ฐานข้อมูลประชาคม (Community Threat Sharing)
        </h3>
        <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 14px 0' }}>
          เลือกเฉพาะตัวบ่งชี้ (IOCs) ที่ต้องการส่งเข้าคิวตรวจสอบของ AOC / ศูนย์ต่อต้านภัยไซเบอร์ ไม่มีการแบ่งปันข้อมูลส่วนบุคคลของผู้เสียหาย
        </p>

        {report.entities.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '0 0 12px 0' }}>
            รายงานนี้ยังไม่มีตัวบ่งชี้ (เบอร์โทร / เลขบัญชี) ที่สามารถเสนอแบ่งปันได้
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, marginBottom: 16 }}>
            {report.entities.map((entity) => (
              <label
                key={entity.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: selectedIds.includes(entity.id) ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg)',
                  border: `1px solid ${selectedIds.includes(entity.id) ? 'var(--emerald)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(entity.id)}
                  onChange={() => toggleEntity(entity.id)}
                />
                <span>
                  <strong>{entity.type}:</strong> {entity.value}
                </span>
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: 'var(--fg)' }}>
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => setConsentConfirmed(e.target.checked)}
            />
            <span>ฉันยืนยันให้ส่งเฉพาะตัวบ่งชี้ที่เลือกเข้าสู่คิวตรวจทาน และรับทราบข้อกำหนดความเป็นส่วนตัว</span>
          </label>

          <div>
            <button
              type="button"
              className="btn-action btn-action-primary"
              disabled={!consentConfirmed || selectedIds.length === 0 || Boolean(proposal)}
              onClick={submitShare}
              style={{ fontSize: 12, padding: '7px 16px' }}
            >
              {proposal ? `✓ ส่งเรียบร้อย · สถานะ: ${proposal.status}` : '📤 ยืนยันเสนอข้อมูลเข้าสู่เครือข่าย'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

