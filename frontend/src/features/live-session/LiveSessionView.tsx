import { useState, useEffect, useRef } from 'react';
import { useLiveSession } from './useLiveSession';
import { AgentAudioPlayer } from './audio/agent-audio-player';
import { showToast } from '../../lib/toast';
import { useAppLanguage } from '../../lib/LanguageContext';

interface DemoUtterance {
  id: string;
  speaker: 'caller' | 'user' | 'ai';
  time: string;
  text: string;
  intent?: string[];
}

const DEFAULT_DEMO_UTTERANCES: DemoUtterance[] = [
  {
    id: 'demo-1',
    speaker: 'caller',
    time: '00:04',
    text: 'สวัสดีครับ ผมร้อยตำรวจเอก ธนกร จาก สภ.เมืองเชียงใหม่ มีเรื่องด่วนต้องเรียนสายกับคุณสมชายครับ',
    intent: ['AUTHORITY IMPERSONATION'],
  },
  {
    id: 'demo-2',
    speaker: 'user',
    time: '00:12',
    text: 'ครับ... มีเรื่องอะไรหรือเปล่าครับผู้หมวด?',
  },
  {
    id: 'demo-3',
    speaker: 'caller',
    time: '00:20',
    text: 'ตอนนี้ทางเราจับกุมขบวนการค้ายาเสพติด พบสมุดบัญชีกรุงไทยของคุณถูกใช้รับโอนเงินผิดกฎหมาย 2.4 ล้านบาท! คุณต้องพิสูจน์ความบริสุทธิ์เดี๋ยวนี้ ไม่อย่างนั้นศาลจะออกหมายจับภายในบ่ายนี้!',
    intent: ['CRIMINAL COERCION', 'URGENCY TRIGGER'],
  },
  {
    id: 'demo-4',
    speaker: 'user',
    time: '00:45',
    text: 'ผมไม่เคยเปิดบัญชีนั้นเลยนะ จะให้ผมทำยังไงครับ?',
  },
  {
    id: 'demo-5',
    speaker: 'caller',
    time: '01:05',
    text: 'ตอนนี้ให้คุณโอนเงินในทุกบัญชีที่คุณมี ไปไว้ที่บัญชีคุ้มครองความปลอดภัย ปปง. ชื่อนายวิชัย ภักดี เพื่อตรวจสอบก่อนครับ ถ้าบริสุทธิ์ใจจะโอนคืนให้ใน 15 นาที',
    intent: ['MONEY ROUTING'],
  },
];

class PhoneRingtone {
  private audioCtx: AudioContext | null = null;
  private isRinging = false;
  private intervalId: number | null = null;

  start() {
    if (this.isRinging) return;
    this.isRinging = true;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }

      const playRingPattern = () => {
        if (!this.isRinging || !this.audioCtx || this.audioCtx.state === 'closed') return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        // Smartphone marimba ringing chime: [E5, G5, B5, E6, B5, E6]
        const freqs = [659.25, 783.99, 987.77, 1318.51, 987.77, 1318.51];
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.11);
          gain.gain.setValueAtTime(0, now + idx * 0.11);
          gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.11 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.32);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.11);
          osc.stop(now + idx * 0.11 + 0.35);
        });
      };

      playRingPattern();
      this.intervalId = window.setInterval(playRingPattern, 2300);
    } catch {
      // AudioContext policy
    }
  }

  stop() {
    this.isRinging = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      void this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
  }
}

function generateWaveformBars(
  isActive: boolean,
  intensity: number = 0.6,
  phase: number = 0,
  isMuted: boolean = false,
): number[] {
  if (isMuted) {
    return Array.from({ length: 44 }, () => 3);
  }
  if (!isActive) {
    // Resting state: calm, subtle baseline with gentle breathing ripple
    return Array.from({ length: 44 }, (_, i) => {
      const ripple = Math.sin(i * 0.25 + phase * 0.4) * 1.2;
      return Math.max(3, Math.floor(4 + ripple));
    });
  }

  // Active voice speech: human speech frequency envelope (center frequencies higher)
  return Array.from({ length: 44 }, (_, i) => {
    const centerDist = Math.abs(i - 22) / 22; // 0 at center, 1 at edges
    const bellEnvelope = Math.cos(centerDist * Math.PI * 0.5); // 1 at center, 0 at edges

    const wave1 = Math.sin(i * 0.45 + phase);
    const wave2 = Math.cos(i * 0.85 - phase * 1.4);
    const wave3 = Math.sin(i * 1.3 + phase * 0.7);
    const combined = wave1 * 0.45 + wave2 * 0.35 + wave3 * 0.2 + 1; // 0 to 2

    const jitter = Math.random() * 0.35 + 0.65;
    const height = Math.floor(4 + bellEnvelope * combined * jitter * (intensity * 24 + 8));
    return Math.min(34, Math.max(4, height));
  });
}

interface LiveSessionViewProps {
  onNavigateToBlacklist?: (query: string) => void;
}

