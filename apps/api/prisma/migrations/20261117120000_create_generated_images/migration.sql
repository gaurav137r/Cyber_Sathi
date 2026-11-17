-- AI-generated backgrounds and composed poster metadata.
-- Binary assets live in project storage (local .data + Supabase Storage);
-- this table stores ownership, render inputs and object keys.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GeneratedImageStatus') THEN
    CREATE TYPE "GeneratedImageStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caseid UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  userid UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status "GeneratedImageStatus" NOT NULL DEFAULT 'PROCESSING',
  prompt TEXT NOT NULL,
  prompthash TEXT NOT NULL,
  model TEXT NOT NULL,
  steps INTEGER NOT NULL DEFAULT 4,
  template TEXT NOT NULL DEFAULT 'cyber-shield',
  format TEXT NOT NULL DEFAULT 'png',
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  backgroundkey TEXT,
  backgroundcontenttype TEXT,
  finalkey TEXT,
  finalcontenttype TEXT,
  content JSONB,
  accentcolor TEXT,
  reusedfromid UUID,
  error TEXT,
  createdat TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updatedat TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "generated_images_caseid_createdat_idx"
  ON public.generated_images(caseid, createdat);

CREATE INDEX IF NOT EXISTS "generated_images_userid_createdat_idx"
  ON public.generated_images(userid, createdat);

CREATE INDEX IF NOT EXISTS "generated_images_prompthash_status_idx"
  ON public.generated_images(prompthash, status);

ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.generated_images IS
  'AI background and composed poster jobs. Assets are stored in project storage; this table is API-only.';
