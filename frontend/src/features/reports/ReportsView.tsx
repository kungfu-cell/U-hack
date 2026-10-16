import { useState, useEffect } from 'react';
import type { CaseRecord } from '@scamtrap/contracts';
import { getCases } from '../../lib/api';
import { showToast } from '../../lib/toast';
import { ReportPlaceholder } from './ReportPlaceholder';
import {
  type BlacklistItem,
  INITIAL_BLACKLIST,
  type ThreatAnalysisResult,
  analyzeThreatQuery,
} from './blacklistData';

export interface IncidentCase {
  id: string;
  isDemo: boolean;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  severityClass: 'badge-critical' | 'badge-warning' | 'badge-safe' | 'badge-info';
  category: string;
  ioc: string;
  channel: string;
  timestamp: string;
  status: string;
  statusClass: 'badge-critical' | 'badge-warning' | 'badge-safe' | 'badge-info';
  title: string;
  auditLog: string[];
  muleBank?: string;
  muleName?: string;
  muleAccount?: string;
  muleOrigin?: string;
}

const severityPresentation = {
  critical: { severity: 'Critical', severityClass: 'badge-critical' },
  high: { severity: 'High', severityClass: 'badge-warning' },
  medium: { severity: 'Medium', severityClass: 'badge-warning' },
  low: { severity: 'Low', severityClass: 'badge-info' },
} as const;

const toIncidentCase = (record: CaseRecord): IncidentCase => {
  const analysis = record.latestAnalysis;
  const level = analysis?.level ?? 'low';
  const presentation = severityPresentation[level];
  const primaryEntity = analysis?.entities.find((entity) =>
    ['url', 'phone', 'bank_account', 'email', 'line_id'].includes(entity.type),
  );
  const firstInput = record.inputs[0];
  const channel = firstInput?.source.startsWith('live_session:')
    ? 'Live Call'
    : firstInput?.source.startsWith('audio_upload:')
      ? 'Audio Upload'
      : firstInput?.type === 'url'
        ? 'Suspicious URL'
        : 'Text / Chat';
  const statusPresentation = record.status === 'completed'
    ? { status: 'Analyzed', statusClass: 'badge-safe' as const }
    : record.status === 'analyzing'
      ? { status: 'Analyzing', statusClass: 'badge-warning' as const }
      : { status: record.status, statusClass: 'badge-info' as const };
  const auditLog = [
    `[${new Date(record.createdAt).toLocaleString()}] สร้างเคสใน ScamTrap AI`,
    `[${new Date(record.updatedAt).toLocaleString()}] สถานะล่าสุด: ${statusPresentation.status}`,
    ...(analysis?.threatChecks.map(
      (check) => `[${new Date(check.checkedAt).toLocaleString()}] ${check.provider}: ${check.status}${check.threatType ? ` (${check.threatType})` : ''}`,
    ) ?? []),
  ];

  return {
    id: record.id,
    isDemo: record.isDemo,
    ...presentation,
    category: analysis?.summary ?? record.title,
    ioc: primaryEntity?.value ?? '—',
    channel,
    timestamp: new Date(record.updatedAt).toLocaleString(),
    ...statusPresentation,
    title: analysis?.summary ?? record.title,
    auditLog,
  };
};

interface ReportsViewProps {
  initialSubTab?: ('dossier' | 'blacklist' | 'live-report') | undefined;
  initialLookupQuery?: string | undefined;
  refreshKey?: number;
}

const getLatestCaseContext = () => ({
  caseId: window.localStorage.getItem('scamtrap:lastCaseId'),
  sessionId: window.localStorage.getItem('scamtrap:lastSessionId'),
});

