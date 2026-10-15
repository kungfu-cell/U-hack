import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  HandoffState,
  RiskLevel,
  SessionEvent,
  Speaker,
  Utterance,
} from '@scamtrap/contracts';
import { createCase } from '../../lib/api';
import { AgentAudioPlayer } from './audio/agent-audio-player';
import { AudioProcessor } from './audio/audio-processor';
import { BrowserSpeechRecognizer } from './audio/browser-speech-recognizer';
import { WebRtcManager } from './audio/webrtc-manager';
import { ScammerConvAiClient, type ScammerConvAiStatus } from './audio/scammer-convai-client';
import { showToast } from '../../lib/toast';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const resolvedApiUrl = new URL(apiUrl, window.location.origin).toString().replace(/\/$/, '');
const wsBaseUrl = resolvedApiUrl.replace(/^http/, 'ws');

const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [
    { urls: import.meta.env.VITE_STUN_URL ?? 'stun:stun.l.google.com:19302' },
  ];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  const username = import.meta.env.VITE_TURN_USERNAME;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL;
  if (turnUrl && username && credential) {
    servers.push({ urls: turnUrl, username, credential });
  }
  return servers;
};

const toRiskLevel = (score: number): RiskLevel => {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
};

export const useLiveSession = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [participantRole, setParticipantRole] = useState<'owner' | 'caller'>('owner');
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [handoffState, setHandoffState] = useState<HandoffState>('human_active');
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [activePartials, setActivePartials] = useState<Record<Speaker, Utterance | null>>({
    user: null,
    caller: null,
    ai: null,
    system: null,
  });
  const [riskScore, setRiskScore] = useState<number>(0);
  const [riskReasons, setRiskReasons] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('idle');
  const [degradedMessage, setDegradedMessage] = useState<string | null>(null);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [spokenLanguage, setSpokenLanguageState] = useState<'th-TH' | 'en-US'>('th-TH');
  const spokenLanguageRef = useRef<'th-TH' | 'en-US'>('th-TH');
  const [isScammerCalling, setIsScammerCalling] = useState<boolean>(false);
  const [scammerStatus, setScammerStatus] = useState<ScammerConvAiStatus>('idle');
  const [activeScammerLang, setActiveScammerLang] = useState<'th' | 'en'>('th');

  const wsRef = useRef<WebSocket | null>(null);
  const webrtcRef = useRef<WebRtcManager | null>(null);
  const agentPlayerRef = useRef<AgentAudioPlayer | null>(null);
  const speechRecognizerRef = useRef<BrowserSpeechRecognizer | null>(null);
  const userAudioProcessorRef = useRef<AudioProcessor | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManuallyEndedRef = useRef<boolean>(false);
  const startingRef = useRef<boolean>(false);
  const participantRoleRef = useRef<'owner' | 'caller'>('owner');
  const clientSpeechFallbackRef = useRef<boolean>(false);
  const scammerClientRef = useRef<ScammerConvAiClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const sendClientMessage = useCallback((msg: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connectWebSocket = useCallback((
    targetSessionId: string,
    participantToken: string,
    localRole: 'owner' | 'caller',
  ) => {
    if (isManuallyEndedRef.current) return;

    setConnectionStatus('connecting');
    const ws = new WebSocket(
      `${wsBaseUrl}/sessions/${targetSessionId}/ws?token=${encodeURIComponent(participantToken)}`,
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      setDegradedMessage(null);
      // Request initial snapshot recovery
      ws.send(JSON.stringify({ type: 'session.sync', sessionId: targetSessionId }));
    };

    ws.onmessage = (event) => {
      try {
        const data: SessionEvent = JSON.parse(event.data);
        if (data.type === 'session.sync_response') {
          setHandoffState(data.snapshot.state);
          setUtterances(data.snapshot.utterances);
          if (data.snapshot.latestRisk) {
            setRiskScore(data.snapshot.latestRisk.score);
            setRiskReasons(data.snapshot.latestRisk.reasons);
          }
        } else if (data.type === 'session.state_changed') {
          setHandoffState(data.state);
          if (data.state === 'ai_active' && localRole === 'owner') {
            speechRecognizerRef.current?.stop();
            if (!agentPlayerRef.current) {
              agentPlayerRef.current = new AgentAudioPlayer();
            }
            if (webrtcRef.current && agentPlayerRef.current) {
              void webrtcRef.current.switchToAiTrack(agentPlayerRef.current.getAudioTrack());
            }
          } else if (
            localRole === 'owner' &&
            (data.state === 'human_active' || data.state === 'waiting_for_user')
          ) {
            agentPlayerRef.current?.stopAndFlush();
            if (webrtcRef.current) {
              void webrtcRef.current.switchToHumanMic();
            }
            speechRecognizerRef.current?.start();
          } else if (data.state === 'paused_safe' && localRole === 'owner') {
            agentPlayerRef.current?.stopAndFlush();
            webrtcRef.current?.setLocalMicMuted(true);
          }
        } else if (data.type === 'agent.audio_chunk') {
          if (!agentPlayerRef.current) {
            agentPlayerRef.current = new AgentAudioPlayer();
          }
          void agentPlayerRef.current.enqueueAudioChunk(data.audioBase64, data.sampleRate);
          if (webrtcRef.current && agentPlayerRef.current) {
            void webrtcRef.current.switchToAiTrack(agentPlayerRef.current.getAudioTrack());
          }
        } else if (data.type === 'agent.interrupted') {
          agentPlayerRef.current?.stopAndFlush();
        } else if (data.type === 'transcript.partial') {
          setActivePartials((prev) => ({
            ...prev,
            [data.utterance.speaker]: data.utterance,
          }));
        } else if (data.type === 'transcript.committed') {
          setUtterances((prev) => [...prev, data.utterance]);
          setActivePartials((prev) => ({
            ...prev,
            [data.utterance.speaker]: null,
          }));
        } else if (data.type === 'risk.updated') {
          setRiskScore(data.score);
          setRiskReasons(data.reasons);
        } else if (data.type === 'service.degraded') {
          setDegradedMessage(`${data.service}: ${data.message}`);
          if (data.service.includes('scribe')) clientSpeechFallbackRef.current = true;
        } else if (data.type === 'peer.joined' && localRole === 'owner' && data.role === 'caller') {
          void webrtcRef.current?.createOffer().then((sdp) => {
            sendClientMessage({ type: 'signal.offer', sessionId: targetSessionId, sdp });
          }).catch((error: unknown) => {
            setDegradedMessage(error instanceof Error ? error.message : 'สร้าง WebRTC offer ไม่สำเร็จ');
          });
        } else if (data.type === 'signal.offer' && localRole === 'caller') {
          void webrtcRef.current?.acceptOffer(data.sdp).then((sdp) => {
            sendClientMessage({ type: 'signal.answer', sessionId: targetSessionId, sdp });
          }).catch((error: unknown) => {
            setDegradedMessage(error instanceof Error ? error.message : 'รับ WebRTC offer ไม่สำเร็จ');
          });
        } else if (data.type === 'signal.answer' && localRole === 'owner') {
          void webrtcRef.current?.acceptAnswer(data.sdp).catch((error: unknown) => {
            setDegradedMessage(error instanceof Error ? error.message : 'รับ WebRTC answer ไม่สำเร็จ');
          });
        } else if (data.type === 'signal.ice') {
          const candidate: RTCIceCandidateInit = {
            candidate: data.candidate.candidate,
            ...(data.candidate.sdpMid !== undefined ? { sdpMid: data.candidate.sdpMid } : {}),
            ...(data.candidate.sdpMLineIndex !== undefined
              ? { sdpMLineIndex: data.candidate.sdpMLineIndex }
              : {}),
            ...(data.candidate.usernameFragment !== undefined
              ? { usernameFragment: data.candidate.usernameFragment }
              : {}),
          };
          void webrtcRef.current?.addIceCandidate(candidate).catch(() => undefined);
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      // triggers onclose
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (!isManuallyEndedRef.current) {
        setConnectionStatus('reconnecting');
        // Backoff reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket(targetSessionId, participantToken, localRole);
        }, 2000);
      } else {
        setConnectionStatus('disconnected');
      }
    };
  }, [sendClientMessage]);

  const startCall = useCallback(async () => {
    if (startingRef.current || sessionId) return;
    startingRef.current = true;
    isManuallyEndedRef.current = false;
    setConnectionStatus('connecting');
    try {
      const query = new URLSearchParams(window.location.search);
      const invitedSessionId = query.get('session');
      const invitedJoinCode = query.get('code');
      let targetSessionId: string;
      let targetCaseId: string;
      let participantToken: string;
      let localRole: 'owner' | 'caller';

      if (invitedSessionId && invitedJoinCode) {
        const joinResponse = await fetch(`${apiUrl}/sessions/${invitedSessionId}/join`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ joinCode: invitedJoinCode }),
        });
        if (!joinResponse.ok) throw new Error('ลิงก์เชิญไม่ถูกต้องหรือหมดอายุแล้ว');
        const joined = await joinResponse.json() as {
          sessionId: string;
          caseId: string;
          state: HandoffState;
          participantToken: string;
        };
        targetSessionId = joined.sessionId;
        targetCaseId = joined.caseId;
        participantToken = joined.participantToken;
        localRole = 'caller';
        setHandoffState(joined.state);
      } else {
        const caseRecord = await createCase();
        const sessionResponse = await fetch(`${apiUrl}/sessions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
          body: JSON.stringify({ caseId: caseRecord.id }),
        });
        if (!sessionResponse.ok) throw new Error('สร้างห้องสนทนาไม่สำเร็จ');
        const session = await sessionResponse.json() as {
          id: string;
          caseId: string;
          state: HandoffState;
          joinCode: string;
          ownerToken: string;
        };
        targetSessionId = session.id;
        targetCaseId = session.caseId;
        participantToken = session.ownerToken;
        localRole = 'owner';
        setJoinCode(session.joinCode);
        const nextInviteUrl = new URL(window.location.href);
        nextInviteUrl.search = '';
        nextInviteUrl.searchParams.set('session', session.id);
        nextInviteUrl.searchParams.set('code', session.joinCode);
        setInviteUrl(nextInviteUrl.toString());
        setHandoffState(session.state);
      }

      participantRoleRef.current = localRole;
      setParticipantRole(localRole);
      setSessionId(targetSessionId);
      sessionIdRef.current = targetSessionId;
      setCaseId(targetCaseId);
      window.localStorage.setItem('scamtrap:lastCaseId', targetCaseId);
      window.localStorage.setItem('scamtrap:lastSessionId', targetSessionId);

      // Initialize WebRTC and the local microphone before signaling starts.
      const webrtc = new WebRtcManager(getIceServers());
      webrtcRef.current = webrtc;
      const localStream = await webrtc.startLocalMic();
      setIsMicActive(true);
      webrtc.initPeerConnection();
      webrtc.setOnIceCandidate((candidate) => {
        sendClientMessage({
          type: 'signal.ice',
          sessionId: targetSessionId,
          candidate,
        });
      });

      // Each participant sends only their own microphone to Scribe.
      const localSpeaker: 'user' | 'caller' = localRole === 'owner' ? 'user' : 'caller';
      const localProcessor = new AudioProcessor(
        localStream,
        (audioBase64) => {
          sendClientMessage({
            type: 'audio.chunk',
            sessionId: targetSessionId,
            speaker: localSpeaker,
            audioBase64,
            sampleRate: 16000,
            timestampMs: Date.now(),
          });
          if (scammerClientRef.current) {
            scammerClientRef.current.sendUserAudioChunk(audioBase64);
          }
        },
        (rms) => {
          setMicLevel(rms);
        },
      );
      localProcessor.start();
      userAudioProcessorRef.current = localProcessor;

      // Browser recognition provides immediate, reliable real-time transcript for the local speaker
      const recognizer = new BrowserSpeechRecognizer((text, isFinal) => {
        // Send to backend so server-side pipeline and subscribers receive it
        sendClientMessage({
          type: 'transcript.client_speech',
          sessionId: targetSessionId,
          speaker: localSpeaker,
          text,
          isFinal,
        });

        // Optimistically update transcript in local UI
        if (!isFinal) {
          setActivePartials((prev) => ({
            ...prev,
            [localSpeaker]: {
              id: `local-partial-${localSpeaker}`,
              sessionId: targetSessionId,
              speaker: localSpeaker,
              text,
              transcriptState: 'partial',
              startedAtMs: Date.now(),
              endedAtMs: Date.now(),
              createdAt: new Date().toISOString(),
            },
          }));
        } else {
          // Commit finalized speech segment into the permanent transcript feed
          const committedUtterance: Utterance = {
            id: `local-commit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sessionId: targetSessionId,
            speaker: localSpeaker,
            text,
            transcriptState: 'committed',
            startedAtMs: Date.now() - 1500,
            endedAtMs: Date.now(),
            createdAt: new Date().toISOString(),
          };
          setUtterances((prev) => {
            // Avoid duplicate text if backend already broadcasted it
            if (prev.some((u) => u.speaker === localSpeaker && u.text.trim() === text.trim() && Math.abs(u.endedAtMs - committedUtterance.endedAtMs) < 3000)) {
              return prev;
            }
            return [...prev, committedUtterance];
          });
          setActivePartials((prev) => ({
            ...prev,
            [localSpeaker]: null,
          }));
        }
      }, spokenLanguageRef.current);
      recognizer.start();
      speechRecognizerRef.current = recognizer;

      connectWebSocket(targetSessionId, participantToken, localRole);
    } catch (err) {
      setDegradedMessage(err instanceof Error ? err.message : 'ไม่สามารถเริ่มการเชื่อมต่อได้');
      setConnectionStatus('disconnected');
      startingRef.current = false;
    }
  }, [connectWebSocket, sendClientMessage, sessionId]);

  const endCall = async () => {
    isManuallyEndedRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (sessionId && participantRoleRef.current === 'owner') {
      try {
        await fetch(`${apiUrl}/sessions/${sessionId}/end`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
        });
      } catch {
        // ignore
      }
    }

    speechRecognizerRef.current?.stop();
    speechRecognizerRef.current = null;
    userAudioProcessorRef.current?.stop();
    agentPlayerRef.current?.close();
    agentPlayerRef.current = null;
    webrtcRef.current?.stop();
    wsRef.current?.close();

    scammerClientRef.current?.disconnect();
    scammerClientRef.current = null;
    setIsScammerCalling(false);
    setScammerStatus('idle');
    sessionIdRef.current = null;

    setIsMicActive(false);
    setMicLevel(0);
    setConnectionStatus('disconnected');
    setHandoffState('ended');
    setSessionId(null);
    setCaseId(null);
    setJoinCode(null);
    setInviteUrl(null);
    startingRef.current = false;
  };

  const requestHandoff = async () => {
    if (!sessionId || participantRoleRef.current !== 'owner') return;
    try {
      const res = await fetch(`${apiUrl}/sessions/${sessionId}/handoff`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
      });
      if (!res.ok) throw new Error('AI ยังไม่พร้อมรับช่วงในสถานะปัจจุบัน');
      const updated = await res.json();
      setHandoffState(updated.state);
    } catch (error) {
      setDegradedMessage(error instanceof Error ? error.message : 'ขอให้ AI รับช่วงไม่สำเร็จ');
    }
  };

  const resumeHuman = async () => {
    if (!sessionId || participantRoleRef.current !== 'owner') return;
    try {
      const res = await fetch(`${apiUrl}/sessions/${sessionId}/resume-human`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
      });
      if (!res.ok) throw new Error('ยังไม่สามารถคืนสายให้ผู้ใช้ได้');
      const updated = await res.json();
      setHandoffState(updated.state);
      agentPlayerRef.current?.stopAndFlush();
      await webrtcRef.current?.switchToHumanMic();
      speechRecognizerRef.current?.start();
    } catch (error) {
      setDegradedMessage(error instanceof Error ? error.message : 'คืนสายให้ผู้ใช้ไม่สำเร็จ');
    }
  };

  const simulateSpeech = async (speaker: 'user' | 'caller', text: string) => {
    const targetSessionId = sessionIdRef.current ?? sessionId;
    if (!targetSessionId) return;
    try {
      await fetch(`${apiUrl}/sessions/${targetSessionId}/simulate-speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
        body: JSON.stringify({ speaker, text }),
      });
    } catch {
      // ignore
    }
  };

  const startScammerCall = useCallback(async (langOverride?: 'th' | 'en') => {
    let targetId = sessionIdRef.current ?? sessionId;
    if (!targetId) {
      await startCall();
      targetId = sessionIdRef.current;
    }
    if (!targetId) return;

    const chosenLang: 'th' | 'en' =
      langOverride ?? (spokenLanguageRef.current?.startsWith('en') ? 'en' : 'th');
    setActiveScammerLang(chosenLang);

    try {
      setScammerStatus('connecting');
      setIsScammerCalling(true);
      const res = await fetch(
        `${resolvedApiUrl}/sessions/${targetId}/scammer-signed-url?lang=${chosenLang}`,
        {
          headers: { 'x-user-id': 'demo-user' },
        },
      );
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(errJson?.error?.message ?? 'Failed to get ElevenLabs signed URL');
      }
      const data = (await res.json()) as { signedUrl: string; lang?: string };
      const client = new ScammerConvAiClient(
        data.signedUrl,
        {
          onStatusChange: (status, err) => {
            setScammerStatus(status);
            if (status === 'connected') {
              showToast(
                chosenLang === 'en'
                  ? '✅ Connected to English Scammer AI (Fraud Taskforce)'
                  : '✅ เชื่อมต่อสายมิจฉาชีพ AI สำเร็จ (ตำรวจไซเบอร์)',
              );
            } else if (status === 'speaking') {
              showToast(
                chosenLang === 'en'
                  ? '🗣️ English Scammer AI is speaking...'
                  : '🗣️ ตำรวจไซเบอร์ AI กำลังพูด...',
              );
            } else if (status === 'closed' || status === 'error') {
              setIsScammerCalling(false);
              if (err) {
                setDegradedMessage(err);
                showToast('⚠️ ' + err);
              }
            }
          },
          onAgentResponse: (text) => {
            void simulateSpeech('caller', text);
          },
          onUserTranscript: (text) => {
            void simulateSpeech('user', text);
          },
        },
        { language: chosenLang },
      );
      scammerClientRef.current = client;
      client.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cannot start scammer simulation';
      setIsScammerCalling(false);
      setScammerStatus('error');
      setDegradedMessage(msg);
      showToast('⚠️ ' + msg);
    }
  }, [sessionId, startCall, simulateSpeech]);

  const stopScammerCall = useCallback(() => {
    scammerClientRef.current?.disconnect();
    scammerClientRef.current = null;
    setIsScammerCalling(false);
    setScammerStatus('idle');
  }, []);

  useEffect(() => {
    return () => {
      isManuallyEndedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      scammerClientRef.current?.disconnect();
      scammerClientRef.current = null;
      speechRecognizerRef.current?.stop();
      speechRecognizerRef.current = null;
      userAudioProcessorRef.current?.stop();
      agentPlayerRef.current?.close();
      agentPlayerRef.current = null;
      webrtcRef.current?.stop();
      wsRef.current?.close();
    };
  }, []);

  const setSpokenLanguage = useCallback((lang: 'th-TH' | 'en-US') => {
    spokenLanguageRef.current = lang;
    setSpokenLanguageState(lang);
    if (speechRecognizerRef.current) {
      speechRecognizerRef.current.stop();
      if (sessionId) {
        const targetSessionId = sessionId;
        const localSpeaker: 'user' | 'caller' =
          participantRoleRef.current === 'owner' ? 'user' : 'caller';
        const recognizer = new BrowserSpeechRecognizer((text, isFinal) => {
          sendClientMessage({
            type: 'transcript.client_speech',
            sessionId: targetSessionId,
            speaker: localSpeaker,
            text,
            isFinal,
          });

          if (!isFinal) {
            setActivePartials((prev) => ({
              ...prev,
              [localSpeaker]: {
                id: `local-partial-${localSpeaker}`,
                sessionId: targetSessionId,
                speaker: localSpeaker,
                text,
                transcriptState: 'partial',
                startedAtMs: Date.now(),
                endedAtMs: Date.now(),
                createdAt: new Date().toISOString(),
              },
            }));
          } else {
            const committedUtterance: Utterance = {
              id: `local-commit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              sessionId: targetSessionId,
              speaker: localSpeaker,
              text,
              transcriptState: 'committed',
              startedAtMs: Date.now() - 1500,
              endedAtMs: Date.now(),
              createdAt: new Date().toISOString(),
            };
            setUtterances((prev) => {
              if (prev.some((u) => u.speaker === localSpeaker && u.text.trim() === text.trim() && Math.abs(u.endedAtMs - committedUtterance.endedAtMs) < 3000)) {
                return prev;
              }
              return [...prev, committedUtterance];
            });
            setActivePartials((prev) => ({
              ...prev,
              [localSpeaker]: null,
            }));
          }
        }, lang);
        recognizer.start();
        speechRecognizerRef.current = recognizer;
      }
    }
  }, [sessionId, sendClientMessage]);

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      webrtcRef.current?.setLocalMicMuted(next);
      return next;
    });
  };

  return {
    sessionId,
    caseId,
    participantRole,
    joinCode,
    inviteUrl,
    handoffState,
    utterances,
    activePartials,
    riskScore,
    riskLevel: toRiskLevel(riskScore),
    riskReasons,
    connectionStatus,
    degradedMessage,
    isMicActive,
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
  };
};
