import { useCallback, useEffect, useRef, useState } from 'react';
import type { IncidentReport, ShareProposal, Utterance } from '@scamtrap/contracts';
import { useAppLanguage } from '../../lib/LanguageContext';
import {
  addCaseInput,
  analyzeCase,
  correctSessionUtterance,
  createShareProposal,
  getCaseReport,
  getSessionSnapshot,
  withdrawCase,
} from '../../lib/api';

interface ReportPlaceholderProps {
  caseId?: string;
  sessionId?: string | null;
  refreshKey?: number;
}

export const ReportPlaceholder = ({
  caseId: propCaseId,
  sessionId: propSessionId,
  refreshKey = 0,
}: ReportPlaceholderProps = {}) => {
  const { language } = useAppLanguage();
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [proposal, setProposal] = useState<ShareProposal | null>(null);
  const [timeline, setTimeline] = useState<Utterance[]>([]);
  const timelineRef = useRef<Utterance[]>([]);
  const [status, setStatus] = useState<'loading' | 'analyzing' | 'ready' | 'pending' | 'empty' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [manualRefreshKey, setManualRefreshKey] = useState(0);

  const effectiveCaseId = propCaseId || window.localStorage.getItem('scamtrap:lastCaseId') || '';
  const effectiveSessionId = propSessionId ?? window.localStorage.getItem('scamtrap:lastSessionId');

  const replaceTimeline = useCallback((nextTimeline: Utterance[]) => {
    timelineRef.current = nextTimeline;
    setTimeline(nextTimeline);
  }, []);

  const handleTriggerAnalysis = useCallback(async (targetCaseId?: string) => {
    const id = targetCaseId || effectiveCaseId;
    if (!id) return;

    setStatus('analyzing');
    try {
      let capturedUtterances: Utterance[] = timelineRef.current;

      if (effectiveSessionId && capturedUtterances.length === 0) {
        try {
          const snap = await getSessionSnapshot(effectiveSessionId);
          if (snap.utterances && snap.utterances.length > 0) {
            capturedUtterances = snap.utterances;
            replaceTimeline(snap.utterances);
          }
        } catch {
          // ignore
        }
      }

      if (capturedUtterances.length > 0) {
        const transcriptText = capturedUtterances
          .map((u) => `[${u.speaker.toUpperCase()}] ${u.text}`)
          .join('\n');

        try {
          await addCaseInput(id, {
            type: 'text',
            content: transcriptText.slice(0, 50000),
            source: effectiveSessionId ? `live_session:${effectiveSessionId}` : 'live_call_transcript',
          });
        } catch {
          // input may already be registered
        }
      }

      await analyzeCase(id);
      const updatedReport = await getCaseReport(id);
      setReport(updatedReport);
      setStatus('ready');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to complete case analysis.');
      setStatus('error');
    }
  }, [effectiveCaseId, effectiveSessionId, replaceTimeline]);

  const loadReport = useCallback(async (id: string, autoAnalyzeOnMissing = true) => {
    try {
      setStatus('loading');
      const nextReport = await getCaseReport(id);
      setReport(nextReport);
      setStatus('ready');

      if (effectiveSessionId) {
        try {
          const snapshot = await getSessionSnapshot(effectiveSessionId);
          if (snapshot.utterances && snapshot.utterances.length > 0) {
            replaceTimeline(snapshot.utterances);
          }
        } catch {
          // ignore
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Failed to retrieve incident dossier.';
      if (
        autoAnalyzeOnMissing &&
        (errMsg.includes('CASE_HAS_NO_ANALYSIS') || errMsg.includes('Analyze the case') || /วิเคราะห์|analysis/iu.test(errMsg))
      ) {
        await handleTriggerAnalysis(id);
      } else {
        setMessage(errMsg);
        setStatus(
          /analy|analysis|วิเคราะห์/iu.test(errMsg)
            ? 'pending'
            : 'error',
        );
      }
    }
  }, [effectiveSessionId, handleTriggerAnalysis, replaceTimeline]);

  useEffect(() => {
    if (!effectiveCaseId) {
      setStatus('empty');
      return;
    }
    void loadReport(effectiveCaseId, true);
  }, [effectiveCaseId, refreshKey, manualRefreshKey, loadReport]);

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
      alert(err instanceof Error ? err.message : 'Failed to submit share proposal.');
    }
  };

  const removeCase = async () => {
    if (!report || !window.confirm('Are you sure you want to delete this incident dossier and withdraw all indicator proposals?')) return;
    try {
      await withdrawCase(report.caseId, 'User withdrew incident report from dossier console.');
      if (window.localStorage.getItem('scamtrap:lastCaseId') === report.caseId) {
        window.localStorage.removeItem('scamtrap:lastCaseId');
        window.localStorage.removeItem('scamtrap:lastSessionId');
      }
      setReport(null);
      setStatus('empty');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to withdraw incident record.');
    }
  };

  const correctUtterance = async (utterance: Utterance) => {
    if (!effectiveSessionId) return;
    const correctedText = window.prompt('Update transcript segment', utterance.text)?.trim();
    if (!correctedText || correctedText === utterance.text) return;
    try {
      const corrected = await correctSessionUtterance(effectiveSessionId, utterance.id, correctedText);
      replaceTimeline(
        timelineRef.current.map((item) => item.id === corrected.id ? corrected : item),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to update transcript segment.');
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
          <h3 style={{ fontSize: 16, margin: 0, color: 'var(--fg)' }}>Assembling Incident Dossier...</h3>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
            Compiling evidentiary records, dialogue transcripts, and risk scoring telemetry.
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
              Conducting Incident Analysis &amp; Threat Attribution...
            </h3>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
              Parsing conversational extortion cues, extracting financial indicators, and cross-referencing national registries.
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
          <span className="code-tag" style={{ fontSize: 11 }}>
            {language === 'en' ? 'NO ACTIVE LIVE CASE' : 'ยังไม่มีประวัติการโทรสด'}
          </span>
          <h2 style={{ fontSize: 18, margin: 0 }}>
            {language === 'en' ? 'No Live Session Dossier Available' : 'ยังไม่มีรายงานจากสายสนทนาสด'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>
            {language === 'en'
              ? 'Initiate a live test call or simulated conversation from the Live Call Shield tab. When an audio session concludes, the case dossier will be populated automatically here.'
              : 'เริ่มการทดสอบโทรศัพท์ หรือจำลองสายมิจฉาชีพได้จากแท็บ "Live Call & Takeover" เมื่อการสนทนาสิ้นสุด ระบบจะประมวลผลและสร้างรายงานสำนวนคดีพร้อมหลักฐานให้ที่นี่โดยอัตโนมัติ'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'pending' || status === 'error' || !report) {
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
              {status === 'pending' ? 'ANALYSIS PENDING' : 'ANALYSIS REQUIRED'}
            </span>
          </div>

          <h2 style={{ fontSize: 18, margin: 0, color: 'var(--fg)' }}>
            Dossier Summary Pending Generation
          </h2>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>
            The active telephony session has either just concluded or has not yet processed its dialogue transcript through the analysis provider ({message || 'Click below to compile immediately'}).
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-action btn-action-primary"
              onClick={() => void handleTriggerAnalysis()}
              style={{ background: '#10b981', borderColor: '#10b981', color: '#000', fontWeight: 700 }}
            >
              Generate Incident Analysis Now
            </button>
            <button
              type="button"
              className="btn-action btn-action-ghost"
              onClick={() => setManualRefreshKey((k) => k + 1)}
            >
              Reload Dossier
            </button>
          </div>
        </div>
      </div>
    );
  }

  const committedUtteranceCount = timeline.filter(
    (utterance) => utterance.transcriptState === 'committed',
  ).length;
  const isLiveSessionReport = report.inputs.some((input) => input.source.startsWith('live_session:'));

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
              Live Incident Dossier &amp; Intercept Summary
            </h1>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              Recorded on: {new Date(report.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-action btn-action-ghost"
              onClick={() => void handleTriggerAnalysis()}
              title="Re-run analysis with latest dialogue logs"
              style={{ fontSize: 12 }}
            >
              Re-Analyze
            </button>
            <button
              type="button"
              className="btn-action btn-action-ghost"
              onClick={() => window.print()}
              style={{ fontSize: 12 }}
            >
              Print / Save PDF
            </button>
            <button
              type="button"
              className="btn-action btn-action-ghost"
              onClick={removeCase}
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', fontSize: 12 }}
            >
              Withdraw Dossier
            </button>
          </div>
        </div>
      </div>

      {/* SUMMARY & RECOMMENDATION */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Executive Threat Summary</span>
        </h3>
        <p style={{ color: 'var(--fg-muted)', fontSize: 11.5, margin: '0 0 10px 0' }}>
          {isLiveSessionReport
            ? `Synthesized from ${committedUtteranceCount} verified dialogue segments, distinguishing between caller extortion vectors and decoy responses.`
            : `Synthesized from ${report.inputs.length} submitted evidentiary records.`}
        </p>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--fg)', margin: '0 0 14px 0' }}>
          {report.summary?.includes('คดีอยู่ในสถานะรวบรวมหลักฐาน')
            ? 'Case is currently compiling evidentiary records or in early session initialization. No definitive threats confirmed yet.'
            : report.summary}
        </p>
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            background: 'rgba(16, 185, 129, 0.08)',
            borderLeft: '4px solid var(--emerald)',
          }}
        >
          <strong style={{ fontSize: 12.5, color: 'var(--emerald)' }}>Operational Advisory:</strong>
          <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
            {report.recommendation?.includes('วิเคราะห์สำนวนคดีด้วย AI')
              ? 'If further dialogue or telemetry is captured, trigger "Re-Analyze" to synthesize conclusions and evaluate indicators in detail.'
              : report.recommendation}
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
            <span>Voice Intercept Dialogue Timeline</span>
            <span className="code-tag" style={{ fontSize: 10 }}>{timeline.length} segments</span>
          </h3>
        </div>

        {timeline.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
            No live dialogue recordings captured in this session.
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
                        {isUser ? 'CITIZEN (RECIPIENT)' : 'CALLER (SUSPECT)'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                        {new Date(u.startedAtMs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--fg)', lineHeight: 1.5 }}>
                      {u.text}
                    </p>
                  </div>
                  {effectiveSessionId && (
                    <button
                      type="button"
                      className="btn-action btn-action-ghost"
                      onClick={() => void correctUtterance(u)}
                      style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* EVIDENCE & THREAT CHECKS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* EVIDENCE */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px 0' }}>
            Extracted Fraudulent Evidence
          </h3>
          {report.evidence.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: 0 }}>
              No overt deceptive coercion statements detected.
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
            External Threat Intelligence Feeds
          </h3>
          {report.threatChecks.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: 0 }}>
              No external indicators required registry lookups.
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
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{check.message ?? 'No additional details on file'}</div>
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
          Community Threat Intelligence Sharing
        </h3>
        <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 14px 0' }}>
          Designate extracted indicators of compromise (IOCs) for submission to national cybersecurity clearinghouses. Personal complainant identities are redacted by default.
        </p>

        {report.entities.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '0 0 12px 0' }}>
            This dossier contains no extractable identifiers suitable for community dissemination.
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
            <span>I authorize the dispatch of selected indicators to the national threat intelligence queue under standard privacy provisions.</span>
          </label>

          <div>
            <button
              type="button"
              className="btn-action btn-action-primary"
              disabled={!consentConfirmed || selectedIds.length === 0 || Boolean(proposal)}
              onClick={submitShare}
              style={{ fontSize: 12, padding: '7px 16px' }}
            >
              {proposal ? `Submitted: ${proposal.status}` : 'Submit Selected Indicators'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
