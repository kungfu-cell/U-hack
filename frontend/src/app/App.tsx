import { useState } from 'react';
import { QuickAnalysis } from '../features/quick-analysis/QuickAnalysis';
import { LiveSessionView } from '../features/live-session/LiveSessionView';
import { ReportsView } from '../features/reports/ReportsView';
import { Toast } from '../components/Toast';
import { showToast } from '../lib/toast';
import { useAppLanguage } from '../lib/LanguageContext';

type TabType = 'tab-verify' | 'tab-live-call' | 'tab-dossier';

export const App = () => {
  const [activeTab, setActiveTab] = useState<TabType>('tab-verify');
  const [mountedTabs, setMountedTabs] = useState<Set<TabType>>(
    () => new Set<TabType>(['tab-verify']),
  );
  const [reportRefreshKey, setReportRefreshKey] = useState(0);

  const handleQuickExport = () => {
    const sampleIncident = {
      incidentId: 'INC-2026-9042',
      timestamp: new Date().toISOString(),
      classification: 'Telephony Coercion & Impersonation',
      riskScore: 96.8,
      inboundCaller: '+66 82-419-8921',
      muleAccount: {
        bank: 'Krungthai Bank (KTB)',
        name: 'นายวิชัย ภักดี',
        account: '984-2-90184-1',
        status: 'Flagged AOC 1441',
      },
      scribeTranscriptEntries: 5,
      isDemo: true,
      aocDispatchStatus: 'Dispatched to Police Taskforce',
    };

    const blob = new Blob([JSON.stringify(sampleIncident, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ScamTrap-Latest-Incident.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('ส่งออกไฟล์คดีล่าสุด (.json) เรียบร้อย');
  };

  const handleTabChange = (tab: TabType) => {
    setMountedTabs((current) => {
      if (current.has(tab)) return current;
      return new Set([...current, tab]);
    });
    if (tab === 'tab-dossier') {
      setReportRefreshKey((current) => current + 1);
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  const [dossierSubTab, setDossierSubTab] = useState<'dossier' | 'blacklist' | 'live-report'>('dossier');
  const [targetLookupQuery, setTargetLookupQuery] = useState<string | undefined>(undefined);
  const { language, setLanguage } = useAppLanguage();

  const handleNavigateToBlacklist = (query: string) => {
    setDossierSubTab('blacklist');
    setTargetLookupQuery(query);
    setMountedTabs((current) => new Set([...current, 'tab-dossier']));
    setReportRefreshKey((current) => current + 1);
    setActiveTab('tab-dossier');
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    showToast(`กำลังส่ง "${query}" ไปตรวจฐานข้อมูล Blacklist & OSINT`);
  };

  return (
    <div data-od-id="scamtrap-streamlined-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Streamlined App Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-shield" title="ScamTrap AI Defense Core">
            <img src="/logo.jpg" alt="ScamTrap AI Logo" className="brand-logo-img" />
          </div>
          <span className="brand-name">ScamTrap AI</span>
          <span className="brand-pill">DEFENSE HUB</span>
        </div>

        {/* 3 Core Navigation Tabs */}
        <nav className="nav-tabs">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'tab-verify' ? 'active' : ''}`}
            onClick={() => handleTabChange('tab-verify')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Verification Hub</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'tab-live-call' ? 'active' : ''}`}
            onClick={() => handleTabChange('tab-live-call')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <span>Live Call &amp; Takeover</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'tab-dossier' ? 'active' : ''}`}
            onClick={() => handleTabChange('tab-dossier')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>Incident Dossier</span>
          </button>
        </nav>

        {/* Header Tools */}
        <div className="header-controls">
          {/* Top Bar Language Selector */}
          <div className="lang-switcher-bar" title="Select Application Language">
            <button
              type="button"
              className={`lang-btn ${language === 'th' ? 'active' : ''}`}
              onClick={() => {
                setLanguage('th');
                showToast('สลับโหมดภาษาเป็น: ภาษาไทย (TH)');
              }}
            >
              TH
            </button>
            <button
              type="button"
              className={`lang-btn ${language === 'en' ? 'active' : ''}`}
              onClick={() => {
                setLanguage('en');
                showToast('Switched language to: English (EN)');
              }}
            >
              EN
            </button>
          </div>

          <div className="ws-status-badge" title="Realtime WebRTC Audio Telemetry">
            <span className="pulse-dot-green" />
            <span>LIVE WS: ONLINE</span>
          </div>
          <button
            type="button"
            className="btn-action btn-action-ghost"
            id="btn-quick-export"
            title="Export incident report as JSON"
            onClick={handleQuickExport}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export Case</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="app-main">
        <div style={{ display: activeTab === 'tab-verify' ? 'contents' : 'none' }}>
          <QuickAnalysis onNavigateToBlacklist={handleNavigateToBlacklist} />
        </div>
        {mountedTabs.has('tab-live-call') && (
          <div style={{ display: activeTab === 'tab-live-call' ? 'contents' : 'none' }}>
            <LiveSessionView onNavigateToBlacklist={handleNavigateToBlacklist} />
          </div>
        )}
        {mountedTabs.has('tab-dossier') && (
          <div style={{ display: activeTab === 'tab-dossier' ? 'contents' : 'none' }}>
            <ReportsView
              initialSubTab={dossierSubTab}
              initialLookupQuery={targetLookupQuery}
              refreshKey={reportRefreshKey}
            />
          </div>
        )}
      </main>

      {/* Global Toast Notification */}
      <Toast />
    </div>
  );
};
