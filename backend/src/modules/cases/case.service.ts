import { randomUUID } from 'node:crypto';
import type { AnalysisProvider } from '@scamtrap/analysis-core';
import type {
  AddCaseInputRequest,
  CaseInput,
  CreateCaseRequest,
  IncidentReport,
  ShareProposal,
} from '@scamtrap/contracts';
import { incidentReportSchema } from '@scamtrap/contracts';
import {
  AuditRepository,
  ConsentRepository,
  DataWithdrawalService,
  decryptValue,
  IncidentCorrelationService,
  maskValue,
  type Prisma,
  type PrismaClient,
  ReportRepository,
  SharedIndicatorRepository,
} from '@scamtrap/database';
import {
  appendInput,
  type CaseRepository,
  type StoredCase,
} from './case.repository.js';

export class CaseService {
  private readonly shareProposals = new Map<string, ShareProposal>();
  private readonly reportRepository?: ReportRepository;
  private readonly consentRepository?: ConsentRepository;
  private readonly sharedIndicatorRepository?: SharedIndicatorRepository;
  private readonly auditRepository?: AuditRepository;
  private readonly withdrawalService?: DataWithdrawalService;
  private readonly correlationService?: IncidentCorrelationService;

  constructor(
    private readonly repository: CaseRepository,
    private readonly analysisProvider: AnalysisProvider,
    database?: PrismaClient,
  ) {
    if (database) {
      this.reportRepository = new ReportRepository(database);
      this.consentRepository = new ConsentRepository(database);
      this.sharedIndicatorRepository = new SharedIndicatorRepository(database);
      this.auditRepository = new AuditRepository(database);
      this.withdrawalService = new DataWithdrawalService(database);
      this.correlationService = new IncidentCorrelationService(database);
    }
  }

