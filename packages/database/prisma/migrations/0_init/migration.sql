-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'READY', 'ANALYZING', 'COMPLETED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('TEXT', 'URL', 'AUDIO');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('HUMAN_ACTIVE', 'PREPARING_AI', 'AI_ACTIVE', 'STOPPING_AI', 'WAITING_FOR_USER', 'ENDED');

-- CreateEnum
CREATE TYPE "TranscriptState" AS ENUM ('PARTIAL', 'COMMITTED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PRIVATE', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseInput" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "InputType" NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'HUMAN_ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utterance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "inputId" TEXT,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "transcriptState" "TranscriptState" NOT NULL,
    "startedAtMs" INTEGER NOT NULL,
    "endedAtMs" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Utterance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "tactic" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityMention" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "utteranceId" TEXT,
    "type" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "lookupDigest" TEXT,
    "sourceId" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EntityMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelCheck" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "entityMentionId" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "threatType" TEXT,
    "responseSummary" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "IntelCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedIndicator" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "lookupDigest" TEXT NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PRIVATE',
    "approvedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "consentScope" TEXT NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Case_ownerId_createdAt_idx" ON "Case"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseInput_caseId_createdAt_idx" ON "CaseInput"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Consent_caseId_scope_idx" ON "Consent"("caseId", "scope");

-- CreateIndex
CREATE INDEX "Session_caseId_startedAt_idx" ON "Session"("caseId", "startedAt");

-- CreateIndex
CREATE INDEX "Utterance_sessionId_createdAt_idx" ON "Utterance"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Assessment_caseId_createdAt_idx" ON "Assessment"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Evidence_assessmentId_idx" ON "Evidence"("assessmentId");

-- CreateIndex
CREATE INDEX "EntityMention_assessmentId_type_idx" ON "EntityMention"("assessmentId", "type");

-- CreateIndex
CREATE INDEX "EntityMention_lookupDigest_idx" ON "EntityMention"("lookupDigest");

-- CreateIndex
CREATE INDEX "IntelCheck_assessmentId_checkedAt_idx" ON "IntelCheck"("assessmentId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_caseId_version_key" ON "Report"("caseId", "version");

-- CreateIndex
CREATE INDEX "SharedIndicator_lookupDigest_reviewStatus_idx" ON "SharedIndicator"("lookupDigest", "reviewStatus");

-- CreateIndex
CREATE INDEX "AuditEvent_caseId_occurredAt_idx" ON "AuditEvent"("caseId", "occurredAt");

-- CreateIndex
CREATE INDEX "VoiceProfile_ownerId_idx" ON "VoiceProfile"("ownerId");

-- AddForeignKey
ALTER TABLE "CaseInput" ADD CONSTRAINT "CaseInput_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Utterance" ADD CONSTRAINT "Utterance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Utterance" ADD CONSTRAINT "Utterance_inputId_fkey" FOREIGN KEY ("inputId") REFERENCES "CaseInput"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMention" ADD CONSTRAINT "EntityMention_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMention" ADD CONSTRAINT "EntityMention_utteranceId_fkey" FOREIGN KEY ("utteranceId") REFERENCES "Utterance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelCheck" ADD CONSTRAINT "IntelCheck_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelCheck" ADD CONSTRAINT "IntelCheck_entityMentionId_fkey" FOREIGN KEY ("entityMentionId") REFERENCES "EntityMention"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedIndicator" ADD CONSTRAINT "SharedIndicator_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
