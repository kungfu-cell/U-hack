import type { Speaker, Utterance } from '@scamtrap/contracts';
import type { AgentClient } from '../handoff/types.js';

export interface ScribeCallbacks {
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
  onError: (error: Error) => void;
  onClose?: () => void;
}

export interface ScribeSession {
  readonly speaker: Speaker;
  sendAudioChunk(chunkBase64: string): void;
  commit(): void;
  close(): void;
}

export interface ScribeProvider {
  readonly name: string;
  createSession(speaker: Speaker, callbacks: ScribeCallbacks): Promise<ScribeSession>;
}

export interface AudioPipelineOptions {
  sessionId: string;
  caseId: string;
  scribeProvider: ScribeProvider;
  onEvent: (event: import('@scamtrap/contracts').SessionEvent) => void;
  analysisProvider: import('@scamtrap/analysis-core').AnalysisProvider;
  agentClient?: AgentClient | undefined;
}

