import type { PrismaClient } from '@prisma/client';
import { AuditRepository } from '../repositories/audit.repository.js';
import { CaseRepository } from '../repositories/case.repository.js';
import { ConsentRepository } from '../repositories/consent.repository.js';
import { SharedIndicatorRepository } from '../repositories/shared-indicator.repository.js';

export interface WithdrawCaseDataParams {
  caseId: string;
  actorId: string;
  reason?: string;
  maskInputs?: boolean;
}

export interface WithdrawalResult {
  caseId: string;
  success: boolean;
  withdrawnAt: string;
  consentsWithdrawn: number;
  indicatorsWithdrawn: number;
  auditEventId: string;
}

export class DataWithdrawalService {
  private readonly caseRepo: CaseRepository;
  private readonly consentRepo: ConsentRepository;
  private readonly sharedIndicatorRepo: SharedIndicatorRepository;
  private readonly auditRepo: AuditRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.caseRepo = new CaseRepository(prisma);
    this.consentRepo = new ConsentRepository(prisma);
    this.sharedIndicatorRepo = new SharedIndicatorRepository(prisma);
    this.auditRepo = new AuditRepository(prisma);
  }

  async withdrawCase(params: WithdrawCaseDataParams): Promise<WithdrawalResult> {
    const now = new Date();
    const caseRecord = await this.caseRepo.findById(params.caseId, { includeDeleted: true });

    if (!caseRecord) {
      throw new Error(`CASE_NOT_FOUND: Case ${params.caseId} does not exist`);
    }

    // 1. Soft-delete the case record
    await this.caseRepo.softDelete(params.caseId);

    // 2. Withdraw all consents associated with this case
    const consentsWithdrawn = await this.consentRepo.withdrawAllByCaseId(params.caseId, now);

    // 3. Withdraw all shared community threat indicators
    const indicatorsWithdrawn = await this.sharedIndicatorRepo.withdrawAllByCaseId(params.caseId, now);

    // 4. Optionally mask inputs if user requested content redaction
    if (params.maskInputs) {
      await this.prisma.caseInput.updateMany({
        where: { caseId: params.caseId },
        data: {
          content: '[WITHDRAWN_BY_USER_REQUEST]',
        },
      });
    }

    // 5. Revoke voice profiles if owner matches
    await this.prisma.voiceProfile.updateMany({
      where: {
        ownerId: caseRecord.ownerId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    // 6. Log immutable audit trail event
    const auditEvent = await this.auditRepo.logEvent({
      actorId: params.actorId,
      caseId: params.caseId,
      action: 'DATA_WITHDRAWAL_EXECUTED',
      metadata: {
        reason: params.reason ?? 'User requested consent revocation and data withdrawal',
        consentsWithdrawn,
        indicatorsWithdrawn,
        maskedInputs: params.maskInputs ?? false,
      },
      occurredAt: now,
    });

    return {
      caseId: params.caseId,
      success: true,
      withdrawnAt: now.toISOString(),
      consentsWithdrawn,
      indicatorsWithdrawn,
      auditEventId: auditEvent.id,
    };
  }

  async hardPurgeCase(caseId: string, actorId: string, reason?: string): Promise<{ success: boolean; auditEventId: string }> {
    const now = new Date();
    const caseRecord = await this.caseRepo.findById(caseId, { includeDeleted: true });

    if (!caseRecord) {
      throw new Error(`CASE_NOT_FOUND: Case ${caseId} does not exist`);
    }

    // Log the hard purge action BEFORE deleting
    const auditEvent = await this.auditRepo.logEvent({
      actorId,
      caseId: null, // disassociate from foreign key before deletion
      action: 'DATA_HARD_PURGE_EXECUTED',
      metadata: {
        purgedCaseId: caseId,
        ownerId: caseRecord.ownerId,
        reason: reason ?? 'User requested permanent GDPR/PDPA erasure',
        occurredAt: now.toISOString(),
      },
      occurredAt: now,
    });

    // Cascade hard delete
    await this.caseRepo.hardDelete(caseId);

    return {
      success: true,
      auditEventId: auditEvent.id,
    };
  }
}
