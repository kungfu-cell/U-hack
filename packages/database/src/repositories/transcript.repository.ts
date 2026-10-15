import type { PrismaClient, Session, SessionState, TranscriptState, Utterance } from '@prisma/client';

export interface CreateSessionParams {
  id?: string;
  caseId: string;
  state?: SessionState;
  startedAt?: Date;
}

export interface AppendUtteranceParams {
  id?: string;
  sessionId: string;
  inputId?: string;
  speaker: string;
  text: string;
  transcriptState: TranscriptState;
  startedAtMs: number;
  endedAtMs: number;
  version?: number;
}

export class TranscriptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSession(params: CreateSessionParams): Promise<Session> {
    return this.prisma.session.create({
      data: {
        ...(params.id !== undefined ? { id: params.id } : {}),
        caseId: params.caseId,
        state: params.state ?? 'HUMAN_ACTIVE',
        startedAt: params.startedAt ?? new Date(),
      },
    });
  }

  async findSessionById(
    id: string,
    options: { includeUtterances?: boolean } = {},
  ): Promise<(Session & { utterances?: Utterance[] }) | null> {
    return this.prisma.session.findUnique({
      where: { id },
      ...(options.includeUtterances
        ? {
            include: {
              utterances: {
                orderBy: { startedAtMs: 'asc' },
              },
            },
          }
        : {}),
    });
  }

  async listSessionsByCaseId(caseId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { caseId },
      orderBy: { startedAt: 'asc' },
    });
  }

  async updateSessionState(
    id: string,
    state: SessionState,
    endedAt?: Date | null,
  ): Promise<Session> {
    return this.prisma.session.update({
      where: { id },
      data: {
        state,
        ...(endedAt !== undefined ? { endedAt } : {}),
      },
    });
  }

  async appendUtterance(params: AppendUtteranceParams): Promise<Utterance> {
    return this.prisma.utterance.create({
      data: {
        ...(params.id !== undefined ? { id: params.id } : {}),
        sessionId: params.sessionId,
        ...(params.inputId !== undefined ? { inputId: params.inputId } : {}),
        speaker: params.speaker,
        text: params.text,
        transcriptState: params.transcriptState,
        startedAtMs: params.startedAtMs,
        endedAtMs: params.endedAtMs,
        version: params.version ?? 1,
      },
    });
  }

  async getUtterances(
    sessionId: string,
    options: { onlyCommitted?: boolean } = {},
  ): Promise<Utterance[]> {
    return this.prisma.utterance.findMany({
      where: {
        sessionId,
        ...(options.onlyCommitted ? { transcriptState: 'COMMITTED' } : {}),
      },
      orderBy: { startedAtMs: 'asc' },
    });
  }

  async correctUtterance(id: string, correctedText: string): Promise<Utterance> {
    return this.prisma.utterance.update({
      where: { id },
      data: {
        text: correctedText,
        transcriptState: 'CORRECTED',
        version: { increment: 1 },
      },
    });
  }
}