export const LiveSessionView = ({ onNavigateToBlacklist }: LiveSessionViewProps = {}) => {
  const { language } = useAppLanguage();
  const {
    sessionId,
    participantRole,
    joinCode,
    inviteUrl,
    handoffState,
    utterances,
    activePartials,
    riskScore,
    riskReasons,
    connectionStatus,
    degradedMessage,
    micLevel,
    isMuted,
    spokenLanguage,
    setSpokenLanguage,
    toggleMute,
    startCall,
    endCall,
    requestHandoff,
    resumeHuman,
    simulateSpeech,
    isScammerCalling,
    scammerStatus,
    activeScammerLang,
    startScammerCall,
    stopScammerCall,
  } = useLiveSession();

  const [isSpeaker, setIsSpeaker] = useState(false);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [callEndedLocally, setCallEndedLocally] = useState(false);
  const [callStatus, setCallStatus] = useState<'incoming' | 'connected' | 'ended'>('incoming');
  const ringtoneRef = useRef<PhoneRingtone>(new PhoneRingtone());
  const [demoUtteranceList, setDemoUtteranceList] = useState<DemoUtterance[]>([]);

  // Speech simulation and audio animation state
  const [isCallerSimSpeaking, setIsCallerSimSpeaking] = useState<boolean>(false);
  const [isUserSimSpeaking, setIsUserSimSpeaking] = useState<boolean>(false);
  const phaseRef = useRef<number>(0);
  const callerAudioPlayerRef = useRef<AgentAudioPlayer | null>(null);

  // Waveform heights state (defaults to resting baseline 4px)
  const [callerWaveBars, setCallerWaveBars] = useState<number[]>(() =>
    Array.from({ length: 44 }, () => 4),
  );
  const [userWaveBars, setUserWaveBars] = useState<number[]>(() =>
    Array.from({ length: 44 }, () => 4),
  );

  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const isCallActive =
    callStatus === 'connected' &&
    !callEndedLocally &&
    (connectionStatus === 'connected' || connectionStatus === 'connecting' || connectionStatus === 'idle');

  const isAiActive = handoffState === 'ai_active';

  // Dynamic speaking detection
  const isCallerActive = Boolean(
    isCallerSimSpeaking ||
    scammerStatus === 'speaking' ||
    (participantRole === 'caller' && !isMuted && micLevel > 0.035) ||
    (activePartials.caller && activePartials.caller.text.trim().length > 0),
  );

  const isUserActive = Boolean(
    !isMuted && !isAiActive &&
    (isUserSimSpeaking ||
     (participantRole !== 'caller' && micLevel > 0.008) ||
     (activePartials.user && activePartials.user.text.trim().length > 0)),
  );

  const isAiSpeaking = Boolean(
    isAiActive && (
      (activePartials.ai && activePartials.ai.text.trim().length > 0) ||
      (!isCallerActive && !isUserActive)
    ),
  );

  // Phone Ringtone Sound Loop for Incoming Call
  useEffect(() => {
    if (callStatus === 'incoming') {
      ringtoneRef.current.start();
    } else {
      ringtoneRef.current.stop();
    }
    return () => {
      ringtoneRef.current.stop();
    };
  }, [callStatus]);

  // Natural Waveform animation synchronized with speech activity
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isCallActive) {
      interval = setInterval(() => {
        phaseRef.current += 0.28;
        const currentPhase = phaseRef.current;

        // Caller wave animation
        const callerIntensity =
          participantRole === 'caller' && !isMuted
            ? Math.min(1, Math.max(0.4, micLevel * 6 + 0.3))
            : isCallerActive
              ? 0.75
              : 0;

        const callerBars = generateWaveformBars(
          isCallerActive,
          callerIntensity,
          currentPhase,
          participantRole === 'caller' && isMuted,
        );
        setCallerWaveBars(callerBars);

        // User / AI wave animation
        const userIntensity = isAiSpeaking
          ? 0.78
          : isUserActive
            ? participantRole === 'caller'
              ? 0.75
              : Math.min(1, Math.max(0.4, micLevel * 6 + 0.3))
            : 0;

        const userBars = generateWaveformBars(
          isUserActive || isAiSpeaking,
          userIntensity,
          currentPhase * 1.1,
          isMuted && !isAiSpeaking && participantRole !== 'caller',
        );
        setUserWaveBars(userBars);
      }, 70);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCallActive, isCallerActive, isUserActive, isAiSpeaking, isMuted, micLevel, participantRole]);

  // Call duration timer (only active once call is connected)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (callStatus === 'connected' && !callEndedLocally) {
      timer = setInterval(() => {
        setCallDurationSec((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callStatus, callEndedLocally]);

  // Scroll transcript feed container to bottom without scrolling parent window
  useEffect(() => {
    const el = document.getElementById('transcript-feed');
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [utterances, activePartials, demoUtteranceList]);

  // Reset page scroll to top on view mount
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  // Pre-initialize live session in background for instantaneous pickup
  useEffect(() => {
    if (!sessionId && !callEndedLocally) {
      void startCall();
    }
  }, [sessionId, callEndedLocally, startCall]);

  const formatTimer = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleToggleTakeover = async () => {
    if (callEndedLocally) {
      showToast('ไม่สามารถรับช่วงสายได้: การโทรสิ้นสุดแล้ว');
      return;
    }
    if (!sessionId) {
      await startCall();
    }
    if (isAiActive) {
      const resumed = await resumeHuman();
      if (resumed) showToast('ส่งคำขอคืนสายให้ผู้ใช้แล้ว');
    } else {
      const accepted = await requestHandoff();
      if (accepted) showToast('กำลังเตรียม AI Decoy รับช่วงสายล่อ');
    }
  };

  const handleAcceptCall = async () => {
    ringtoneRef.current.stop();
    callerAudioPlayerRef.current?.stopAndFlush();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setCallStatus('connected');
    setCallEndedLocally(false);
    setCallDurationSec(0);
    if (!sessionId) await startCall();
    showToast(
      spokenLanguage === 'en-US'
        ? 'Call Connected! English Scammer AI (Fraud Taskforce) is connecting...'
        : 'รับสายแล้ว! มิจฉาชีพ AI (ตำรวจไซเบอร์) กำลังเชื่อมต่อสายตรง...',
    );

    // ConvAI owns live-call audio. Transcript updates must never trigger a second TTS playback.
    const targetLang: 'th' | 'en' = spokenLanguage === 'en-US' ? 'en' : 'th';
    await startScammerCall(targetLang);
  };

  const handleDeclineCall = async () => {
    ringtoneRef.current.stop();
    setCallStatus('ended');
    setCallEndedLocally(true);
    stopScammerCall();
    await endCall();
    showToast('ปฏิเสธสายมิจฉาชีพแล้ว • ป้องกันความเสี่ยงสำเร็จ');
  };

  const handleRestartIncomingCall = () => {
    stopScammerCall();
    setDemoUtteranceList([]);
    setCallEndedLocally(false);
    setCallDurationSec(0);
    setCallStatus('incoming');
    showToast('จำลองสายมิจฉาชีพโทรเข้ามาใหม่ (เสียงกระดิ่งกำลังดัง)...');
  };

  const handleEndCall = async () => {
    ringtoneRef.current.stop();
    setCallStatus('ended');
    setCallEndedLocally(true);
    stopScammerCall();
    await endCall();
    showToast('ตัดสายเรียบร้อย • บันทึกหลักฐานลงใน Incident Dossier');
  };

  const handleToggleSpeaker = () => {
    setIsSpeaker((prev) => {
      const next = !prev;
      showToast(next ? 'เปิดลำโพง (Hands-Free)' : 'ปิดลำโพง (Earpiece)');
      return next;
    });
  };

  const handleToggleMic = () => {
    toggleMute();
    showToast(isMuted ? 'เปิดไมโครโฟนแล้ว (Active)' : 'ปิดไมโครโฟนแล้ว (Muted)');
  };

  const playScammerSpeech = async (text: string, lang: 'th' | 'en' = 'th') => {
    setIsCallerSimSpeaking(true);
    const approxDurationSec = Math.max(3.8, Math.min(11, text.length * 0.075));
    const timer = setTimeout(() => {
      setIsCallerSimSpeaking(false);
    }, approxDurationSec * 1000);

    showToast(`กำลังสังเคราะห์เสียงมิจฉาชีพ AI (${lang === 'en' ? 'George (EN)' : 'Anan (TH)'})...`);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/sessions/speak-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'demo-user' },
        body: JSON.stringify({
          text,
          directText: true,
          voiceRole: 'scammer',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          if (!callerAudioPlayerRef.current) {
            callerAudioPlayerRef.current = new AgentAudioPlayer();
          }
          await callerAudioPlayerRef.current.enqueueAudioChunk(data.audioBase64, 16000);
          showToast(`เสียงมิจฉาชีพ AI กำลังพูดออกลำโพง (${lang === 'en' ? 'EN' : 'TH'})`);
          return;
        }
      }
    } catch {
      // Fallback below
    }

    // Fallback: Web Speech API speechSynthesis for zero-dependency speaker playback
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'en' ? 'en-US' : 'th-TH';
        utterance.rate = 0.98;
        utterance.pitch = 0.85; // Deep, commanding tone
        utterance.onend = () => {
          clearTimeout(timer);
          setIsCallerSimSpeaking(false);
        };
        utterance.onerror = () => {
          clearTimeout(timer);
          setIsCallerSimSpeaking(false);
        };
        window.speechSynthesis.speak(utterance);
        showToast(`เสียงมิจฉาชีพ AI ออกลำโพง (Web Speech): ${lang === 'en' ? 'EN' : 'TH'}`);
      }
    } catch {
      // ignore
    }
  };

  const handleSimulate = async (type: 'police' | 'otp' | 'user' | 'en_police' | 'en_otp' | 'en_user') => {
    if (type === 'police') {
      const text =
        'สวัสดีครับ ผมร้อยตำรวจเอกสมชาย จากกองบัญชาการตำรวจไซเบอร์ ตรวจพบว่าบัญชีธนาคารของคุณมีส่วนพัวพันกับคดีฟอกเงินข้ามชาติ ขอให้โอนเงินทั้งหมดเข้ามาตรวจสอบที่บัญชีกลางของ ปปง. ด่วนที่สุด และห้ามบอกใครเด็ดขาด มิฉะนั้นจะออกหมายจับทันที';
      void playScammerSpeech(text, 'th');
      await simulateSpeech('caller', text);
      setDemoUtteranceList((prev) => [
        ...prev,
        {
          id: `sim-${Date.now()}`,
          speaker: 'caller',
          time: formatTimer(callDurationSec),
          text,
          intent: ['AUTHORITY IMPERSONATION', 'CRIMINAL COERCION'],
        },
      ]);
      showToast('จำลอง: ตำรวจปลอมโทรข่มขู่โอนเงิน (เสียงออกลำโพง)');
    } else if (type === 'otp') {
      const text =
        'ทางเจ้าหน้าที่ได้ส่งรหัส OTP 6 หลักไปที่โทรศัพท์มือถือของคุณแล้ว ขอให้แจ้งรหัสยืนยันกลับมาเดี๋ยวนี้เพื่อระงับการอายัดบัญชีครับ';
      void playScammerSpeech(text, 'th');
      await simulateSpeech('caller', text);
      setDemoUtteranceList((prev) => [
        ...prev,
        {
          id: `sim-${Date.now()}`,
          speaker: 'caller',
          time: formatTimer(callDurationSec),
          text,
          intent: ['SECRET REQUEST', 'URGENCY TRIGGER'],
        },
      ]);
      showToast('จำลอง: มิจฉาชีพหลอกขอ OTP (เสียงออกลำโพง)');
    } else if (type === 'user') {
      const text = 'ขอโทษนะครับ ผมไม่สะดวกโอนเงิน และขอโทรกลับไปตรวจสอบกับทางสถานีตำรวจด้วยตัวเองครับ';
      setIsUserSimSpeaking(true);
      setTimeout(() => setIsUserSimSpeaking(false), 3500);
      await simulateSpeech('user', text);
      setDemoUtteranceList((prev) => [
        ...prev,
        {
          id: `sim-${Date.now()}`,
          speaker: 'user',
          time: formatTimer(callDurationSec),
          text,
        },
      ]);
      showToast('จำลอง: ผู้ใช้ปฏิเสธการโอนเงิน');
    } else if (type === 'en_police') {
      const text =
        'This is Officer John Davis from Federal Fraud Taskforce. Your account is tied to an international money laundering ring. You must wire all funds to our verification vault immediately.';
      void playScammerSpeech(text, 'en');
      await simulateSpeech('caller', text);
      setDemoUtteranceList((prev) => [
        ...prev,
        {
          id: `sim-${Date.now()}`,
          speaker: 'caller',
          time: formatTimer(callDurationSec),
          text,
          intent: ['AUTHORITY IMPERSONATION', 'URGENCY', 'MONEY ROUTING'],
        },
      ]);
      showToast('Simulate: Impersonating Federal Police (Voice on Speaker)');
    } else if (type === 'en_otp') {
      const text =
        'We sent a 6-digit OTP passcode to your mobile device right now. Please disclose the code immediately to avoid permanent account termination.';
      void playScammerSpeech(text, 'en');
      await simulateSpeech('caller', text);
      setDemoUtteranceList((prev) => [
        ...prev,
        {
          id: `sim-${Date.now()}`,
          speaker: 'caller',
          time: formatTimer(callDurationSec),
          text,
          intent: ['CREDENTIAL HARVESTING', 'URGENCY'],
        },
      ]);
      showToast('Simulate: OTP Harvesting Scam (Voice on Speaker)');
    } else if (type === 'en_user') {
      const text =
        'I will not share any OTP codes or transfer money over the phone. I am contacting my bank fraud prevention desk directly.';
      setIsUserSimSpeaking(true);
      setTimeout(() => setIsUserSimSpeaking(false), 4000);
      await simulateSpeech('user', text);
      setDemoUtteranceList((prev) => [
        ...prev,
        {
          id: `sim-${Date.now()}`,
          speaker: 'user',
          time: formatTimer(callDurationSec),
          text,
        },
      ]);
      showToast('Simulate: Citizen Refuses & Mentions Fraud Desk');
    }
  };

  return (
    <div className="tab-pane active" id="tab-live-call">
      {/* Top Banner with Real Call Controls */}
      <div className="call-active-banner">
        <div className="call-details">
          <div
            className="pulse-dot-red"
            style={{
              background:
                callStatus === 'incoming'
                  ? '#22c55e'
                  : callEndedLocally
                    ? 'var(--fg-muted)'
                    : '#ef4444',
            }}
          />
          <div>
            <div className="call-meta-title">
              <span style={{ color: callEndedLocally ? 'var(--fg-muted)' : 'var(--fg)' }}>
                {callStatus === 'incoming'
                  ? (language === 'en' ? 'Incoming Call (Suspected Scam Caller)...' : 'Incoming Call (สายเรียกเข้าจากมิจฉาชีพ)...')
                  : callEndedLocally
                    ? (language === 'en' ? 'Call Terminated' : 'Call Terminated (สายถูกตัดแล้ว)')
                    : participantRole === 'owner'
                      ? (language === 'en' ? 'Live Scam Shield · Session Owner' : 'Live Scam Shield · เจ้าของห้อง')
                      : (language === 'en' ? 'Live Scam Shield · Test Participant' : 'Live Scam Shield · ผู้ร่วมทดสอบ')}
              </span>
              <span
                className={`badge-sev ${
                  callStatus === 'incoming'
                    ? 'badge-warning'
                    : callEndedLocally || riskScore < 55
                      ? 'badge-safe'
                      : 'badge-critical'
                }`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {callStatus === 'incoming' ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                    <span>Ringing</span>
                  </>
                ) : callEndedLocally ? (
                  'Session Closed'
                ) : riskScore >= 55 ? (
                  `Risk ${riskScore}%`
                ) : (
                  'Monitoring'
                )}
              </span>
            </div>
            <div className="call-meta-sub">
              WebRTC {connectionStatus} • Session:{' '}
              <span className="code-tag">{sessionId ? sessionId.slice(0, 13) : 'pending'}</span>
            </div>
          </div>
        </div>

        <div className="call-controls-cluster">
          <div style={{ textAlign: 'right', marginRight: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>
              {callStatus === 'incoming' ? '00:00' : formatTimer(callDurationSec)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
              {callStatus === 'incoming' ? 'Incoming...' : 'Call Duration'}
            </div>
          </div>

          {callStatus === 'incoming' && (
            <button
              type="button"
              className="btn-action btn-action-primary pulse-green-glow"
              onClick={handleAcceptCall}
              title={language === 'en' ? 'Answer call immediately' : 'กดรับสายทันทีเพื่อฟังมิจฉาชีพ AI ข่มขู่'}
              style={{ background: '#22c55e', borderColor: '#16a34a', color: '#ffffff', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>{language === 'en' ? 'Answer Call (AI Scammer Speaks)' : 'กดรับสาย (AI มิจฉาชีพจะเริ่มพูด)'}</span>
            </button>
          )}

          {callStatus === 'connected' && !callEndedLocally && (
            <>
              <button
                type="button"
                className={`btn-call-mute ${isMuted ? 'muted' : ''}`}
                onClick={handleToggleMic}
                title="Mute or Unmute your microphone"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
              </button>

              <button
                type="button"
                className="btn-call-end"
                onClick={handleEndCall}
                title="End call immediately"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                  <line x1="23" y1="1" x2="1" y2="23" />
                </svg>
                <span>End Call</span>
              </button>
            </>
          )}

          {callEndedLocally && (
            <button
              type="button"
              className="btn-action btn-action-primary"
              onClick={handleRestartIncomingCall}
              title={language === 'en' ? 'Simulate new incoming scam call' : 'จำลองสายมิจฉาชีพโทรเข้ามาใหม่'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>{language === 'en' ? 'Simulate Incoming Call' : 'จำลองสายมิจฉาชีพโทรเข้าใหม่'}</span>
            </button>
          )}
        </div>
      </div>

      {degradedMessage && (
        <div className="warning-banner" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--amber)', padding: '10px 14px', borderRadius: 6, marginBottom: 16 }}>
          <strong style={{ color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {language === 'en' ? 'Audio Pipeline Notice: ' : 'แจ้งเตือนระบบเสียง: '}
          </strong>
          <span style={{ color: 'var(--fg-secondary)', fontSize: 12 }}>{degradedMessage}</span>
        </div>
      )}

      {participantRole === 'owner' && inviteUrl && !callEndedLocally && (
        <div className="warning-banner" style={{ marginBottom: 16 }}>
          <strong>{language === 'en' ? `Invitee Test Link · Code ${joinCode}` : `ลิงก์เชิญผู้ร่วมทดสอบ · รหัส ${joinCode}`}</strong>
          <p style={{ overflowWrap: 'anywhere' }}>{inviteUrl}</p>
          <button
            type="button"
            className="btn-action btn-action-ghost"
            onClick={() => {
              void navigator.clipboard.writeText(inviteUrl);
              showToast(language === 'en' ? 'Invite link copied' : 'คัดลอกลิงก์เชิญแล้ว');
            }}
          >
            {language === 'en' ? 'Copy Invite Link' : 'คัดลอกลิงก์เชิญ'}
          </button>
        </div>
      )}

      {/* Main 2-Column Live Call Layout */}
      <div className="live-call-layout">
        {/* Left Column: Authentic In-Call Smartphone Mockup */}
        <div className="phone-mockup-wrapper">
          <div className="phone-device-chassis">
            {/* Hardware Buttons */}
            <div className="hw-btn-action" />
            <div className="hw-btn-volup" />
            <div className="hw-btn-voldown" />
            <div className="hw-btn-power" />

            {/* Active OLED Display */}
            <div className="phone-screen-display">
              <div className="phone-glass-glare" />

              {/* Dynamic Island & Status */}
              <div>
                <div className="phone-notch-area">
                  <div className="phone-dynamic-island">
                    <div className="island-lens" />
                    <div
                      className="island-mic-dot"
                      style={{
                        background:
                          callStatus === 'incoming'
                            ? '#22c55e'
                            : callEndedLocally
                              ? 'var(--fg-muted)'
                              : isAiActive
                                ? '#38bdf8'
                                : '#f59e0b',
                        boxShadow: callEndedLocally ? 'none' : undefined,
                      }}
                      title="Microphone Active"
                    />
                  </div>
                </div>

                {/* iOS Status Bar */}
                <div className="ios-status-bar">
                  <span>22:11</span>
                  <div className="ios-status-right">
                    <div className="ios-cell-signal">
                      <span className="ios-signal-bar" />
                      <span className="ios-signal-bar" />
                      <span className="ios-signal-bar" />
                      <span className="ios-signal-bar" />
                    </div>
                    <span className="ios-network-tag">4G</span>
                    <div className="ios-battery-pill">84</div>
                  </div>
                </div>
              </div>

              {/* Conditional Display: Incoming Call vs In-Call Active */}
              {callStatus === 'incoming' ? (
                <div className="ios-incoming-screen">
                  {/* Incoming Caller Profile */}
                  <div className="ios-incoming-header">
                    <div className="ios-incoming-sub">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span>SUSPECTED SCAM CALLER</span>
                    </div>
                    <div className="ios-incoming-number">08-2419-8921</div>
                    <div className="ios-incoming-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{language === 'en' ? 'Flagged Caller · Fraud Taskforce Impersonation' : 'เบอร์ต้องสงสัย · กองปราบปรามปลอม'}</span>
                    </div>
                    <div className="ios-incoming-warning">
                      {language === 'en'
                        ? 'ScamTrap Live Shield detected high-risk scam activity'
                        : 'ScamTrap Live Shield ตรวจจับพฤติกรรมเสี่ยงสูง'}
                    </div>
                  </div>

                  {/* Pulsing Avatar Radar */}
                  <div className="ios-incoming-avatar-wrap">
                    <div className="ios-incoming-radar-ring" />
                    <div className="ios-incoming-radar-ring ring-2" />
                    <div className="ios-incoming-avatar">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </div>
                    <div className="ios-ringing-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      <span>{language === 'en' ? 'Ringing...' : 'เสียงกระดิ่งกำลังดัง...'}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      width: 'min(360px, 90%)',
                      margin: '0 auto 18px',
                      padding: '10px 12px',
                      border: '1px solid rgba(255, 255, 255, 0.16)',
                      borderRadius: 10,
                      background: 'rgba(15, 23, 42, 0.78)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ color: '#cbd5e1', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
                      {language === 'en' ? 'Choose call language' : 'เลือกภาษาของสาย / Choose call language'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className={`btn-action ${spokenLanguage === 'th-TH' ? 'btn-action-primary' : 'btn-action-ghost'}`}
                        aria-pressed={spokenLanguage === 'th-TH'}
                        onClick={() => {
                          setSpokenLanguage('th-TH');
                          showToast('สายถัดไปจะใช้ Agent และไมโครโฟนภาษาไทย');
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.18)' }}>TH</span>
                        <span>{language === 'en' ? 'Thai' : 'ภาษาไทย'}</span>
                      </button>
                      <button
                        type="button"
                        className={`btn-action ${spokenLanguage === 'en-US' ? 'btn-action-primary' : 'btn-action-ghost'}`}
                        aria-pressed={spokenLanguage === 'en-US'}
                        onClick={() => {
                          setSpokenLanguage('en-US');
                          showToast('The next call will use the English agent and microphone');
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.18)' }}>EN</span>
                        <span>English</span>
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons: Decline vs Accept */}
                  <div>
                    <div className="ios-incoming-actions">
                      <button
                        type="button"
                        className="ios-incoming-btn"
                        onClick={handleDeclineCall}
                        title={language === 'en' ? 'Decline Call' : 'ปฏิเสธสาย'}
                      >
                        <div className="ios-action-circle bg-red-decline">
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </div>
                        <span>{language === 'en' ? 'Decline' : 'ปฏิเสธสาย'}</span>
                      </button>

                      <button
                        type="button"
                        className="ios-incoming-btn"
                        onClick={handleAcceptCall}
                        title={spokenLanguage === 'en-US' ? 'Answer with the English AI caller' : 'รับสายด้วย AI ภาษาไทย'}
                      >
                        <div className="ios-action-circle bg-green-accept pulse-green-glow">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </div>
                        <span>
                          {spokenLanguage === 'en-US'
                            ? 'Answer (English AI)'
                            : (language === 'en' ? 'Answer (Thai AI)' : 'รับสาย (AI ภาษาไทย)')}
                        </span>
                      </button>
                    </div>

                    {/* Bottom Home Bar */}
                    <div className="ios-home-bar-wrap">
                      <div className="ios-home-bar" />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                  {/* Call Info Header */}
                  <div className="ios-call-header">
                    <div className="ios-call-timer">
                      {callEndedLocally
                        ? '00:00'
                        : isScammerCalling
                          ? `AI Call • ${formatTimer(callDurationSec)}`
                          : formatTimer(callDurationSec)}
                    </div>
                    <div
                      className="ios-call-number"
                      style={{ color: callEndedLocally ? '#ef4444' : '#ffffff', fontSize: callEndedLocally ? 22 : isScammerCalling ? 22 : 30 }}
                    >
                      {callEndedLocally
                        ? (language === 'en' ? 'Call Ended' : 'สายถูกตัดแล้ว')
                        : isScammerCalling
                          ? (activeScammerLang === 'en' ? '08-2419-8921 (Fraud Taskforce AI)' : (language === 'en' ? '08-2419-8921 (Cyber Police AI)' : '08-2419-8921 (ตำรวจไซเบอร์ AI)'))
                          : '08-2419-8921'}
                    </div>
                  </div>

                  {/* Middle Section: AI Takeover Pill Button */}
                  <div className="ios-ai-action-wrap">
                    <button
                      type="button"
                      className={`btn-ios-ai-takeover ${isAiActive ? 'active' : ''}`}
                      onClick={handleToggleTakeover}
                      disabled={callEndedLocally || participantRole !== 'owner'}
                      style={{ opacity: callEndedLocally || participantRole !== 'owner' ? 0.4 : 1, cursor: callEndedLocally || participantRole !== 'owner' ? 'not-allowed' : 'pointer' }}
                    >
                      <svg className="ai-sparkle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
                      </svg>
                      <span>
                        {participantRole !== 'owner'
                          ? (language === 'en' ? 'Owner controls AI' : 'เจ้าของห้องเป็นผู้ควบคุม AI')
                          : isAiActive
                            ? (language === 'en' ? 'AI Decoy Active... (Tap to talk)' : 'AI กำลังคุยแทน... (แตะเพื่อคุยเอง)')
                            : handoffState === 'preparing_ai'
                              ? (language === 'en' ? 'Preparing AI...' : 'กำลังเตรียม AI...')
                              : (language === 'en' ? 'Let AI Takeover Call (Handoff)' : 'ให้ AI รับช่วงสาย (Handoff)')}
                      </span>
                    </button>
                  </div>

                  {/* Bottom Section: 2x3 iOS Call Grid */}
                  <div>
                    <div className="ios-call-grid">
                      {/* 1: Speaker */}
                      <button type="button" className="ios-grid-btn" onClick={handleToggleSpeaker} title={language === 'en' ? 'Speaker' : 'เสียง'}>
                        <div className={`ios-btn-circle ${isSpeaker ? 'active-white' : ''}`}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                          </svg>
                        </div>
                        <span className="ios-btn-label">{language === 'en' ? 'Speaker' : 'เสียง'}</span>
                      </button>

                      {/* 2: FaceTime */}
                      <button
                        type="button"
                        className="ios-grid-btn"
                        onClick={() => showToast(language === 'en' ? 'FaceTime unavailable during voice call' : 'FaceTime ไม่พร้อมใช้งานขณะโทรเสียง')}
                        title="FaceTime"
                      >
                        <div className="ios-btn-circle">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M15 10l5-3v10l-5-3v-4z" />
                            <rect x="2" y="6" width="13" height="12" rx="2" />
                            <circle cx="8.5" cy="12" r="1.5" fill="currentColor" />
                          </svg>
                        </div>
                        <span className="ios-btn-label">FaceTime</span>
                      </button>

                      {/* 3: Mute */}
                      <button type="button" className="ios-grid-btn" onClick={handleToggleMic} title={language === 'en' ? (isMuted ? 'Unmute' : 'Mute') : (isMuted ? 'เปิดเสียง' : 'ปิดเสียง')}>
                        <div className={`ios-btn-circle ${isMuted ? 'active-white' : ''}`}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="1" y1="1" x2="23" y2="23" />
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                        </div>
                        <span className="ios-btn-label">
                          {language === 'en'
                            ? (isMuted ? 'Unmute' : 'Mute')
                            : (isMuted ? 'เปิดเสียง' : 'ปิดเสียง')}
                        </span>
                      </button>

                      {/* 4: More */}
                      <button type="button" className="ios-grid-btn" onClick={() => showToast(language === 'en' ? 'More options' : 'ตัวเลือกเพิ่มเติม')} title={language === 'en' ? 'More' : 'เพิ่มเติม'}>
                        <div className="ios-btn-circle">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="5" cy="12" r="2.2" />
                            <circle cx="12" cy="12" r="2.2" />
                            <circle cx="19" cy="12" r="2.2" />
                          </svg>
                        </div>
                        <span className="ios-btn-label">{language === 'en' ? 'More' : 'เพิ่มเติม'}</span>
                      </button>

                      {/* 5: Hangup */}
                      <button
                        type="button"
                        className="ios-grid-btn"
                        onClick={handleEndCall}
                        disabled={callEndedLocally}
                        title={language === 'en' ? 'End' : 'วางสาย'}
                      >
                        <div
                          className="ios-btn-circle btn-red-end"
                          style={{ opacity: callEndedLocally ? 0.35 : 1, cursor: callEndedLocally ? 'not-allowed' : 'pointer' }}
                        >
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                            <line x1="23" y1="1" x2="1" y2="23" />
                          </svg>
                        </div>
                        <span className="ios-btn-label">{language === 'en' ? 'End' : 'วางสาย'}</span>
                      </button>

                      {/* 6: Keypad */}
                      <button
                        type="button"
                        className="ios-grid-btn"
                        onClick={() => showToast(language === 'en' ? 'Keypad opened' : 'เปิดแป้นตัวเลข')}
                        title={language === 'en' ? 'Keypad' : 'แป้นตัวเลข'}
                      >
                        <div className="ios-btn-circle">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="6" cy="6" r="1.8" />
                            <circle cx="12" cy="6" r="1.8" />
                            <circle cx="18" cy="6" r="1.8" />
                            <circle cx="6" cy="12" r="1.8" />
                            <circle cx="12" cy="12" r="1.8" />
                            <circle cx="18" cy="12" r="1.8" />
                            <circle cx="6" cy="18" r="1.8" />
                            <circle cx="12" cy="18" r="1.8" />
                            <circle cx="18" cy="18" r="1.8" />
                          </svg>
                        </div>
                        <span className="ios-btn-label">{language === 'en' ? 'Keypad' : 'แป้นตัวเลข'}</span>
                      </button>
                    </div>

                    {/* Bottom Home Bar */}
                    <div className="ios-home-bar-wrap">
                      <div className="ios-home-bar" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Dual-Channel Telemetry & Live Transcript */}
        <div className="telemetry-wrapper">
          {/* Audio Channels & AI Takeover Control */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                </svg>
                Dual-Channel Audio Telemetry (WebRTC)
              </div>
              <span className="badge-sev badge-info">Scribe Stream 48kHz</span>
            </div>

            <div className="card-body">
              {/* Channel A: Caller */}
              <div className={`waveform-box caller-channel ${isCallerActive ? 'active-channel' : 'idle-channel'}`}>
                <div className="waveform-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>CHANNEL A: Inbound Caller (+66 82-419-8921)</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        background: isCallerActive ? 'rgba(244,63,94,0.25)' : 'rgba(255,255,255,0.06)',
                        color: isCallerActive ? '#f43f5e' : 'var(--fg-muted)',
                        borderRadius: 4,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </svg>
                      Speaker: {isCallerActive ? 'Playing Voice' : 'Active'}
                    </span>
                  </div>
                  {isCallerActive ? (
                    <span style={{ color: '#f43f5e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="pulse-dot-red" style={{ width: 6, height: 6 }} />
                      {language === 'en' ? 'Active Speech (Caller Streaming)' : 'Active Speech (เสียงมิจฉาชีพออนไลน์)'}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>
                      {language === 'en' ? 'Listening (Awaiting voice)' : 'Listening (รอฟังสาย)'}
                    </span>
                  )}
                </div>
                <div className="waveform-bars">
                  {callerWaveBars.map((h, i) => (
                    <div key={i} className="wave-line" style={{ height: `${h}px` }} />
                  ))}
                </div>
              </div>

              {/* Channel B: User / AI */}
              <div
                className={`waveform-box user-channel ${
                  isMuted
                    ? 'muted-channel'
                    : isAiSpeaking
                      ? 'ai-channel'
                      : isUserActive
                        ? 'active-channel'
                        : 'idle-channel'
                }`}
              >
                <div className="waveform-header">
                  <span>
                    {isAiActive
                      ? 'CHANNEL B: ScamTrap AI Agent (Decoy Takeover)'
                      : 'CHANNEL B: Protected Citizen (End-User)'}
                  </span>
                  {isMuted ? (
                    <span style={{ color: '#ff6b6b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="1" y1="1" x2="23" y2="23" />
                        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                        <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
                      </svg>
                      <span>{language === 'en' ? 'Muted (Microphone Off)' : 'Muted (ปิดเสียงไมค์)'}</span>
                    </span>
                  ) : isAiSpeaking ? (
                    <span style={{ color: '#60a5fa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="pulse-dot-green" style={{ width: 6, height: 6, background: '#60a5fa' }} />
                      AI Agent Speaking (ElevenLabs 16kHz)
                    </span>
                  ) : isUserActive ? (
                    <span style={{ color: 'var(--emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="pulse-dot-green" style={{ width: 6, height: 6 }} />
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </svg>
                      {language === 'en' ? 'Active Speech (Talking...)' : 'Active Speech (กำลังพูด...)'}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>
                      {language === 'en' ? 'Listening (Ready for voice)' : 'Listening (พร้อมตรวจจับเสียง)'}
                    </span>
                  )}
                </div>
                <div className="waveform-bars">
                  {userWaveBars.map((h, i) => (
                    <div key={i} className="wave-line" style={{ height: `${h}px` }} />
                  ))}
                </div>
              </div>


              {/* Language Selection & Hackathon Demo Simulation Triggers */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>
                    {language === 'en' ? 'Spoken Language (Microphone):' : 'ภาษาที่รองรับ (Spoken Language):'}
                  </span>
                  <button
                    type="button"
                    className={`btn-action ${spokenLanguage === 'th-TH' ? 'btn-action-primary' : 'btn-action-ghost'}`}
                    style={{ fontSize: 11, height: 24, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    disabled={callStatus === 'connected' && !callEndedLocally}
                    onClick={() => {
                      setSpokenLanguage('th-TH');
                      showToast(language === 'en' ? 'Switched microphone to Thai (th-TH)' : 'สลับไมโครโฟนเป็นภาษาไทย (th-TH)');
                    }}
                  >
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 3px', borderRadius: 2, background: 'rgba(255,255,255,0.15)' }}>TH</span>
                    <span>{language === 'en' ? 'Thai' : 'ภาษาไทย'}</span>
                  </button>
                  <button
                    type="button"
                    className={`btn-action ${spokenLanguage === 'en-US' ? 'btn-action-primary' : 'btn-action-ghost'}`}
                    style={{ fontSize: 11, height: 24, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    disabled={callStatus === 'connected' && !callEndedLocally}
                    onClick={() => {
                      setSpokenLanguage('en-US');
                      showToast('Switched microphone to English (en-US)');
                    }}
                  >
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 3px', borderRadius: 2, background: 'rgba(255,255,255,0.15)' }}>EN</span>
                    <span>English</span>
                  </button>
                </div>



                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)', width: '100%', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.1)' }}>TH</span>
                    <span>{language === 'en' ? 'Thai Scam Simulations:' : 'จำลองบทสนทนาไทย:'}</span>
                  </span>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onClick={() => handleSimulate('police')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>{language === 'en' ? 'Police Money Laundering' : 'ขู่คดีฟอกเงิน'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onClick={() => handleSimulate('otp')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                      <circle cx="7.5" cy="15.5" r="5.5" />
                      <path d="M12 12l8-8m-3 0l3 3m-5 1l2 2" />
                    </svg>
                    <span>{language === 'en' ? 'Phish OTP' : 'หลอกขอ OTP'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onClick={() => handleSimulate('user')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>{language === 'en' ? 'User Refusal' : 'ผู้ใช้ปฏิเสธ'}</span>
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)', width: '100%', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.1)' }}>EN</span>
                    <span>English Scam Scenarios:</span>
                  </span>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onClick={() => handleSimulate('en_police')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>Taskforce Wire Scam</span>
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onClick={() => handleSimulate('en_otp')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                      <circle cx="7.5" cy="15.5" r="5.5" />
                      <path d="M12 12l8-8m-3 0l3 3m-5 1l2 2" />
                    </svg>
                    <span>Phish OTP Passcode</span>
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onClick={() => handleSimulate('en_user')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>Citizen Refusal</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Real-Time Speech-to-Text & Transcript Feed */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 7 4 4 20 4 20 7" />
                  <line x1="9" y1="20" x2="15" y2="20" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
                Live Speech-to-Text &amp; Intent Interception
              </div>
              <span className="badge-sev badge-safe">Scribe Sync: Active</span>
            </div>

            <div className="card-body">
              <div className="transcript-container" id="transcript-feed">
                {demoUtteranceList.map((item) => (
                  <div
                    key={item.id}
                    className={`chat-bubble ${item.speaker === 'caller' ? 'bubble-inbound' : item.speaker === 'user' ? 'bubble-citizen' : 'bubble-agent'}`}
                  >
                    <div className="bubble-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        {item.speaker === 'caller' && (
                          <>
                            CALLER ({item.time}){' '}
                            {item.intent?.map((it) => (
                              <span key={it} className="tag-intent">
                                {it}
                              </span>
                            ))}
                          </>
                        )}
                        {item.speaker === 'user' && `USER (${item.time})`}
                        {item.speaker === 'ai' && (
                          <span style={{ color: '#60a5fa' }}>SCAMTRAP AI AGENT (TAKEOVER ACTIVE)</span>
                        )}
                      </div>
                      {item.speaker === 'caller' && (
                        <button
                          type="button"
                          className="btn-replay-voice"
                          style={{
                            background: 'rgba(244,63,94,0.15)',
                            border: '1px solid rgba(244,63,94,0.35)',
                            color: '#f43f5e',
                            fontSize: 10,
                            borderRadius: 4,
                            padding: '1px 7px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          onClick={() => void playScammerSpeech(item.text, /[\u0E00-\u0E7F]/.test(item.text) ? 'th' : 'en')}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          </svg>
                          <span>{language === 'en' ? 'Replay Voice' : 'ฟังเสียงซ้ำ'}</span>
                        </button>
                      )}
                    </div>
                    {item.text}
                  </div>
                ))}

                {/* Real-time backend utterances if connected */}
                {utterances.map((u) => (
                  <div
                    key={u.id}
                    className={`chat-bubble ${u.speaker === 'caller' ? 'bubble-inbound' : u.speaker === 'user' ? 'bubble-citizen' : 'bubble-agent'}`}
                  >
                    <div className="bubble-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {u.speaker === 'caller' ? (
                          <span style={{ color: '#f87171', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>{language === 'en' ? 'CALLER (Scammer)' : 'CALLER (มิจฉาชีพ)'}</span>
                          </span>
                        ) : u.speaker === 'user' ? (
                          <span style={{ color: 'var(--emerald)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                            <span>{language === 'en' ? 'USER (You)' : 'USER (คุณ)'}</span>
                          </span>
                        ) : (
                          <span style={{ color: '#60a5fa', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <rect x="4" y="4" width="16" height="16" rx="2" />
                              <rect x="9" y="9" width="6" height="6" />
                            </svg>
                            <span>SCAMTRAP AI DECOY</span>
                          </span>
                        )}
                        <span style={{ color: 'var(--fg-muted)', fontWeight: 400, fontSize: 10 }}>
                          ({new Date(u.createdAt).toLocaleTimeString()})
                        </span>
                      </div>
                      {u.speaker === 'caller' && (
                        <button
                          type="button"
                          className="btn-replay-voice"
                          style={{
                            background: 'rgba(244,63,94,0.15)',
                            border: '1px solid rgba(244,63,94,0.35)',
                            color: '#f43f5e',
                            fontSize: 10,
                            borderRadius: 4,
                            padding: '1px 7px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          onClick={() => void playScammerSpeech(u.text, /[\u0E00-\u0E7F]/.test(u.text) ? 'th' : 'en')}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          </svg>
                          <span>{language === 'en' ? 'Replay Voice' : 'ฟังเสียงซ้ำ'}</span>
                        </button>
                      )}
                    </div>
                    {u.text}
                  </div>
                ))}

                {/* Interim partial typing indicator */}
                {activePartials.caller && activePartials.caller.text.trim() && (
                  <div className="chat-bubble bubble-inbound" style={{ borderStyle: 'dashed', opacity: 0.85 }}>
                    <div className="bubble-meta">{language === 'en' ? 'CALLER (Speaking...)' : 'CALLER (กำลังพูด...)'}</div>
                    <em>{activePartials.caller.text}</em>
                  </div>
                )}
                {activePartials.user && activePartials.user.text.trim() && (
                  <div className="chat-bubble bubble-citizen" style={{ borderStyle: 'dashed', opacity: 0.85 }}>
                    <div className="bubble-meta">{language === 'en' ? 'USER (Speaking...)' : 'USER (กำลังพูด...)'}</div>
                    <em>{activePartials.user.text}</em>
                  </div>
                )}

                {callEndedLocally && (
                  <div
                    className="chat-bubble"
                    style={{
                      background: '#1a1f2c',
                      textAlign: 'center',
                      alignSelf: 'center',
                      color: 'var(--fg-muted)',
                    }}
                  >
                    — Call session ended by user at {formatTimer(callDurationSec)} — Evidence saved to Incident Dossier
                  </div>
                )}

                <div ref={feedEndRef} />
              </div>

              <div
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  color: 'var(--fg-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Audio Pipeline Latency: 84ms • Scribe Realtime</span>
                <span style={{ color: '#ff6b6b', fontWeight: 500 }}>
                  {riskReasons.length > 0
                    ? `Warning: ${riskReasons[0]}`
                    : (language === 'en' ? 'No active threat keywords detected' : 'ยังไม่พบคำเตือนจากบทสนทนารอบนี้')}
                </span>
              </div>

              {/* Real-Time IOC Interception & 1-Click Blacklist Cross-Reference */}
              <div
                style={{
                  marginTop: 14,
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge-sev badge-critical" style={{ fontSize: 9.5 }}>
                    LIVE IOC DETECTED
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--fg)' }}>
                    {language === 'en' ? (
                      <>
                        Flagged Caller: <strong style={{ color: '#f87171' }}>+66 82-419-8921</strong> (VoIP Poipet Trunk) • Mule Account: <strong style={{ color: '#f87171' }}>984-2-90184-1</strong>
                      </>
                    ) : (
                      <>
                        ตรวจพบเป้าหมายในสาย: <strong style={{ color: '#f87171' }}>+66 82-419-8921</strong> (VoIP Poipet Trunk) • บัญชีม้า: <strong style={{ color: '#f87171' }}>984-2-90184-1</strong>
                      </>
                    )}
                  </span>
                </div>

                {onNavigateToBlacklist && (
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{
                      height: 26,
                      fontSize: 11,
                      color: '#ef4444',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                    onClick={() => onNavigateToBlacklist('+66 82-419-8921')}
                    title={language === 'en' ? 'Check number against Blacklist & OSINT database' : 'เปิดตรวจสอบเบอร์นี้กับฐานข้อมูล Blacklist & OSINT ทันที'}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span>{language === 'en' ? 'Cross-Check Blacklist ›' : 'ตรวจกับ Blacklist ทันที ›'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
