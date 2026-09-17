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
pnpm install
pnpm compose:up
pnpm prisma:deploy
pnpm --filter @cybersathi/api prisma:seed
pnpm start:dev
```

- API: http://localhost:3000
- Health: http://localhost:3000/health
- Swagger: http://localhost:3000/api/docs
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

Hot-reload the API on the host with `pnpm start:dev` (it talks to Compose Postgres/Redis/MinIO). To run the API in a container as well: `pnpm compose:up:all`.

Frontend prototype: `pnpm dev`.

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
