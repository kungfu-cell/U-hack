import type { CaseStatus, InputType, PrismaClient } from '@scamtrap/database';
import { database as defaultDb } from '@scamtrap/database';
import type { CaseInput, CaseRecord } from '@scamtrap/contracts';
import type { CaseRepository, StoredCase } from './case.repository.js';

const toDbStatus = (status: CaseRecord['status']): CaseStatus => {
  switch (status) {
    case 'ready':
      return 'READY';
    case 'analyzing':
      return 'ANALYZING';
    case 'completed':
      return 'COMPLETED';
    case 'failed':
      return 'FAILED';
    case 'deleted':
      return 'DELETED';
    case 'draft':
    default:
      return 'DRAFT';
  }
};

const toContractStatus = (status: CaseStatus): CaseRecord['status'] => {
  switch (status) {
    case 'READY':
      return 'ready';
    case 'ANALYZING':
      return 'analyzing';
    case 'COMPLETED':
      return 'completed';
    case 'FAILED':
      return 'failed';
    case 'DELETED':
      return 'deleted';
    case 'DRAFT':
    default:
      return 'draft';
  }
};

const toContractInputType = (type: InputType): CaseInput['type'] => {
  switch (type) {
    case 'AUDIO':
      return 'audio';
    case 'URL':
      return 'url';
    case 'TEXT':
    default:
      return 'text';
  }
};

const toDbInputType = (type: CaseInput['type']): InputType => {
  switch (type) {
    case 'audio':
      return 'AUDIO';
    case 'url':
      return 'URL';
    case 'text':
    default:
      return 'TEXT';
  }
};

export class PrismaCaseRepository implements CaseRepository {
  constructor(private readonly prisma: PrismaClient = defaultDb) {}

  async create(record: StoredCase): Promise<StoredCase> {
    const created = await this.prisma.case.create({
      data: {
        id: record.id,
        ownerId: record.ownerId,
        title: record.title,
        status: toDbStatus(record.status),
        isDemo: record.isDemo,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
    });

    return {
      ...record,
      id: created.id,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async findById(id: string): Promise<StoredCase | undefined> {
    const found = await this.prisma.case.findFirst({
      where: { id, deletedAt: null },
      include: {
        inputs: { orderBy: { createdAt: 'asc' } },
        assessments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            evidence: true,
            entityMentions: true,
            intelChecks: true,
          },
        },
      },
    });

    if (!found) return undefined;

    const latestAssessment = found.assessments[0];
    let latestAnalysis: StoredCase['latestAnalysis'] = null;

    if (latestAssessment) {
      latestAnalysis = {
        id: latestAssessment.id,
        status: 'completed',
        score: latestAssessment.score,
        level: latestAssessment.level as any,
        scoreVersion: 'v1.0.0',
        verificationStatus: 'unverified',
        secretRequestDetected: latestAssessment.evidence.some((e) => e.tactic === 'secret_request'),
        summary: latestAssessment.summary,
        recommendation: latestAssessment.recommendation,
        modelVersion: latestAssessment.modelVersion,
        createdAt: latestAssessment.createdAt.toISOString(),
        isDemo: latestAssessment.isDemo,
        limitations: [],
        evidence: latestAssessment.evidence.map((e) => ({
          id: e.id,
          quote: e.quote,
          start: e.startOffset,
          end: e.endOffset,
          tactic: e.tactic as any,
          explanation: e.explanation,
          sourceId: e.sourceId,
          confidence: 0.95,
        })),
        entities: latestAssessment.entityMentions.map((em) => ({
          id: em.id,
          type: em.type as any,
          value: em.encryptedValue,
          normalizedValue: em.encryptedValue,
          sourceId: em.sourceId,
          start: 0,
          end: em.encryptedValue.length,
          speaker: em.speaker as any,
          confidence: em.confidence,
          verified: em.verified,
        })),
        threatChecks: latestAssessment.intelChecks.map((ic) => ({
          provider: ic.provider,
          status: ic.status as any,
          checkedAt: ic.checkedAt.toISOString(),
          indicator: ic.entityMentionId ?? '',
          ...(ic.threatType ? { threatType: ic.threatType } : {}),
          isDemo: ic.isDemo,
        })),
      };
    }

    return {
      id: found.id,
      ownerId: found.ownerId,
      title: found.title,
      status: toContractStatus(found.status),
      isDemo: found.isDemo,
      inputs: found.inputs.map((i) => ({
        id: i.id,
        type: toContractInputType(i.type),
        content: i.content,
        source: i.source,
        createdAt: i.createdAt.toISOString(),
      })),
      latestAnalysis,
      createdAt: found.createdAt.toISOString(),
      updatedAt: found.updatedAt.toISOString(),
    };
  }

  async save(record: StoredCase): Promise<StoredCase> {
    await this.prisma.case.update({
      where: { id: record.id },
      data: {
        title: record.title,
        status: toDbStatus(record.status),
        isDemo: record.isDemo,
        updatedAt: new Date(record.updatedAt),
      },
    });

    // Sync any newly added inputs
    for (const input of record.inputs) {
      await this.prisma.caseInput.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          caseId: record.id,
          type: toDbInputType(input.type),
          content: input.content,
          source: input.source,
          createdAt: new Date(input.createdAt),
        },
        update: {
          content: input.content,
          source: input.source,
        },
      });
    }

    return record;
  }
}
