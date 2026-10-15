import { describe, expect, it, vi } from 'vitest';
import { computeLookupDigest } from '../crypto.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { ConsentRepository } from '../repositories/consent.repository.js';
import { ReportRepository } from '../repositories/report.repository.js';
import { DataWithdrawalService } from '../services/data-withdrawal.service.js';
import { IncidentCorrelationService } from '../services/incident-correlation.service.js';
import { ReportService } from '../services/report.service.js';

describe('Data & Reports Services and Repositories', () => {
  describe('ConsentRepository', () => {
    it('records consent and marks withdrawn', async () => {
      const mockPrisma = {
        consent: {
          create: vi.fn().mockResolvedValue({
            id: 'c-1',
            caseId: 'case-1',
            subjectId: 'user-1',
            scope: 'audio_analysis',
            noticeVersion: 'v1.0',
            grantedAt: new Date(),
            withdrawnAt: null,
          }),
          update: vi.fn().mockImplementation(({ where, data }) => ({
            id: where.id,
            withdrawnAt: data.withdrawnAt,
          })),
          count: vi.fn().mockResolvedValue(1),
        },
      } as any;

      const repo = new ConsentRepository(mockPrisma);
      const consent = await repo.recordConsent({
        caseId: 'case-1',
        subjectId: 'user-1',
        scope: 'audio_analysis',
        noticeVersion: 'v1.0',
      });

      expect(consent.id).toBe('c-1');
      expect(mockPrisma.consent.create).toHaveBeenCalled();

      const withdrawn = await repo.withdrawConsent('c-1');
      expect(withdrawn.withdrawnAt).toBeInstanceOf(Date);

      const hasConsent = await repo.hasConsent('case-1', 'audio_analysis');
      expect(hasConsent).toBe(true);
    });
  });

  describe('AuditRepository', () => {
    it('logs immutable audit event with actor, action, and metadata', async () => {
      const mockPrisma = {
        auditEvent: {
          create: vi.fn().mockResolvedValue({
            id: 'audit-1',
            actorId: 'admin-1',
            action: 'DATA_WITHDRAWAL_EXECUTED',
            caseId: 'case-1',
            metadata: { reason: 'User requested' },
            occurredAt: new Date(),
          }),
        },
      } as any;

      const repo = new AuditRepository(mockPrisma);
      const event = await repo.logEvent({
        actorId: 'admin-1',
        action: 'DATA_WITHDRAWAL_EXECUTED',
        caseId: 'case-1',
        metadata: { reason: 'User requested' },
      });

      expect(event.id).toBe('audit-1');
      expect(event.action).toBe('DATA_WITHDRAWAL_EXECUTED');
      expect(mockPrisma.auditEvent.create).toHaveBeenCalled();
    });
  });

  describe('ReportRepository', () => {
    it('automatically increments version when creating reports for same case', async () => {
      const mockPrisma = {
        report: {
          findFirst: vi.fn().mockResolvedValue({ version: 2 }),
          create: vi.fn().mockImplementation(({ data }) => ({
            ...data,
            id: data.id ?? 'rep-1',
          })),
        },
      } as any;

      const repo = new ReportRepository(mockPrisma);
      const report = await repo.createReport({
        caseId: 'case-1',
        content: { title: 'Test' },
      });

      expect(report.version).toBe(3);
    });
  });

  describe('DataWithdrawalService', () => {
    it('coordinates soft delete, consent withdrawal, shared indicator withdrawal, and audit log', async () => {
      const mockPrisma = {
        case: {
          findFirst: vi.fn().mockResolvedValue({ id: 'case-1', ownerId: 'user-1' }),
          update: vi.fn().mockResolvedValue({ id: 'case-1', status: 'DELETED' }),
        },
        consent: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        sharedIndicator: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        caseInput: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        voiceProfile: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        auditEvent: {
          create: vi.fn().mockResolvedValue({ id: 'audit-withdrawal-1' }),
        },
      } as any;

      const service = new DataWithdrawalService(mockPrisma);
      const result = await service.withdrawCase({
        caseId: 'case-1',
        actorId: 'user-1',
        maskInputs: true,
      });

      expect(result.success).toBe(true);
      expect(result.consentsWithdrawn).toBe(2);
      expect(result.indicatorsWithdrawn).toBe(1);
      expect(mockPrisma.case.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DELETED' }),
        }),
      );
      expect(mockPrisma.caseInput.updateMany).toHaveBeenCalled();
      expect(mockPrisma.auditEvent.create).toHaveBeenCalled();
    });
  });

  describe('IncidentCorrelationService', () => {
    it('detects recurring incidents across different cases and community indicators', async () => {
      const targetDigest = computeLookupDigest('bank_account', '0819984321');

      const mockPrisma = {
        entityMention: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'em-1',
              assessment: { caseId: 'case-previous-1', createdAt: new Date('2026-10-10') },
            },
            {
              id: 'em-2',
              assessment: { caseId: 'case-previous-2', createdAt: new Date('2026-10-12') },
            },
          ]),
        },
        sharedIndicator: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'si-1',
              reviewStatus: 'APPROVED',
              createdAt: new Date('2026-10-09'),
            },
          ]),
        },
      } as any;

      const service = new IncidentCorrelationService(mockPrisma);
      const result = await service.correlateIndicators(
        [{ type: 'bank_account', lookupDigest: targetDigest, rawValue: '081-998-4321' }],
        'current-case-id',
      );

      expect(result.isRecurring).toBe(true);
      expect(result.totalCorrelatedCases).toBe(2);
      expect(result.correlatedIndicators).toHaveLength(1);
      expect(result.correlatedIndicators[0]?.isCommunityApproved).toBe(true);
      expect(result.correlatedIndicators[0]?.distinctCasesCount).toBe(2);
    });
  });

  describe('ReportService', () => {
    it('compiles full incident report with evidence, intel, handoff logs, and disclaimers', async () => {
      const mockPrisma = {
        case: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'case-100',
            title: 'สายโทรศัพท์ตำรวจปลอม',
            status: 'COMPLETED',
            isDemo: true,
            inputs: [{ type: 'AUDIO', source: 'web_call', createdAt: new Date() }],
            consents: [{ withdrawnAt: null, noticeVersion: 'v1.0', grantedAt: new Date() }],
            sessions: [
              {
                id: 'sess-1',
                state: 'ENDED',
                startedAt: new Date(),
                endedAt: new Date(),
                utterances: [{ id: 'u-1', speaker: 'caller' }, { id: 'u-2', speaker: 'ai' }],
              },
            ],
            assessments: [
              {
                id: 'ass-1',
                score: 95,
                level: 'critical',
                summary: 'พบการข่มขู่โอนเงิน',
                recommendation: 'ห้ามโอนเงิน',
                modelVersion: 'v1.4',
                evidence: [
                  {
                    id: 'ev-1',
                    quote: 'โอนเงินมาเดี๋ยวนี้',
                    tactic: 'urgency_coercion',
                    explanation: 'บีบบังคับเวลา',
                    sourceId: 'u-1',
                    startOffset: 0,
                    endOffset: 15,
                  },
                ],
                entityMentions: [
                  {
                    id: 'em-1',
                    type: 'bank_account',
                    encryptedValue: '0819984321',
                    lookupDigest: 'dig-1',
                    speaker: 'caller',
                    confidence: 0.99,
                    verified: true,
                    intelChecks: [{ id: 'ic-1', status: 'match' }],
                  },
                ],
                intelChecks: [
                  {
                    id: 'ic-1',
                    provider: 'AOC 1441',
                    status: 'match',
                    threatType: 'Mule Account',
                    checkedAt: new Date(),
                    isDemo: true,
                  },
                ],
              },
            ],
          }),
        },
        assessment: {
          findFirst: vi.fn().mockResolvedValue({
            entityMentions: [{ type: 'bank_account', lookupDigest: 'dig-1' }],
          }),
        },
        entityMention: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        sharedIndicator: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        report: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) => ({
            ...data,
            id: data.id ?? 'rep-new',
            version: data.version ?? 1,
          })),
        },
      } as any;

      const reportService = new ReportService(mockPrisma);
      const report = await reportService.generateAndSaveReport('case-100');

      expect(report.id).toBe('rep-new');
      expect(report.version).toBe(1);
      const content = report.content as any;
      expect(content.summary.riskScore).toBe(95);
      expect(content.evidenceCitations).toHaveLength(1);
      expect(content.voiceHandoffLog?.totalSessions).toBe(1);
      expect(content.voiceHandoffLog?.sessions[0]?.aiUtteranceCount).toBe(1);
      expect(content.limitationsAndDisclaimers.length).toBeGreaterThan(0);
    });
  });
});
