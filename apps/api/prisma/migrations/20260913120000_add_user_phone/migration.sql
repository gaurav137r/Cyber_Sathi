ALTER TABLE "User" ADD COLUMN "phoneE164" TEXT;

-- Preserve existing Stage 2 smoke-test users without inventing a real phone number.
UPDATE "User"
SET "phoneE164" = '+910000000' || substr(replace("id"::text, '-', ''), 1, 3)
WHERE "phoneE164" IS NULL;

ALTER TABLE "User" ALTER COLUMN "phoneE164" SET NOT NULL;
CREATE UNIQUE INDEX "User_phoneE164_key" ON "User"("phoneE164");