# CyberSathi

Bilingual (English/Hindi) voice-first companion for reporting cyber fraud in India.

The repo is a **pnpm workspace**: the existing React/Vite prototype stays at the root; the NestJS API lives in `apps/api`.

## Tooling choices

| Choice | Why |
| --- | --- |
| **Node.js 22 LTS** (Dockerfile + `.mise.toml`) | Current LTS for production Node APIs. |
| **pnpm 10** | Fast installs, strict dependency layout, ready if we split more packages. |
| **TypeScript + NestJS** | Typed modules for auth, cases, evidence, classification, and publishing without a custom framework. |
| **PostgreSQL 16 + Prisma** | Relational case/audit data with versioned migrations. |
| **Redis 7 + BullMQ** | Cache plus durable jobs so STT/OCR/classification/social posts never block HTTP. |
| **MinIO (S3 API)** | Local stand-in for production object storage; binaries stay out of Postgres. |
| **Docker Compose** | Orchestrates Postgres, Redis, MinIO, and the API. Target **Docker Engine 27.x** with the **Compose V2** plugin (Engine 24+ is fine). Kubernetes is deferred until production scale. |
| **Zod + `@nestjs/config`** | Missing or invalid env vars fail at boot. |

## Branching and commits

**Trunk-based:** `main` is always releasable. Work on short-lived `feat/<topic>` or `fix/<topic>` branches and merge quickly (squash is fine).

**Conventional Commits:** `type(scope): summary`

- Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`
- Example: `feat(cases): add status transition audit entries`

## Data retention (minimal, explicit)

| Data | Stored | Duration | Why |
| --- | --- | --- | --- |
| User (identity later) | `users` | Until account delete or last case purge | Scope cases and name the audit actor |
| Case (private) | `cases` | Active until `ARCHIVED`; **24 months** after archive | Tracking, escalation, user history |
| Evidence **files** | MinIO/S3 keys only in DB | Same window as parent case | Proof for filing; not in Postgres |
| Evidence metadata / extracts | `evidence_items` | Same as case | Classification and review |
| Internal report snapshot | `report_versions` kind `INTERNAL` | Same as case | Private reconstruction |
| Public redacted report | `report_versions` kind `PUBLIC_REDACTED` | Same as case (longer if a post stays live — Stage 6+) | Social copy **after** hard PII redaction |
| Audit log | `audit_log_entries` | **36 months** | Proof of explicit confirmations |

PII (name, phone, exact address, financial account numbers) must never appear in `PUBLIC_REDACTED` content. Official portals are **guide-and-confirm only** until an approved integration exists.

## Local run

Requires **Node 22+**, **pnpm 10.34.3**, and **Docker Engine 27.x** (Compose V2).

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
pnpm install
pnpm compose:up
pnpm --filter @cybersathi/api prisma:deploy
pnpm --filter @cybersathi/api prisma:seed
pnpm start:dev
```

- API: http://localhost:3000
- Health: http://localhost:3000/health
- Swagger: http://localhost:3000/api/docs

Hot-reload the API on the host with `pnpm start:dev` (it talks to Compose Postgres/Redis/MinIO). To run the API in a container as well: `pnpm compose:up:all`.

Frontend prototype: `pnpm dev`.

### Test microphone locally

- On a computer, open `http://localhost:8443` directly in Chrome or Edge. Do
  not use an embedded preview frame; browser microphone access requires a
  secure context, and localhost is treated as secure.
- On a USB-connected Android device with USB debugging enabled, run
  `adb reverse tcp:8443 tcp:8443` and `adb reverse tcp:3000 tcp:3000`, then
  start the mobile app with
  `pnpm mobile:start`. The Android WebView uses `http://localhost:8443` by
  default, which reaches the computer through the reverse port and qualifies
  as a secure context. Accept the Android microphone permission when prompted.
  If `EXPO_PUBLIC_WEB_URL` is set, set it to `http://localhost:8443` for this
  test or unset it.
- Start a report, accept the third-party processing notice, then use the Bland
  widget's chat or voice option. Browser voice requires microphone permission.
- To resume, open **My Cases**, choose the case, and select **Resume Sathi
  conversation**. Bland's configured conversation timeout is 30 days.

### Saathi voice, text, and evidence

Voice uses the Bland web widget; typed chat uses the authenticated Sathi text
service and the project's KeyPool. Both update the same case record, while
their conversation histories remain separate. Set `VITE_BLAND_WIDGET_ID` in
the frontend environment and `BLAND_API_KEY` plus the same `BLAND_WIDGET_ID` in
the API environment. The Bland API key must remain server-side. The widget uses
the case ID as its visitor ID so returning to that case can resume its voice
conversation; the configured widget conversation timeout is 30 days. Use **My
Cases → Case Tracking → Resume Sathi conversation** to reopen a saved intake.

For Bland's post-call webhook, set `BLAND_WEBHOOK_SECRET` in `apps/api/.env` to
the signing secret from Bland Account Settings → Keys. The public receiver is
`POST /bland/webhook`; verify the API is reachable over HTTPS before pasting its
full URL into Bland's webhook field.

#### Stable Bland agent voice

