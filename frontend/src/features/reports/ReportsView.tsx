import { useState } from 'react';
import { showToast } from '../../lib/toast';

export interface IncidentCase {
  id: string;
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

const INITIAL_CASES: IncidentCase[] = [
  {
    id: 'INC-2026-9042',
    severity: 'Critical',
    severityClass: 'badge-critical',
    category: 'Police Impersonation & Money Laundering',
    ioc: '+66 82-419-8921',
    channel: 'Inbound VoIP',
    timestamp: 'Today, 14:28:10',
    status: 'Active Takeover',
    statusClass: 'badge-critical',
    title: 'Organized Call Center Extortion: Police Impersonation',
    auditLog: [
      '[14:28:10] Inbound call initiated from +66 82-419-8921 via Poipet VoIP Gateway.',
      '[14:28:18] Caller falsely claimed to be Pol.Capt. Thanakorn from Chiang Mai Police Station.',
      '[14:28:35] ScamTrap Scribe NLP detected coercion triggers ("ออกหมายจับ", "อายัดทรัพย์", "ปปง.").',
      '[14:29:10] Criminal instructed victim to wire money to mule account: นายวิชัย ภักดี.',
      '[14:29:40] ScamTrap Honeypot AI Agent intercepted call to protect citizen.',
      '[14:30:00] Automated IOC alert queued for Central Police & AOC 1441.',
    ],
    muleBank: 'Krungthai Bank (KTB)',
    muleName: 'นายวิชัย ภักดี (Flagged Mule)',
    muleAccount: '984-2-90184-1',
    muleOrigin: 'Gateway Cell-04 Border Range (Poipet)',
  },
  {
    id: 'INC-2026-8819',
    severity: 'High',
    severityClass: 'badge-warning',
    category: 'Bank Phishing SMS (Krungthai Spoofed)',
    ioc: 'ktb-online-claim.vip',
    channel: 'SMS Text',
    timestamp: 'Today, 13:12:45',
    status: 'Reported 1441',
    statusClass: 'badge-safe',
    title: 'Bank Credential Harvester • Spoofed SMS Header',
    auditLog: [
      '[13:12:45] SMS received with forged sender "KTB-Privilege".',
      '[13:13:02] Link pointed to credential harvester domain ktb-online-claim.vip.',
      '[13:13:20] Domain matched Threat Intel blocklist (Google Safe Browsing & URLhaus).',
      '[13:14:00] Citizen warned not to submit OTP. Incident report shared with Thai AOC 1441.',
    ],
    muleBank: 'Krungthai Bank (KTB)',
    muleName: 'บัญชีม้าออนไลน์ ปปง. (ตรวจพบใน Blacklistseller)',
    muleAccount: '710-0-84192-3',
    muleOrigin: 'Bangkok SMS Gateway Trunk',
  },
  {
    id: 'INC-2026-8740',
    severity: 'Critical',
    severityClass: 'badge-critical',
    category: 'DLT Tax Dept Remote Trojan APK',
    ioc: 'dlt-tax-payment.apk',
    channel: 'Web Phish',
    timestamp: 'Today, 11:40:02',
    status: 'Quarantined',
    statusClass: 'badge-safe',
    title: 'Remote Access Trojan (RAT) Distribution Targeting Android Devices',
    auditLog: [
      '[11:40:02] Fake Department of Land Transport page urged victim to install APK.',
      '[11:40:15] APK analyzed: requests BIND_ACCESSIBILITY_SERVICE permission.',
      '[11:40:40] Malware payload quarantined. C2 IP 103.45.89.214:8080 blacklisted.',
    ],
    muleOrigin: 'Malware C2 Server (Cambodia IP)',
  },
  {
    id: 'INC-2026-8610',
    severity: 'Low',
    severityClass: 'badge-info',
    category: 'Legitimate OTP Verification (Shopee)',
    ioc: 'ShopeePay-OTP',
    channel: 'SMS 2FA',
    timestamp: 'Today, 09:15:20',
    status: 'Cleared',
    statusClass: 'badge-safe',
    title: 'Legitimate Two-Factor Authentication • Standard Security Protocol',
    auditLog: [
      '[09:15:20] Standard ShopeePay OTP SMS received.',
      '[09:15:30] Heuristic Engine confirmed legitimate standard message with security warning.',
      '[09:15:35] No coercion, extortion, or suspicious URLs detected.',
    ],
  },
];

export const ReportsView = () => {
  const [cases, setCases] = useState<IncidentCase[]>(INITIAL_CASES);
  const [search, setSearch] = useState('');
  const [selectedCase, setSelectedCase] = useState<IncidentCase | null>(null);

  const filteredCases = cases.filter(
    (c) =>
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase()) ||
      c.ioc.toLowerCase().includes(search.toLowerCase()) ||
      c.channel.toLowerCase().includes(search.toLowerCase()),
  );

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

  const dispatchAoc = (caseId: string) => {
    showToast(`รายงาน ${caseId} ถูกส่งต่อไปยังศูนย์ AOC 1441 & บช.สอท. เรียบร้อย`);
    setSelectedCase(null);
  };

  const deleteCase = (caseId: string) => {
    setCases((prev) => prev.filter((c) => c.id !== caseId));
    setSelectedCase(null);
    showToast(`ถอนและลบประวัติ ${caseId} เรียบร้อย (PDPA Compliant)`);
  };

  return (
    <div className="tab-pane active" id="tab-dossier">
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
              ฐานข้อมูลคดีและหลักฐานภัยคุกคาม ตามมาตรฐาน AOC 1441 และ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)
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
                  onClick={() => setSelectedCase(c)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span className="code-tag">{c.id}</span>
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
                        setSelectedCase(c);
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
    </div>
  );
};
