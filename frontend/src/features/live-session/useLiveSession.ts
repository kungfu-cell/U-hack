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

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const wsBaseUrl = apiUrl.replace(/^http/, 'ws');

const toRiskLevel = (score: number): RiskLevel => {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
};

export const useLiveSession = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
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

  const wsRef = useRef<WebSocket | null>(null);
  const webrtcRef = useRef<WebRtcManager | null>(null);
  const agentPlayerRef = useRef<AgentAudioPlayer | null>(null);
  const speechRecognizerRef = useRef<BrowserSpeechRecognizer | null>(null);
  const userAudioProcessorRef = useRef<AudioProcessor | null>(null);
  const callerAudioProcessorRef = useRef<AudioProcessor | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManuallyEndedRef = useRef<boolean>(false);

  const sendClientMessage = useCallback((msg: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connectWebSocket = useCallback((targetSessionId: string) => {
    if (isManuallyEndedRef.current) return;

    setConnectionStatus('connecting');
    const ws = new WebSocket(`${wsBaseUrl}/sessions/${targetSessionId}/ws`);
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
          if (data.state === 'ai_active') {
            if (!agentPlayerRef.current) {
              agentPlayerRef.current = new AgentAudioPlayer();
            }
            if (webrtcRef.current && agentPlayerRef.current) {
              void webrtcRef.current.switchToAiTrack(agentPlayerRef.current.getAudioTrack());
            }
          } else if (data.state === 'human_active' || data.state === 'waiting_for_user') {
            agentPlayerRef.current?.stopAndFlush();
            if (webrtcRef.current) {
              void webrtcRef.current.switchToHumanMic();
            }
          } else if (data.state === 'paused_safe') {
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
          connectWebSocket(targetSessionId);
        }, 2000);
      } else {
        setConnectionStatus('disconnected');
      }
    };
  }, []);

  const startCall = async () => {
    isManuallyEndedRef.current = false;
    setConnectionStatus('connecting');
    try {
      // 1. Create a Case
      const caseRecord = await createCase();
      setCaseId(caseRecord.id);

      // 2. Create a Session
      const sessionRes = await fetch(`${apiUrl}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
        body: JSON.stringify({ caseId: caseRecord.id }),
      });
      const session = await sessionRes.json();
      setSessionId(session.id);
      setHandoffState(session.state);

      // 3. Connect WebSocket
      connectWebSocket(session.id);

      // 4. Initialize WebRTC & Mic
      const webrtc = new WebRtcManager();
      webrtcRef.current = webrtc;
      const userStream = await webrtc.startLocalMic();
      setIsMicActive(true);

      // 5. Setup AudioProcessor for user mic
      const userProcessor = new AudioProcessor(userStream, (audioBase64) => {
        sendClientMessage({
          type: 'audio.chunk',
          sessionId: session.id,
          speaker: 'user',
          audioBase64,
          timestampMs: Date.now(),
        });
      });
      userProcessor.start();
      userAudioProcessorRef.current = userProcessor;

      // 6. Listen for incoming remote WebRTC caller stream
      webrtc.setOnRemoteStream((remoteStream) => {
        const callerProcessor = new AudioProcessor(remoteStream, (audioBase64) => {
          sendClientMessage({
            type: 'audio.chunk',
            sessionId: session.id,
            speaker: 'caller',
            audioBase64,
            timestampMs: Date.now(),
          });
        });
        callerProcessor.start();
        callerAudioProcessorRef.current = callerProcessor;
      });

      // 7. Setup BrowserSpeechRecognizer for user speech (Web Speech API)
      const recognizer = new BrowserSpeechRecognizer((text, isFinal) => {
        // Stream transcript to backend so session room and analysis engine receive it
        sendClientMessage({
          type: 'transcript.client_speech',
          sessionId: session.id,
          speaker: 'user',
          text,
          isFinal,
        });

        // Optimistically show transcript locally in UI
        if (!isFinal) {
          setActivePartials((prev) => ({
            ...prev,
            user: {
              id: 'local-partial-user',
              sessionId: session.id,
              speaker: 'user',
              text,
              transcriptState: 'partial',
              startedAtMs: Date.now(),
              endedAtMs: Date.now(),
              createdAt: new Date().toISOString(),
            },
          }));
        } else {
          setActivePartials((prev) => ({
            ...prev,
            user: null,
          }));
        }
      });
      recognizer.start();
      speechRecognizerRef.current = recognizer;
    } catch (err) {
      setDegradedMessage(err instanceof Error ? err.message : 'ไม่สามารถเริ่มการเชื่อมต่อได้');
      setConnectionStatus('disconnected');
    }
  };

  const endCall = async () => {
    isManuallyEndedRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (sessionId) {
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
    callerAudioProcessorRef.current?.stop();
    agentPlayerRef.current?.close();
    agentPlayerRef.current = null;
    webrtcRef.current?.stop();
    wsRef.current?.close();

    setIsMicActive(false);
    setConnectionStatus('disconnected');
    setHandoffState('ended');
  };

  const requestHandoff = async () => {
    setHandoffState('ai_active');
    speechRecognizerRef.current?.stop();
    if (!agentPlayerRef.current) {
      agentPlayerRef.current = new AgentAudioPlayer();
    }
    if (webrtcRef.current && agentPlayerRef.current) {
      void webrtcRef.current.switchToAiTrack(agentPlayerRef.current.getAudioTrack());
    }
    if (!sessionId) return;
    try {
      const res = await fetch(`${apiUrl}/sessions/${sessionId}/handoff`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
      });
      if (res.ok) {
        const updated = await res.json();
        setHandoffState(updated.state);
      }
    } catch {
      // optimistic update already applied
    }
  };

  const resumeHuman = async () => {
    setHandoffState('human_active');
    agentPlayerRef.current?.stopAndFlush();
    speechRecognizerRef.current?.start();
    if (webrtcRef.current) {
      void webrtcRef.current.switchToHumanMic();
    }
    if (!sessionId) return;
    try {
      const res = await fetch(`${apiUrl}/sessions/${sessionId}/resume-human`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
      });
      if (res.ok) {
        const updated = await res.json();
        setHandoffState(updated.state);
      }
    } catch {
      // optimistic update already applied
    }
  };

  const simulateSpeech = async (speaker: 'user' | 'caller', text: string) => {
    if (!sessionId) return;
    try {
      await fetch(`${apiUrl}/sessions/${sessionId}/simulate-speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'demo-user' },
        body: JSON.stringify({ speaker, text }),
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    return () => {
      isManuallyEndedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      speechRecognizerRef.current?.stop();
      speechRecognizerRef.current = null;
      userAudioProcessorRef.current?.stop();
      callerAudioProcessorRef.current?.stop();
      agentPlayerRef.current?.close();
      agentPlayerRef.current = null;
      webrtcRef.current?.stop();
      wsRef.current?.close();
    };
  }, []);

  return {
    sessionId,
    caseId,
    handoffState,
    utterances,
    activePartials,
    riskScore,
    riskLevel: toRiskLevel(riskScore),
    riskReasons,
    connectionStatus,
    degradedMessage,
    isMicActive,
    startCall,
    endCall,
    requestHandoff,
    resumeHuman,
    simulateSpeech,
  };
};
