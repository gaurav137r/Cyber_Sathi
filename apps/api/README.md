# CyberSathi API

## Local smoke test

Start the infrastructure and API from the repository root:

```bash
docker compose up -d postgres redis minio
corepack pnpm api:prisma:migrate
corepack pnpm api:start:dev
```

The API listens on `http://localhost:3000`.

Create and read a case:

```bash
curl -X POST http://localhost:3000/cases -H "content-type: application/json" -d "{\"category\":\"upi-payment-fraud\"}"
curl http://localhost:3000/cases
```

Queue the BullMQ proof job with the returned case ID:

```bash
curl -X POST http://localhost:3000/jobs/ping -H "content-type: application/json" -d "{\"caseId\":\"CASE_ID\"}"
```

Upload and retrieve evidence:

```bash
curl -X POST "http://localhost:3000/evidence?caseId=CASE_ID" -F "file=@./test-fixture.txt"
curl http://localhost:3000/evidence/EVIDENCE_ID/url
```

Inspect all dependency statuses:

```bash
curl http://localhost:3000/health
```

Every response includes an `x-request-id` header. The same request ID is included in HTTP and asynchronous job logs when it is passed into a queued job.

## Authentication smoke test

The current SMS adapter is `ConsoleSmsProvider`, which logs the OTP and exposes `devOtp` only when `NODE_ENV` is not `production`. The business logic depends on the `SmsProvider` interface, so a production adapter can later target MSG91 (a common India-focused transactional SMS option) or Twilio Verify without changing OTP storage or authentication logic. The provider decision should be made after delivery, sender-ID, DLT, and cost testing in India.

```bash
OTP_RESPONSE=$(curl -s -X POST http://localhost:3000/auth/otp/request -H 'content-type: application/json' -d '{"phone":"9876543210"}')
OTP=$(echo "$OTP_RESPONSE" | jq -r .devOtp)

TOKENS=$(curl -s -X POST http://localhost:3000/auth/otp/verify -H 'content-type: application/json' -d "{\"phone\":\"9876543210\",\"otp\":\"$OTP\"}")
ACCESS=$(echo "$TOKENS" | jq -r .accessToken)
REFRESH=$(echo "$TOKENS" | jq -r .refreshToken)

curl -s http://localhost:3000/cases -H "authorization: Bearer $ACCESS"
curl -s -X POST http://localhost:3000/cases -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' -d '{"category":"upi-payment-fraud"}'
curl -s -X POST http://localhost:3000/auth/refresh -H 'content-type: application/json' -d "{\"refreshToken\":\"$REFRESH\"}"
curl -s -X POST http://localhost:3000/auth/logout -H 'content-type: application/json' -d "{\"refreshToken\":\"$REFRESH\"}"
```

The mobile client must store tokens only in Expo SecureStore, iOS Keychain, or Android Keystore. It must never store access or refresh tokens in AsyncStorage or other plain storage.

## Case lifecycle smoke test

With `ACCESS` set to a verified access token:

```bash
CASE=$(curl -s -X POST http://localhost:3000/cases \
	-H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
	-d '{"category":"upi-payment-fraud","detectedLanguage":"en","structuredFields":{"amount":15000,"bankOrApp":"HDFC Bank"}}')
CASE_ID=$(echo "$CASE" | jq -r .id)

curl -s -X PATCH "http://localhost:3000/cases/$CASE_ID" \
	-H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
	-d '{"categoryConfidence":0.94,"structuredFields":{"amount":15000,"bankOrApp":"HDFC Bank","description":"Caller requested my UPI PIN."}}'

curl -s -X POST "http://localhost:3000/cases/$CASE_ID/transition" \
	-H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
	-d '{"status":"PROCESSING","reason":"Voice transcript submitted"}'

curl -s "http://localhost:3000/cases/$CASE_ID" -H "authorization: Bearer $ACCESS"
```

Transitions must follow `DRAFT -> PROCESSING -> CLASSIFIED -> REVIEWED -> FILED -> RESOLVED`. `ARCHIVED` is allowed from any non-archived state. For example, `DRAFT -> FILED` returns HTTP 400 with an `Invalid case transition` message. Swagger is available at `http://localhost:3000/api/docs`.

