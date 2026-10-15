import type { Case, CaseInput, CaseStatus, InputType, PrismaClient } from '@prisma/client';

export interface CreateCaseParams {
  id?: string;
  ownerId: string;
  title: string;
  isDemo?: boolean;
}

export interface AddInputParams {
  id?: string;
  type: InputType;
  content: string;
  source: string;
}

export class CaseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(params: CreateCaseParams): Promise<Case> {
    return this.prisma.case.create({
      data: {
        ...(params.id !== undefined ? { id: params.id } : {}),
        ownerId: params.ownerId,
        title: params.title,
        status: 'DRAFT',
        isDemo: params.isDemo ?? true,
      },
    });
  }

  async findById(
    id: string,
    options: { includeRelations?: boolean; includeDeleted?: boolean } = {},
  ): Promise<
    | (Case & {
        inputs?: CaseInput[];
        assessments?: any[];
        sessions?: any[];
        reports?: any[];
      })
    | null
  > {
    const where: { id: string; deletedAt?: null } = { id };
    if (!options.includeDeleted) {
      where.deletedAt = null;
    }

    if (!options.includeRelations) {
      return this.prisma.case.findFirst({ where });
    }

    return this.prisma.case.findFirst({
      where,
      include: {
        inputs: {
          orderBy: { createdAt: 'asc' },
        },
        assessments: {
          orderBy: { createdAt: 'desc' },
          include: {
            evidence: true,
            entityMentions: true,
            intelChecks: true,
          },
        },
        sessions: {
          orderBy: { startedAt: 'asc' },
          include: {
            utterances: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        reports: {
          orderBy: { version: 'desc' },
        },
      },
    });
  }

  async listByOwner(
    ownerId: string,
    options: { limit?: number; offset?: number; includeDeleted?: boolean } = {},
  ): Promise<Case[]> {
    return this.prisma.case.findMany({
      where: {
        ownerId,
        ...(options.includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
  }

  async updateStatus(id: string, status: CaseStatus): Promise<Case> {
    return this.prisma.case.update({
      where: { id },
      data: { status },
    });
  }

  async addInput(caseId: string, input: AddInputParams): Promise<CaseInput> {
    return this.prisma.caseInput.create({
      data: {
        ...(input.id !== undefined ? { id: input.id } : {}),
        caseId,
        type: input.type,
        content: input.content,
        source: input.source,
      },
    });
  }

  async softDelete(id: string): Promise<Case> {
    return this.prisma.case.update({
      where: { id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });
  }

  async hardDelete(id: string): Promise<Case> {
    return this.prisma.case.delete({
      where: { id },
    });
  }
}
