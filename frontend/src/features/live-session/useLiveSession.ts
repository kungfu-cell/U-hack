import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  HandoffState,
  ParticipantRole,
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

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const wsBaseUrl = apiUrl.replace(/^http/, 'ws');

const toRiskLevel = (score: number): RiskLevel => {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
};

interface OwnerSessionResponse {
  id: string;
  caseId: string;
  state: HandoffState;
  joinCode: string;
  ownerToken: string;
}

interface JoinSessionResponse {
  sessionId: string;
  caseId: string;
  state: HandoffState;
  role: 'caller';
  participantToken: string;
}

const readInvitation = () => {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');
  const joinCode = params.get('join');
  return sessionId && joinCode ? { sessionId, joinCode } : null;
};

export const useLiveSession = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [participantRole, setParticipantRole] = useState<ParticipantRole | null>(null);
  const [pendingInvitation] = useState(readInvitation);
  const [handoffState, setHandoffState] = useState<HandoffState>('human_active');
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [activePartials, setActivePartials] = useState<Record<Speaker, Utterance | null>>({
    user: null,
    caller: null,
    ai: null,
    system: null,
  });
  const [riskScore, setRiskScore] = useState(0);
  const [riskReasons, setRiskReasons] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('idle');
  const [peerConnected, setPeerConnected] = useState(false);
  const [degradedMessage, setDegradedMessage] = useState<string | null>(null);
  const [isMicActive, setIsMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const webrtcRef = useRef<WebRtcManager | null>(null);
  const agentPlayerRef = useRef<AgentAudioPlayer | null>(null);
  const speechRecognizerRef = useRef<BrowserSpeechRecognizer | null>(null);
  const localAudioProcessorRef = useRef<AudioProcessor | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManuallyEndedRef = useRef(false);

  const sendClientMessage = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const connectWebSocket = useCallback(
    async (targetSessionId: string, token: string, role: ParticipantRole): Promise<void> => {
      if (isManuallyEndedRef.current) return;
      setConnectionStatus('connecting');

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `${wsBaseUrl}/sessions/${targetSessionId}/ws?token=${encodeURIComponent(token)}`,
        );
        wsRef.current = ws;
        let opened = false;

        ws.onopen = () => {
          opened = true;
          setConnectionStatus('connected');
          setDegradedMessage(null);
          ws.send(JSON.stringify({ type: 'session.sync', sessionId: targetSessionId }));
          resolve();
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
            } else if (data.type === 'peer.joined') {
              if (role === 'owner' && data.role === 'caller' && webrtcRef.current) {
                void webrtcRef.current.createOffer().then((sdp) => {
                  sendClientMessage({ type: 'signal.offer', sessionId: targetSessionId, sdp });
                });
              }
            } else if (data.type === 'peer.left') {
              setPeerConnected(false);
            } else if (data.type === 'signal.offer' && role === 'caller' && webrtcRef.current) {
              void webrtcRef.current.acceptOffer(data.sdp).then((sdp) => {
                sendClientMessage({ type: 'signal.answer', sessionId: targetSessionId, sdp });
              });
            } else if (data.type === 'signal.answer' && role === 'owner' && webrtcRef.current) {
              void webrtcRef.current.acceptAnswer(data.sdp);
            } else if (data.type === 'signal.ice' && webrtcRef.current) {
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
              void webrtcRef.current.addIceCandidate(candidate);
            } else if (data.type === 'session.state_changed') {
              setHandoffState(data.state);
              if (data.state === 'ai_active' && role === 'owner') {
                agentPlayerRef.current ??= new AgentAudioPlayer();
                if (webrtcRef.current) {
                  void webrtcRef.current.switchToAiTrack(agentPlayerRef.current.getAudioTrack());
                }
              } else if (data.state === 'human_active' && role === 'owner') {
                agentPlayerRef.current?.stopAndFlush();
                void webrtcRef.current?.switchToHumanMic();
              } else if (data.state === 'paused_safe' && role === 'owner') {
                agentPlayerRef.current?.stopAndFlush();
                webrtcRef.current?.setLocalMicMuted(true);
              }
            } else if (data.type === 'agent.audio_chunk' && role === 'owner') {
              agentPlayerRef.current ??= new AgentAudioPlayer();
              void agentPlayerRef.current.enqueueAudioChunk(data.audioBase64, data.sampleRate);
            } else if (data.type === 'agent.interrupted') {
              agentPlayerRef.current?.stopAndFlush();
            } else if (data.type === 'transcript.partial') {
              setActivePartials((previous) => ({
                ...previous,
                [data.utterance.speaker]: data.utterance,
              }));
            } else if (data.type === 'transcript.committed') {
              setUtterances((previous) =>
                previous.some((utterance) => utterance.id === data.utterance.id)
                  ? previous
                  : [...previous, data.utterance],
              );
              setActivePartials((previous) => ({
                ...previous,
                [data.utterance.speaker]: null,
              }));
            } else if (data.type === 'risk.updated') {
              setRiskScore(data.score);
              setRiskReasons(data.reasons);
            } else if (data.type === 'service.degraded') {
              setDegradedMessage(`${data.service}: ${data.message}`);
            }
          } catch {
            // Ignore malformed server events while keeping the call alive.
          }
        };

        ws.onerror = () => {
          if (!opened) reject(new Error('ไม่สามารถเชื่อมต่อ WebSocket ของห้องได้'));
        };

        ws.onclose = () => {
          wsRef.current = null;
          setPeerConnected(false);
          if (!isManuallyEndedRef.current && opened) {
            setConnectionStatus('reconnecting');
            reconnectTimeoutRef.current = setTimeout(() => {
              void connectWebSocket(targetSessionId, token, role);
            }, 2000);
          } else if (isManuallyEndedRef.current) {
            setConnectionStatus('disconnected');
          }
        };
      });
    },
    [sendClientMessage],
  );

  const initializeMedia = async (targetSessionId: string, role: ParticipantRole) => {
    const webrtc = new WebRtcManager();
    webrtcRef.current = webrtc;
    const localStream = await webrtc.startLocalMic();
    webrtc.initPeerConnection();
    webrtc.setOnIceCandidate((candidate) => {
      sendClientMessage({ type: 'signal.ice', sessionId: targetSessionId, candidate });
    });
    webrtc.setOnRemoteStream(() => setPeerConnected(true));
    setIsMicActive(true);

    const speaker: 'user' | 'caller' = role === 'owner' ? 'user' : 'caller';
    const processor = new AudioProcessor(
      localStream,
      (audioBase64) => {
        sendClientMessage({
          type: 'audio.chunk',
          sessionId: targetSessionId,
          speaker,
          audioBase64,
          timestampMs: Date.now(),
        });
      },
      setMicLevel,
    );
    processor.start();
    localAudioProcessorRef.current = processor;

    const recognizer = new BrowserSpeechRecognizer((text, isFinal) => {
      sendClientMessage({
        type: 'transcript.client_speech',
        sessionId: targetSessionId,
        speaker,
        text,
        isFinal,
      });
      if (!isFinal) {
        setActivePartials((previous) => ({
          ...previous,
          [speaker]: {
            id: `local-partial-${speaker}`,
            sessionId: targetSessionId,
            speaker,
            text,
            transcriptState: 'partial',
            startedAtMs: Date.now(),
            endedAtMs: Date.now(),
            createdAt: new Date().toISOString(),
          },
        }));
      }
    });
    recognizer.start();
    speechRecognizerRef.current = recognizer;
  };

  const startCall = async () => {
    isManuallyEndedRef.current = false;
    setConnectionStatus('connecting');
    try {
      const caseRecord = await createCase();
      setCaseId(caseRecord.id);
      window.localStorage.setItem('scamtrap:lastCaseId', caseRecord.id);
      const response = await fetch(`${apiUrl}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
        body: JSON.stringify({ caseId: caseRecord.id }),
      });
      if (!response.ok) throw new Error('สร้างห้องสนทนาไม่สำเร็จ');
      const session = (await response.json()) as OwnerSessionResponse;
      setSessionId(session.id);
      window.localStorage.setItem('scamtrap:lastSessionId', session.id);
      setJoinCode(session.joinCode);
      setParticipantRole('owner');
      setHandoffState(session.state);
      await initializeMedia(session.id, 'owner');
      await connectWebSocket(session.id, session.ownerToken, 'owner');
    } catch (error) {
      setDegradedMessage(error instanceof Error ? error.message : 'ไม่สามารถเริ่มการเชื่อมต่อได้');
      setConnectionStatus('disconnected');
    }
  };

  const joinCall = async () => {
    if (!pendingInvitation) return;
    isManuallyEndedRef.current = false;
    setConnectionStatus('connecting');
    try {
      const response = await fetch(`${apiUrl}/sessions/${pendingInvitation.sessionId}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ joinCode: pendingInvitation.joinCode }),
      });
      if (!response.ok) throw new Error('ลิงก์เข้าร่วมห้องไม่ถูกต้องหรือหมดอายุ');
      const joined = (await response.json()) as JoinSessionResponse;
      setSessionId(joined.sessionId);
      setCaseId(joined.caseId);
      setParticipantRole('caller');
      setHandoffState(joined.state);
      await initializeMedia(joined.sessionId, 'caller');
      await connectWebSocket(joined.sessionId, joined.participantToken, 'caller');
    } catch (error) {
      setDegradedMessage(error instanceof Error ? error.message : 'ไม่สามารถเข้าร่วมห้องได้');
      setConnectionStatus('disconnected');
    }
  };

  const cleanupMedia = () => {
    speechRecognizerRef.current?.stop();
    speechRecognizerRef.current = null;
    localAudioProcessorRef.current?.stop();
    localAudioProcessorRef.current = null;
    agentPlayerRef.current?.close();
    agentPlayerRef.current = null;
    webrtcRef.current?.stop();
    webrtcRef.current = null;
    wsRef.current?.close();
    setIsMicActive(false);
    setMicLevel(0);
    setPeerConnected(false);
  };

  const endCall = async () => {
    isManuallyEndedRef.current = true;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (sessionId && participantRole === 'owner') {
      try {
        await fetch(`${apiUrl}/sessions/${sessionId}/end`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
        });
      } catch {
        // Local teardown must still complete.
      }
    }
    cleanupMedia();
    setConnectionStatus('disconnected');
    setHandoffState('ended');
  };

  const requestHandoff = async () => {
    if (!sessionId || participantRole !== 'owner') return;
    setHandoffState('preparing_ai');
    speechRecognizerRef.current?.stop();
    try {
      const response = await fetch(`${apiUrl}/sessions/${sessionId}/handoff`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
      });
      if (!response.ok) throw new Error('เตรียม AI รับช่วงไม่สำเร็จ');
    } catch (error) {
      setHandoffState('paused_safe');
      setDegradedMessage(error instanceof Error ? error.message : 'AI handoff failed');
    }
  };

  const resumeHuman = async () => {
    if (!sessionId || participantRole !== 'owner') return;
    agentPlayerRef.current?.stopAndFlush();
    try {
      const response = await fetch(`${apiUrl}/sessions/${sessionId}/resume-human`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
      });
      if (!response.ok) throw new Error('คืนสายให้ผู้ใช้ไม่สำเร็จ');
      speechRecognizerRef.current?.start();
    } catch (error) {
      setDegradedMessage(error instanceof Error ? error.message : 'Resume failed');
    }
  };

  const simulateSpeech = async (speaker: 'user' | 'caller', text: string) => {
    if (!sessionId || participantRole !== 'owner') return;
    await fetch(`${apiUrl}/sessions/${sessionId}/simulate-speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
      body: JSON.stringify({ speaker, text }),
    }).catch(() => undefined);
  };

  useEffect(() => {
    return () => {
      isManuallyEndedRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      speechRecognizerRef.current?.stop();
      localAudioProcessorRef.current?.stop();
      agentPlayerRef.current?.close();
      webrtcRef.current?.stop();
      wsRef.current?.close();
    };
  }, []);

  const inviteUrl =
    sessionId && joinCode
      ? `${window.location.origin}${window.location.pathname}?session=${encodeURIComponent(sessionId)}&join=${encodeURIComponent(joinCode)}`
      : null;

  return {
    sessionId,
    caseId,
    joinCode,
    inviteUrl,
    participantRole,
    pendingInvitation,
    handoffState,
    utterances,
    activePartials,
    riskScore,
    riskLevel: toRiskLevel(riskScore),
    riskReasons,
    connectionStatus,
    peerConnected,
    degradedMessage,
    isMicActive,
    micLevel,
    startCall,
    joinCall,
    endCall,
    requestHandoff,
    resumeHuman,
    simulateSpeech,
  };
};
