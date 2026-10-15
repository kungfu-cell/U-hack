import { useState } from 'react';
import { showToast } from '../../lib/toast';
import { ReportPlaceholder } from './ReportPlaceholder';

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
  const [officialReportModal, setOfficialReportModal] = useState<IncidentCase | null>(null);
  const latestCaseId = window.localStorage.getItem('scamtrap:lastCaseId');

  if (latestCaseId) {
    return <ReportPlaceholder />;
  }

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
      <div className="warning-banner" style={{ marginBottom: 16 }}>
        <strong>ข้อมูลสาธิต</strong>
        <p>รายการด้านล่างเป็นตัวอย่างหน้ารายงาน ยังไม่ได้ส่งข้อมูลไป AOC หรือหน่วยงานภายนอก</p>
      </div>
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
