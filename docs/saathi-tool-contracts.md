# Saathi application tool contracts

These are application contracts. The names below are available to the current
Gemini-backed Sathi turn handler. They are **not registered as Bland webhook
tools**: the connected Bland chat API contract and a trusted server-side Bland
session-to-case binding have not been verified.

## Current implementation

The authenticated app uses the routes below. Every route requires a Supabase
JWT and resolves the case through the authenticated user's ownership. No route
accepts a model-supplied user ID or authorizes by case ID alone.

| Operation | Route | Request | Result |
| --- | --- | --- | --- |
| Read case state | `GET /cases/:id/state` | none | Compact confirmed/extracted fields, pending requests, evidence states, conflicts, revision, and next action |
| Stream case events | `GET /cases/:id/events` | Bearer token; optional `Last-Event-ID` header | Persisted SSE events, resumable by audit-log ID |
| Request a field | `POST /cases/:id/requests/input` | `{ "field": "suspect_phone", "displayPrompt": "..." }` | Persisted pending request and revision |
| Request evidence | `POST /cases/:id/requests/evidence` | `{ "category": "payment_screenshot" }` | Persisted pending request and revision |
| Request review | `POST /cases/:id/requests/review` | `{}` | Persisted review request and revision |
| Submit a field | `POST /cases/:id/requests/:requestId/submit` | `{ "expectedRevision": "...", "value": "...", "omit": false }` | Validated field, submitted request, updated revision |
| Confirm review | `POST /cases/:id/review/confirm` | `{ "expectedRevision": "..." }` | Confirmation bound to the exact post-confirmation revision |
| Flag human support | `POST /cases/:id/needs-human` | `{}` | Idempotently sets the existing `needsHuman` flag; no callback promise |

Allowed input fields are `victim_phone`, `suspect_phone`, `caller_name`,
`sms_content`, `transaction_id`, `amount`, `currency`, `incident_datetime`,
`bank_or_app`, `provisional_fraud_category`, and `description`. Evidence request
categories are `payment_screenshot`, `sms_screenshot`, `call_recording`, and
`document`. Upload validation currently accepts JPEG, PNG, WebP, PDF, WAV, MP3,
and OGG (maximum 25 MB); no video formats are advertised.

Application events use names such as `case.input_requested`,
`case.input_submitted`, `evidence.uploaded`, `evidence.processing`,
`evidence.ready`, `evidence.failed`, `case.review_requested`, `case.updated`,
`report.ready`, and `social_post.ready`. These names are generated from
persisted audit records; they are not asserted to be Bland-native event types.

The model tools `request_case_input`, `request_case_evidence`,
`get_case_state`, `request_case_review`, `generate_case_report`,
`generate_social_post`, and `flag_human_support` are implemented in the
authenticated Sathi turn path. Typed responses are saved to the canonical case
record. The UI explicitly asks the user to tell Sathi when a requested value is
saved; it does not fabricate speech or claim a supported context-injection
mechanism. Voice and typed conversation histories remain separate.

Report generation requires the user to confirm the current case revision.
Corrections and evidence processing bump the case revision, making an earlier
confirmation stale. Reports filter internal request state, unconfirmed
extraction candidates, and confirmation metadata from the report payload.

## Bland registration blockers

The current official Bland documentation available during this implementation
did not verify the proposed Agent API Chat endpoints (`POST /v1/chat`,
`POST /v1/chat/:id/messages`, `GET /v1/chat/:id`, or
`POST /v1/chat/:id/end`). The documented Agent authorization endpoint supports
voice session authorization; the documented legacy pathway chat and webchat
widget flows are different products and are not substitutes for this agent's
text chat.

There is also no configured and verified trusted mechanism that binds a Bland
tool invocation to a server-created, owned case and session. The temporary
webhook tunnel is not treated as a stable public application API or as a
tool-authentication credential. Therefore no executable tool definitions,
guessed endpoints, permanent user JWTs, or shared live tools were registered.

To register Bland tools safely, obtain (1) Bland's supported Agent API Chat
request/response and idempotency contract, (2) a stable HTTPS API origin, and
(3) a supported server-to-server authentication method plus a trusted
session/case binding mechanism. Then define narrowly scoped development tools
against the authenticated application operations, read them back, and verify
the binding without promoting or changing the production agent.
