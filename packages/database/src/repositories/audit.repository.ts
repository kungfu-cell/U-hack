import { Prisma, type AuditEvent, type PrismaClient } from '@prisma/client';

export interface LogAuditParams {
  id?: string;
  actorId: string;
  action: string;
  caseId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  occurredAt?: Date;
}

export interface QueryAuditFilter {
  caseId?: string;
  actorId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export class AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async logEvent(params: LogAuditParams): Promise<AuditEvent> {
    return this.prisma.auditEvent.create({
      data: {
        ...(params.id !== undefined ? { id: params.id } : {}),
        actorId: params.actorId,
        action: params.action,
        caseId: params.caseId ?? null,
        ...(params.metadata !== undefined
          ? { metadata: params.metadata === null ? Prisma.JsonNull : params.metadata }
          : {}),
        occurredAt: params.occurredAt ?? new Date(),
      },
    });
  }

  async queryAuditTrail(filter: QueryAuditFilter): Promise<AuditEvent[]> {
    return this.prisma.auditEvent.findMany({
      where: {
        ...(filter.caseId ? { caseId: filter.caseId } : {}),
        ...(filter.actorId ? { actorId: filter.actorId } : {}),
        ...(filter.action ? { action: filter.action } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: filter.limit ?? 100,
      skip: filter.offset ?? 0,
    });
  }

  async countEvents(filter: Omit<QueryAuditFilter, 'limit' | 'offset'>): Promise<number> {
    return this.prisma.auditEvent.count({
      where: {
        ...(filter.caseId ? { caseId: filter.caseId } : {}),
        ...(filter.actorId ? { actorId: filter.actorId } : {}),
        ...(filter.action ? { action: filter.action } : {}),
      },
    });
  }
}
