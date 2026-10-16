import { useState, useEffect } from 'react';
import type { CaseRecord } from '@scamtrap/contracts';
import { getCases } from '../../lib/api';
import { showToast } from '../../lib/toast';
import { ReportPlaceholder } from './ReportPlaceholder';
import { useAppLanguage } from '../../lib/LanguageContext';
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
  priority?: 'P1 - Urgent' | 'P2 - Elevated' | 'P3 - Standard' | 'P4 - Low';
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
  assignedInvestigator?: string;
  tags?: string[];
  investigatorNotes?: string;
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
  const priority = level === 'critical'
    ? 'P1 - Urgent'
    : level === 'high'
      ? 'P2 - Elevated'
      : level === 'medium'
        ? 'P3 - Standard'
        : 'P4 - Low';
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
    priority,
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
  const { language } = useAppLanguage();
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
    tags: 'Mule Account, Wire Fraud',
    description: '',
  });

  const [latestCaseContext, setLatestCaseContext] = useState(getLatestCaseContext);
  const { caseId: latestCaseId, sessionId: latestSessionId } = latestCaseContext;
  const activeReportCaseId = reportCaseId ?? latestCaseId;

  // Dossier Triage & Filter State
  const [dossierStatusFilter, setDossierStatusFilter] = useState<string>('ALL');
  const [dossierPriorityFilter, setDossierPriorityFilter] = useState<string>('ALL');

  const filteredCases = cases.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      c.id.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.ioc.toLowerCase().includes(q) ||
      c.channel.toLowerCase().includes(q) ||
      (c.assignedInvestigator && c.assignedInvestigator.toLowerCase().includes(q)) ||
      (c.tags && c.tags.some((t) => t.toLowerCase().includes(q)));

    const matchesStatus = dossierStatusFilter === 'ALL' || c.status === dossierStatusFilter;
    const matchesPriority = dossierPriorityFilter === 'ALL' || c.priority === dossierPriorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const updateCaseTriage = (
    caseId: string,
    updates: Partial<IncidentCase>,
  ) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        const updated = { ...c, ...updates };
        if (updates.status) {
          if (updates.status === 'Active Takeover' || updates.status === 'Awaiting Freeze') {
            updated.statusClass = 'badge-critical';
          } else if (updates.status === 'Under Investigation') {
            updated.statusClass = 'badge-warning';
          } else {
            updated.statusClass = 'badge-safe';
          }
        }
        return updated;
      }),
    );
    if (selectedCase && selectedCase.id === caseId) {
      setSelectedCase((prev) => (prev ? { ...prev, ...updates } : null));
    }
    showToast(`Updated triage docket for case ${caseId}.`);
  };

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
      showToast('Enter a phone number, account number, or URL to query.');
      return;
    }
    setIsAnalyzing(true);
    setTimeout(() => {
      const result = analyzeThreatQuery(q, blacklist);
      setAnalysisResult(result);
      setIsAnalyzing(false);
      showToast(`Verification completed for "${q}".`);
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
  }, [refreshKey, activeSubTab]);

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

  const handleAddNewIoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIoc.value.trim()) {
      showToast('Please enter an identifier value.');
      return;
    }
    const tagsArray = newIoc.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

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
      lastReported: 'Just now',
      tags: tagsArray,
      status: 'ACTIVE_BLOCK',
      description: newIoc.description.trim() || 'Filed by investigative analyst / complainant',
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
      tags: 'Mule Account, Wire Fraud',
      description: '',
    });
    showToast(`Added ${newItem.value} to blacklist registry.`);
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
      aocDispatchStatus: 'Queued for National AOC Hotline 1441',
      isDemo: true,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ScamTrap-${c.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported evidence dossier ${c.id}.json.`);
  };

  const exportAllCases = () => {
    const blob = new Blob([JSON.stringify(cases, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ScamTrap-All-Dossiers.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${cases.length} incident records (.json).`);
  };

  const exportBlacklistJson = () => {
    const blob = new Blob([JSON.stringify(blacklist, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ScamTrap-Blacklist-Registry.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported blacklist threat registry (.json).');
  };

  const dispatchAoc = (caseId: string) => {
    showToast(`Demonstration mode: Report ${caseId} logged locally; not dispatched externally.`);
    setSelectedCase(null);
  };

  const deleteCase = (caseId: string) => {
    setCases((prev) => prev.filter((c) => c.id !== caseId));
    setSelectedCase(null);
    showToast(`Removed demonstration record ${caseId}.`);
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
            <span>{language === 'en' ? 'Incident Dossier' : 'แฟ้มคดี & หลักฐาน (Dossier)'}</span>
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
            <span>{language === 'en' ? 'Mule Accounts & Threat Intelligence' : 'บัญชีม้า & ฐานข้อมูล Blacklist'}</span>
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
              <span>{language === 'en' ? 'Incident Report' : 'รายงานเคสจริง'}</span>
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
              {language === 'en' ? '+ Add Target to Blacklist' : '+ เพิ่มเป้าหมายใน Blacklist'}
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: LIVE SESSION REPORT */}
      {activeSubTab === 'live-report' && activeReportCaseId && (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              {language === 'en'
                ? 'Displaying the report generated from this case and its external threat-intelligence checks.'
                : 'กำลังแสดงรายงานที่ระบบสร้างจากข้อมูลและผลตรวจแหล่งภายนอกของเคสนี้'}
            </span>
            <button
              type="button"
              className="btn-action btn-action-ghost"
              onClick={() => setActiveSubTab('dossier')}
              style={{ fontSize: 11 }}
            >
              Return to Incident Dossier
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
                  Mule Account &amp; Threat Intelligence Verification Center
                </h3>
                <p style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 4 }}>
                  {language === 'en' ? (
                    <>URLs are checked through <strong>Google Safe Browsing and URLhaus</strong>. Phone and bank-account entries on this tab are internal demonstration data.</>
                  ) : (
                    <>URL จะตรวจด้วย <strong>Google Safe Browsing และ URLhaus</strong> ส่วนข้อมูลเบอร์โทรและบัญชีในหน้านี้เป็นรายการภายในเพื่อการสาธิต</>
                  )}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="badge-sev badge-info" style={{ fontSize: 10 }}>AOC 1441 NOT CONNECTED</span>
                <span className="badge-sev badge-warning" style={{ fontSize: 10 }}>PHONE / ACCOUNT DEMO DATA</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <input
                type="text"
                placeholder={
                  language === 'en'
                    ? 'Enter bank account (e.g. 984-2-90184-1), phone (+66 82-419-8921), holder name, or URL...'
                    : 'ค้นหาเลขบัญชี (เช่น 984-2-90184-1), เบอร์โทร (+66 82-419-8921), ชื่อเจ้าของบัญชี หรือ URL...'
                }
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
                {isAnalyzing
                  ? (language === 'en' ? 'Querying Intelligence...' : 'กำลังสืบค้นฐานข้อมูล...')
                  : (language === 'en' ? 'Verify Identifier' : 'ตรวจสอบข้อมูล (Verify)')}
              </button>
            </div>

            {/* Quick Chips */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Reference Samples:</span>
              <button
                type="button"
                className="btn-copy"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => {
                  setLookupQuery('984-2-90184-1');
                  handleRunLookup('984-2-90184-1');
                }}
              >
                984-2-90184-1 (Mule Bank Account)
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
                +66 82-419-8921 (Spoofed Police VoIP)
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
                ktb-online-claim.vip (Phishing Portal)
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
                        {analysisResult.riskLevel} RISK SCORE ({analysisResult.riskScore}/100)
                      </span>
                      <span className="code-tag" style={{ fontSize: 12.5 }}>{analysisResult.query}</span>
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Type: {analysisResult.type}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', marginTop: 8 }}>
                      {analysisResult.verdict}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 2 }}>
                      Attribution: {analysisResult.sourceConfidence}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {analysisResult.riskScore >= 70 && (
                      <button
                        type="button"
                        className="btn-action btn-action-primary"
                        onClick={() => {
                          showToast(`Emergency freeze request dispatched for ${analysisResult.query} via AOC 1441 banking protocols.`);
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
                        Initiate AOC 1441 Freeze
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
                            lastReported: 'Just now',
                            tags: ['Rapid Report', 'Complainant Flagged'],
                            status: 'INVESTIGATING',
                            description: 'Logged via public real-time threat reporting tool.',
                          };
                          setBlacklist([newItem, ...blacklist]);
                          showToast(`Recorded ${analysisResult.query} into the active blacklist.`);
                        }}
                        style={{ fontSize: 11, height: 28, color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                      >
                        Add to Blacklist
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
                            showToast('Navigated to associated incident dossiers.');
                            setActiveSubTab('dossier');
                          }
                        }}
                        style={{ fontSize: 11, height: 28, color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.4)' }}
                      >
                        View Correlated Dossier
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-action btn-action-ghost"
                      onClick={() => setAnalysisResult(null)}
                      style={{ fontSize: 11, height: 28 }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>

                {/* Threat Signals & Recommendation */}
                <div className="threat-signals-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginTop: 14 }}>
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: 6 }}>
                      Detected Threat Indicators:
                    </div>
                    <ul style={{ paddingLeft: 18, fontSize: 11.5, lineHeight: 1.6, color: 'var(--fg)' }}>
                      {analysisResult.threatSignals.map((sig, i) => (
                        <li key={i}>{sig}</li>
                      ))}
                    </ul>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>
                      <strong>Operational Advisory:</strong> {analysisResult.recommendation}
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
                      Threat Registry Attribution Feeds:
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

          {/* Metrics & Threat Activity */}
          <div className="reports-charts-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
            {/* Chart 1: Threat Attack Vectors & Wave Activity */}
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
                    <span>24-Hour Threat Influx &amp; Interception Velocity</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                    Telemetry aggregated from cross-border VoIP gateways and AOC 1441 freeze dockets
                  </div>
                </div>
                <span className="badge-sev badge-critical" style={{ fontSize: 9.5 }}>
                  PEAK: 14:00 - 16:30
                </span>
              </div>

              {/* Dynamic SVG Area Chart */}
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

                  {/* Shield Interception Line */}
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

                  <circle cx="340" cy="25" r="4.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                  <circle cx="500" cy="15" r="4.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                  <circle cx="500" cy="20" r="4" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                </svg>

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
                  <span>Active Live</span>
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
                    <span style={{ color: 'var(--fg-secondary)' }}>Inbound Threats</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ width: 10, height: 3, background: '#10b981', borderRadius: 2 }} />
                    <span style={{ color: 'var(--fg-secondary)' }}>Shield Mitigations (97.4%)</span>
                  </div>
                </div>
                <span className="code-tag" style={{ fontSize: 10.5, color: '#60a5fa' }}>
                  Total Inbound: 2,419 Calls
                </span>
              </div>
            </div>

            {/* Chart 2: Threat Distribution by Category */}
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
                    <span>Threat Distribution by Category</span>
                  </div>
                  <span className="badge-sev badge-safe" style={{ fontSize: 9.5 }}>LIVE INTEL</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--fg)', fontWeight: 600 }}>Fraudulent Mule Accounts</span>
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>48% (1,161 entries)</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: '48%', height: '100%', background: 'linear-gradient(90deg, #dc2626, #ef4444)', borderRadius: 3 }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--fg)', fontWeight: 600 }}>Spoofed Official Numbers &amp; VoIP</span>
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>32% (774 entries)</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: '32%', height: '100%', background: 'linear-gradient(90deg, #d97706, #f59e0b)', borderRadius: 3 }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--fg)', fontWeight: 600 }}>Phishing Links &amp; Trojan APKs</span>
                      <span style={{ color: '#3b82f6', fontWeight: 700 }}>15% (362 entries)</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: '15%', height: '100%', background: 'linear-gradient(90deg, #2563eb, #3b82f6)', borderRadius: 3 }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--fg)', fontWeight: 600 }}>C2 Servers &amp; Crypto Laundering</span>
                      <span style={{ color: '#a855f7', fontWeight: 700 }}>5% (122 entries)</span>
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
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>Average Freeze Response</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--emerald)' }}>2.4 min (AOC 1441)</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.35)', padding: '6px 8px', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>Intercepted Exposure</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>THB 142.8M</div>
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
                  Active Blacklist &amp; Threat Intelligence Registry
                </div>
                <div className="card-subtitle">
                  Operational repository of flagged mule accounts, cross-border VoIP gateways, phishing domains, and command-and-control nodes.
                </div>
              </div>

              <div className="table-toolbar-group" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  className="input-control"
                  style={{ height: 30, fontSize: 11.5, minWidth: 130, flex: '1 1 auto' }}
                  value={blacklistFilter}
                  onChange={(e) => setBlacklistFilter(e.target.value as any)}
                >
                  <option value="ALL">All Categories ({blacklist.length})</option>
                  <option value="bank_account">Mule Accounts</option>
                  <option value="phone">Fraudulent Phone Numbers</option>
                  <option value="url">Phishing URLs &amp; APKs</option>
                </select>

                <input
                  type="text"
                  placeholder="Search threat registry..."
                  className="input-control"
                  style={{ height: 30, minWidth: 160, flex: '2 1 180px', fontSize: 11.5 }}
                  value={blacklistSearch}
                  onChange={(e) => setBlacklistSearch(e.target.value)}
                />

                <button
                  type="button"
                  className="btn-action btn-action-ghost"
                  onClick={exportBlacklistJson}
                  style={{ flex: '0 0 auto' }}
                >
                  Export JSON
                </button>
              </div>
            </div>

            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-responsive-wrap">
                <table className="data-table">
                <thead>
                  <tr>
                    <th>Identifier Ref</th>
                    <th>Type</th>
                    <th>Target Value</th>
                    <th>Holder / Entity Attribution</th>
                    <th>Institution / Carrier</th>
                    <th>Source Registry</th>
                    <th>Risk</th>
                    <th>Status</th>
                    <th>Action</th>
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
                          {item.type === 'bank_account' ? 'MULE ACCOUNT' : item.type === 'phone' ? 'VOIP / PHONE' : item.type === 'url' ? 'PHISHING / APK' : 'C2 IP'}
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
                          Analyze ›
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredBlacklist.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--fg-muted)' }}>
                        No records match the active query parameters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* VIEW 3: INCIDENT CASES DOSSIER */}
      {activeSubTab === 'dossier' && (
        <>
          <div className="warning-banner" style={{ marginBottom: 16 }}>
            <strong>{language === 'en' ? 'ScamTrap AI case database' : 'ข้อมูลเคสจากระบบ ScamTrap AI'}</strong>
            <p>
              {language === 'en'
                ? 'Records are loaded from PostgreSQL and labelled REAL or DEMO. No data is submitted to AOC or another agency automatically.'
                : 'รายการดึงจาก PostgreSQL และแยกป้าย REAL/DEMO โดยยังไม่มีการส่งข้อมูลไป AOC หรือหน่วยงานภายนอกโดยอัตโนมัติ'}
            </p>
          </div>
          {casesLoadError && (
            <div className="warning-banner" style={{ marginBottom: 16 }}>
              <strong>{language === 'en' ? 'Unable to load cases' : 'โหลดรายการเคสไม่สำเร็จ'}</strong>
              <p>{casesLoadError}</p>
            </div>
          )}

          {/* Quick Triage Operational Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div className="card" style={{ padding: '12px 14px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Active Takeovers &amp; Urgent</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#f87171' }}>
                  {cases.filter((c) => c.status === 'Active Takeover' || c.priority === 'P1 - Urgent').length}
                </span>
                <span style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>Immediate Triage</span>
              </div>
            </div>

            <div className="card" style={{ padding: '12px 14px', background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Under Investigation</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24' }}>
                  {cases.filter((c) => c.status === 'Under Investigation' || c.status === 'Awaiting Freeze').length}
                </span>
                <span style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>Assigned to Analysts</span>
              </div>
            </div>

            <div className="card" style={{ padding: '12px 14px', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Dispatched AOC 1441</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#34d399' }}>
                  {cases.filter((c) => c.status === 'Reported 1441' || c.status === 'Quarantined').length}
                </span>
                <span style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>Escalated &amp; Frozen</span>
              </div>
            </div>

            <div className="card" style={{ padding: '12px 14px', background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Registered Dockets</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#60a5fa' }}>{cases.length}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>PostgreSQL Records</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="card-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Security Incidents &amp; Forensic Dossier
                </div>
                <div className="card-subtitle">
                  {language === 'en'
                    ? 'Case analysis and threat-intelligence results persisted in PostgreSQL.'
                    : 'เคส การวิเคราะห์ และผลตรวจ Threat Intelligence ที่บันทึกใน PostgreSQL'}
                </div>
              </div>

              <div className="table-toolbar-group" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                {/* Status Triage Filter */}
                <select
                  className="input-control"
                  style={{ height: 30, fontSize: 11.5, minWidth: 140, flex: '1 1 auto' }}
                  value={dossierStatusFilter}
                  onChange={(e) => setDossierStatusFilter(e.target.value)}
                  aria-label="Filter by case status"
                >
                  <option value="ALL">All Statuses ({cases.length})</option>
                  <option value="Active Takeover">Active Takeover</option>
                  <option value="Under Investigation">Under Investigation</option>
                  <option value="Awaiting Freeze">Awaiting Freeze</option>
                  <option value="Reported 1441">Reported 1441</option>
                  <option value="Quarantined">Quarantined</option>
                  <option value="Cleared">Cleared</option>
                  <option value="Closed">Closed</option>
                </select>

                {/* Priority Filter */}
                <select
                  className="input-control"
                  style={{ height: 30, fontSize: 11.5, minWidth: 120, flex: '1 1 auto' }}
                  value={dossierPriorityFilter}
                  onChange={(e) => setDossierPriorityFilter(e.target.value)}
                  aria-label="Filter by priority tier"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="P1 - Urgent">P1 - Urgent</option>
                  <option value="P2 - Elevated">P2 - Elevated</option>
                  <option value="P3 - Standard">P3 - Standard</option>
                  <option value="P4 - Low">P4 - Low</option>
                </select>

                <input
                  type="text"
                  id="filter-dossier"
                  placeholder={
                    language === 'en'
                      ? 'Search docket, IOC, analyst, or tag...'
                      : 'ค้นหารหัสเคส, เลขบัญชี, เบอร์โทร, หรือแท็ก...'
                  }
                  className="input-control"
                  style={{ height: 30, minWidth: 180, flex: '2 1 200px', fontSize: 11.5 }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />

                <button
                  type="button"
                  className="btn-action btn-action-ghost"
                  id="btn-export-all"
                  onClick={exportAllCases}
                  style={{ flex: '0 0 auto' }}
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
              <div className="table-responsive-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Priority</th>
                      <th>Severity</th>
                      <th>Threat Category</th>
                      <th>Primary Indicator (IOC)</th>
                      <th>Investigator</th>
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
                          {c.tags && c.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                              {c.tags.map((t, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    fontSize: 9.5,
                                    padding: '1px 5px',
                                    borderRadius: 3,
                                    background: 'rgba(255,255,255,0.06)',
                                    color: 'var(--fg-muted)',
                                  }}
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge-sev ${
                              c.priority === 'P1 - Urgent'
                                ? 'badge-critical'
                                : c.priority === 'P2 - Elevated'
                                  ? 'badge-warning'
                                  : 'badge-safe'
                            }`}
                            style={{ fontSize: 10, letterSpacing: 0.3 }}
                          >
                            {c.priority || 'P3 - Standard'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge-sev ${c.severityClass}`}>{c.severity}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--fg)', fontSize: 12 }}>{c.category}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 2 }}>
                            {c.channel} &bull; {c.timestamp}
                          </div>
                        </td>
                        <td>
                          <span className="code-tag">{c.ioc}</span>
                        </td>
                        <td style={{ fontSize: 11.5, color: c.assignedInvestigator ? 'var(--fg)' : 'var(--fg-muted)' }}>
                          {c.assignedInvestigator || 'Unassigned'}
                        </td>
                        <td>
                          <span className={`badge-sev ${c.statusClass}`}>{c.status}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-copy"
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setReportCaseId(c.id);
                              setActiveSubTab('live-report');
                            }}
                          >
                            Triage ›
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredCases.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--fg-muted)' }}>
                          No incident cases match your criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Manual Add IOC to Blacklist Modal */}
      {showAddModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 460, background: '#0e1320', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="card-title">{language === 'en' ? 'Add Target to Active Blacklist' : 'บันทึกเป้าหมายเข้าฐานข้อมูล Blacklist'}</div>
              <button
                type="button"
                className="btn-copy"
                onClick={() => setShowAddModal(false)}
                style={{ padding: '4px 8px' }}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddNewIoc} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="form-label">{language === 'en' ? 'Identifier Type' : 'ประเภทข้อมูล (Identifier Type)'}</label>
                <select
                  className="input-control"
                  value={newIoc.type}
                  onChange={(e) => setNewIoc({ ...newIoc, type: e.target.value as any })}
                >
                  <option value="bank_account">{language === 'en' ? 'Bank Mule Account' : 'บัญชีม้าธนาคาร (Bank Mule)'}</option>
                  <option value="phone">{language === 'en' ? 'Fraudulent Phone Number' : 'เบอร์โทรศัพท์มิจฉาชีพ (Phone / VoIP)'}</option>
                  <option value="url">{language === 'en' ? 'Phishing URL / Malicious APK' : 'ลิงก์ฟิชชิ่ง / ไฟล์ APK อันตราย'}</option>
                  <option value="wallet">{language === 'en' ? 'Crypto Wallet Address' : 'กระเป๋าคริปโต (Crypto Wallet)'}</option>
                  <option value="c2_ip">C2 Server IP</option>
                </select>
              </div>

              <div>
                <label className="form-label">{language === 'en' ? 'Indicator Value (Account / Number / URL)' : 'ข้อมูลเป้าหมาย (เลขบัญชี / เบอร์โทร / ลิงก์)'}</label>
                <input
                  type="text"
                  required
                  placeholder={language === 'en' ? 'e.g. 020-3-19482-8 or +66 94-812-3004' : 'เช่น 020-3-19482-8 หรือ +66 94-812-3004'}
                  className="input-control"
                  value={newIoc.value}
                  onChange={(e) => setNewIoc({ ...newIoc, value: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label">{language === 'en' ? 'Account Holder / Claimed Entity Name' : 'ชื่อเจ้าของบัญชี / บุคคลแอบอ้าง'}</label>
                <input
                  type="text"
                  placeholder={language === 'en' ? 'e.g. Registered mule account name' : 'เช่น นายสมชาย หมายจับ หรือชื่อตามบัญชีม้า'}
                  className="input-control"
                  value={newIoc.holderOrAlias}
                  onChange={(e) => setNewIoc({ ...newIoc, holderOrAlias: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label">{language === 'en' ? 'Financial Institution / Network Carrier' : 'ธนาคาร / ผู้ให้บริการเครือข่าย'}</label>
                <input
                  type="text"
                  placeholder={language === 'en' ? 'e.g. Siam Commercial Bank (SCB)' : 'เช่น ธนาคารกสิกรไทย (KBANK), AIS, True'}
                  className="input-control"
                  value={newIoc.bankOrProvider}
                  onChange={(e) => setNewIoc({ ...newIoc, bankOrProvider: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label">{language === 'en' ? 'Incident Synopsis / Modus Operandi' : 'พฤติการณ์ / รายละเอียดภัยคุกคาม'}</label>
                <textarea
                  className="input-control"
                  rows={2}
                  placeholder={language === 'en' ? 'Summary of extortion, investment scheme, or spoofed pretext' : 'ระบุพฤติกรรม เช่น หลอกลงทุน, อ้างตำรวจขู่โอนเงิน, ส่ง SMS หลอกรับรางวัล'}
                  value={newIoc.description}
                  onChange={(e) => setNewIoc({ ...newIoc, description: e.target.value })}
                  style={{ height: 'auto', padding: 8 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-action btn-action-ghost"
                  onClick={() => setShowAddModal(false)}
                >
                  {language === 'en' ? 'Cancel' : 'ยกเลิก'}
                </button>
                <button type="submit" className="btn-action btn-action-primary">
                  {language === 'en' ? 'Save to Blacklist' : 'บันทึกลง Blacklist'}
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
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="flyout-body">
              {/* Severity & Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span className={`badge-sev ${selectedCase.severityClass}`}>{selectedCase.severity} Severity</span>
                <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{selectedCase.timestamp}</span>
              </div>

              <div className="form-group">
                <span className="form-label">Threat Classification &amp; Synopsis</span>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{selectedCase.title}</p>
              </div>

              <div className="form-group" style={{ marginTop: 14 }}>
                <span className="form-label">Audit Trail &amp; Intercept Log</span>
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

              {/* Investigator Triage & Workflow Section */}
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.05)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                  marginBottom: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Investigator Triage &amp; Workflow
                  </span>
                  <span className="badge-sev badge-safe" style={{ fontSize: 9.5 }}>AOC CCIB SYNC</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="form-label" style={{ fontSize: 10 }}>Workflow Status</label>
                    <select
                      className="input-control"
                      style={{ height: 28, fontSize: 11 }}
                      value={selectedCase.status}
                      onChange={(e) => updateCaseTriage(selectedCase.id, { status: e.target.value as any })}
                    >
                      <option value="Active Takeover">Active Takeover</option>
                      <option value="Under Investigation">Under Investigation</option>
                      <option value="Awaiting Freeze">Awaiting Freeze</option>
                      <option value="Reported 1441">Reported 1441</option>
                      <option value="Quarantined">Quarantined</option>
                      <option value="Cleared">Cleared</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: 10 }}>Priority Tier</label>
                    <select
                      className="input-control"
                      style={{ height: 28, fontSize: 11 }}
                      value={selectedCase.priority || 'P3 - Standard'}
                      onChange={(e) => updateCaseTriage(selectedCase.id, { priority: e.target.value as any })}
                    >
                      <option value="P1 - Urgent">P1 - Urgent</option>
                      <option value="P2 - Elevated">P2 - Elevated</option>
                      <option value="P3 - Standard">P3 - Standard</option>
                      <option value="P4 - Low">P4 - Low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Assigned Lead Investigator</label>
                  <select
                    className="input-control"
                    style={{ height: 28, fontSize: 11 }}
                    value={selectedCase.assignedInvestigator || ''}
                    onChange={(e) => updateCaseTriage(selectedCase.id, { assignedInvestigator: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    <option value="Capt. S. Wongsawat (CCIB-4)">Capt. S. Wongsawat (CCIB-4)</option>
                    <option value="Insp. P. Rattana (Cyber Taskforce)">Insp. P. Rattana (Cyber Taskforce)</option>
                    <option value="K. Somchai (Malware Forensics)">K. Somchai (Malware Forensics)</option>
                    <option value="Special Agent M. Chai (AOC Liaison)">Special Agent M. Chai (AOC Liaison)</option>
                    <option value="Automated Triaging Bot">Automated Triaging Bot</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Investigator Triage Notes</label>
                  <textarea
                    className="input-control"
                    rows={2}
                    style={{ height: 'auto', fontSize: 11, padding: 6 }}
                    placeholder="Enter analytical findings, judicial warrants, or bank contact log..."
                    value={selectedCase.investigatorNotes || ''}
                    onChange={(e) => updateCaseTriage(selectedCase.id, { investigatorNotes: e.target.value })}
                  />
                </div>
              </div>

              {selectedCase.muleAccount && (
                <div className="form-group" style={{ marginTop: 14 }}>
                  <span className="form-label">Target Mule Account &amp; Banking Telemetry</span>
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
                      <strong>Institution:</strong> {selectedCase.muleBank}
                    </div>
                    <div>
                      <strong>Account Title:</strong> {selectedCase.muleName}
                    </div>
                    <div>
                      <strong>Account Number:</strong> <span className="code-tag">{selectedCase.muleAccount}</span>
                    </div>
                    <div>
                      <strong>Routing Origin:</strong> {selectedCase.muleOrigin}
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
                {language === 'en' ? 'Delete / Revoke' : 'ลบ / ยกเลิกเคส'}
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
                  title="Cross-reference this case identifier against the threat database"
                >
                  {language === 'en' ? 'Verify in Blacklist' : 'ตรวจใน Blacklist'}
                </button>
                <button
                  type="button"
                  className="btn-action btn-action-ghost"
                  onClick={() => setOfficialReportModal(selectedCase)}
                  style={{ color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.4)' }}
                  title="Generate official evidentiary dossier for AOC 1441 and Cyber Crime Investigation Bureau"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>{language === 'en' ? 'Official Dossier' : 'เอกสารส่งเจ้าหน้าที่'}</span>
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
                  {language === 'en' ? 'Dispatch to AOC 1441' : 'ส่งต่อข้อมูล AOC 1441'}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Official Forensic Evidence Dossier Modal */}
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
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  className="btn-copy"
                  onClick={() => setOfficialReportModal(null)}
                  style={{ padding: '3px 8px' }}
                  aria-label="Close"
                >
                  &times;
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
                  Digital Forensic Evidence Dossier &amp; Intercept Affidavit
                </h2>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                  Anti-Online Scam Operations Center (AOC 1441) • Cyber Crime Investigation Bureau (CCIB)
                </div>
                <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4, fontWeight: 500 }}>
                  Statutory Reference: Royal Decree on Measures for Protection and Suppression of Technology Crimes B.E. 2566
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
                  <strong>Case Docket ID:</strong> <span className="code-tag">{officialReportModal.id}</span>
                </div>
                <div>
                  <strong>Assigned Threat Severity:</strong>{' '}
                  <span className={`badge-sev ${officialReportModal.severityClass}`}>{officialReportModal.severity}</span>
                </div>
                <div>
                  <strong>Transmission Medium:</strong> {officialReportModal.channel}
                </div>
                <div>
                  <strong>Intercept Timestamp:</strong> {officialReportModal.timestamp}
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <strong>Operational Case Synopsis:</strong> {officialReportModal.title}
                </div>
              </div>

              {/* Suspect Mule Bank Details */}
              {officialReportModal.muleAccount && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>
                    Designated Mule Account &amp; Financial Routing Target
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
                    <div><strong>Financial Institution:</strong> {officialReportModal.muleBank}</div>
                    <div><strong>Designated Beneficiary (Mule):</strong> {officialReportModal.muleName}</div>
                    <div><strong>Account Identifier:</strong> <span className="code-tag" style={{ color: '#ef4444' }}>{officialReportModal.muleAccount}</span></div>
                    <div><strong>Inbound Gateway Attribution:</strong> {officialReportModal.muleOrigin}</div>
                  </div>
                </div>
              )}

              {/* Audit Trail Timeline */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>
                  Chronological Telemetry &amp; Scribe NLP Logs
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
                <div><strong>Cryptographic Hash (SHA-256):</strong> 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069</div>
                <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 2 }}>
                  Certified under ISO/IEC 27037:2012 forensic preservation standards for digital evidence admissibility.
                </div>
              </div>

              {/* Signatures */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, textAlign: 'center', paddingTop: 10 }}>
                <div>
                  <div style={{ borderBottom: '1px solid var(--border)', width: 180, margin: '0 auto 6px auto', height: 35 }} />
                  <div style={{ fontSize: 11.5, fontWeight: 600 }}>Forensic Analyst / Intercept Agent</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>ScamTrap Core Defense Framework</div>
                </div>
                <div>
                  <div style={{ borderBottom: '1px solid var(--border)', width: 180, margin: '0 auto 6px auto', height: 35 }} />
                  <div style={{ fontSize: 11.5, fontWeight: 600 }}>Receiving Investigative Officer</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>AOC 1441 Anti-Online Scam Operations</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