Voice is an **agent setting**, not a per-session request variable. The Saathi
agent must pin a single BTTS_V3 voice, otherwise Bland can fall back to a
different or unset voice between turns. The repository default is **AAVY**
(`c8bfeab1-1844-4d0f-9c46-acb011d7e99c`), a soothing, smooth, calm, and consoling
Hindi/Indian accent BTTS_V3 voice with a warm, friendly, reassuring tone suited for comforting
fraud victims (alternative calm Indian female voice: **Vibha** `791bba5c-f36d-4f15-8b63-ceffffc19fea`). To apply it to the agent,
publish it to staging, and promote it to production:

```bash
pnpm --filter @cybersathi/api bland:configure
```

The command is idempotent; use `-- --dry-run` to preview or `-- --voice=<uuid>`
to select another v3 voice. On boot the API verifies the agent's production
voice and logs a warning if it has drifted. Do not send `voice` inside the
session `request_data`; it is not a voice override.

Typed replies use Gemini TTS only when a Bland voice call is **not** active.
While the live call is connected, Bland speaks the agent turns and the browser
TTS is suppressed so two voices never overlap.

When deploying, add the deployed frontend hostname to the widget's allowed
domains in the Bland dashboard/API. The currently provisioned widget allows
`localhost` and `127.0.0.1` for local testing.

Supported evidence is uploaded to private Supabase Storage and processed by the
API in the background. Extracted values are candidates, not verified facts;
review and confirm the case before generating a report. The UI asks the user to
signal when a typed value is saved because the app does not inject it into a
running Bland conversation. Direct Bland text chat and Bland tool registration
remain unavailable until their API and trusted tool-authentication contracts
are verified; see `docs/saathi-tool-contracts.md`. Voice and evidence processing
involve third-party services; the app cannot guarantee provider retention,
deletion, or training policies. Never share OTPs, PINs, passwords, CVV, full
card numbers, or government-ID numbers.

### Supabase Auth and database

Create a Supabase project, enable **Phone** under Authentication providers, and configure an SMS provider. For email OTPs, edit the project's **Authentication > Email Templates > Magic Link** template to include `{{ .Token }}`; Supabase otherwise sends a magic link instead of the six-digit code this UI asks for. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `apps/api/.env` from Project Settings > API; the API also accepts the legacy `SUPABASE_ANON_KEY` name. Set the same project URL and publishable key as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the root `.env` for the browser client (the existing `NEXT_PUBLIC_` and `EXPO_PUBLIC_` aliases are also accepted). Sign-in and OTP verification use Supabase Auth. The API validates the Supabase bearer token and stores the profile and case data in Postgres through Prisma.

To use the **remote Supabase database**, replace `DATABASE_URL` in `apps/api/.env` with the Postgres connection string from the Supabase Dashboard's **Connect** dialog (use the direct connection when your network supports its IP version, or the session pooler otherwise). Replace the password placeholder locally, and percent-encode reserved characters in the password. Do not put this URI or a Supabase secret/service-role key in the browser `.env` or commit either value. The checked-in `DATABASE_URL` example targets local Compose Postgres; it does not connect to Supabase.

Apply the app schema to the database selected by `DATABASE_URL` with `pnpm --filter @cybersathi/api prisma:deploy`. Review the target database and connection string before running this command; it applies the repository's Prisma migrations. The onboarding screen requests and verifies an OTP through Supabase Auth, then sends the profile to the authenticated API for database persistence. The API and supporting Redis/MinIO services must also be running for profile onboarding.

Copy `apps/mobile/.env.example` to `apps/mobile/.env` to configure the mobile wrapper. The current mobile app is a WebView shell and does not read the Expo Supabase variables directly. Publishable keys are public and must be protected by Row Level Security. Set `CORS_ORIGINS` to the frontend origin when running with `NODE_ENV=production`; development mode allows local origins.

### Smoke checks

```bash
curl -s http://localhost:3000/health
```

Create → update → transition → fetch:

```bash
CASE_ID=$(curl -s -X POST http://localhost:3000/cases \
  -H 'Content-Type: application/json' \
  -d '{"rawTranscript":"Someone asked for OTP","detectedLanguage":"en","structuredFields":{"description":"phishing call"}}' \
  | jq -r .id)

curl -s -X PATCH http://localhost:3000/cases/$CASE_ID \
  -H 'Content-Type: application/json' \
  -d '{"structuredFields":{"amount":12000,"bankOrApp":"UPI"},"category":"phishing"}'

curl -s -X POST http://localhost:3000/cases/$CASE_ID/transition \
  -H 'Content-Type: application/json' \
  -d '{"toStatus":"PROCESSING"}'

curl -s http://localhost:3000/cases/$CASE_ID
```

BullMQ ping and MinIO signed URL:

```bash
curl -s -X POST http://localhost:3000/smoke/jobs/ping \
  -H 'Content-Type: application/json' \
  -d "{\"caseId\":\"$CASE_ID\"}"

curl -s -X POST http://localhost:3000/smoke/storage/presign-upload \
  -H 'Content-Type: application/json' \
  -d '{"filename":"test.txt","contentType":"text/plain"}'
```
