import {
  Prisma,
  type Assessment,
  type EntityMention,
  type Evidence,
  type IntelCheck,
  type PrismaClient,
} from '@prisma/client';

export interface CreateAssessmentInput {
  id?: string;
  caseId: string;
  score: number;
  level: string;
  summary: string;
  recommendation: string;
  modelVersion: string;
  inputSnapshot: Prisma.InputJsonValue;
  isDemo?: boolean;
  evidence?: Array<{
    id?: string;
    sourceId: string;
    quote: string;
    startOffset: number;
    endOffset: number;
    tactic: string;
    explanation: string;
  }>;
  entityMentions?: Array<{
    id?: string;
    utteranceId?: string | null;
    type: string;
    encryptedValue: string;
    lookupDigest?: string | null;
    sourceId: string;
    speaker: string;
    confidence: number;
    verified?: boolean;
  }>;
  intelChecks?: Array<{
    id?: string;
    entityMentionId?: string | null;
    provider: string;
    status: string;
    threatType?: string | null;
    responseSummary?: Prisma.InputJsonValue | null;
    isDemo?: boolean;
  }>;
}

export type AssessmentWithDetails = Assessment & {
  evidence: Evidence[];
  entityMentions: (EntityMention & { intelChecks?: IntelCheck[] })[];
  intelChecks: IntelCheck[];
};

export class AssessmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateAssessmentInput): Promise<AssessmentWithDetails> {
    return this.prisma.assessment.create({
      data: {
        ...(data.id !== undefined ? { id: data.id } : {}),
        caseId: data.caseId,
        score: data.score,
        level: data.level,
        summary: data.summary,
        recommendation: data.recommendation,
        modelVersion: data.modelVersion,
        inputSnapshot: data.inputSnapshot,
        isDemo: data.isDemo ?? true,
        ...(data.evidence
          ? {
              evidence: {
                create: data.evidence.map((e) => ({
                  ...(e.id !== undefined ? { id: e.id } : {}),
                  sourceId: e.sourceId,
                  quote: e.quote,
                  startOffset: e.startOffset,
                  endOffset: e.endOffset,
                  tactic: e.tactic,
                  explanation: e.explanation,
                })),
              },
            }
          : {}),
        ...(data.entityMentions
          ? {
              entityMentions: {
                create: data.entityMentions.map((em) => ({
                  ...(em.id !== undefined ? { id: em.id } : {}),
                  ...(em.utteranceId !== undefined ? { utteranceId: em.utteranceId } : {}),
                  type: em.type,
                  encryptedValue: em.encryptedValue,
                  ...(em.lookupDigest !== undefined ? { lookupDigest: em.lookupDigest } : {}),
                  sourceId: em.sourceId,
                  speaker: em.speaker,
                  confidence: em.confidence,
                  verified: em.verified ?? false,
                })),
              },
            }
          : {}),
        ...(data.intelChecks
          ? {
              intelChecks: {
                create: data.intelChecks.map((ic) => ({
                  ...(ic.id !== undefined ? { id: ic.id } : {}),
                  ...(ic.entityMentionId !== undefined ? { entityMentionId: ic.entityMentionId } : {}),
                  provider: ic.provider,
                  status: ic.status,
                  ...(ic.threatType !== undefined ? { threatType: ic.threatType } : {}),
                  ...(ic.responseSummary !== undefined
                    ? { responseSummary: ic.responseSummary === null ? Prisma.JsonNull : ic.responseSummary }
                    : {}),
                  isDemo: ic.isDemo ?? false,
                })),
              },
            }
          : {}),
      },
      include: {
        evidence: true,
        entityMentions: {
          include: {
            intelChecks: true,
          },
        },
        intelChecks: true,
      },
    });
  }

  async findLatestByCaseId(caseId: string): Promise<AssessmentWithDetails | null> {
    return this.prisma.assessment.findFirst({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      include: {
        evidence: true,
        entityMentions: {
          include: {
            intelChecks: true,
          },
        },
        intelChecks: true,
      },
    });
  }

  async listByCaseId(caseId: string): Promise<Assessment[]> {
    return this.prisma.assessment.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addEvidence(
    assessmentId: string,
    evidence: {
      id?: string;
      sourceId: string;
      quote: string;
      startOffset: number;
      endOffset: number;
      tactic: string;
      explanation: string;
    },
  ): Promise<Evidence> {
    return this.prisma.evidence.create({
      data: {
        ...(evidence.id !== undefined ? { id: evidence.id } : {}),
        sourceId: evidence.sourceId,
        quote: evidence.quote,
        startOffset: evidence.startOffset,
        endOffset: evidence.endOffset,
        tactic: evidence.tactic,
        explanation: evidence.explanation,
        assessmentId,
      },
    });
  }

  async addIntelCheck(
    assessmentId: string,
    check: {
      id?: string;
      entityMentionId?: string | null;
      provider: string;
      status: string;
      threatType?: string | null;
      responseSummary?: Prisma.InputJsonValue | null;
      isDemo?: boolean;
    },
  ): Promise<IntelCheck> {
    return this.prisma.intelCheck.create({
      data: {
        ...(check.id !== undefined ? { id: check.id } : {}),
        assessmentId,
        ...(check.entityMentionId !== undefined ? { entityMentionId: check.entityMentionId } : {}),
        provider: check.provider,
        status: check.status,
        ...(check.threatType !== undefined ? { threatType: check.threatType } : {}),
        ...(check.responseSummary !== undefined
          ? { responseSummary: check.responseSummary === null ? Prisma.JsonNull : check.responseSummary }
          : {}),
        isDemo: check.isDemo ?? false,
      },
    });
  }
}
