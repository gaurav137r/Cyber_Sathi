-- Provider-independent, durable transcript storage for a case.
CREATE TABLE IF NOT EXISTS "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseid" TEXT NOT NULL,
    "userid" TEXT NOT NULL,
    "blandagentid" TEXT,
    "blandsessionid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "channel" TEXT NOT NULL DEFAULT 'chat',
    "createdat" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedat" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationid" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'chat',
    "blandturnid" TEXT,
    "createdat" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_blandsessionid_key" ON "conversations"("blandsessionid");
CREATE INDEX IF NOT EXISTS "conversations_caseid_idx" ON "conversations"("caseid");
CREATE INDEX IF NOT EXISTS "conversations_userid_idx" ON "conversations"("userid");
CREATE INDEX IF NOT EXISTS "messages_conversationid_idx" ON "messages"("conversationid");
CREATE INDEX IF NOT EXISTS "messages_createdat_idx" ON "messages"("createdat");
CREATE INDEX IF NOT EXISTS "messages_conversationid_createdat_id_idx" ON "messages"("conversationid", "createdat", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_sathi_transcript_unique"
  ON "conversations"("caseid", "userid") WHERE "channel" = 'sathi';
