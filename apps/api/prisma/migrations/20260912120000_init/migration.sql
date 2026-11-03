-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportVersion" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" UUID NOT NULL,
    "caseId" UUID,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Case_userId_idx" ON "Case"("userId");
CREATE INDEX "Case_status_idx" ON "Case"("status");
CREATE UNIQUE INDEX "EvidenceItem_objectKey_key" ON "EvidenceItem"("objectKey");
CREATE INDEX "EvidenceItem_caseId_idx" ON "EvidenceItem"("caseId");
CREATE INDEX "ReportVersion_caseId_idx" ON "ReportVersion"("caseId");
CREATE UNIQUE INDEX "ReportVersion_caseId_version_key" ON "ReportVersion"("caseId", "version");
CREATE INDEX "AuditLogEntry_caseId_idx" ON "AuditLogEntry"("caseId");
CREATE INDEX "AuditLogEntry_action_idx" ON "AuditLogEntry"("action");
CREATE INDEX "AuditLogEntry_createdAt_idx" ON "AuditLogEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;