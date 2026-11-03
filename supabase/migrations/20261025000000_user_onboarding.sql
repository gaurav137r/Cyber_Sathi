-- ==============================================================================
-- CyberSathi Database Migration: User Onboarding & Core Schema for Supabase
-- Target: PostgreSQL 16 (Supabase)
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create Enums if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CaseStatus') THEN
    CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'PROCESSING', 'CLASSIFIED', 'REVIEWED', 'FILED', 'RESOLVED', 'ARCHIVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EvidenceType') THEN
    CREATE TYPE "EvidenceType" AS ENUM ('AUDIO', 'IMAGE', 'SCREENSHOT', 'DOCUMENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportKind') THEN
    CREATE TYPE "ReportKind" AS ENUM ('INTERNAL', 'PUBLIC_REDACTED');
  END IF;
END $$;

-- 2. Create Users Table (Stores user login & onboarding information)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supabaseId" TEXT UNIQUE,
  email TEXT UNIQUE,
  "phoneE164" TEXT UNIQUE,
  "displayName" TEXT,
  "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
  state TEXT,
  district TEXT,
  "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
  "onboardingStep" TEXT NOT NULL DEFAULT 'language',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist if table was already created earlier
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "supabaseId" TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS "phoneE164" TEXT,
  ADD COLUMN IF NOT EXISTS "displayName" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "onboardingStep" TEXT NOT NULL DEFAULT 'language',
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "users_supabaseId_key" ON public.users("supabaseId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON public.users(email);
CREATE UNIQUE INDEX IF NOT EXISTS "users_phoneE164_key" ON public.users("phoneE164");

-- 3. Cases Table
CREATE TABLE IF NOT EXISTS public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status "CaseStatus" NOT NULL DEFAULT 'DRAFT',
  category TEXT,
  "categoryConfidence" DOUBLE PRECISION,
  "classificationExplanation" TEXT,
  "clarificationRequired" BOOLEAN NOT NULL DEFAULT false,
  "detectedLanguage" TEXT,
  "rawTranscript" TEXT,
  "canonicalTranscript" TEXT,
  "structuredFields" JSONB DEFAULT '{}'::jsonb,
  "canonicalEntities" JSONB DEFAULT '{}'::jsonb,
  "filingDestination" TEXT,
  "trackingNumber" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cases_userId_createdAt_idx" ON public.cases("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "cases_status_idx" ON public.cases(status);

-- 4. Evidence Items Table
CREATE TABLE IF NOT EXISTS public.evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId" UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  type "EvidenceType" NOT NULL,
  "storageKey" TEXT NOT NULL,
  "extractedText" TEXT,
  "extractedEntities" JSONB,
  "uploadedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "evidence_items_caseId_idx" ON public.evidence_items("caseId");

-- 5. Report Versions Table
CREATE TABLE IF NOT EXISTS public.report_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId" UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  kind "ReportKind" NOT NULL,
  content JSONB NOT NULL,
  "generatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "report_versions_unique_case_version_kind" UNIQUE ("caseId", version, kind)
);

CREATE INDEX IF NOT EXISTS "report_versions_caseId_idx" ON public.report_versions("caseId");

-- 6. Audit Log Entries Table
CREATE TABLE IF NOT EXISTS public.audit_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId" UUID NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  "actorUserId" UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_log_entries_caseId_timestamp_idx" ON public.audit_log_entries("caseId", timestamp);
CREATE INDEX IF NOT EXISTS "audit_log_entries_actorUserId_timestamp_idx" ON public.audit_log_entries("actorUserId", timestamp);

-- 7. Supabase Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log_entries ENABLE ROW LEVEL SECURITY;

-- User RLS Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id OR auth.uid()::text = "supabaseId");

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id OR auth.uid()::text = "supabaseId");

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id OR auth.uid()::text = "supabaseId");

DROP POLICY IF EXISTS "Service role full access on users" ON public.users;
CREATE POLICY "Service role full access on users"
  ON public.users FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Cases RLS Policies
DROP POLICY IF EXISTS "Users can view own cases" ON public.cases;
CREATE POLICY "Users can view own cases"
  ON public.cases FOR SELECT
  USING (
    "userId" IN (
      SELECT u.id FROM public.users u
      WHERE u.id = auth.uid() OR u."supabaseId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can insert own cases" ON public.cases;
CREATE POLICY "Users can insert own cases"
  ON public.cases FOR INSERT
  WITH CHECK (
    "userId" IN (
      SELECT u.id FROM public.users u
      WHERE u.id = auth.uid() OR u."supabaseId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can update own cases" ON public.cases;
CREATE POLICY "Users can update own cases"
  ON public.cases FOR UPDATE
  USING (
    "userId" IN (
      SELECT u.id FROM public.users u
      WHERE u.id = auth.uid() OR u."supabaseId" = auth.uid()::text
    )
  );

-- 8. Automated Trigger: When a user signs up via Supabase Auth, create a public.users profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_phone TEXT;
  v_email TEXT;
  v_name TEXT;
  v_lang TEXT;
BEGIN
  v_email := NULLIF(TRIM(new.email), '');
  v_phone := NULLIF(TRIM(new.phone), '');
  v_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'displayName',
    new.raw_user_meta_data->>'name',
    SPLIT_PART(v_email, '@', 1)
  );
  v_lang := COALESCE(new.raw_user_meta_data->>'preferredLanguage', 'en');

  INSERT INTO public.users (
    id,
    "supabaseId",
    email,
    "phoneE164",
    "displayName",
    "preferredLanguage",
    "onboardingCompleted",
    "onboardingStep",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    new.id,
    new.id::text,
    v_email,
    v_phone,
    v_name,
    v_lang,
    false,
    'language',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.users.email),
    "phoneE164" = COALESCE(EXCLUDED."phoneE164", public.users."phoneE164"),
    "supabaseId" = EXCLUDED."supabaseId",
    "updatedAt" = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updatedAt timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  new."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_cases_updated_at ON public.cases;
CREATE TRIGGER set_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
