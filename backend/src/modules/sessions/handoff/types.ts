import type { HandoffState, Speaker, Utterance } from "@scamtrap/contracts";

export interface AgentContextPacket {
  sessionId: string;
  hasPriorAgentTurn: boolean;
  callerClaims: string[];
  knownEntities: { type: string; value: string }[];
  unresolvedQuestions: string[];
  recentDialogue: { speaker: Speaker; text: string }[];
  systemPrompt: string;
  language: 'th' | 'en';
}

export interface GuardrailResult {
  safe: boolean;
  sanitizedText: string;
  blockedPatterns: string[];
  violationReason?: string | undefined;
}

export interface AgentReply {
  text: string;
  audioBase64?: string | undefined;
}

export interface AgentClient {
  readonly name: string;
  generateReply(
    context: AgentContextPacket,
    latestCallerUtterance: string,
  ): Promise<AgentReply>;
}
