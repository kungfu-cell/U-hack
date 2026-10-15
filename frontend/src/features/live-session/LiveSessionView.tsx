import { useEffect, useRef } from 'react';
import { RiskGauge } from '../../components/RiskGauge';
import { useLiveSession } from './useLiveSession';

const SPEAKER_LABELS: Record<string, { label: string; badgeClass: string }> = {
  user: { label: 'คุณ (User)', badgeClass: 'badge-user' },
  caller: { label: 'คู่สนทนา (Caller)', badgeClass: 'badge-caller' },
  ai: { label: 'AI Decoy (รับช่วง)', badgeClass: 'badge-ai' },
  system: { label: 'ระบบ', badgeClass: 'badge-system' },
};

export const LiveSessionView = () => {
  const {
    sessionId,
    handoffState,
    utterances,
    activePartials,
    riskScore,
    riskLevel,
    riskReasons,
    connectionStatus,
    degradedMessage,
    isMicActive,
    micLevel,
    startCall,
    endCall,
    requestHandoff,
    resumeHuman,
    simulateSpeech,
  } = useLiveSession();

  const feedEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [utterances, activePartials]);

  const isCallActive = connectionStatus === 'connected' || connectionStatus === 'connecting' || connectionStatus === 'reconnecting';

  return (
    <main className="page-grid live-session-page">
      <section className="hero-panel">
        <span className="eyebrow">Real-Time Scam Shield</span>
        <h1>สนทนาสด<br />ถอดเสียง & ป้องกัน</h1>
        <p>
          ระบบรับเสียงจาก WebRTC แบบแยกช่องสัญญาณระหว่างคุณและคู่สนทนา ส่งเข้า ElevenLabs Scribe
          เพื่อถอดเสียงและประเมินพฤติกรรมเสี่ยงแบบวินาทีต่อวินาที
        </p>

        <div className="session-status-card">
          <div className="status-row">
            <span>สถานะสาย:</span>
            <span className={`status-pill status-${connectionStatus}`}>
              {connectionStatus === 'connected' && '● เชื่อมต่อแล้ว (Live)'}
              {connectionStatus === 'connecting' && '◌ กำลังต่อสาย...'}
              {connectionStatus === 'reconnecting' && '◌ พยายามเชื่อมต่อใหม่...'}
              {connectionStatus === 'disconnected' && 'สายสิ้นสุด'}
              {connectionStatus === 'idle' && 'พร้อมเริ่มสนทนา'}
            </span>
          </div>
          <div className="status-row">
            <span>โหมดผู้พูด:</span>
            <code className="state-badge">{handoffState}</code>
          </div>
          {isCallActive && (
            <div className="status-row mic-status-row">
              <span>ไมค์ของคุณ:</span>
              <div className="mic-visualizer">
                <div
                  className="mic-level-fill"
                  style={{ width: `${Math.min(100, Math.round(micLevel * 450))}%` }}
                />
              </div>
              <span className="mic-db-text">
                {micLevel > 0.015 ? '🎙️ ตรวจพบเสียงพูด' : '🤫 ไมค์ทำงานปกติ'}
              </span>
            </div>
          )}
        </div>

        {degradedMessage && (
          <div className="warning-banner" role="alert">
            <strong>⚠️ บริการถอดเสียงแจ้งเตือน</strong>
            <p>{degradedMessage} — สายสนทนายังคงดำเนินต่อไปได้ตามปกติ</p>
          </div>
        )}

        <div className="session-actions">
          {!isCallActive ? (
            <button className="primary-button call-start-btn" onClick={startCall}>
              📞 เริ่มสนทนาและเปิดไมค์
            </button>
          ) : (
            <div className="active-call-controls">
              <button className="danger-button" onClick={endCall}>
                ✕ จบการสนทนา
              </button>
              {handoffState !== 'ai_active' && handoffState !== 'waiting_for_user' ? (
                <button className="secondary-button" onClick={requestHandoff}>
                  🤖 ให้ AI รับช่วงสนทนา
                </button>
              ) : (
                <button className="primary-button" onClick={resumeHuman}>
                  🎙️ กลับมาพูดเอง
                </button>
              )}
            </div>
          )}
        </div>



        {isCallActive && (
          <div className="demo-triggers-panel">
            <span className="eyebrow">ทดสอบสถานการณ์จำลอง (Hackathon Demo)</span>
            <div className="demo-btn-group">
              <button
                type="button"
                className="chip-btn chip-danger"
                onClick={() =>
                  simulateSpeech(
                    'caller',
                    'ผมร้อยตำรวจเอก สมชาย จากสถานีตำรวจภูธรเมือง ตรวจพบว่าคุณเกี่ยวข้องกับคดีฟอกเงิน ให้รีบโอนเงินมาตรวจสอบทันทีและห้ามบอกใคร',
                  )
                }
              >
                🚨 แกล้งโทรเป็นตำรวจ & ขู่โอนเงิน
              </button>
              <button
                type="button"
                className="chip-btn chip-warning"
                onClick={() =>
                  simulateSpeech(
                    'caller',
                    'ทางธนาคารส่ง SMS รหัส OTP 6 หลักไปให้แล้ว รบกวนแจ้งรหัสเพื่อยืนยันสิทธิ์เดี๋ยวนี้',
                  )
                }
              >
                🔑 มิจฉาชีพขอรหัส OTP
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() =>
                  simulateSpeech('user', 'สวัสดีค่ะ ขอสอบถามรายละเอียดโปรโมชั่นอินเทอร์เน็ตบ้านค่ะ')
                }
              >
                💬 จำลองผู้ใช้พูดตอบ
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="workspace-panel live-workspace">
        <div className="risk-header-box">
          <RiskGauge score={riskScore} level={riskLevel} />
          {riskReasons.length > 0 && (
            <div className="active-reasons">
              <span className="eyebrow">สัญญาณเตือนในสาย</span>
              <ul>
                {riskReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="transcript-feed-container">
          <div className="feed-header">
            <h3>ข้อความถอดเสียงสด (Scribe Streams)</h3>
            <div className="speaker-legend">
              <span className="legend-item"><i className="dot dot-caller" /> คู่สนทนา</span>
              <span className="legend-item"><i className="dot dot-user" /> คุณ</span>
              <span className="legend-item"><i className="dot dot-ai" /> AI Decoy</span>
            </div>
          </div>

          <div className="transcript-messages">
            {utterances.length === 0 && !activePartials.caller && !activePartials.user && (
              <div className="empty-feed">
                <p>ยังไม่มีเสียงสนทนาในห้อง</p>
                <span>กดปุ่ม "เริ่มสนทนาและเปิดไมค์" เพื่อเปิดช่องสัญญาณเสียงคู่ขนาน</span>
              </div>
            )}

            {utterances.map((u) => {
              const info = SPEAKER_LABELS[u.speaker] ?? { label: u.speaker, badgeClass: '' };
              return (
                <div key={u.id} className={`message-bubble message-${u.speaker}`}>
                  <div className="message-meta">
                    <span className={`speaker-badge ${info.badgeClass}`}>{info.label}</span>
                    <span className="time-badge">{new Date(u.startedAtMs).toLocaleTimeString()}</span>
                  </div>
                  <p className="message-text">{u.text}</p>
                </div>
              );
            })}

            {/* Interim Partial Transcripts (Visual feedback only, not counted for risk) */}
            {(['caller', 'user', 'ai'] as const).map((spk) => {
              const partial = activePartials[spk];
              if (!partial || !partial.text.trim()) return null;
              const info = SPEAKER_LABELS[spk] ?? { label: spk, badgeClass: '' };
              return (
                <div key={`partial-${spk}`} className={`message-bubble message-${spk} message-partial`}>
                  <div className="message-meta">
                    <span className={`speaker-badge ${info.badgeClass}`}>{info.label}</span>
                    <span className="live-typing-pill">● กำลังพูด...</span>
                  </div>
                  <p className="message-text partial-text">{partial.text}</p>
                </div>
              );
            })}


            <div ref={feedEndRef} />
          </div>
        </div>
      </section>
    </main>
  );
};
