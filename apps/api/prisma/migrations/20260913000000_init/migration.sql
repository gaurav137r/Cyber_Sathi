-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'PROCESSING', 'CLASSIFIED', 'REVIEWED', 'FILED', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('AUDIO', 'IMAGE', 'SCREENSHOT', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('INTERNAL', 'PUBLIC_REDACTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "category" TEXT,
    "categoryConfidence" DOUBLE PRECISION,
    "detectedLanguage" TEXT,
    "rawTranscript" TEXT,
    "structuredFields" JSONB,
    "filingDestination" TEXT,
    "trackingNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "extractedText" TEXT,
    "extractedEntities" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_versions" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "content" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cases_userId_createdAt_idx" ON "cases"("userId", "createdAt");
CREATE INDEX "cases_status_idx" ON "cases"("status");
CREATE INDEX "evidence_items_caseId_idx" ON "evidence_items"("caseId");
CREATE UNIQUE INDEX "report_versions_caseId_version_kind_key" ON "report_versions"("caseId", "version", "kind");
CREATE INDEX "report_versions_caseId_idx" ON "report_versions"("caseId");
CREATE INDEX "audit_log_entries_caseId_timestamp_idx" ON "audit_log_entries"("caseId", "timestamp");
CREATE INDEX "audit_log_entries_actorUserId_timestamp_idx" ON "audit_log_entries"("actorUserId", "timestamp");

ALTER TABLE "cases" ADD CONSTRAINT "cases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stage-4 stub actor so case APIs can run before real auth.
INSERT INTO "users" ("id", "displayName", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'Stub Test User', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
