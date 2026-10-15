import { useState, useEffect, useRef } from 'react';
import { useLiveSession } from './useLiveSession';
import { AgentAudioPlayer } from './audio/agent-audio-player';
import { showToast } from '../../lib/toast';

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

export const LiveSessionView = () => {
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
  const previewPlayerRef = useRef<AgentAudioPlayer | null>(null);
  const callerAudioPlayerRef = useRef<AgentAudioPlayer | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

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
    isPlayingPreview ||
    (isAiActive && (
      (activePartials.ai && activePartials.ai.text.trim().length > 0) ||
      (!isCallerActive && !isUserActive)
    )),
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

  const handlePreviewVoice = async (lang: 'th' | 'en' = 'th') => {
    if (isPlayingPreview) return;
    setIsPlayingPreview(true);
    const previewText =
      lang === 'en'
        ? 'Hello, I am taking over this call. Please state your full badge number and precinct so I can verify with the department.'
        : 'สวัสดีค่ะ ดิฉันรับสายแทนนะคะ ขอรบกวนทวนชื่อและยศเจ้าหน้าที่อีกครั้งได้ไหมคะ กำลังจดบันทึกไว้ค่ะ';

    showToast(`กำลังสังเคราะห์เสียง ElevenLabs Multilingual V2 (${lang === 'en' ? 'English' : 'ไทย'})...`);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/sessions/speak-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'demo-user' },
        body: JSON.stringify({
          text: previewText,
          directText: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          if (!previewPlayerRef.current) {
            previewPlayerRef.current = new AgentAudioPlayer();
          }
          await previewPlayerRef.current.enqueueAudioChunk(data.audioBase64, 16000);
          showToast(`กำลังเล่นเสียง AI Agent จาก ElevenLabs (${lang === 'en' ? 'EN' : 'TH'}) 🔊`);
        } else {
          showToast('ไม่พบข้อมูลเสียง (Fallback Mode)');
        }
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการเรียก ElevenLabs Voice');
    } finally {
      setTimeout(() => setIsPlayingPreview(false), 3000);
    }
  };

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
      await resumeHuman();
      showToast('ส่งคำขอคืนสายให้ผู้ใช้แล้ว');
    } else {
      await requestHandoff();
      showToast('กำลังเตรียม AI Decoy รับช่วงสายล่อ');
    }
  };

  const handleAcceptCall = async () => {
    ringtoneRef.current.stop();
    setCallStatus('connected');
    setCallEndedLocally(false);
    setCallDurationSec(0);
    if (!sessionId) {
      void startCall();
    }
    showToast(
      spokenLanguage === 'en-US'
        ? '📞 Call Connected! English Scammer AI (Fraud Taskforce) is connecting...'
        : '📞 รับสายแล้ว! มิจฉาชีพ AI (ตำรวจไซเบอร์) กำลังเชื่อมต่อสายตรง...',
    );

    // Directly engage ElevenLabs Scammer ConvAI (friend's model)
    const targetLang: 'th' | 'en' = spokenLanguage === 'en-US' ? 'en' : 'th';
    setTimeout(async () => {
      await startScammerCall(targetLang);
    }, 300);
  };

  const handleDeclineCall = async () => {
    ringtoneRef.current.stop();
    setCallStatus('ended');
    setCallEndedLocally(true);
    stopScammerCall();
    await endCall();
    showToast('❌ ปฏิเสธสายมิจฉาชีพแล้ว • ป้องกันความเสี่ยงสำเร็จ');
  };

  const handleRestartIncomingCall = () => {
    stopScammerCall();
    setCallEndedLocally(false);
    setCallDurationSec(0);
    setCallStatus('incoming');
    showToast('📲 จำลองสายมิจฉาชีพโทรเข้ามาใหม่ (เสียงกระดิ่งกำลังดัง)...');
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

    showToast(`กำลังสังเคราะห์เสียงมิจฉาชีพ AI (${lang === 'en' ? 'George (EN)' : 'George (TH)'})... 🚨`);

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
          showToast(`🔊 เสียงมิจฉาชีพ AI กำลังพูดออกลำโพง (${lang === 'en' ? 'EN' : 'TH'}) 🚨`);
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
        showToast(`🔊 เสียงมิจฉาชีพ AI ออกลำโพง (Web Speech): ${lang === 'en' ? 'EN' : 'TH'}`);
      }
    } catch {
      // ignore
    }
  };

  const handleSimulate = async (type: 'police' | 'otp' | 'user' | 'en_police' | 'en_otp' | 'en_user') => {
    if (type === 'police') {
      const text =
        'ผมร้อยตำรวจเอก สมชาย จากสถานีตำรวจภูธรเมือง ตรวจพบว่าคุณเกี่ยวข้องกับคดีฟอกเงิน ให้รีบโอนเงินมาตรวจสอบทันทีและห้ามบอกใคร';
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
      const text = 'ทางธนาคารส่ง SMS รหัส OTP 6 หลักไปให้แล้ว รบกวนแจ้งรหัสเพื่อยืนยันสิทธิ์เดี๋ยวนี้';
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
      const text = 'ขอโทษนะครับ ผมไม่สะดวกโอนเงิน และขอโทรกลับไปตรวจสอบที่สถานีตำรวจโดยตรงครับ';
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
                  ? '📲 Incoming Call (สายเรียกเข้าจากมิจฉาชีพ)...'
                  : callEndedLocally
                    ? 'Call Terminated (สายถูกตัดแล้ว)'
                    : participantRole === 'owner'
                      ? 'Live Scam Shield · เจ้าของห้อง'
                      : 'Live Scam Shield · ผู้ร่วมทดสอบ'}
              </span>
              <span
                className={`badge-sev ${
                  callStatus === 'incoming'
                    ? 'badge-warning'
                    : callEndedLocally || riskScore < 55
                      ? 'badge-safe'
                      : 'badge-critical'
                }`}
              >
                {callStatus === 'incoming'
                  ? 'Ringing 🚨'
                  : callEndedLocally
                    ? 'Session Closed'
                    : riskScore >= 55
                      ? `Risk ${riskScore}%`
                      : 'Monitoring'}
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
              title="กดรับสายทันทีเพื่อฟังมิจฉาชีพ AI ข่มขู่"
              style={{ background: '#22c55e', borderColor: '#16a34a', color: '#ffffff', fontWeight: 600 }}
            >
              📞 กดรับสาย (AI มิจฉาชีพจะเริ่มพูด)
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
              title="จำลองสายมิจฉาชีพโทรเข้ามาใหม่"
            >
              📲 จำลองสายมิจฉาชีพโทรเข้าใหม่
            </button>
          )}
        </div>
      </div>

      {degradedMessage && (
        <div className="warning-banner" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--amber)', padding: '10px 14px', borderRadius: 6, marginBottom: 16 }}>
          <strong style={{ color: 'var(--amber)' }}>⚠️ แจ้งเตือนระบบเสียง: </strong>
          <span style={{ color: 'var(--fg-secondary)', fontSize: 12 }}>{degradedMessage}</span>
        </div>
      )}

      {participantRole === 'owner' && inviteUrl && !callEndedLocally && (
        <div className="warning-banner" style={{ marginBottom: 16 }}>
          <strong>ลิงก์เชิญผู้ร่วมทดสอบ · รหัส {joinCode}</strong>
          <p style={{ overflowWrap: 'anywhere' }}>{inviteUrl}</p>
          <button
            type="button"
            className="btn-action btn-action-ghost"
            onClick={() => {
              void navigator.clipboard.writeText(inviteUrl);
              showToast('คัดลอกลิงก์เชิญแล้ว');
            }}
          >
            คัดลอกลิงก์เชิญ
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
                    <div className="ios-incoming-tag">🚨 เบอร์ต้องสงสัย · กองปราบปรามปลอม</div>
                    <div className="ios-incoming-warning">
                      ScamTrap Live Shield ตรวจจับพฤติกรรมเสี่ยงสูง
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
                    <div className="ios-ringing-label">🔔 เสียงกระดิ่งกำลังดัง...</div>
                  </div>

                  {/* Action Buttons: Decline vs Accept */}
                  <div>
                    <div className="ios-incoming-actions">
                      <button
                        type="button"
                        className="ios-incoming-btn"
                        onClick={handleDeclineCall}
                        title="ปฏิเสธสาย"
                      >
                        <div className="ios-action-circle bg-red-decline">
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </div>
                        <span>ปฏิเสธสาย</span>
                      </button>

                      <button
                        type="button"
                        className="ios-incoming-btn"
                        onClick={handleAcceptCall}
                        title="กดรับสายทันทีเพื่อฟังมิจฉาชีพ AI พูดข่มขู่"
                      >
                        <div className="ios-action-circle bg-green-accept pulse-green-glow">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </div>
                        <span>รับสาย (AI พูดข่มขู่)</span>
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
                        ? 'สายถูกตัดแล้ว'
                        : isScammerCalling
                          ? (activeScammerLang === 'en' ? '08-2419-8921 (Fraud Taskforce AI)' : '08-2419-8921 (ตำรวจไซเบอร์ AI)')
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
                          ? 'เจ้าของห้องเป็นผู้ควบคุม AI'
                          : isAiActive
                            ? 'AI กำลังคุยแทน... (แตะเพื่อคุยเอง)'
                            : handoffState === 'preparing_ai'
                              ? 'กำลังเตรียม AI...'
                              : '🤖 ให้ AI รับช่วงสาย (Handoff)'}
                      </span>
                    </button>
                  </div>

                  {/* Bottom Section: 2x3 iOS Call Grid */}
                  <div>
                    <div className="ios-call-grid">
                      {/* 1: Speaker */}
                      <button type="button" className="ios-grid-btn" onClick={handleToggleSpeaker} title="เสียง">
                        <div className={`ios-btn-circle ${isSpeaker ? 'active-white' : ''}`}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                          </svg>
                        </div>
                        <span className="ios-btn-label">เสียง</span>
                      </button>

                      {/* 2: FaceTime */}
                      <button
                        type="button"
                        className="ios-grid-btn"
                        onClick={() => showToast('FaceTime ไม่พร้อมใช้งานขณะโทรเสียง')}
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
                      <button type="button" className="ios-grid-btn" onClick={handleToggleMic} title="ปิดเสียง">
                        <div className={`ios-btn-circle ${isMuted ? 'active-white' : ''}`}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="1" y1="1" x2="23" y2="23" />
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                        </div>
                        <span className="ios-btn-label">{isMuted ? 'เปิดเสียง' : 'ปิดเสียง'}</span>
                      </button>

                      {/* 4: More */}
                      <button type="button" className="ios-grid-btn" onClick={() => showToast('ตัวเลือกเพิ่มเติม')} title="เพิ่มเติม">
                        <div className="ios-btn-circle">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="5" cy="12" r="2.2" />
                            <circle cx="12" cy="12" r="2.2" />
                            <circle cx="19" cy="12" r="2.2" />
                          </svg>
                        </div>
                        <span className="ios-btn-label">เพิ่มเติม</span>
                      </button>

                      {/* 5: Hangup */}
                      <button
                        type="button"
                        className="ios-grid-btn"
                        onClick={handleEndCall}
                        disabled={callEndedLocally}
                        title="วางสาย"
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
                        <span className="ios-btn-label">วางสาย</span>
                      </button>

                      {/* 6: Keypad */}
                      <button
                        type="button"
                        className="ios-grid-btn"
                        onClick={() => showToast('เปิดแป้นตัวเลข')}
                        title="แป้นตัวเลข"
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
                        <span className="ios-btn-label">แป้นตัวเลข</span>
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
                      🔊 Speaker: {isCallerActive ? 'Playing Voice' : 'Active'}
                    </span>
                  </div>
                  {isCallerActive ? (
                    <span style={{ color: '#f43f5e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="pulse-dot-red" style={{ width: 6, height: 6 }} />
                      Active Speech (เสียงมิจฉาชีพออนไลน์)
                    </span>
                  ) : (
                    <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>
                      Listening (รอฟังสาย)
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
                    <span style={{ color: '#ff6b6b', fontWeight: 600 }}>🔇 Muted (ปิดเสียงไมค์)</span>
                  ) : isAiSpeaking ? (
                    <span style={{ color: '#60a5fa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="pulse-dot-green" style={{ width: 6, height: 6, background: '#60a5fa' }} />
                      AI Agent Speaking (ElevenLabs 16kHz)
                    </span>
                  ) : isUserActive ? (
                    <span style={{ color: 'var(--emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="pulse-dot-green" style={{ width: 6, height: 6 }} />
                      🎙️ Active Speech (กำลังพูด...)
                    </span>
                  ) : (
                    <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>
                      Listening (พร้อมตรวจจับเสียง)
                    </span>
                  )}
                </div>
                <div className="waveform-bars">
                  {userWaveBars.map((h, i) => (
                    <div key={i} className="wave-line" style={{ height: `${h}px` }} />
                  ))}
                </div>
              </div>

              {/* AI Takeover Command Box */}
              <div className="takeover-panel">
                <div>
                  <div className="takeover-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span>ElevenLabs AI Counter-Agent Handoff</span>
                  </div>
                  <div className="takeover-desc">
                    โอนสายให้ ScamTrap AI Agent คุยแทนเพื่อถ่วงเวลามิจฉาชีพ ปกป้องประชาชน และสกัดข้อมูลบัญชีม้า
                  </div>
                  <div style={{ fontSize: 10.5, color: '#60a5fa', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="pulse-dot-green" style={{ width: 6, height: 6 }} />
                    <span>ElevenLabs Multilingual V2 (Voice: Eric • 16kHz PCM Stream)</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    onClick={() => handlePreviewVoice('th')}
                    disabled={isPlayingPreview}
                    style={{
                      height: 34,
                      fontSize: 11.5,
                      borderColor: 'rgba(96, 165, 250, 0.4)',
                      color: isPlayingPreview ? 'var(--emerald)' : 'var(--fg)',
                    }}
                    title="ทดสอบฟังเสียง Agent ภาษาไทยที่สังเคราะห์ผ่าน ElevenLabs"
                  >
                    <span>{isPlayingPreview ? '🔊 กำลังเล่น...' : '🔊 เสียงไทย (TH)'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    onClick={() => handlePreviewVoice('en')}
                    disabled={isPlayingPreview}
                    style={{
                      height: 34,
                      fontSize: 11.5,
                      borderColor: 'rgba(96, 165, 250, 0.4)',
                      color: isPlayingPreview ? 'var(--emerald)' : 'var(--fg)',
                    }}
                    title="Test ElevenLabs English Decoy Agent Voice"
                  >
                    <span>{isPlayingPreview ? '🔊 Playing...' : '🔊 English (EN)'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-primary"
                    onClick={handleToggleTakeover}
                    disabled={callEndedLocally}
                    style={{
                      height: 34,
                      padding: '0 14px',
                      background: isAiActive ? 'var(--crimson-dark)' : 'var(--emerald-dark)',
                      borderColor: isAiActive ? 'var(--crimson)' : 'var(--emerald)',
                    }}
                  >
                    <span>{isAiActive ? 'Stop AI & Resume Self' : 'Engage AI Takeover'}</span>
                  </button>
                </div>
              </div>

              {/* Language Selection & Hackathon Demo Simulation Triggers */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>
                    🗣️ ภาษาที่รองรับ (Spoken Language):
                  </span>
                  <button
                    type="button"
                    className={`btn-action ${spokenLanguage === 'th-TH' ? 'btn-action-primary' : 'btn-action-ghost'}`}
                    style={{ fontSize: 11, height: 24, padding: '0 10px' }}
                    onClick={() => {
                      setSpokenLanguage('th-TH');
                      showToast('สลับไมโครโฟนเป็นภาษาไทย (th-TH)');
                    }}
                  >
                    🇹🇭 ภาษาไทย
                  </button>
                  <button
                    type="button"
                    className={`btn-action ${spokenLanguage === 'en-US' ? 'btn-action-primary' : 'btn-action-ghost'}`}
                    style={{ fontSize: 11, height: 24, padding: '0 10px' }}
                    onClick={() => {
                      setSpokenLanguage('en-US');
                      showToast('Switched microphone to English (en-US)');
                    }}
                  >
                    🇬🇧 English
                  </button>
                </div>



                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)', width: '100%' }}>
                    🇹🇭 จำลองบทสนทนาไทย:
                  </span>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26 }}
                    onClick={() => handleSimulate('police')}
                  >
                    🚨 ขู่คดีฟอกเงิน
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26 }}
                    onClick={() => handleSimulate('otp')}
                  >
                    🔑 หลอกขอ OTP
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26 }}
                    onClick={() => handleSimulate('user')}
                  >
                    💬 ผู้ใช้ปฏิเสธ
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)', width: '100%' }}>
                    🇬🇧 English Scam Scenarios:
                  </span>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26 }}
                    onClick={() => handleSimulate('en_police')}
                  >
                    🚨 Taskforce Wire Scam
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26 }}
                    onClick={() => handleSimulate('en_otp')}
                  >
                    🔑 Phish OTP Passcode
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-ghost"
                    style={{ fontSize: 11, height: 26 }}
                    onClick={() => handleSimulate('en_user')}
                  >
                    💬 Citizen Refusal
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
                          🔊 ฟังเสียงซ้ำ
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
                            🚨 CALLER (มิจฉาชีพ)
                          </span>
                        ) : u.speaker === 'user' ? (
                          <span style={{ color: 'var(--emerald)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            🛡️ USER (คุณ)
                          </span>
                        ) : (
                          <span style={{ color: '#60a5fa', fontWeight: 700 }}>
                            🤖 SCAMTRAP AI DECOY
                          </span>
                        )}
                        <span style={{ color: 'var(--fg-muted)', fontWeight: 400, fontSize: 10 }}>
                          ({new Date(u.startedAtMs).toLocaleTimeString()})
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
                          🔊 ฟังเสียงซ้ำ
                        </button>
                      )}
                    </div>
                    {u.text}
                  </div>
                ))}

                {/* Interim partial typing indicator */}
                {activePartials.caller && activePartials.caller.text.trim() && (
                  <div className="chat-bubble bubble-inbound" style={{ borderStyle: 'dashed', opacity: 0.85 }}>
                    <div className="bubble-meta">CALLER (กำลังพูด...)</div>
                    <em>{activePartials.caller.text}</em>
                  </div>
                )}
                {activePartials.user && activePartials.user.text.trim() && (
                  <div className="chat-bubble bubble-citizen" style={{ borderStyle: 'dashed', opacity: 0.85 }}>
                    <div className="bubble-meta">USER (กำลังพูด...)</div>
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
                    : 'ยังไม่พบคำเตือนจากบทสนทนารอบนี้'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
