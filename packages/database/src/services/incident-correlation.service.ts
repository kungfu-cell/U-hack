import type { PrismaClient } from '@prisma/client';
import { computeLookupDigest, maskValue } from '../crypto.js';

export interface IndicatorToCorrelate {
  type: string;
  rawValue?: string;
  lookupDigest?: string;
}

export interface CorrelatedIndicatorMatch {
  type: string;
  lookupDigest: string;
  maskedDisplay: string;
  distinctCasesCount: number;
  communityMatchesCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  isCommunityApproved: boolean;
  notes: string[];
}

export interface IncidentCorrelationResult {
  targetCaseId?: string | undefined;
  isRecurring: boolean;
  totalCorrelatedCases: number;
  correlatedIndicators: CorrelatedIndicatorMatch[];
  summaryMessage: string;
  analyzedAt: string;
}

export class IncidentCorrelationService {
  constructor(private readonly prisma: PrismaClient) {}

  async correlateCase(caseId: string): Promise<IncidentCorrelationResult> {
    // 1. Fetch current case's entity mentions from latest assessment
    const latestAssessment = await this.prisma.assessment.findFirst({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      include: {
        entityMentions: true,
      },
    });

    if (!latestAssessment || latestAssessment.entityMentions.length === 0) {
      return {
        targetCaseId: caseId,
        isRecurring: false,
        totalCorrelatedCases: 0,
        correlatedIndicators: [],
        summaryMessage: 'ไม่พบตัวบ่งชี้สำหรับเชื่อมโยงเหตุการณ์',
        analyzedAt: new Date().toISOString(),
      };
    }

    const indicators: IndicatorToCorrelate[] = latestAssessment.entityMentions
      .filter((em) => em.lookupDigest)
      .map((em) => ({
        type: em.type,
        lookupDigest: em.lookupDigest!,
      }));

    return this.correlateIndicators(indicators, caseId);
  }

  async correlateIndicators(
    indicators: IndicatorToCorrelate[],
    excludeCaseId?: string,
  ): Promise<IncidentCorrelationResult> {
    const analyzedAt = new Date().toISOString();
    const correlatedIndicators: CorrelatedIndicatorMatch[] = [];
    const distinctCorrelatedCaseIds = new Set<string>();

    for (const ind of indicators) {
      const digest = ind.lookupDigest ?? (ind.rawValue ? computeLookupDigest(ind.type, ind.rawValue) : null);
      if (!digest) continue;

      // 1. Find matching EntityMentions across non-deleted cases
      const entityMatches = await this.prisma.entityMention.findMany({
        where: {
          lookupDigest: digest,
          assessment: {
            case: {
              ...(excludeCaseId ? { id: { not: excludeCaseId } } : {}),
              deletedAt: null,
            },
          },
        },
        include: {
          assessment: {
            select: {
              caseId: true,
              createdAt: true,
            },
          },
        },
      });

      // Deduplicate distinct cases
      const matchedCaseIds = new Set<string>();
      let firstSeen: Date | null = null;
      let lastSeen: Date | null = null;

      for (const m of entityMatches) {
        matchedCaseIds.add(m.assessment.caseId);
        distinctCorrelatedCaseIds.add(m.assessment.caseId);

        const createdAt = m.assessment.createdAt;
        if (!firstSeen || createdAt < firstSeen) firstSeen = createdAt;
        if (!lastSeen || createdAt > lastSeen) lastSeen = createdAt;
      }

      // 2. Find matching SharedIndicators (Community threat intel)
      const sharedMatches = await this.prisma.sharedIndicator.findMany({
        where: {
          lookupDigest: digest,
          withdrawnAt: null,
          ...(excludeCaseId ? { caseId: { not: excludeCaseId } } : {}),
        },
      });

      const approvedCommunityMatches = sharedMatches.filter((s) => s.reviewStatus === 'APPROVED');
      const isApproved = approvedCommunityMatches.length > 0;

      for (const s of sharedMatches) {
        if (!firstSeen || s.createdAt < firstSeen) firstSeen = s.createdAt;
        if (!lastSeen || s.createdAt > lastSeen) lastSeen = s.createdAt;
      }

      const distinctCasesCount = matchedCaseIds.size;
      const communityMatchesCount = approvedCommunityMatches.length;

      const notes: string[] = [];
      if (distinctCasesCount > 0) {
        notes.push(`พบใน ${distinctCasesCount} เหตุการณ์ก่อนหน้าในระบบ`);
      }
      if (communityMatchesCount > 0) {
        notes.push(`ผ่านการตรวจทานในฐานข้อมูลภัยร่วมกัน (${communityMatchesCount} รายการ)`);
      }

      const masked = ind.rawValue ? maskValue(ind.type, ind.rawValue) : `${ind.type} (${digest.slice(0, 8)}...)`;

      correlatedIndicators.push({
        type: ind.type,
        lookupDigest: digest,
        maskedDisplay: masked,
        distinctCasesCount,
        communityMatchesCount,
        firstSeenAt: firstSeen ? firstSeen.toISOString() : null,
        lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
        isCommunityApproved: isApproved,
        notes,
      });
    }

    const totalCorrelatedCases = distinctCorrelatedCaseIds.size;
    const isRecurring = totalCorrelatedCases > 0 || correlatedIndicators.some((i) => i.communityMatchesCount > 0);

    let summaryMessage = 'ไม่พบความเชื่อมโยงกับเหตุการณ์เดิม';
    if (isRecurring) {
      summaryMessage = `ตรวจพบความเชื่อมโยงกับ ${totalCorrelatedCases} เหตุการณ์ก่อนหน้า และ ${correlatedIndicators.filter((i) => i.isCommunityApproved).length} ตัวบ่งชี้ภัยในชุมชน`;
    }

    return {
      targetCaseId: excludeCaseId,
      isRecurring,
      totalCorrelatedCases,
      correlatedIndicators,
      summaryMessage,
      analyzedAt,
    };
  }
}