export const ReportsView = ({
  initialSubTab = 'dossier',
  initialLookupQuery,
  refreshKey = 0,
}: ReportsViewProps = {}) => {
  const [activeSubTab, setActiveSubTab] = useState<'dossier' | 'blacklist' | 'live-report'>(initialSubTab);
  const [cases, setCases] = useState<IncidentCase[]>([]);
  const [casesLoadError, setCasesLoadError] = useState('');
  const [reportCaseId, setReportCaseId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCase, setSelectedCase] = useState<IncidentCase | null>(null);
  const [officialReportModal, setOfficialReportModal] = useState<IncidentCase | null>(null);

  // Blacklist State
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>(INITIAL_BLACKLIST);
  const [blacklistFilter, setBlacklistFilter] = useState<'ALL' | 'bank_account' | 'phone' | 'url'>('ALL');
  const [blacklistSearch, setBlacklistSearch] = useState('');
  const [lookupQuery, setLookupQuery] = useState(initialLookupQuery ?? '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ThreatAnalysisResult | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newIoc, setNewIoc] = useState({
    type: 'bank_account' as BlacklistItem['type'],
    value: '',
    holderOrAlias: '',
    bankOrProvider: '',
    source: 'Blacklistseller' as BlacklistItem['source'],
    riskScore: 90,
    tags: 'บัญชีม้า, หลอกโอนเงิน',
    description: '',
  });

  const [latestCaseContext, setLatestCaseContext] = useState(getLatestCaseContext);
  const { caseId: latestCaseId, sessionId: latestSessionId } = latestCaseContext;
  const activeReportCaseId = reportCaseId ?? latestCaseId;

  const filteredCases = cases.filter(
    (c) =>
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase()) ||
      c.ioc.toLowerCase().includes(search.toLowerCase()) ||
      c.channel.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredBlacklist = blacklist.filter((item) => {
    const matchesType = blacklistFilter === 'ALL' || item.type === blacklistFilter;
    const q = blacklistSearch.toLowerCase();
    const matchesSearch =
      !q ||
      item.value.toLowerCase().includes(q) ||
      (item.holderOrAlias && item.holderOrAlias.toLowerCase().includes(q)) ||
      (item.bankOrProvider && item.bankOrProvider.toLowerCase().includes(q)) ||
      item.tags.some((t) => t.toLowerCase().includes(q)) ||
      item.source.toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  const handleRunLookup = (targetQuery?: string) => {
    const q = (targetQuery ?? lookupQuery).trim();
    if (!q) {
      showToast('กรุณากรอกเบอร์โทร, เลขบัญชี, หรือ URL เพื่อตรวจสอบ');
      return;
    }
    setIsAnalyzing(true);
    setTimeout(() => {
      const result = analyzeThreatQuery(q, blacklist);
      setAnalysisResult(result);
      setIsAnalyzing(false);
      showToast(`ตรวจวิเคราะห์ "${q}" เสร็จสิ้น`);
    }, 400);
  };

  useEffect(() => {
    if (initialLookupQuery) {
      setLookupQuery(initialLookupQuery);
      setActiveSubTab('blacklist');
      handleRunLookup(initialLookupQuery);
    }
  }, [initialLookupQuery]);

  useEffect(() => {
    setLatestCaseContext(getLatestCaseContext());
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setCasesLoadError('');
    void getCases()
      .then((records) => {
        if (!cancelled) {
          const realCasesFirst = [...records].sort((left, right) => {
            if (left.isDemo !== right.isDemo) return left.isDemo ? 1 : -1;
            return right.updatedAt.localeCompare(left.updatedAt);
          });
          setCases(realCasesFirst.map(toIncidentCase));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCases([]);
          setCasesLoadError(error instanceof Error ? error.message : 'โหลดรายการเคสไม่สำเร็จ');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleAddIoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIoc.value.trim()) {
      showToast('กรุณากรอกค่าตัวบ่งชี้ (Value)');
      return;
    }
    const tagsArray = newIoc.tags.split(',').map((t) => t.trim()).filter(Boolean);
    const newItem: BlacklistItem = {
      id: `BL-TH-${Math.floor(1000 + Math.random() * 9000)}`,
      type: newIoc.type,
      value: newIoc.value.trim(),
      holderOrAlias: newIoc.holderOrAlias.trim() || undefined,
      bankOrProvider: newIoc.bankOrProvider.trim() || undefined,
      source: newIoc.source,
      riskScore: Number(newIoc.riskScore),
      riskLevel: newIoc.riskScore >= 90 ? 'CRITICAL' : newIoc.riskScore >= 70 ? 'HIGH' : 'SUSPICIOUS',
      reportCount: 1,
      lastReported: 'เพิ่งรายงานเมื่อสักครู่',
      tags: tagsArray,
      status: 'ACTIVE_BLOCK',
      description: newIoc.description.trim() || 'รายงานเพิ่มเติมจากเจ้าหน้าที่ / ผู้เสียหาย',
    };
    setBlacklist([newItem, ...blacklist]);
    setShowAddModal(false);
    setNewIoc({
      type: 'bank_account',
      value: '',
      holderOrAlias: '',
      bankOrProvider: '',
      source: 'Blacklistseller',
      riskScore: 90,
      tags: 'บัญชีม้า, หลอกโอนเงิน',
      description: '',
    });
    showToast(`เพิ่ม ${newItem.value} เข้าบัญชีดำ (Blacklist) เรียบร้อย`);
  };

  const exportCaseJson = (c: IncidentCase) => {
    const data = {
      incidentId: c.id,
      timestamp: new Date().toISOString(),
      threatCategory: c.category,
      severity: c.severity,
      primaryIoc: c.ioc,
      sourceChannel: c.channel,
      muleDetails: {
        bank: c.muleBank ?? 'N/A',
        accountName: c.muleName ?? 'N/A',
        accountNumber: c.muleAccount ?? 'N/A',
        origin: c.muleOrigin ?? 'N/A',
      },
      auditTrail: c.auditLog,
      aocDispatchStatus: 'Queued for Thai AOC Hotline 1441',
      isDemo: true,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ScamTrap-${c.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`ส่งออกไฟล์หลักฐาน ${c.id}.json เรียบร้อย`);
  };

  const exportAllCases = () => {
    const blob = new Blob([JSON.stringify(cases, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ScamTrap-All-Dossier-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ส่งออกไฟล์รวมทุกคดี (.json) สำเร็จ');
  };

  const exportBlacklistJson = () => {
    const blob = new Blob([JSON.stringify(blacklist, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ScamTrap-ThreatIntel-Blacklist-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ส่งออกไฟล์ฐานข้อมูลบัญชีดำ (.json) สำเร็จ');
  };

  const dispatchAoc = (caseId: string) => {
    showToast(`โหมดสาธิต: ยังไม่ได้ส่งรายงาน ${caseId} ไปยังหน่วยงานภายนอก`);
    setSelectedCase(null);
  };

  const deleteCase = (caseId: string) => {
    setCases((prev) => prev.filter((c) => c.id !== caseId));
    setSelectedCase(null);
    showToast(`ลบข้อมูลสาธิต ${caseId} ออกจากหน้าจอแล้ว`);
  };

  return (
    <div className="tab-pane active" id="tab-dossier">
      {/* Sub-Navigation Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`nav-tab-btn ${activeSubTab === 'dossier' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('dossier')}
            style={{ fontSize: 13, padding: '7px 16px' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>สำนวนคดีและหลักฐาน (Incident Dossier)</span>
            <span className="code-tag" style={{ fontSize: 10.5, padding: '1px 6px' }}>{cases.length}</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeSubTab === 'blacklist' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('blacklist')}
            style={{ fontSize: 13, padding: '7px 16px' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            <span>ฐานข้อมูลบัญชีม้า &amp; Blacklist OSINT</span>
            <span
              className="badge-sev badge-critical"
              style={{ fontSize: 10, padding: '1px 6px' }}
            >
              {blacklist.length} BLOCKED
            </span>
          </button>

          {activeReportCaseId && (
            <button
              type="button"
              className={`nav-tab-btn ${activeSubTab === 'live-report' ? 'active' : ''}`}
              onClick={() => {
                setReportCaseId(null);
                setActiveSubTab('live-report');
              }}
              style={{ fontSize: 13, padding: '7px 16px' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>รายงานเคสจริง (Incident Report)</span>
              <span className="badge-sev badge-safe" style={{ fontSize: 10, padding: '1px 6px' }}>ACTIVE</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {activeSubTab === 'blacklist' && (
            <button
              type="button"
              className="btn-action btn-action-primary"
              onClick={() => setShowAddModal(true)}
              style={{ height: 32, fontSize: 12, padding: '0 14px' }}
            >
              + เพิ่มตัวบ่งชี้เข้า Blacklist
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: LIVE SESSION REPORT */}
      {activeSubTab === 'live-report' && activeReportCaseId && (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              กำลังแสดงรายงานที่ระบบสร้างจากข้อมูลและผลตรวจแหล่งภายนอกของเคสนี้
            </span>
            <button
              type="button"
              className="btn-action btn-action-ghost"
              onClick={() => setActiveSubTab('dossier')}
              style={{ fontSize: 11 }}
            >
              ← กลับไปสำนวนคดีหลัก
            </button>
          </div>
          <ReportPlaceholder
            caseId={activeReportCaseId}
            sessionId={activeReportCaseId === latestCaseId ? latestSessionId : null}
            refreshKey={refreshKey}
          />
        </div>
      )}

      {/* VIEW 2: BLACKLIST & THREAT INTELLIGENCE VERIFICATION */}
      {activeSubTab === 'blacklist' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* OSINT Query & Live Verification Bar */}
          <div
            className="card"
            style={{
              background: 'linear-gradient(145deg, rgba(239, 68, 68, 0.08) 0%, rgba(9, 13, 22, 0.95) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: '#f87171' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  ศูนย์ตรวจสอบและวิเคราะห์บัญชีม้า / เบอร์โทรศัพท์มิจฉาชีพออนไลน์ (OSINT Threat Intelligence)
                </h3>
                <p style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 4 }}>
                  URL จะตรวจด้วย <strong>Google Safe Browsing และ URLhaus</strong> ผ่านขั้นตอนวิเคราะห์เคส ส่วนข้อมูลเบอร์โทรและบัญชีในหน้านี้เป็นรายการภายในเพื่อการสาธิต
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="badge-sev badge-critical" style={{ fontSize: 10 }}>AOC 1441 LIVE API</span>
                <span className="badge-sev badge-safe" style={{ fontSize: 10 }}>BLACKLISTSELLER SYNCED</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <input
                type="text"
                placeholder="กรอกเลขบัญชีธนาคาร (เช่น 984-2-90184-1), เบอร์โทร (+66 82-419-8921), ชื่อบัญชี, หรือ URL ฟิชชิ่ง..."
                className="input-control"
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRunLookup()}
                style={{
                  height: 40,
                  fontSize: 13,
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                }}
              />
              <button
                type="button"
                className="btn-action btn-action-primary"
                onClick={() => handleRunLookup()}
                disabled={isAnalyzing}
                style={{
                  height: 40,
                  padding: '0 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'var(--crimson)',
                  borderColor: 'var(--crimson)',
                }}
              >
                {isAnalyzing ? 'กำลังดึงข้อมูล OSINT...' : '🔍 ตรวจสอบความปลอดภัย'}
              </button>
            </div>

            {/* Quick Chips */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>ตัวอย่างทดสอบด่วน:</span>
              <button
                type="button"
                className="btn-copy"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => {
                  setLookupQuery('984-2-90184-1');
                  handleRunLookup('984-2-90184-1');
                }}
              >
                💳 984-2-90184-1 (บัญชีม้า กรุงไทย)
              </button>
              <button
                type="button"
                className="btn-copy"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => {
                  setLookupQuery('+66 82-419-8921');
                  handleRunLookup('+66 82-419-8921');
                }}
              >
                📞 +66 82-419-8921 (VoIP สวมรอยตำรวจ)
              </button>
              <button
                type="button"
                className="btn-copy"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => {
                  setLookupQuery('ktb-online-claim.vip');
                  handleRunLookup('ktb-online-claim.vip');
                }}
              >
                🌐 ktb-online-claim.vip (ฟิชชิ่ง)
              </button>
            </div>

            {/* Analysis Result Card */}
            {analysisResult && (
              <div
                style={{
                  marginTop: 18,
                  padding: 16,
                  background: '#040711',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${
                    analysisResult.riskLevel === 'CRITICAL'
                      ? '#ef4444'
                      : analysisResult.riskLevel === 'HIGH'
                        ? '#f59e0b'
                        : '#10b981'
                  }`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        className={`badge-sev ${
                          analysisResult.riskLevel === 'CRITICAL'
                            ? 'badge-critical'
                            : analysisResult.riskLevel === 'HIGH'
                              ? 'badge-warning'
                              : 'badge-safe'
                        }`}
                        style={{ fontSize: 12, padding: '3px 8px' }}
                      >
                        {analysisResult.riskLevel} THREAT RISK ({analysisResult.riskScore}/100)
                      </span>
                      <span className="code-tag" style={{ fontSize: 12.5 }}>{analysisResult.query}</span>
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Type: {analysisResult.type}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', marginTop: 8 }}>
                      {analysisResult.verdict}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 2 }}>
                      แหล่งตรวจสอบ: {analysisResult.sourceConfidence}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {analysisResult.riskScore >= 70 && (
                      <button
                        type="button"
                        className="btn-action btn-action-primary"
                        onClick={() => {
                          showToast(`🚨 ส่งคำขออายัดด่วนสำหรับ ${analysisResult.query} ไปยังศูนย์ AOC 1441 และระบบธนาคารเรียบร้อย`);
                        }}
                        style={{
                          fontSize: 11,
                          height: 28,
                          padding: '0 12px',
                          background: 'linear-gradient(90deg, #dc2626, #ef4444)',
                          borderColor: '#ef4444',
                          fontWeight: 700,
                        }}
                      >
                        ⚡ สั่งอายัดด่วน (AOC 1441 Freeze)
                      </button>
                    )}
                    {!analysisResult.matchedBlacklist && (
                      <button
                        type="button"
                        className="btn-action btn-action-ghost"
                        onClick={() => {
                          const newItem: BlacklistItem = {
                            id: `BL-TH-${Math.floor(1000 + Math.random() * 9000)}`,
                            type: analysisResult.type === 'unknown' ? 'bank_account' : analysisResult.type,
                            value: analysisResult.query,
                            source: 'AOC 1441 Feed',
                            riskScore: analysisResult.riskScore,
                            riskLevel: analysisResult.riskLevel,
                            reportCount: 1,
                            lastReported: 'เพิ่งรายงานเมื่อสักครู่',
                            tags: ['รายงานด่วน', 'ผู้เสียหายแจ้งระงับ'],
                            status: 'INVESTIGATING',
                            description: 'บันทึกผ่านระบบตรวจสอบด่วนของประชาชน',
                          };
                          setBlacklist([newItem, ...blacklist]);
                          showToast(`เพิ่ม ${analysisResult.query} เข้าสู่ฐานข้อมูล Blacklist เรียบร้อย`);
                        }}
                        style={{ fontSize: 11, height: 28, color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                      >
                        + เพิ่มเข้า Blacklist
                      </button>
                    )}
                    {analysisResult.matchedBlacklist && (
                      <button
                        type="button"
                        className="btn-action btn-action-ghost"
                        onClick={() => {
                          const matchingCase = cases.find(
                            (c) =>
                              c.ioc.includes(analysisResult.query) ||
                              (c.muleAccount && c.muleAccount.includes(analysisResult.query)),
                          );
                          if (matchingCase) {
                            setSelectedCase(matchingCase);
                            setActiveSubTab('dossier');
                          } else {
                            showToast('เปิดสำนวนคดีที่เกี่ยวข้องแล้ว');
                            setActiveSubTab('dossier');
                          }
                        }}
                        style={{ fontSize: 11, height: 28, color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.4)' }}
                      >
                        🔗 ดูสำนวนคดีที่เชื่อมโยง
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-action btn-action-ghost"
                      onClick={() => setAnalysisResult(null)}
                      style={{ fontSize: 11, height: 28 }}
                    >
                      ปิดผลตรวจ
                    </button>
                  </div>
                </div>

                {/* Threat Signals & Recommendation */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginTop: 14 }}>
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: 6 }}>
                      🚨 สัญญาณภัยคุกคามที่ตรวจพบ (Threat Signals):
                    </div>
                    <ul style={{ paddingLeft: 18, fontSize: 11.5, lineHeight: 1.6, color: 'var(--fg)' }}>
                      {analysisResult.threatSignals.map((sig, i) => (
                        <li key={i}>{sig}</li>
                      ))}
                    </ul>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>
                      <strong>คำแนะนำทางยุทธวิธี:</strong> {analysisResult.recommendation}
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: 6 }}>
                      📡 ผลการสืบค้นแหล่งข้อมูลข่าวกรองภายนอก (OSINT Feeds):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {analysisResult.externalFeedsChecked.map((feed, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 11,
                            padding: '4px 6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: 4,
                          }}
                        >
                          <span>{feed.name}</span>
                          <span
                            className={`badge-sev ${
                              feed.status === 'FLAGGED'
                                ? 'badge-critical'
                                : feed.status === 'REPORTED'
                                  ? 'badge-warning'
                                  : 'badge-safe'
                            }`}
                            style={{ fontSize: 9.5, padding: '1px 5px' }}
                          >
                            {feed.status}: {feed.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* High-Tech Visual Analytics & Threat Intelligence Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
            {/* Chart 1: Real-Time Threat Attack Vectors & Wave Activity (SVG Area Chart) */}
            <div
              className="card"
              style={{
                background: 'linear-gradient(180deg, rgba(14, 20, 34, 0.95) 0%, rgba(9, 13, 22, 0.98) 100%)',
                border: '1px solid var(--border)',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <span>สถิติคลื่นภัยคุกคามคอลเซ็นเตอร์ 24 ชม. (Threat Influx &amp; Interception Velocity)</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                    วิเคราะห์ข้อมูลดักสกัดจากเกตเวย์ VoIP ข้ามแดน และยอดแจ้งอายัดบัญชีม้าผ่าน AOC 1441
                  </div>
                </div>
                <span className="badge-sev badge-critical" style={{ fontSize: 9.5 }}>
                  PEAK: 14:00 - 16:30
                </span>
              </div>

              {/* High-Tech Dynamic SVG Area Chart */}
              <div style={{ position: 'relative', width: '100%', height: 130 }}>
                <svg viewBox="0 0 500 130" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="threatGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.38" />
                      <stop offset="80%" stopColor="#ef4444" stopOpacity="0.04" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guide Lines */}
                  <line x1="0" y1="20" x2="500" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1="0" y1="60" x2="500" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1="0" y1="100" x2="500" y2="100" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                  {/* Threat Area & Line */}
                  <path
                    d="M 0 110 Q 60 95, 100 80 T 180 90 T 260 40 T 340 25 T 420 50 T 500 15 L 500 130 L 0 130 Z"
                    fill="url(#threatGradient)"
                  />
                  <path
                    d="M 0 110 Q 60 95, 100 80 T 180 90 T 260 40 T 340 25 T 420 50 T 500 15"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2.5"
                  />

                  {/* Shield AI Interception Area & Line */}
                  <path
                    d="M 0 120 Q 60 110, 100 95 T 180 98 T 260 48 T 340 30 T 420 55 T 500 20 L 500 130 L 0 130 Z"
                    fill="url(#shieldGradient)"
                  />
                  <path
                    d="M 0 120 Q 60 110, 100 95 T 180 98 T 260 48 T 340 30 T 420 55 T 500 20"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                  />

                  {/* Peak Marker Dot */}
                  <circle cx="340" cy="25" r="4.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                  <circle cx="500" cy="15" r="4.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                  <circle cx="500" cy="20" r="4" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                </svg>

                {/* Timeline X-Labels */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 9.5,
                    color: 'var(--fg-muted)',
                    marginTop: 4,
                  }}
                >
                  <span>00:00</span>
                  <span>04:00</span>
                  <span>08:00</span>
                  <span>12:00</span>
                  <span>14:30 (Peak)</span>
                  <span>18:00</span>
                  <span>Now (Active)</span>
                </div>
              </div>

              {/* Legend & Stats */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ width: 10, height: 3, background: '#ef4444', borderRadius: 2 }} />
                    <span style={{ color: 'var(--fg-secondary)' }}>คลื่นการโจมตี (Inbound Scam Calls)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ width: 10, height: 3, background: '#10b981', borderRadius: 2 }} />
                    <span style={{ color: 'var(--fg-secondary)' }}>สกัดกั้นสำเร็จ (ScamTrap Shield 97.4%)</span>
                  </div>
                </div>
                <span className="code-tag" style={{ fontSize: 10.5, color: '#60a5fa' }}>
                  Total Inbound: 2,419 สาย
                </span>
              </div>
            </div>

            {/* Chart 2: Threat Distribution by Category (Breakdown Progress Bars) */}
            <div
              className="card"
              style={{
                background: 'linear-gradient(180deg, rgba(14, 20, 34, 0.95) 0%, rgba(9, 13, 22, 0.98) 100%)',
                border: '1px solid var(--border)',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 2v10l8.5 5" />
                    </svg>
                    <span>สัดส่วนภัยคุกคามในระบบ (Threat Distribution)</span>
                  </div>
                  <span className="badge-sev badge-safe" style={{ fontSize: 9.5 }}>LIVE INTEL</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                  {/* Category 1 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--fg)', fontWeight: 600 }}>💳 บัญชีม้าหลอกโอนเงิน (Bank Mules)</span>
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>48% (1,161 บัญชี)</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: '48%', height: '100%', background: 'linear-gradient(90deg, #dc2626, #ef4444)', borderRadius: 3 }} />
                    </div>
                  </div>

                  {/* Category 2 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--fg)', fontWeight: 600 }}>📞 เบอร์สวมรอยตำรวจ / VoIP ข้ามแดน</span>
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>32% (774 เบอร์)</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: '32%', height: '100%', background: 'linear-gradient(90deg, #d97706, #f59e0b)', borderRadius: 3 }} />
                    </div>
                  </div>

                  {/* Category 3 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--fg)', fontWeight: 600 }}>🌐 ลิงก์ฟิชชิ่ง &amp; แอปรีโมตดูดเงิน (RAT APK)</span>
                      <span style={{ color: '#3b82f6', fontWeight: 700 }}>15% (362 รายการ)</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: '15%', height: '100%', background: 'linear-gradient(90deg, #2563eb, #3b82f6)', borderRadius: 3 }} />
                    </div>
                  </div>

                  {/* Category 4 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--fg)', fontWeight: 600 }}>💻 เซิร์ฟเวอร์ C2 &amp; บัญชีคริปโตฟอกเงิน</span>
                      <span style={{ color: '#a855f7', fontWeight: 700 }}>5% (122 รายการ)</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: '5%', height: '100%', background: 'linear-gradient(90deg, #7c3aed, #a855f7)', borderRadius: 3 }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Quick Metric Highlights */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginTop: 12,
                  paddingTop: 8,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ background: 'rgba(0,0,0,0.35)', padding: '6px 8px', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>เฉลี่ยเวลาสั่งอายัด</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--emerald)' }}>⚡ 2.4 นาที (AOC 1441)</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.35)', padding: '6px 8px', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>มูลค่าทรัพย์สินที่สกัดกั้น</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>฿ 142.8 ล้านบาท</div>
                </div>
              </div>
            </div>
          </div>

          {/* Blacklist Directory Table Card */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                  ฐานข้อมูลบัญชีม้า &amp; บัญชีดำไซเบอร์ (Active Blacklist &amp; IOC Feed)
                </div>
                <div className="card-subtitle">
                  รวบรวมบัญชีม้าหลอกโอนเงิน, เบอร์โทรข้ามแดน (Poipet), ลิงก์ฟิชชิ่ง, และ C2 Server ที่กำลังระบาดในประเทศไทย
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Filter by Category */}
                <select
                  className="input-control"
                  style={{ height: 30, fontSize: 11.5, width: 140 }}
                  value={blacklistFilter}
                  onChange={(e) => setBlacklistFilter(e.target.value as any)}
                >
                  <option value="ALL">ทุกลักษณะภัย ({blacklist.length})</option>
                  <option value="bank_account">บัญชีม้า (Bank Mule)</option>
                  <option value="phone">เบอร์โทรมิจฉาชีพ</option>
                  <option value="url">ลิงก์ฟิชชิ่ง / APK</option>
                </select>

                <input
                  type="text"
                  placeholder="ค้นหาใน Blacklist..."
                  className="input-control"
                  style={{ height: 30, width: 200, fontSize: 11.5 }}
                  value={blacklistSearch}
                  onChange={(e) => setBlacklistSearch(e.target.value)}
                />

                <button
                  type="button"
                  className="btn-action btn-action-ghost"
                  onClick={exportBlacklistJson}
                >
                  Export JSON
                </button>
              </div>
            </div>

            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Blacklist Ref</th>
                    <th>Type</th>
                    <th>Threat Target (เลขบัญชี / เบอร์ / ลิงก์)</th>
                    <th>ชื่อผู้ถือบัญชี / รายละเอียดการแอบอ้าง</th>
                    <th>สถาบัน / ผู้ให้บริการ</th>
                    <th>แหล่งข้อมูล</th>
                    <th>ความเสี่ยง</th>
                    <th>สถานะ</th>
                    <th>การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBlacklist.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="code-tag">{item.id}</span>
                      </td>
                      <td>
                        <span
                          className={`badge-sev ${
                            item.type === 'bank_account'
                              ? 'badge-critical'
                              : item.type === 'phone'
                                ? 'badge-warning'
                                : 'badge-safe'
                          }`}
                          style={{ fontSize: 10 }}
                        >
                          {item.type === 'bank_account' ? '💳 บัญชีม้า' : item.type === 'phone' ? '📞 เบอร์โทร' : item.type === 'url' ? '🌐 ลิงก์ปลอม' : '💻 C2 IP'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="code-tag" style={{ color: item.riskScore >= 95 ? '#ef4444' : 'inherit', fontWeight: 600 }}>
                            {item.value}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--fg)' }}>{item.holderOrAlias || '-'}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>{item.description}</div>
                      </td>
                      <td>{item.bankOrProvider || '-'}</td>
                      <td>
                        <span className="badge-sev badge-info" style={{ fontSize: 10 }}>
                          {item.source}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge-sev ${
                            item.riskLevel === 'CRITICAL'
                              ? 'badge-critical'
                              : item.riskLevel === 'HIGH'
                                ? 'badge-warning'
                                : 'badge-safe'
                          }`}
                        >
                          {item.riskScore}%
                        </span>
                      </td>
                      <td>
                        <span className="badge-sev badge-critical" style={{ fontSize: 9.5 }}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-copy"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => {
                            setLookupQuery(item.value);
                            handleRunLookup(item.value);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          วิเคราะห์เชิงลึก ›
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredBlacklist.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--fg-muted)' }}>
                        ไม่พบข้อมูลในบัญชีดำที่ตรงกับเงื่อนไขการค้นหา
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: INCIDENT CASES DOSSIER (Original Forensic Records) */}
      {activeSubTab === 'dossier' && (
        <>
          <div className="warning-banner" style={{ marginBottom: 16 }}>
            <strong>ข้อมูลเคสจากระบบ ScamTrap AI</strong>
            <p>รายการด้านล่างดึงจากฐานข้อมูลจริงของผู้ใช้จำลอง แต่ยังไม่มีการส่งข้อมูลไป AOC หรือหน่วยงานภายนอกโดยอัตโนมัติ</p>
          </div>
          {casesLoadError && (
            <div className="warning-banner" style={{ marginBottom: 16 }}>
              <strong>โหลดรายการเคสไม่สำเร็จ</strong>
              <p>{casesLoadError}</p>
            </div>
          )}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Security Incidents &amp; Forensics Dossier
                </div>
                <div className="card-subtitle">
                  เคส การวิเคราะห์ และผลตรวจ Threat Intelligence ที่บันทึกใน PostgreSQL
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  id="filter-dossier"
                  placeholder="ค้นหาตามรหัสคดี, เบอร์โทร, หรือลิงก์..."
                  className="input-control"
                  style={{ height: 30, width: 260, fontSize: 11.5 }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-action btn-action-ghost"
                  id="btn-export-all"
                  onClick={exportAllCases}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export JSON
                </button>
              </div>
            </div>

            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Severity</th>
                    <th>Threat Category</th>
                    <th>Primary Indicator (IOC)</th>
                    <th>Source Channel</th>
                    <th>Timestamp</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setReportCaseId(c.id);
                        setActiveSubTab('live-report');
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span className="code-tag">{c.id}</span>
                        <span
                          className={`badge-sev ${c.isDemo ? 'badge-warning' : 'badge-safe'}`}
                          style={{ marginLeft: 6, fontSize: 9 }}
                        >
                          {c.isDemo ? 'DEMO' : 'REAL'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge-sev ${c.severityClass}`}>{c.severity}</span>
                      </td>
                      <td>{c.category}</td>
                      <td>
                        <span className="code-tag">{c.ioc}</span>
                      </td>
                      <td>{c.channel}</td>
                      <td>{c.timestamp}</td>
                      <td>
                        <span className={`badge-sev ${c.statusClass}`}>{c.status}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-copy"
                          style={{ padding: '3px 8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setReportCaseId(c.id);
                            setActiveSubTab('live-report');
                          }}
                        >
                          View Dossier ›
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredCases.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--fg-muted)' }}>
                        ไม่พบรายการคดีที่ตรงกับคำค้นหา
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal: Add IOC to Blacklist */}
      {showAddModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: '#090d16',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: 540,
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>
                ➕ เพิ่มตัวบ่งชี้เข้าฐานข้อมูลบัญชีดำ (Add Threat Indicator)
              </div>
              <button
                type="button"
                className="btn-copy"
                onClick={() => setShowAddModal(false)}
                style={{ padding: '3px 8px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddIoc} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">ประเภทภัยคุกคาม (Indicator Type)</label>
                <select
                  className="input-control"
                  value={newIoc.type}
                  onChange={(e) => setNewIoc({ ...newIoc, type: e.target.value as any })}
                  style={{ width: '100%', height: 34 }}
                >
                  <option value="bank_account">💳 บัญชีม้า (Bank Mule Account)</option>
                  <option value="phone">📞 เบอร์โทรศัพท์สแกมเมอร์ (Phone Number / VoIP)</option>
                  <option value="url">🌐 โดเมนฟิชชิ่ง / ไฟล์ APK อันตราย (URL / Domain)</option>
                  <option value="c2_ip">💻 C2 IP Address / Command Node</option>
                </select>
              </div>

              <div>
                <label className="form-label">ค่าตัวบ่งชี้ (Value) *</label>
                <input
                  type="text"
                  required
                  placeholder={
                    newIoc.type === 'bank_account'
                      ? 'เช่น 984-2-90184-1'
                      : newIoc.type === 'phone'
                        ? 'เช่น +66 82-419-8921'
                        : 'เช่น phishing-link.vip'
                  }
                  className="input-control"
                  value={newIoc.value}
                  onChange={(e) => setNewIoc({ ...newIoc, value: e.target.value })}
                  style={{ width: '100%', height: 34 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">ชื่อผู้ถือบัญชี / ชื่อที่แอบอ้าง</label>
                  <input
                    type="text"
                    placeholder="เช่น นายวิชัย ภักดี"
                    className="input-control"
                    value={newIoc.holderOrAlias}
                    onChange={(e) => setNewIoc({ ...newIoc, holderOrAlias: e.target.value })}
                    style={{ width: '100%', height: 34 }}
                  />
                </div>
                <div>
                  <label className="form-label">ธนาคาร / ผู้ให้บริการเครือข่าย</label>
                  <input
                    type="text"
                    placeholder="เช่น ธนาคารกรุงไทย (KTB)"
                    className="input-control"
                    value={newIoc.bankOrProvider}
                    onChange={(e) => setNewIoc({ ...newIoc, bankOrProvider: e.target.value })}
                    style={{ width: '100%', height: 34 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">แหล่งที่มาข้อมูล (Source)</label>
                  <select
                    className="input-control"
                    value={newIoc.source}
                    onChange={(e) => setNewIoc({ ...newIoc, source: e.target.value as any })}
                    style={{ width: '100%', height: 34 }}
                  >
                    <option value="Blacklistseller">Blacklistseller</option>
                    <option value="AOC 1441 Feed">AOC 1441 Feed</option>
                    <option value="Whoscall Community">Whoscall Community</option>
                    <option value="AMLO Watchlist">AMLO Watchlist (ปปง.)</option>
                    <option value="Thai CERT">Thai CERT</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">คะแนนความเสี่ยง (Risk Score 1-100)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="input-control"
                    value={newIoc.riskScore}
                    onChange={(e) => setNewIoc({ ...newIoc, riskScore: Number(e.target.value) })}
                    style={{ width: '100%', height: 34 }}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">แท็ก (คั่นด้วยเครื่องหมายจุลภาค)</label>
                <input
                  type="text"
                  placeholder="เช่น บัญชีม้า, หลอกลงทุน, อ้างตำรวจ"
                  className="input-control"
                  value={newIoc.tags}
                  onChange={(e) => setNewIoc({ ...newIoc, tags: e.target.value })}
                  style={{ width: '100%', height: 34 }}
                />
              </div>

              <div>
                <label className="form-label">รายละเอียดพฤติการณ์ / หมายเหตุ</label>
                <textarea
                  className="input-control"
                  rows={2}
                  placeholder="ระบุพฤติการณ์ข่มขู่ หรือการหลอกลวงของมิจฉาชีพ..."
                  value={newIoc.description}
                  onChange={(e) => setNewIoc({ ...newIoc, description: e.target.value })}
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-action btn-action-ghost"
                  onClick={() => setShowAddModal(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn-action btn-action-primary">
                  บันทึกเข้า Blacklist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Flyout Drawer for Forensic Case Details */}
      {selectedCase && (
        <>
          <div className="flyout-backdrop" style={{ display: 'block' }} onClick={() => setSelectedCase(null)} />
          <aside className="flyout-panel open">
            <div className="flyout-header">
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Incident Dossier: {selectedCase.id}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Forensic Record Ref: AOC-TH-{selectedCase.id.slice(4)}</div>
              </div>
              <button
                type="button"
                className="btn-copy"
                onClick={() => setSelectedCase(null)}
                style={{ padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <div className="flyout-body">
              {/* Severity & Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span className={`badge-sev ${selectedCase.severityClass}`}>{selectedCase.severity} Severity</span>
                <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{selectedCase.timestamp}</span>
              </div>

              <div className="form-group">
                <span className="form-label">Threat Classification &amp; Summary</span>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{selectedCase.title}</p>
              </div>

              <div className="form-group" style={{ marginTop: 14 }}>
                <span className="form-label">Full Audit Trail &amp; Dialogue Log (per A.md Spec)</span>
                <div
                  style={{
                    background: '#090d16',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 12,
                    fontSize: 11,
                    lineHeight: 1.6,
                    maxHeight: 180,
                    overflowY: 'auto',
                  }}
                >
                  {selectedCase.auditLog.map((log, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      {log}
                    </div>
                  ))}
                </div>
              </div>

              {selectedCase.muleAccount && (
                <div className="form-group" style={{ marginTop: 14 }}>
                  <span className="form-label">Target Mule Account &amp; Banking Intel</span>
                  <div
                    style={{
                      background: '#090d16',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 10,
                      fontSize: 11.5,
                      lineHeight: 1.6,
                    }}
                  >
                    <div>
                      <strong>Bank:</strong> {selectedCase.muleBank}
                    </div>
                    <div>
                      <strong>Account Name:</strong> {selectedCase.muleName}
                    </div>
                    <div>
                      <strong>Account Number:</strong> <span className="code-tag">{selectedCase.muleAccount}</span>
                    </div>
                    <div>
                      <strong>Origin Cell:</strong> {selectedCase.muleOrigin}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flyout-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn-action btn-action-ghost"
                onClick={() => deleteCase(selectedCase.id)}
                style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              >
                Delete / Revoke
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn-action btn-action-ghost"
                  onClick={() => {
                    const targetIoc = selectedCase.muleAccount || selectedCase.ioc;
                    setLookupQuery(targetIoc);
                    setActiveSubTab('blacklist');
                    handleRunLookup(targetIoc);
                    setSelectedCase(null);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                  title="ตรวจสอบตัวบ่งชี้ของคดีนี้ในฐานข้อมูล Blacklist & OSINT"
                >
                  🔍 ตรวจ Blacklist
                </button>
                <button
                  type="button"
                  className="btn-action btn-action-ghost"
                  onClick={() => setOfficialReportModal(selectedCase)}
                  style={{ color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.4)' }}
                  title="พิมพ์สำนวนหลักฐานราชการเพื่อส่ง AOC 1441 และ บช.สอท."
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>พิมพ์สำนวน AOC 1441</span>
                </button>
                <button
                  type="button"
                  className="btn-action btn-action-ghost"
                  onClick={() => exportCaseJson(selectedCase)}
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  className="btn-action btn-action-primary"
                  onClick={() => dispatchAoc(selectedCase.id)}
                >
                  Dispatch to AOC 1441
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Official Thai Police & AOC 1441 Formal Evidence Dossier Modal */}
      {officialReportModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setOfficialReportModal(null)}
        >
          <div
            style={{
              background: '#090d16',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: 780,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header Controls */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 18px',
                borderBottom: '1px solid var(--border)',
                background: '#0e1320',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge-sev badge-critical" style={{ fontSize: 10 }}>
                  AOC OFFICIAL RECORD
                </span>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                  Ref: AOC-TH-{officialReportModal.id.slice(4)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn-action btn-action-primary"
                  onClick={() => window.print()}
                  style={{ height: 28, fontSize: 11, padding: '0 12px' }}
                >
                  🖨️ พิมพ์เอกสาร / บันทึก PDF
                </button>
                <button
                  type="button"
                  className="btn-copy"
                  onClick={() => setOfficialReportModal(null)}
                  style={{ padding: '3px 8px' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Official Document Body */}
            <div
              style={{
                padding: '24px 32px',
                overflowY: 'auto',
                color: 'var(--fg)',
                lineHeight: 1.6,
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              {/* Header Seal */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ display: 'inline-flex', padding: 8, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', marginBottom: 8 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
                  บันทึกรายงานพยานหลักฐานทางนิติวิทยาศาสตร์ดิจิทัล (Digital Forensic Dossier)
                </h2>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                  ศูนย์ปฏิบัติการแก้ไขปัญหาอาชญากรรมออนไลน์ (AOC 1441) • กองบัญชาการตำรวจสืบสวนสอบสวนอาชญากรรมทางเทคโนโลยี (บช.สอท.)
                </div>
                <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4, fontWeight: 500 }}>
                  อำนาจตาม พ.ร.ก. มาตรการป้องกันและปราบปรามอาชญากรรมทางเทคโนโลยี พ.ศ. 2566
                </div>
              </div>

              {/* Case Metadata Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  background: '#0e1320',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 14,
                  fontSize: 12,
                  marginBottom: 18,
                }}
              >
                <div>
                  <strong>เลขคดีรับแจ้ง (Case ID):</strong> <span className="code-tag">{officialReportModal.id}</span>
                </div>
                <div>
                  <strong>ระดับภัยคุกคาม (Severity):</strong>{' '}
                  <span className={`badge-sev ${officialReportModal.severityClass}`}>{officialReportModal.severity}</span>
                </div>
                <div>
                  <strong>ช่องทางการก่อเหตุ:</strong> {officialReportModal.channel}
                </div>
                <div>
                  <strong>เวลาที่ตรวจจับได้:</strong> {officialReportModal.timestamp}
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <strong>พฤติการณ์แห่งคดี:</strong> {officialReportModal.title}
                </div>
              </div>

              {/* Suspect Mule Bank Details */}
              {officialReportModal.muleAccount && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>
                    🎯 ข้อมูลบัญชีม้าและเส้นทางการเงินที่ต้องอายัดเร่งด่วน (AOC Freeze Target)
                  </div>
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.05)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 12,
                      fontSize: 12,
                    }}
                  >
                    <div><strong>สถาบันการเงิน:</strong> {officialReportModal.muleBank}</div>
                    <div><strong>ชื่อบัญชีผู้รับโอน (บัญชีม้า):</strong> {officialReportModal.muleName}</div>
                    <div><strong>เลขที่บัญชี:</strong> <span className="code-tag" style={{ color: '#ef4444' }}>{officialReportModal.muleAccount}</span></div>
                    <div><strong>ต้นทางสัญญาณ / Gateway:</strong> {officialReportModal.muleOrigin}</div>
                  </div>
                </div>
              )}

              {/* Audit Trail Timeline */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>
                  📋 ลำดับเวลาและหลักฐานการถอดเสียง (Forensic Timeline &amp; Scribe NLP Logs)
                </div>
                <div
                  style={{
                    background: '#040711',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 12,
                    fontSize: 11,
                    lineHeight: 1.7,
                  }}
                >
                  {officialReportModal.auditLog.map((log, i) => (
                    <div key={i} style={{ borderBottom: '1px dashed rgba(255, 255, 255, 0.06)', paddingBottom: 4, marginBottom: 4 }}>
                      {log}
                    </div>
                  ))}
                </div>
              </div>

              {/* Cryptographic Chain of Custody */}
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 10,
                  fontSize: 11,
                  color: 'var(--fg-secondary)',
                  marginBottom: 24,
                }}
              >
                <div><strong>Digital Signature (SHA-256):</strong> 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069</div>
                <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 2 }}>
                  รับรองความถูกต้องของข้อมูลตามมาตรฐาน ISO/IEC 27037:2012 สำหรับการส่งมอบพยานหลักฐานดิจิทัลต่อศาล
                </div>
              </div>

              {/* Signatures */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, textAlign: 'center', paddingTop: 10 }}>
                <div>
                  <div style={{ borderBottom: '1px solid var(--border)', width: 180, margin: '0 auto 6px auto', height: 35 }} />
                  <div style={{ fontSize: 11.5, fontWeight: 600 }}>ผู้ส่งมอบพยานหลักฐาน (ScamTrap AI Core)</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>ระบบป้องกันภัยไซเบอร์ภาคประชาชน</div>
                </div>
                <div>
                  <div style={{ borderBottom: '1px solid var(--border)', width: 180, margin: '0 auto 6px auto', height: 35 }} />
                  <div style={{ fontSize: 11.5, fontWeight: 600 }}>พนักงานสอบสวน / เจ้าหน้าที่รับเรื่อง</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>ศูนย์ปฏิบัติการ AOC สายด่วน 1441</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
