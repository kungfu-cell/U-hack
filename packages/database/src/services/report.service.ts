import type { Prisma, PrismaClient, Report } from '@prisma/client';
import { maskValue } from '../crypto.js';
import { ReportRepository } from '../repositories/report.repository.js';
import { IncidentCorrelationService } from './incident-correlation.service.js';

export interface StructuredIncidentReport {
  metadata: {
    reportId: string;
    caseId: string;
    version: number;
    generatedAt: string;
    isDemo: boolean;
    title: string;
    status: string;
    sourceChannels: string[];
  };
  summary: {
    riskScore: number;
    riskLevel: string;
    executiveSummary: string;
    recommendations: string[];
    isRecurringScam: boolean;
  };
  evidenceCitations: Array<{
    id: string;
    quote: string;
    tactic: string;
    explanation: string;
    sourceId: string;
    startOffset: number;
    endOffset: number;
  }>;
  keyFindings: Array<{
    id: string;
    type: string;
    maskedValue: string;
    speaker: string;
    confidence: number;
    verified: boolean;
    intelStatus: string | null;
  }>;
  externalIntelChecks: Array<{
    id: string;
    provider: string;
    status: string;
    threatType: string | null;
    checkedAt: string;
    isDemo: boolean;
  }>;
  voiceHandoffLog?:
    | {
        totalSessions: number;
        sessions: Array<{
          sessionId: string;
          state: string;
          startedAt: string;
          endedAt: string | null;
          utteranceCount: number;
          aiUtteranceCount: number;
        }>;
      }
    | undefined;
  recurringIncidentCorrelation: {
    isRecurring: boolean;
    totalCorrelatedCases: number;
    summary: string;
    matchedIndicators: Array<{
      type: string;
      maskedDisplay: string;
      distinctCasesCount: number;
      communityMatchesCount: number;
      isCommunityApproved: boolean;
      notes: string[];
    }>;
  };
  consentAndProvenance: {
    hasActiveConsent: boolean;
    consentsCount: number;
    modelVersion: string;
    noticeVersion: string | null;
  };
  limitationsAndDisclaimers: string[];
}

export class ReportService {
  private readonly reportRepo: ReportRepository;
  private readonly correlationService: IncidentCorrelationService;

  constructor(private readonly prisma: PrismaClient) {
    this.reportRepo = new ReportRepository(prisma);
    this.correlationService = new IncidentCorrelationService(prisma);
  }