## Sathi Gemini voice agent

Set `GEMINI_API_KEY` (Gemini API key from Google AI Studio). Optional overrides: `GEMINI_LIVE_MODEL` (default `gemini-3.8-live`), `GEMINI_TEXT_MODEL` (default `gemini-3.6-flash`), `GEMINI_VOICE_NAME` (default `Kore`).

The API never sends the long-lived key to the client. `POST /sathi/session` creates a case and mints a short-lived Live API token. The app can speak through that session, or send recorded audio/text to `POST /cases/:id/sathi/turns`. When a caller or SMS number is unclear, Sathi returns a `PICK_PHONE_NUMBER` client action; the Android/web UI lets the user choose a number and posts it to `POST /cases/:id/sathi/device-context`.

```bash
SESSION=$(curl -s -X POST http://localhost:3000/sathi/session \
	-H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
	-d '{"language":"hi"}')
CASE_ID=$(echo "$SESSION" | jq -r .caseId)

curl -s -X POST "http://localhost:3000/cases/$CASE_ID/sathi/turns?language=hi&text=Someone%20called%20and%20took%20my%20UPI%20money" \
	-H "authorization: Bearer $ACCESS"

curl -s -X POST "http://localhost:3000/cases/$CASE_ID/sathi/device-context" \
	-H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
	-d '{"source":"CALL","phone":"9876500021"}'
```

Connect the Live websocket with the returned `live.ephemeralToken` as `access_token`. Do not put `GEMINI_API_KEY` in the web or mobile client.

## Voice pipeline smoke test

Configure `BHASHINI_API_KEY` and, when required by the account, `BHASHINI_USER_ID` in the API environment. The ASR, translation, and TTS service IDs are configurable with `BHASHINI_ASR_SERVICE_ID`, `BHASHINI_TRANSLATION_SERVICE_ID`, and `BHASHINI_TTS_SERVICE_ID`. Bhashini is the active provider; a self-hosted Whisper adapter remains a future implementation behind the same `SpeechService` interface.

```bash
VOICE=$(curl -s -X POST "http://localhost:3000/cases/$CASE_ID/voice-intake?language=hi" \
	-H "authorization: Bearer $ACCESS" \
	-F "audio=@./sample-hi.wav;type=audio/wav")
JOB_ID=$(echo "$VOICE" | jq -r .jobId)

curl -s "http://localhost:3000/cases/$CASE_ID/voice-intake/$JOB_ID" \
	-H "authorization: Bearer $ACCESS"
```

Poll until `progress.stage` is `ready_for_classification`. The case then contains `rawTranscript` in the detected source language and `canonicalTranscript` in English. The transcription job remains in `PROCESSING`; classification is the next explicit state-machine step.

Generate summary audio:

```bash
curl -s -X POST "http://localhost:3000/cases/$CASE_ID/summary/audio" \
	-H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
	-d '{"language":"hi","text":"आपकी शिकायत सफलतापूर्वक दर्ज की गई है।"}'
```

## Stage 6 classification and report compilation

Set `LLM_API_KEY` before starting the API. The classifier uses an OpenAI-compatible strict JSON Schema response format and validates the response again with Zod. A malformed or non-conforming model response is rejected; no free-text classification is persisted. The routing table is versioned in `src/classification/routing.config.ts`; government URLs and workflows must be re-verified before production.

```bash
CLASSIFICATION=$(curl -s -X POST "http://localhost:3000/cases/$CASE_ID/classify" \
	-H "authorization: Bearer $ACCESS")
echo "$CLASSIFICATION" | jq

REPORT=$(curl -s -X POST "http://localhost:3000/cases/$CASE_ID/compile-report" \
	-H "authorization: Bearer $ACCESS")
echo "$REPORT" | jq
```

High-confidence classification shape:

```json
{
	"case": {
		"status": "CLASSIFIED",
		"category": "UPI_FRAUD",
		"categoryConfidence": 0.94,
		"classificationExplanation": "The transcript describes an unauthorized UPI transfer after a caller requested payment credentials.",
		"clarificationRequired": false,
		"filingDestination": "NCRP financial-fraud module"
	},
	"clarificationRequired": false
}
```

