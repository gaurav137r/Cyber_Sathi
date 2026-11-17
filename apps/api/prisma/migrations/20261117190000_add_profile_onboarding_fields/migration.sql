-- Add onboarding tracking columns to `profiles`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'onboardingcompleted'
  ) THEN
    ALTER TABLE "profiles" ADD COLUMN "onboardingcompleted" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'onboardingstep'
  ) THEN
    ALTER TABLE "profiles" ADD COLUMN "onboardingstep" TEXT;
  END IF;
END $$;