  async generateAndSaveReport(caseId: string): Promise<Report> {
    const caseRecord = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        inputs: { orderBy: { createdAt: 'asc' } },
        consents: { orderBy: { grantedAt: 'desc' } },
        sessions: {
          include: {
            utterances: { orderBy: { startedAtMs: 'asc' } },
          },
        },
        assessments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            evidence: true,
            entityMentions: {
              include: { intelChecks: true },
            },
            intelChecks: true,
          },
        },
      },
    });

    if (!caseRecord) {
      throw new Error(`CASE_NOT_FOUND: Case ${caseId} does not exist`);
    }

    const latestAssessment = caseRecord.assessments[0];
    const correlation = await this.correlationService.correlateCase(caseId);

    const activeConsents = caseRecord.consents.filter((c) => c.withdrawnAt === null);

    const evidenceCitations = (latestAssessment?.evidence ?? []).map((e) => ({
      id: e.id,
      quote: e.quote,
      tactic: e.tactic,
      explanation: e.explanation,
      sourceId: e.sourceId,
      startOffset: e.startOffset,
      endOffset: e.endOffset,
    }));

    const keyFindings = (latestAssessment?.entityMentions ?? []).map((em) => {
      const relatedCheck = em.intelChecks?.[0];
      return {
        id: em.id,
        type: em.type,
        maskedValue: maskValue(em.type, em.encryptedValue.includes(':') ? em.type : em.encryptedValue),
        speaker: em.speaker,
        confidence: em.confidence,
        verified: em.verified,
        intelStatus: relatedCheck ? relatedCheck.status : null,
      };
    });

    const externalIntelChecks = (latestAssessment?.intelChecks ?? []).map((ic) => ({
      id: ic.id,
      provider: ic.provider,
      status: ic.status,
      threatType: ic.threatType,
      checkedAt: ic.checkedAt.toISOString(),
      isDemo: ic.isDemo,
    }));

    const voiceHandoffLog =
      caseRecord.sessions.length > 0
        ? {
            totalSessions: caseRecord.sessions.length,
            sessions: caseRecord.sessions.map((s) => ({
              sessionId: s.id,
              state: s.state,
              startedAt: s.startedAt.toISOString(),
              endedAt: s.endedAt ? s.endedAt.toISOString() : null,
              utteranceCount: s.utterances.length,
              aiUtteranceCount: s.utterances.filter((u) => u.speaker.toLowerCase() === 'ai').length,
            })),
          }
        : undefined;

    const recommendations: string[] = [];
    if (latestAssessment?.recommendation) {
      recommendations.push(latestAssessment.recommendation);
    }
    if (correlation.isRecurring) {
      recommendations.push('ระงับการโอนเงินหรือให้ข้อมูลส่วนตัวทันที เนื่องจากตรวจพบข้อมูลที่เคยถูกรายงานว่าเป็นมิจฉาชีพ');
    }
    recommendations.push('ตรวจสอบยืนยันข้อมูลโดยตรงผ่านช่องทางทางการของหน่วยงานหรือธนาคาร');

    const limitationsAndDisclaimers = [
      'รายงานนี้เป็นเครื่องมือช่วยประเมินความเสี่ยงเบื้องต้นด้วยเทคโนโลยีปัญญาประดิษฐ์และกฎความปลอดภัย ไม่ใช่คำชี้ขาดทางกฎหมาย',
      'การไม่พบข้อมูลในฐานข้อมูลภัยคุกคาม (Not Found) ไม่ได้รับประกันว่าคู่สนทนาหรือลิงก์ดังกล่าวปลอดภัย 100%',
      'ข้อมูลส่วนบุคคลถูกปกปิด (Masked) และเข้ารหัสเพื่อคุ้มครองข้อมูลตามกฎหมาย PDPA',
    ];

    if (caseRecord.isDemo) {
      limitationsAndDisclaimers.push('สถานะข้อมูลนี้เป็นข้อมูลจำลอง (Demo Mode) สำหรับการทดสอบในงาน Hackathon เท่านั้น');
    }

    const reportContent: StructuredIncidentReport = {
      metadata: {
        reportId: '', // placeholder, will be set or referenced by Report.id
        caseId: caseRecord.id,
        version: 1, // repository calculates proper sequential version
        generatedAt: new Date().toISOString(),
        isDemo: caseRecord.isDemo,
        title: caseRecord.title,
        status: caseRecord.status,
        sourceChannels: caseRecord.inputs.map((i) => `${i.type}:${i.source}`),
      },
      summary: {
        riskScore: latestAssessment?.score ?? 0,
        riskLevel: latestAssessment?.level ?? 'low',
        executiveSummary: latestAssessment?.summary ?? 'ไม่มีข้อมูลผลการประเมิน',
        recommendations,
        isRecurringScam: correlation.isRecurring,
      },
      evidenceCitations,
      keyFindings,
      externalIntelChecks,
      ...(voiceHandoffLog !== undefined ? { voiceHandoffLog } : {}),
      recurringIncidentCorrelation: {
        isRecurring: correlation.isRecurring,
        totalCorrelatedCases: correlation.totalCorrelatedCases,
        summary: correlation.summaryMessage,
        matchedIndicators: correlation.correlatedIndicators,
      },
      consentAndProvenance: {
        hasActiveConsent: activeConsents.length > 0,
        consentsCount: activeConsents.length,
        modelVersion: latestAssessment?.modelVersion ?? 'v1.0.0-rule-engine',
        noticeVersion: activeConsents[0]?.noticeVersion ?? null,
      },
      limitationsAndDisclaimers,
    };

    return this.reportRepo.createReport({
      caseId,
      status: 'PUBLISHED',
      content: reportContent as unknown as Prisma.InputJsonValue,
    });
  }

  async getLatestReport(caseId: string): Promise<Report | null> {
    return this.reportRepo.getLatestReport(caseId);
  }

  async listReports(caseId: string): Promise<Report[]> {
    return this.reportRepo.listReports(caseId);
  }
}
