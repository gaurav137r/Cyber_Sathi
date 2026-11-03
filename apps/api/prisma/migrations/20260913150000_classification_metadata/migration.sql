ALTER TABLE "Case" ADD COLUMN "classificationExplanation" TEXT;
ALTER TABLE "Case" ADD COLUMN "clarificationRequired" BOOLEAN NOT NULL DEFAULT false;