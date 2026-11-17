DO $$
BEGIN
  IF to_regtype('public."CaseStatus"') IS NULL THEN
    CREATE TYPE public."CaseStatus" AS ENUM (
      'DRAFT',
      'PROCESSING',
      'CLASSIFIED',
      'REVIEWED',
      'FILED',
      'RESOLVED',
      'ARCHIVED'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cases
    WHERE status IS NOT NULL
      AND upper(status) NOT IN (
        'DRAFT',
        'PROCESSING',
        'CLASSIFIED',
        'REVIEWED',
        'FILED',
        'RESOLVED',
        'ARCHIVED'
      )
  ) THEN
    RAISE EXCEPTION 'cases.status contains values outside the CaseStatus enum';
  END IF;
END $$;

UPDATE public.cases
SET status = 'DRAFT'
WHERE status IS NULL;

ALTER TABLE public.cases
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public."CaseStatus"
    USING upper(status)::public."CaseStatus",
  ALTER COLUMN status SET DEFAULT 'DRAFT'::public."CaseStatus",
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN "userId" SET NOT NULL;

UPDATE public.cases
SET clarificationrequired = false
WHERE clarificationrequired IS NULL;

ALTER TABLE public.cases
  ALTER COLUMN clarificationrequired SET DEFAULT false,
  ALTER COLUMN clarificationrequired SET NOT NULL;

UPDATE public.cases
SET canonicalentities = '{}'::jsonb
WHERE canonicalentities IS NULL;

ALTER TABLE public.cases
  ALTER COLUMN canonicalentities SET DEFAULT '{}'::jsonb,
  ALTER COLUMN canonicalentities SET NOT NULL;

UPDATE public.cases
SET createdat = CURRENT_TIMESTAMP
WHERE createdat IS NULL;

ALTER TABLE public.cases
  ALTER COLUMN createdat SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN createdat SET NOT NULL;

UPDATE public.cases
SET updatedat = CURRENT_TIMESTAMP
WHERE updatedat IS NULL;

ALTER TABLE public.cases
  ALTER COLUMN updatedat SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN updatedat SET NOT NULL;