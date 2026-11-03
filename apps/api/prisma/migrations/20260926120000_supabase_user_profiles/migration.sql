DO $$
BEGIN
  IF to_regclass('public.users') IS NULL AND to_regclass('public."User"') IS NOT NULL THEN
    ALTER TABLE "User" RENAME TO "users";
  END IF;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "supabaseId" TEXT,
  ADD COLUMN IF NOT EXISTS "phoneE164" TEXT,
  ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF to_regclass('public."User_phoneE164_key"') IS NOT NULL
    AND to_regclass('public."users_phoneE164_key"') IS NULL THEN
    ALTER INDEX public."User_phoneE164_key" RENAME TO "users_phoneE164_key";
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "users_supabaseId_key" ON "users"("supabaseId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_phoneE164_key" ON "users"("phoneE164");