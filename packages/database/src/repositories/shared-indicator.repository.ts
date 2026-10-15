import type { PrismaClient, ReviewStatus, SharedIndicator } from '@prisma/client';
import { computeLookupDigest, encryptValue } from '../crypto.js';

export interface ProposeIndicatorParams {
  id?: string;
  caseId: string;
  type: string;
  rawValue: string;
  reviewStatus?: ReviewStatus;
}

export class SharedIndicatorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async proposeShare(params: ProposeIndicatorParams): Promise<SharedIndicator> {
    const encryptedValue = encryptValue(params.rawValue);
    const lookupDigest = computeLookupDigest(params.type, params.rawValue);

    return this.prisma.sharedIndicator.create({
      data: {
        ...(params.id !== undefined ? { id: params.id } : {}),
        caseId: params.caseId,
        type: params.type,
        encryptedValue,
        lookupDigest,
        reviewStatus: params.reviewStatus ?? 'PENDING',
      },
    });
  }

  async reviewIndicator(
    id: string,
    reviewStatus: ReviewStatus,
    approvedAt?: Date | null,
  ): Promise<SharedIndicator> {
    return this.prisma.sharedIndicator.update({
      where: { id },
      data: {
        reviewStatus,
        approvedAt: reviewStatus === 'APPROVED' ? (approvedAt ?? new Date()) : null,
      },
    });
  }

  async withdrawIndicator(id: string, withdrawnAt: Date = new Date()): Promise<SharedIndicator> {
    return this.prisma.sharedIndicator.update({
      where: { id },
      data: {
        reviewStatus: 'WITHDRAWN',
        withdrawnAt,
      },
    });
  }

  async withdrawAllByCaseId(caseId: string, withdrawnAt: Date = new Date()): Promise<number> {
    const result = await this.prisma.sharedIndicator.updateMany({
      where: {
        caseId,
        withdrawnAt: null,
      },
      data: {
        reviewStatus: 'WITHDRAWN',
        withdrawnAt,
      },
    });
    return result.count;
  }

  async findApprovedByLookupDigest(lookupDigest: string): Promise<SharedIndicator[]> {
    return this.prisma.sharedIndicator.findMany({
      where: {
        lookupDigest,
        reviewStatus: 'APPROVED',
        withdrawnAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByLookupDigest(
    lookupDigest: string,
    options: { onlyApproved?: boolean } = {},
  ): Promise<SharedIndicator[]> {
    return this.prisma.sharedIndicator.findMany({
      where: {
        lookupDigest,
        withdrawnAt: null,
        ...(options.onlyApproved ? { reviewStatus: 'APPROVED' } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listApproved(type?: string, limit: number = 100): Promise<SharedIndicator[]> {
    return this.prisma.sharedIndicator.findMany({
      where: {
        reviewStatus: 'APPROVED',
        withdrawnAt: null,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
