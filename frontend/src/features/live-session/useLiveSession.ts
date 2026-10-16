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

const getInitialSpokenLanguage = (): 'th-TH' | 'en-US' =>
  window.localStorage.getItem('scamtrap:spokenLanguage') === 'en-US' ? 'en-US' : 'th-TH';

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

interface QueuedDecoyAudio {
  audioBase64: string;
  sampleRate: number;
  decoyText?: string;
  playbackVersion: number;
}

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
  const [spokenLanguage, setSpokenLanguageState] = useState<'th-TH' | 'en-US'>(getInitialSpokenLanguage);
  const spokenLanguageRef = useRef<'th-TH' | 'en-US'>(getInitialSpokenLanguage());
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
  const scammerConnectingRef = useRef<boolean>(false);
  const scammerAttemptRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(null);
  const handoffStateRef = useRef<HandoffState>('human_active');
  const pendingDecoyTurnsRef = useRef<string[]>([]);
  const pendingDecoyAudioRef = useRef<QueuedDecoyAudio[]>([]);
  const decoyPlaybackVersionRef = useRef<number>(0);
  const scammerTurnInProgressRef = useRef<boolean>(false);
  const scammerTurnSafetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flushPendingDecoyAudioRef = useRef<() => void>(() => undefined);
  const lastScammerSpokenTimeRef = useRef<number>(0);
  const lastScammerTextRef = useRef<string>('');
  const scammerPhrasesHistoryRef = useRef<string[]>([]);

  const sendClientMessage = useCallback((msg: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const playDecoyAudio = useCallback((audio: QueuedDecoyAudio) => {
    if (!agentPlayerRef.current) {
      agentPlayerRef.current = new AgentAudioPlayer();
    }
    const player = agentPlayerRef.current;
    void player
      .enqueueAudioChunk(audio.audioBase64, audio.sampleRate)
      .then(() => {
        if (
          audio.decoyText &&
          handoffStateRef.current === 'ai_active' &&
          audio.playbackVersion === decoyPlaybackVersionRef.current
        ) {
          scammerClientRef.current?.sendSyntheticUserMessage(audio.decoyText);
        }
      });
    if (webrtcRef.current) {
      void webrtcRef.current.switchToAiTrack(player.getAudioTrack());
    }
  }, []);

  const flushPendingDecoyAudio = useCallback(() => {
    if (
      scammerTurnInProgressRef.current ||
      (scammerClientRef.current?.isSpeaking() ?? false)
    ) {
      return;
    }
    const queuedAudio = pendingDecoyAudioRef.current.splice(0);
    for (const audio of queuedAudio) {
      playDecoyAudio(audio);
    }
  }, [playDecoyAudio]);

  flushPendingDecoyAudioRef.current = flushPendingDecoyAudio;

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
          handoffStateRef.current = data.snapshot.state;
          setHandoffState(data.snapshot.state);
          setUtterances(data.snapshot.utterances);
          if (data.snapshot.latestRisk) {
            setRiskScore(data.snapshot.latestRisk.score);
            setRiskReasons(data.snapshot.latestRisk.reasons);
          }
        } else if (data.type === 'session.state_changed') {
          handoffStateRef.current = data.state;
          if (data.state !== 'ai_active') {
            pendingDecoyTurnsRef.current = [];
            pendingDecoyAudioRef.current = [];
            decoyPlaybackVersionRef.current += 1;
          }
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
          const decoyText =
            handoffStateRef.current === 'ai_active'
              ? pendingDecoyTurnsRef.current.shift()
              : undefined;
          const audio: QueuedDecoyAudio = {
            audioBase64: data.audioBase64,
            sampleRate: data.sampleRate,
            ...(decoyText ? { decoyText } : {}),
            playbackVersion: decoyPlaybackVersionRef.current,
          };
          if (
            scammerTurnInProgressRef.current ||
            (scammerClientRef.current?.isSpeaking() ?? false)
          ) {
            pendingDecoyAudioRef.current.push(audio);
          } else {
            playDecoyAudio(audio);
          }
        } else if (data.type === 'agent.interrupted') {
          pendingDecoyTurnsRef.current = [];
          pendingDecoyAudioRef.current = [];
          decoyPlaybackVersionRef.current += 1;
          agentPlayerRef.current?.stopAndFlush();
        } else if (data.type === 'transcript.partial') {
          setActivePartials((prev) => ({
            ...prev,
            [data.utterance.speaker]: data.utterance,
          }));
        } else if (data.type === 'transcript.committed') {
          if (handoffStateRef.current === 'ai_active' && data.utterance.speaker === 'ai') {
            pendingDecoyTurnsRef.current.push(data.utterance.text);
          }
          setUtterances((prev) => {
            const incomingText = data.utterance.text.trim();
            const incomingCreatedAt = Date.parse(data.utterance.createdAt);
            const isDuplicate = prev.some((utterance) => {
              if (utterance.speaker !== data.utterance.speaker || utterance.text.trim() !== incomingText) {
                return false;
              }
              const existingCreatedAt = Date.parse(utterance.createdAt);
              return (
                Number.isFinite(incomingCreatedAt) &&
                Number.isFinite(existingCreatedAt) &&
                Math.abs(incomingCreatedAt - existingCreatedAt) < 5000
              );
            });
            return isDuplicate ? prev : [...prev, data.utterance];
          });
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
  }, [playDecoyAudio, sendClientMessage]);

  const startCall = useCallback(async () => {
    if (startingRef.current || sessionId) return;
    startingRef.current = true;
    isManuallyEndedRef.current = false;
    setUtterances([]);
    setActivePartials({ user: null, caller: null, ai: null, system: null });
    setRiskScore(0);
    setRiskReasons([]);
    lastScammerSpokenTimeRef.current = 0;
    lastScammerTextRef.current = '';
    pendingDecoyTurnsRef.current = [];
    pendingDecoyAudioRef.current = [];
    decoyPlaybackVersionRef.current += 1;
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
        handoffStateRef.current = joined.state;
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
        handoffStateRef.current = session.state;
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
      let localStream: MediaStream | null = null;
      try {
        localStream = await webrtc.startLocalMic();
        setIsMicActive(true);
      } catch (micErr) {
        setDegradedMessage(
          'ไมโครโฟนไม่พร้อมใช้งาน: ' +
            (micErr instanceof Error ? micErr.message : 'ไม่สามารถเข้าถึงไมโครโฟนได้'),
        );
      }
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
      if (localStream) {
        const localProcessor = new AudioProcessor(
          localStream,
          (audioBase64) => {
            const scammerClient = scammerClientRef.current;
            const scammerIsActive =
              scammerClient &&
              !['idle', 'closed', 'error'].includes(scammerClient.getStatus());

            if (scammerIsActive) {
              if (handoffStateRef.current !== 'ai_active') {
                scammerClient.sendUserAudioChunk(audioBase64);
              }
            } else {
              sendClientMessage({
                type: 'audio.chunk',
                sessionId: targetSessionId,
                speaker: localSpeaker,
                audioBase64,
                sampleRate: 16000,
                timestampMs: Date.now(),
              });
            }
          },
          (rms) => {
            setMicLevel(rms);
          },
        );
        localProcessor.start();
        userAudioProcessorRef.current = localProcessor;
      }

      // Browser recognition provides immediate, reliable real-time transcript for the local speaker
      const recognizer = new BrowserSpeechRecognizer((text, isFinal) => {
        const scammerClient = scammerClientRef.current;
        if (
          scammerClient &&
          !['idle', 'closed', 'error'].includes(scammerClient.getStatus())
        ) {
          // ConvAI is the single transcript source during a simulated scam call.
          return;
        }

        const trimmed = text.trim();
        const normalizedInput = trimmed.replace(/[^\w\u0E00-\u0E7F]/g, '');

        // 1. If Scammer AI is currently actively outputting audio through speaker, discard input as speaker echo
        const isScammerCurrentlySpeaking = scammerClientRef.current?.isSpeaking() ?? false;

        // 2. Check if text matches recent scammer speech (fuzzy overlap of 8+ characters)
        const isEchoOfScammerPhrases = scammerPhrasesHistoryRef.current.some((phrase) => {
          if (!phrase || phrase.length < 5) return false;
          const sample = phrase.slice(0, 18);
          const inputSample = normalizedInput.slice(0, 18);
          return (
            (sample.length >= 6 && normalizedInput.includes(sample)) ||
            (inputSample.length >= 6 && phrase.includes(inputSample))
          );
        });

        const isRecentScammerEcho =
          isScammerCurrentlySpeaking ||
          (Date.now() - lastScammerSpokenTimeRef.current < 9000 && isEchoOfScammerPhrases);

        if (isRecentScammerEcho) {
          return;
        }

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
          // Forward recognized user speech directly to ElevenLabs ConvAI so AI agent immediately receives and responds
          if (localSpeaker === 'user' && scammerClientRef.current) {
            scammerClientRef.current.sendUserMessage(text);
          }

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
    if (scammerTurnSafetyTimeoutRef.current) {
      clearTimeout(scammerTurnSafetyTimeoutRef.current);
      scammerTurnSafetyTimeoutRef.current = null;
    }
    scammerTurnInProgressRef.current = false;
    pendingDecoyAudioRef.current = [];

    if (sessionId && participantRoleRef.current === 'owner') {
      try {
        await fetch(`${apiUrl}/sessions/${sessionId}/end`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
          body: '{}',
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
    handoffStateRef.current = 'ended';
    setHandoffState('ended');
    setSessionId(null);
    setCaseId(null);
    setJoinCode(null);
    setInviteUrl(null);
    startingRef.current = false;
  };

  const requestHandoff = async (): Promise<boolean> => {
    if (!sessionId || participantRoleRef.current !== 'owner') return false;
    try {
      const res = await fetch(`${apiUrl}/sessions/${sessionId}/handoff`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
        body: '{}',
      });
      if (!res.ok) throw new Error('AI ยังไม่พร้อมรับช่วงในสถานะปัจจุบัน');
      const updated = await res.json();
      handoffStateRef.current = updated.state;
      setHandoffState(updated.state);
      return true;
    } catch (error) {
      setDegradedMessage(error instanceof Error ? error.message : 'ขอให้ AI รับช่วงไม่สำเร็จ');
      return false;
    }
  };

  const resumeHuman = async (): Promise<boolean> => {
    if (!sessionId || participantRoleRef.current !== 'owner') return false;
    try {
      const res = await fetch(`${apiUrl}/sessions/${sessionId}/resume-human`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
        body: '{}',
      });
      if (!res.ok) throw new Error('ยังไม่สามารถคืนสายให้ผู้ใช้ได้');
      const updated = await res.json();
      handoffStateRef.current = updated.state;
      setHandoffState(updated.state);
      agentPlayerRef.current?.stopAndFlush();
      await webrtcRef.current?.switchToHumanMic();
      speechRecognizerRef.current?.start();
      return true;
    } catch (error) {
      setDegradedMessage(error instanceof Error ? error.message : 'คืนสายให้ผู้ใช้ไม่สำเร็จ');
      return false;
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
    if (scammerConnectingRef.current) return;

    const existingClient = scammerClientRef.current;
    if (
      existingClient &&
      ['connecting', 'connected', 'speaking', 'listening'].includes(existingClient.getStatus())
    ) {
      return;
    }

    existingClient?.disconnect();
    scammerClientRef.current = null;
    scammerConnectingRef.current = true;
    const attemptId = ++scammerAttemptRef.current;

    let targetId = sessionIdRef.current ?? sessionId;
    if (!targetId) {
      await startCall();
      targetId = sessionIdRef.current;
    }
    if (!targetId) {
      scammerConnectingRef.current = false;
      return;
    }

    const chosenLang: 'th' | 'en' =
      langOverride ?? (spokenLanguageRef.current?.startsWith('en') ? 'en' : 'th');
    setActiveScammerLang(chosenLang);

    try {
      // Ensure microphone processor and speech recognition are active following user interaction
      await userAudioProcessorRef.current?.resume();
      speechRecognizerRef.current?.start();

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
      if (attemptId !== scammerAttemptRef.current) return;

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
            const cleanText = text.trim();
            if (!cleanText) return;

            scammerTurnInProgressRef.current = true;
            if (scammerTurnSafetyTimeoutRef.current) {
              clearTimeout(scammerTurnSafetyTimeoutRef.current);
            }
            const safetyDelayMs = Math.max(8_000, Math.min(45_000, cleanText.length * 120));
            scammerTurnSafetyTimeoutRef.current = setTimeout(() => {
              scammerTurnSafetyTimeoutRef.current = null;
              scammerTurnInProgressRef.current = false;
              flushPendingDecoyAudioRef.current();
            }, safetyDelayMs);

            // Strip emotion/roleplay tags like [concerned], [polite], [angry] for echo matching
            const strippedForMatching = cleanText.replace(/\[.*?\]/g, '').replace(/[^\w\u0E00-\u0E7F]/g, '');
            lastScammerSpokenTimeRef.current = Date.now();
            lastScammerTextRef.current = strippedForMatching;
            scammerPhrasesHistoryRef.current.push(strippedForMatching);
            if (scammerPhrasesHistoryRef.current.length > 5) {
              scammerPhrasesHistoryRef.current.shift();
            }

            // Immediately display scammer bubble on the left (CALLER - RED)
            const scammerUtterance: Utterance = {
              id: `scammer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              sessionId: sessionIdRef.current ?? '',
              speaker: 'caller',
              text: cleanText,
              transcriptState: 'committed',
              startedAtMs: Date.now() - 1500,
              endedAtMs: Date.now(),
              createdAt: new Date().toISOString(),
            };
            setUtterances((prev) => {
              if (prev.some((u) => u.speaker === 'caller' && u.text.trim() === cleanText)) {
                return prev;
              }
              return [...prev, scammerUtterance];
            });

            void simulateSpeech('caller', cleanText);
          },
          onUserTranscript: (text) => {
            const cleanText = text.trim();
            if (!cleanText) return;
            const normalizedInput = cleanText.replace(/[^\w\u0E00-\u0E7F]/g, '');

            // Ignore system trigger greeting
            if (
              cleanText.includes('ใครโทรมา') ||
              cleanText.includes('who is calling') ||
              cleanText.includes('Who is calling')
            ) {
              return;
            }

            // Discard if scammer AI is currently talking through speaker
            if (scammerClientRef.current?.isSpeaking()) {
              return;
            }

            // Ignore if user transcript is actually scammer audio leaking into mic
            const isScammerEcho = scammerPhrasesHistoryRef.current.some((phrase) => {
              if (!phrase || phrase.length < 5) return false;
              const sample = phrase.slice(0, 18);
              const inputSample = normalizedInput.slice(0, 18);
              return (
                (sample.length >= 6 && normalizedInput.includes(sample)) ||
                (inputSample.length >= 6 && phrase.includes(inputSample))
              );
            });

            if (isScammerEcho) {
              return;
            }

            // Immediately display user bubble on the right (USER - GREEN)
            const userUtterance: Utterance = {
              id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              sessionId: sessionIdRef.current ?? '',
              speaker: 'user',
              text: cleanText,
              transcriptState: 'committed',
              startedAtMs: Date.now() - 1200,
              endedAtMs: Date.now(),
              createdAt: new Date().toISOString(),
            };
            setUtterances((prev) => {
              if (prev.some((u) => u.speaker === 'user' && u.text.trim() === cleanText)) {
                return prev;
              }
              return [...prev, userUtterance];
            });

            void simulateSpeech('user', cleanText);
          },
          onAudioChunkReceived: () => {
            scammerTurnInProgressRef.current = true;
          },
          onInterrupted: () => {
            if (scammerTurnSafetyTimeoutRef.current) {
              clearTimeout(scammerTurnSafetyTimeoutRef.current);
              scammerTurnSafetyTimeoutRef.current = null;
            }
            scammerTurnInProgressRef.current = false;
            flushPendingDecoyAudioRef.current();
          },
          onPlaybackFinished: () => {
            if (scammerTurnSafetyTimeoutRef.current) {
              clearTimeout(scammerTurnSafetyTimeoutRef.current);
              scammerTurnSafetyTimeoutRef.current = null;
            }
            scammerTurnInProgressRef.current = false;
            flushPendingDecoyAudioRef.current();
          },
        },
        { language: chosenLang },
      );
      scammerClientRef.current = client;
      client.connect();
    } catch (err) {
      scammerClientRef.current?.disconnect();
      scammerClientRef.current = null;
      const msg = err instanceof Error ? err.message : 'Cannot start scammer simulation';
      setIsScammerCalling(false);
      setScammerStatus('error');
      setDegradedMessage(msg);
      showToast('⚠️ ' + msg);
    } finally {
      scammerConnectingRef.current = false;
    }
  }, [sessionId, startCall, simulateSpeech]);

  const stopScammerCall = useCallback(() => {
    scammerAttemptRef.current += 1;
    scammerConnectingRef.current = false;
    scammerTurnInProgressRef.current = false;
    pendingDecoyAudioRef.current = [];
    if (scammerTurnSafetyTimeoutRef.current) {
      clearTimeout(scammerTurnSafetyTimeoutRef.current);
      scammerTurnSafetyTimeoutRef.current = null;
    }
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
      scammerAttemptRef.current += 1;
      if (scammerTurnSafetyTimeoutRef.current) {
        clearTimeout(scammerTurnSafetyTimeoutRef.current);
        scammerTurnSafetyTimeoutRef.current = null;
      }
      pendingDecoyAudioRef.current = [];
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
    window.localStorage.setItem('scamtrap:spokenLanguage', lang);
    if (speechRecognizerRef.current) {
      speechRecognizerRef.current.stop();
      if (sessionId) {
        const targetSessionId = sessionId;
        const localSpeaker: 'user' | 'caller' =
          participantRoleRef.current === 'owner' ? 'user' : 'caller';
        const recognizer = new BrowserSpeechRecognizer((text, isFinal) => {
          const trimmed = text.trim();
          const normalizedInput = trimmed.replace(/[^\w\u0E00-\u0E7F]/g, '');

          // Discard if scammer AI is speaking or matching echo
          const isScammerCurrentlySpeaking = scammerClientRef.current?.isSpeaking() ?? false;
          const isEchoOfScammerPhrases = scammerPhrasesHistoryRef.current.some((phrase) => {
            if (!phrase || phrase.length < 5) return false;
            const sample = phrase.slice(0, 18);
            const inputSample = normalizedInput.slice(0, 18);
            return (
              (sample.length >= 6 && normalizedInput.includes(sample)) ||
              (inputSample.length >= 6 && phrase.includes(inputSample))
            );
          });

          if (isScammerCurrentlySpeaking || (Date.now() - lastScammerSpokenTimeRef.current < 9000 && isEchoOfScammerPhrases)) {
            return;
          }

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
            if (localSpeaker === 'user' && scammerClientRef.current) {
              scammerClientRef.current.sendUserMessage(text);
            }
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