Low-confidence output is forced to `UNCERTAIN`, remains `PROCESSING`, and cannot transition to `CLASSIFIED` until this is completed:

```bash
curl -s -X POST "http://localhost:3000/cases/$CASE_ID/clarification/complete" \
	-H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
	-d '{"category":"PHISHING"}'
```

The internal report stores each value with `user-stated`, `AI-inferred`, or `evidence-corroborated` provenance. No `PUBLIC_REDACTED` report is generated by this stage.

## Stage 7 multimodal evidence

Tesseract.js is the OCR provider for this stage. It runs locally, avoids sending screenshots to a third party, and has no cloud credential dependency. The tradeoff is higher CPU/latency and less managed accuracy than Google Cloud Vision; the `OcrService` token can be replaced with a Vision adapter later. The current worker uses English OCR data; Hindi-trained Tesseract data or Vision should be enabled before Hindi screenshot evidence is treated as production-grade.

Upload a screenshot or image. OCR and entity extraction complete before the response returns:

```bash
EVIDENCE=$(curl -s -X POST "http://localhost:3000/cases/$CASE_ID/evidence?type=SCREENSHOT" \
	-H "authorization: Bearer $ACCESS" \
	-F "file=@./bank-scam-screenshot.png;type=image/png")
echo "$EVIDENCE" | jq
```

The case's `canonicalEntities` merges screenshot entities with voice-derived entities. An overlapping phone number is stored once with both sources:

```json
{
	"phoneNumbers": [
		{
			"value": "+919876543210",
			"sources": ["case-transcript", "evidence-uuid"],
			"sourceTypes": ["voice-transcript", "evidence-screenshot"]
		}
	],
	"amounts": [
		{
			"value": 15000,
			"sources": ["case-transcript", "evidence-uuid"],
			"sourceTypes": ["voice-transcript", "evidence-screenshot"]
		}
	]
}
```

Compile the report after evidence resolution:

```bash
curl -s -X POST "http://localhost:3000/cases/$CASE_ID/compile-report" \
	-H "authorization: Bearer $ACCESS" | jq
```

The internal report includes the canonical entity set and each evidence item's extracted text/entities, preserving evidence IDs for corroboration.

## Stage 2 retention boundary

This skeleton intentionally stores no user name, phone number, exact address, account number, audio transcript, or raw report content.

| Data | Purpose | Retention in this stage |
| --- | --- | --- |
| `User.id` | Stable internal owner reference | Until account deletion; no profile PII is stored |
| `Case` status/category | Case workflow smoke test | Until case deletion; future policy must define the legal/operational period |
| `EvidenceItem` metadata and MinIO object | Prove evidence storage plumbing | 24 hours for local smoke fixtures; production retention requires user/legal approval |
| `ReportVersion.payload` | Versioned report contract | Not populated by Stage 2; future versions must contain only consented case data |
| `AuditLogEntry` | Trace irreversible actions and service events | Not populated by Stage 2 endpoints; production policy must retain submission/share confirmations for the legally required period |

No public/social content generation or government submission endpoint exists in Stage 2. Those flows must add hard redaction, explicit confirmation, and an audit entry before becoming executable.

## AI poster studio

`ImagesModule` adds a Cloudflare Workers AI + ImageMagick poster pipeline:

- `GET /images/templates` — presets, templates, formats and safe limits.
- `POST /cases/:caseId/images/generate-background` — AI artwork only.
- `POST /cases/:caseId/images/render` — SVG typography over an existing
  background.
- `POST /cases/:caseId/images/generate` — full generate + render + export.
- `GET /cases/:caseId/images` and `/:imageId` — metadata.
- `GET /cases/:caseId/images/:imageId/file` and `/download` — authenticated
  preview/download.

The AI model only draws the background; all text, helpline numbers, logos and
labels are rendered locally with SVG and ImageMagick. Backgrounds are cached by
prompt hash so repeat renders do not spend another Cloudflare inference.

See [docs/image-pipeline.md](../../docs/image-pipeline.md) for setup, image
formats and presets, error handling, free-tier guidance, storage and the tested
failure matrix.