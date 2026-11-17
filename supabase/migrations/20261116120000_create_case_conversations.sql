-- Durable, provider-independent case transcripts. The API writes these rows
-- using its server-side database connection; browser clients have no direct
-- access to transcripts, evidence, or reports.
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Existing API deployments use text IDs for these provider-neutral rows.
  caseid TEXT NOT NULL,
  userid TEXT NOT NULL,
  blandagentid TEXT,
  blandsessionid TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  channel TEXT NOT NULL DEFAULT 'chat',
  createdat TIMESTAMP NOT NULL DEFAULT now(),
  updatedat TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversationid TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'model', 'agent', 'system')),
  content TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'chat',
  blandturnid TEXT,
  createdat TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_caseid_idx
  ON public.conversations(caseid);
CREATE INDEX IF NOT EXISTS conversations_userid_idx
  ON public.conversations(userid);
CREATE INDEX IF NOT EXISTS messages_conversationid_createdat_id_idx
  ON public.messages(conversationid, createdat, id);

-- Only one provider-independent Sathi transcript exists per case/user. Voice
-- provider conversations remain separate and may have their own lifecycle.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_sathi_transcript_unique
  ON public.conversations(caseid, userid)
  WHERE channel = 'sathi';

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conversations, public.messages FROM anon, authenticated;
