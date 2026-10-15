export const LiveSessionPlaceholder = () => (
  <main className="placeholder-page">
    <span className="eyebrow">Live scam shield</span>
    <h1>พื้นที่ต่อ WebRTC และเสียงสด</h1>
    <p>โครงส่วนนี้เตรียมไว้สำหรับทีม Voice: room connection, transcript, risk timeline และ handoff controls</p>
    <div className="state-flow" aria-label="Handoff states">
      {['human_active', 'preparing_ai', 'ai_active', 'waiting_for_user', 'ended'].map((state) => (
        <code key={state}>{state}</code>
      ))}
    </div>
  </main>
);