  async create(ownerId: string, request: CreateCaseRequest) {
    const now = new Date().toISOString();
    return this.repository.create({
      id: randomUUID(),
      ownerId,
      title: request.title,
      status: 'draft',
      isDemo: request.isDemo,
      inputs: [],
      latestAnalysis: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  get(id: string) {
    return this.repository.findById(id);
  }

  list(ownerId: string) {
    return this.repository.listByOwner(ownerId);
  }

  async addInput(record: StoredCase, request: AddCaseInputRequest) {
    const input: CaseInput = {
      id: randomUUID(),
      type: request.type,
      content: request.content,
      source: request.source,
      createdAt: new Date().toISOString(),
    };

    return this.repository.save(appendInput(record, input));
  }

  async analyze(record: StoredCase) {
    // Audio inputs contain the committed transcript, not the original binary file.
    // They therefore follow the same analysis path as text and URL submissions.
    const analyzableInputs = record.inputs;
    if (analyzableInputs.length === 0) {
      throw new Error('CASE_HAS_NO_ANALYZABLE_INPUT');
    }

    await this.repository.save({
      ...record,
      status: 'analyzing',
      updatedAt: new Date().toISOString(),
    });

    const combinedText = analyzableInputs
      .map((input) => {
        if (!input.source.startsWith('live_session:')) return input.content;

        // A live-call report evaluates the suspected caller. Keeping user/decoy lines in the
        // stored input preserves the full audit trail, but sending them to the risk analyzer
        // would incorrectly attribute defensive prompts or repeated OTP warnings to the caller.
        return input.content
          .split(/\r?\n/u)
          .filter((line) => /^\[caller\]\s+/iu.test(line))
          .join('\n');
      })
      .filter((content) => content.trim().length > 0)
      .join('\n');
    const result = await this.analysisProvider.analyzeText({
      sourceId: analyzableInputs[0]!.id,
      text: combinedText,
      isDemo: record.isDemo,
    });

    return this.repository.save({
      ...record,
      status: 'completed',
      latestAnalysis: result,
      updatedAt: new Date().toISOString(),
    });
  }

  buildReport(record: StoredCase, version = 1): IncidentReport {
    if (!record.latestAnalysis) {
      return {
        caseId: record.id,
        version,
        generatedAt: new Date().toISOString(),
        isDemo: record.isDemo,
        summary: 'Case is currently compiling evidentiary records or in early session initialization. No definitive threats confirmed yet.',
        recommendation: 'If further dialogue or telemetry is captured, trigger "Re-Analyze" to synthesize conclusions and evaluate indicators in detail.',
        inputs: record.inputs.map((input) => ({ ...input })),
        evidence: [],
        entities: [],
        threatChecks: [],
        limitations: [
          'This evidentiary docket is awaiting in-depth heuristic model synthesis.',
          ...(record.isDemo ? ['This record represents simulated demonstration telemetry and will not populate production threat registries.'] : []),
        ],
      };
    }
    const analysis = record.latestAnalysis;
    const sensitiveTypes = new Set([
      'phone',
      'bank_account',
      'account_holder',
      'line_id',
      'email',
      'otp',
    ]);
    const sensitiveEntities = analysis.entities.filter((entity) => sensitiveTypes.has(entity.type));
    const maskText = (text: string) => {
      let masked = text;
      for (const entity of sensitiveEntities) {
        const replacement = entity.type === 'otp' ? '[REDACTED_SECRET]' : maskValue(entity.type, entity.value);
        if (entity.value) masked = masked.replaceAll(entity.value, replacement);
        if (entity.normalizedValue && entity.normalizedValue !== entity.value) {
          masked = masked.replaceAll(entity.normalizedValue, replacement);
        }
      }
      return masked.replace(
        /((?:otp|pin|รหัสผ่าน|รหัสยืนยัน)\s*[:：]?\s*)\d{4,8}/giu,
        '$1[REDACTED_SECRET]',
      );
    };
    return {
      caseId: record.id,
      version,
      generatedAt: new Date().toISOString(),
      isDemo: record.isDemo,
      summary: analysis.summary,
      recommendation: analysis.recommendation,
      inputs: record.inputs.map((input) => ({ ...input, content: maskText(input.content) })),
      evidence: analysis.evidence.map((evidence) => ({
        ...evidence,
        quote: maskText(evidence.quote),
      })),
      entities: analysis.entities.map((entity) => ({
        ...entity,
        ...(sensitiveTypes.has(entity.type)
          ? {
              value: entity.type === 'otp' ? '[REDACTED_SECRET]' : maskValue(entity.type, entity.value),
              normalizedValue:
                entity.type === 'otp'
                  ? '[REDACTED_SECRET]'
                  : maskValue(entity.type, entity.normalizedValue),
            }
          : {}),
      })),
      threatChecks: analysis.threatChecks,
      limitations: [
        ...analysis.limitations,
        ...(record.isDemo ? ['This record represents simulated demonstration telemetry and will not populate production threat registries.'] : []),
      ],
    };
  }

  async getOrCreateReport(record: StoredCase): Promise<IncidentReport> {
    if (!record.latestAnalysis && record.inputs.length > 0) {
      record = await this.analyze(record);
    }
    if (this.reportRepository) {
      const latest = await this.reportRepository.getLatestReport(record.id);
      if (latest) {
        const parsed = incidentReportSchema.safeParse(latest.content);
        const latestAnalysisAt = record.latestAnalysis?.createdAt;
        if (
          parsed.success &&
          (!latestAnalysisAt || latest.createdAt.getTime() >= Date.parse(latestAnalysisAt))
        ) {
          return parsed.data;
        }
      }
    }
    return this.generateReport(record);
  }

  async generateReport(record: StoredCase): Promise<IncidentReport> {
    const latest = this.reportRepository
      ? await this.reportRepository.getLatestReport(record.id)
      : null;
    const report = this.buildReport(record, (latest?.version ?? 0) + 1);
    if (this.reportRepository) {
      await this.reportRepository.createReport({
        caseId: record.id,
        version: report.version,
        status: 'PUBLISHED',
        content: report as unknown as Prisma.InputJsonValue,
      });
      await this.auditRepository?.logEvent({
        actorId: record.ownerId,
        caseId: record.id,
        action: 'REPORT_GENERATED',
        metadata: { version: report.version },
      });
    }
    return report;
  }

  async proposeShare(record: StoredCase, indicatorIds: string[]): Promise<ShareProposal> {
    const availableIds = new Set(record.latestAnalysis?.entities.map((entity) => entity.id) ?? []);
    if (indicatorIds.some((id) => !availableIds.has(id))) {
      throw new Error('INVALID_SHARE_INDICATOR');
    }
    let persistedIds = indicatorIds;
    if (
      this.sharedIndicatorRepository &&
      this.consentRepository &&
      !record.isDemo &&
      !record.latestAnalysis?.isDemo
    ) {
      const entities = new Map(
        (record.latestAnalysis?.entities ?? []).map((entity) => [entity.id, entity]),
      );
      await this.consentRepository.recordConsent({
        caseId: record.id,
        subjectId: record.ownerId,
        scope: 'community_share',
        noticeVersion: '2026-10-15',
      });
      const saved = await Promise.all(
        indicatorIds.map((id) => {
          const entity = entities.get(id)!;
          return this.sharedIndicatorRepository!.proposeShare({
            caseId: record.id,
            type: entity.type,
            rawValue: entity.normalizedValue || entity.value,
          });
        }),
      );
      persistedIds = saved.map((item) => item.id);
      await this.auditRepository?.logEvent({
        actorId: record.ownerId,
        caseId: record.id,
        action: 'COMMUNITY_SHARE_PROPOSED',
        metadata: { indicatorIds: persistedIds, sourceEntityIds: indicatorIds },
      });
    }
    const proposal: ShareProposal = {
      id: persistedIds[0] ?? randomUUID(),
      caseId: record.id,
      indicatorIds: persistedIds,
      status: 'pending',
      isDemo: record.isDemo,
      createdAt: new Date().toISOString(),
    };
    this.shareProposals.set(proposal.id, proposal);
    return proposal;
  }

  async recordConsent(record: StoredCase, scope: string, noticeVersion: string) {
    if (!this.consentRepository) throw new Error('PERSISTENCE_REQUIRED');
    const consent = await this.consentRepository.recordConsent({
      caseId: record.id,
      subjectId: record.ownerId,
      scope,
      noticeVersion,
    });
    await this.auditRepository?.logEvent({
      actorId: record.ownerId,
      caseId: record.id,
      action: 'CONSENT_GRANTED',
      metadata: { consentId: consent.id, scope, noticeVersion },
    });
    return this.toConsentRecord(consent);
  }

  async listConsents(record: StoredCase) {
    if (!this.consentRepository) return [];
    return (await this.consentRepository.listConsents(record.id)).map((item) =>
      this.toConsentRecord(item),
    );
  }

  async withdrawConsent(record: StoredCase, consentId: string) {
    if (!this.consentRepository) throw new Error('PERSISTENCE_REQUIRED');
    const consents = await this.consentRepository.listConsents(record.id);
    const target = consents.find((item) => item.id === consentId);
    if (!target) throw new Error('CONSENT_NOT_FOUND');
    const withdrawn = await this.consentRepository.withdrawConsent(consentId);
    await this.auditRepository?.logEvent({
      actorId: record.ownerId,
      caseId: record.id,
      action: 'CONSENT_WITHDRAWN',
      metadata: { consentId, scope: target.scope },
    });
    return this.toConsentRecord(withdrawn);
  }

  async correlate(record: StoredCase) {
    if (!this.correlationService) {
      return {
        targetCaseId: record.id,
        isRecurring: false,
        totalCorrelatedCases: 0,
        correlatedIndicators: [],
        summaryMessage: 'Correlation requires PostgreSQL persistence',
        analyzedAt: new Date().toISOString(),
      };
    }
    const result = await this.correlationService.correlateCase(record.id);
    await this.auditRepository?.logEvent({
      actorId: record.ownerId,
      caseId: record.id,
      action: 'INCIDENT_CORRELATION_RUN',
      metadata: {
        isRecurring: result.isRecurring,
        totalCorrelatedCases: result.totalCorrelatedCases,
      },
    });
    return result;
  }

  async listAudit(record: StoredCase) {
    if (!this.auditRepository) return [];
    const events = await this.auditRepository.queryAuditTrail({ caseId: record.id });
    return events.map((event) => ({
      id: event.id,
      actorId: event.actorId,
      action: event.action,
      metadata: event.metadata,
      occurredAt: event.occurredAt.toISOString(),
    }));
  }

  async listReviewQueue() {
    if (!this.sharedIndicatorRepository) throw new Error('PERSISTENCE_REQUIRED');
    return Promise.all(
      (await this.sharedIndicatorRepository.listForReview()).map((item) =>
        this.toReviewIndicator(item),
      ),
    );
  }

  async reviewIndicator(id: string, status: 'approved' | 'rejected', actorId: string) {
    if (!this.sharedIndicatorRepository) throw new Error('PERSISTENCE_REQUIRED');
    const existing = await this.sharedIndicatorRepository.findById(id);
    if (!existing || existing.withdrawnAt) throw new Error('INDICATOR_NOT_FOUND');
    const updated = await this.sharedIndicatorRepository.reviewIndicator(
      id,
      status === 'approved' ? 'APPROVED' : 'REJECTED',
    );
    await this.auditRepository?.logEvent({
      actorId,
      caseId: updated.caseId,
      action: status === 'approved' ? 'INDICATOR_APPROVED' : 'INDICATOR_REJECTED',
      metadata: { indicatorId: id, type: updated.type },
    });
    return this.toReviewIndicator(updated);
  }

  private toConsentRecord(consent: {
    id: string;
    caseId: string;
    subjectId: string;
    scope: string;
    noticeVersion: string;
    grantedAt: Date;
    withdrawnAt: Date | null;
  }) {
    return {
      ...consent,
      grantedAt: consent.grantedAt.toISOString(),
      withdrawnAt: consent.withdrawnAt?.toISOString() ?? null,
    };
  }

  private toReviewIndicator(item: {
    id: string;
    caseId: string;
    type: string;
    encryptedValue: string;
    reviewStatus: string;
    createdAt: Date;
    approvedAt: Date | null;
    withdrawnAt: Date | null;
  }) {
    return {
      id: item.id,
      caseId: item.caseId,
      type: item.type,
      maskedValue: maskValue(item.type, decryptValue(item.encryptedValue)),
      status: item.reviewStatus.toLowerCase(),
      createdAt: item.createdAt.toISOString(),
      approvedAt: item.approvedAt?.toISOString() ?? null,
      withdrawnAt: item.withdrawnAt?.toISOString() ?? null,
    };
  }

  async delete(
    record: StoredCase,
    actorId = record.ownerId,
    reason?: string,
    maskInputs = true,
  ) {
    if (this.withdrawalService) {
      return this.withdrawalService.withdrawCase({
        caseId: record.id,
        actorId,
        ...(reason ? { reason } : {}),
        maskInputs,
      });
      return;
    }
    await this.repository.delete(record.id);
    for (const [id, proposal] of this.shareProposals) {
      if (proposal.caseId === record.id) this.shareProposals.delete(id);
    }
    return {
      caseId: record.id,
      success: true,
      withdrawnAt: new Date().toISOString(),
      consentsWithdrawn: 0,
      indicatorsWithdrawn: 0,
      auditEventId: '',
    };
  }
}
