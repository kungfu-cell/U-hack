import type { Consent, PrismaClient } from '@prisma/client';

export interface RecordConsentParams {
  id?: string;
  caseId: string;
  subjectId: string;
  scope: string;
  noticeVersion: string;
  grantedAt?: Date;
}

export class ConsentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordConsent(params: RecordConsentParams): Promise<Consent> {
    return this.prisma.consent.create({
      data: {
        ...(params.id !== undefined ? { id: params.id } : {}),
        caseId: params.caseId,
        subjectId: params.subjectId,
        scope: params.scope,
        noticeVersion: params.noticeVersion,
        grantedAt: params.grantedAt ?? new Date(),
      },
    });
  }

  async withdrawConsent(id: string, withdrawnAt: Date = new Date()): Promise<Consent> {
    return this.prisma.consent.update({
      where: { id },
      data: { withdrawnAt },
    });
  }

  async withdrawByScope(
    caseId: string,
    scope: string,
    withdrawnAt: Date = new Date(),
  ): Promise<number> {
    const result = await this.prisma.consent.updateMany({
      where: {
        caseId,
        scope,
        withdrawnAt: null,
      },
      data: { withdrawnAt },
    });
    return result.count;
  }

  async withdrawAllByCaseId(caseId: string, withdrawnAt: Date = new Date()): Promise<number> {
    const result = await this.prisma.consent.updateMany({
      where: {
        caseId,
        withdrawnAt: null,
      },
      data: { withdrawnAt },
    });
    return result.count;
  }

  async getActiveConsents(caseId: string): Promise<Consent[]> {
    return this.prisma.consent.findMany({
      where: {
        caseId,
        withdrawnAt: null,
      },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async hasConsent(caseId: string, scope: string): Promise<boolean> {
    const count = await this.prisma.consent.count({
      where: {
        caseId,
        scope,
        withdrawnAt: null,
      },
    });
    return count > 0;
  }

  async listConsents(caseId: string): Promise<Consent[]> {
    return this.prisma.consent.findMany({
      where: { caseId },
      orderBy: { grantedAt: 'desc' },
    });
  }
}
