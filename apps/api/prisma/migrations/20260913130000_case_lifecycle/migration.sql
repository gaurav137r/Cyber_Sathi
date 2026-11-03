CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'PROCESSING', 'CLASSIFIED', 'REVIEWED', 'FILED', 'RESOLVED', 'ARCHIVED');
CREATE TYPE "EvidenceType" AS ENUM ('AUDIO', 'IMAGE', 'SCREENSHOT', 'DOCUMENT');
CREATE TYPE "ReportVersionKind" AS ENUM ('INTERNAL', 'PUBLIC_REDACTED');

ALTER TABLE "Case" ADD COLUMN "categoryConfidence" DOUBLE PRECISION;
ALTER TABLE "Case" ADD COLUMN "detectedLanguage" TEXT;
ALTER TABLE "Case" ADD COLUMN "rawTranscript" TEXT;
ALTER TABLE "Case" ADD COLUMN "structuredFields" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "Case" ADD COLUMN "filingDestination" TEXT;
ALTER TABLE "Case" ADD COLUMN "trackingNumber" TEXT;
ALTER TABLE "Case" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Case" ALTER COLUMN "status" TYPE "CaseStatus" USING upper("status")::"CaseStatus";
ALTER TABLE "Case" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "Case" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "EvidenceItem" ADD COLUMN "type" "EvidenceType" NOT NULL DEFAULT 'SCREENSHOT';
ALTER TABLE "EvidenceItem" ADD COLUMN "extractedText" TEXT;
ALTER TABLE "EvidenceItem" ADD COLUMN "extractedEntities" JSONB;
ALTER TABLE "EvidenceItem" RENAME COLUMN "objectKey" TO "storageKey";
ALTER TABLE "EvidenceItem" RENAME COLUMN "createdAt" TO "uploadedAt";
ALTER TABLE "EvidenceItem" DROP COLUMN "contentType";
ALTER TABLE "EvidenceItem" DROP COLUMN "sizeBytes";
ALTER TABLE "EvidenceItem" ALTER COLUMN "type" DROP DEFAULT;

ALTER TABLE "ReportVersion" ADD COLUMN "kind" "ReportVersionKind" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "ReportVersion" RENAME COLUMN "payload" TO "content";
ALTER TABLE "ReportVersion" RENAME COLUMN "createdAt" TO "generatedAt";
ALTER TABLE "ReportVersion" ALTER COLUMN "kind" DROP DEFAULT;

ALTER TABLE "AuditLogEntry" DROP CONSTRAINT IF EXISTS "AuditLogEntry_userId_fkey";
ALTER TABLE "AuditLogEntry" DROP CONSTRAINT IF EXISTS "AuditLogEntry_caseId_fkey";
ALTER TABLE "AuditLogEntry" RENAME COLUMN "userId" TO "actorUserId";
ALTER TABLE "AuditLogEntry" RENAME COLUMN "createdAt" TO "timestamp";
ALTER TABLE "AuditLogEntry" DROP COLUMN "requestId";
ALTER TABLE "AuditLogEntry" ALTER COLUMN "caseId" SET NOT NULL;
ALTER TABLE "AuditLogEntry" ALTER COLUMN "actorUserId" SET NOT NULL;

DROP INDEX IF EXISTS "AuditLogEntry_createdAt_idx";
CREATE INDEX "AuditLogEntry_timestamp_idx" ON "AuditLogEntry"("timestamp");
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;