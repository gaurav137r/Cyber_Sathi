# AI image generation and poster rendering

Cyber Sathi can turn a case into a shareable awareness poster. The pipeline is
deliberately split so the AI model **only draws the background**:

```
case + prompt
   ↓
prompt builder (safe, reusable art-direction brief)
   ↓
Cloudflare Workers AI — Flux Schnell (background artwork only)
   ↓
base64 decoder + magic-byte check + ImageMagick identify
   ↓
ImageMagick resize/crop to the exact canvas
   ↓
SVG overlay (headlines, labels, helpline, logo, gradients, borders, shadows)
   ↓
ImageMagick composite + PNG/JPEG/WebP export
   ↓
authenticated preview + download endpoints
```

Text, numbers, contact details, logos and structured graphics are never
requested from the model and are never trusted to it. They are rendered locally
with SVG and ImageMagick.

## Module map

| Path | Responsibility |
| --- | --- |
| `apps/api/src/images/images.config.ts` | Validated env/config, safe public metadata, fail-fast startup checks |
| `apps/api/src/images/prompt-builder.ts` | Reusable prompt processing (subject, objective, style, palette, composition, aspect ratio, background rules, negatives, purpose) |
| `apps/api/src/images/cloudflare-images.client.ts` | Flux Schnell HTTP client, timeouts, retries, rate-limit/auth/5xx errors |
| `apps/api/src/images/image-decoder.ts` | Data-URL/base64 normalisation, size limits, PNG/JPEG/WebP/GIF magic bytes |
| `apps/api/src/images/image-validator.ts` | ImageMagick validation, dimensions, aspect-ratio limits |
| `apps/api/src/images/svg-renderer.ts` | Canvas reflow, text wrapping/fitting, four templates, Devanagari support |
| `apps/api/src/images/composition-engine.service.ts` | ImageMagick resize/crop/composite, format export, output re-validation |
| `apps/api/src/images/image-exporter.ts` | PNG/JPEG/WebP conversion and “file really exists” checks |
| `apps/api/src/images/image-storage.service.ts` | Local primary storage + best-effort Supabase Storage copy |
| `apps/api/src/images/images.service.ts` | Case ownership, caching, orchestration, DB rows, DTO mapping |
| `apps/api/src/images/images.controller.ts` | Authenticated HTTP endpoints |
| `src/lib/image-studio.ts` | Frontend API client |
| `src/components/ImageStudioScreen.tsx` | Prompt → canvas → template → text → preview/download workflow |

## Prerequisites

Fedora / RHEL:

```bash
sudo dnf install ImageMagick dejavu-sans-fonts python3 curl
# Optional but recommended for Hindi posters:
sudo dnf install google-noto-sans-devanagari-fonts
```

Verify the renderer and fonts:

```bash
magick -version
magick identify -format '%m %wx%h\n' some-image.png
fc-list :lang=hi family file
```

The default font files are read from environment variables and checked at API
startup. Missing ImageMagick or missing Latin font files stop the API with an
actionable error. A missing Devanagari font logs a warning and falls back to the
Latin font.

## Configuration

Copy `.env.example` to `.env` and set at least:

```dotenv
IMAGE_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=your_32_character_account_id
CLOUDFLARE_API_TOKEN=your_workers_ai_token
IMAGE_MODEL=@cf/black-forest-labs/flux-1-schnell
```

> **Model ID is case-sensitive.** Cloudflare returns
> `{"code":7000,"message":"No route for that URI"}` for
> `@cf/black-forest-labs/FLUX.1-schnell`. Use the lowercase
> `@cf/black-forest-labs/flux-1-schnell`.

| Variable | Default | Notes |
| --- | --- | --- |
| `IMAGE_PROVIDER` | `cloudflare` | `cloudflare` or `disabled` |
| `CLOUDFLARE_ACCOUNT_ID` | — | 32 hex characters; required unless disabled |
| `CLOUDFLARE_API_TOKEN` | — | Workers AI access; never sent to the frontend |
| `IMAGE_MODEL` | `@cf/black-forest-labs/flux-1-schnell` | Must be lowercase |
| `IMAGE_STEPS` | `4` | 1–8; 4 keeps free-tier usage low |
| `IMAGE_TIMEOUT_MS` | `60000` | Per request |
| `IMAGE_MAX_BYTES` | `8388608` | Decoded image size limit |
| `IMAGE_MIN_DIMENSION` | `256` | Canvas limit |
| `IMAGE_MAX_DIMENSION` | `2048` | Canvas limit |
| `IMAGE_FONT_REGULAR` | DejaVu Sans path | Latin regular |
| `IMAGE_FONT_BOLD` | DejaVu Sans Bold path | Latin bold |
| `IMAGE_FONT_DEVANAGARI` | Noto Sans Devanagari path | Hindi |
| `IMAGE_FONT_FAMILY` | `DejaVu Sans` | SVG family name |
| `IMAGE_FONT_FAMILY_BOLD` | `DejaVu Sans` | SVG family name |
| `IMAGE_FONT_FAMILY_DEVANAGARI` | `Noto Sans Devanagari` | SVG family name |
| `IMAGE_STORAGE_DIR` | `.data/generated-images` | Gitignored local storage |
| `SUPABASE_IMAGES_BUCKET` | `case-images` | Private bucket, auto-created on first upload |

Only `{ prompt, steps }` is sent to Cloudflare. The implementation does **not**
assume Flux supports `width`/`height` parameters; the returned 1024×1024 JPEG is
cropped to the requested canvas by ImageMagick.

## API

All `/images` and `/cases/:caseId/images` routes require a Supabase bearer token
(`JwtAuthGuard`). Files are streamed by the API, so no storage credentials or
public URLs are exposed.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/images/templates` | Presets, templates, formats, limits, safe provider metadata |
| `POST` | `/cases/:caseId/images/generate-background` | AI background only |
| `POST` | `/cases/:caseId/images/render` | Render text over an existing background |
| `POST` | `/cases/:caseId/images/generate` | Full pipeline (AI + SVG + export) |
| `GET` | `/cases/:caseId/images` | List generated assets for the case (max 50) |
| `GET` | `/cases/:caseId/images/:imageId` | Metadata |
| `GET` | `/cases/:caseId/images/:imageId/file?kind=background\|final` | Inline authenticated preview |
| `GET` | `/cases/:caseId/images/:imageId/download?kind=background\|final` | Attachment download |

### Canvas presets

| ID | Size | Ratio |
| --- | --- | --- |
| `instagram-square` | 1080×1080 | 1:1 |
| `instagram-portrait` | 1080×1350 | 4:5 |
| `story` | 1080×1920 | 9:16 |
| `landscape` | 1200×628 | 1.91:1 |
| custom | `width` + `height` | 0.3:1 – 3.2:1, 256–2048 px |

### Templates

| ID | Look |
| --- | --- |
| `cyber-shield` | Bottom teal gradient scrim, mint accent, left-aligned text |
| `alert-card` | White information card, coral rule, dark text |
| `minimal-focus` | Side gradient, oversized headline, editorial feel |
| `story-ribbon` | Top/bottom ribbons and centred text for 9:16 stories |

Formats: `png` (default), `jpeg`, `webp`.

### Full generation example

```http
POST /cases/<caseId>/images/generate
Authorization: Bearer <supabase-access-token>
Content-Type: application/json

{
  "prompt": "Minimal premium 3D cybersecurity illustration, glossy shield, phone with a blank screen, mint and powder blue palette, clean background, no text, no letters, no watermark",
  "preset": "instagram-square",
  "template": "cyber-shield",
  "format": "png",
  "language": "en",
  "steps": 4,
  "reuse": true,
  "headline": "Stop UPI fraud",
  "subheadline": "Verify before you pay.",
  "body": "Never share an OTP, UPI PIN or bank password. Report fraud on 1930.",
  "footer": "Helpline 1930 · cybercrime.gov.in",
  "brandLabel": "CYBER SATHI",
  "accentColor": "#7FD1C0"
}
```

The response includes `id`, `status`, `hasBackground`, `hasFinal`, `width`,
`height`, `format`, `backgroundUrl`, `finalUrl` and `downloadUrl`. URLs are
relative API paths and still require the bearer token.

If `prompt` is omitted, the prompt builder creates a safe brief from the case
category plus optional `subject`, `campaignObjective`, `visualStyle`, `palette`,
`composition`, `aspectRatio`, `backgroundRequirements`,
`negativeInstructions` and `outputPurpose` fields.

### Background-only and render-only

`generate-background` accepts the prompt/canvas fields and returns a row with
`hasBackground: true`, `hasFinal: false`.

`render` accepts `backgroundImageId` plus the template/text/canvas fields. Every
render creates a new immutable poster row that references the existing
background object, so changing text never overwrites an earlier poster.

### Caching

Backgrounds are keyed by `sha256(model + steps + normalised prompt)` and stored
under `backgrounds/<hash>.<ext>`. When `reuse` is not `false`, a matching ready
background is reused, creating a new case-scoped row that references the same
object without another Cloudflare call. The response includes `cached: true`.

## Storage and database

- Local disk: `IMAGE_STORAGE_DIR` (default `apps/api/.data/generated-images`),
  written atomically with `0600` permissions.
- Supabase Storage: private bucket `SUPABASE_IMAGES_BUCKET`; uploaded
  best-effort. If the bucket/remote upload fails, the local copy remains
  authoritative and the request still succeeds.
- Objects are read locally first, then from Supabase Storage. Preview/download
  always goes through the authenticated API.
- Database table `generated_images` stores ownership, prompt hash, model,
  steps, template, format, canvas, object keys, rendered text JSON, status
  (`PROCESSING`/`READY`/`FAILED`) and a sanitised error message.

Migration files:

- `supabase/migrations/20261117120000_create_generated_images.sql`
- `apps/api/prisma/migrations/20261117120000_create_generated_images/migration.sql`

RLS is enabled with no client policies: artwork is API-only.

## Failure handling

| Situation | Behaviour |
| --- | --- |
| Missing/invalid Cloudflare config | API fails at startup with a specific message |
| Missing ImageMagick/fonts | API fails at startup with install instructions |
| Cloudflare 400 | `502` with a redacted response-body snippet; no retry |
| Cloudflare 401/403 | `503` with credential guidance; no retry |
| Cloudflare 429 | `429` with `retryAfterSeconds` when provided; no blind retry |
| Cloudflare 5xx / network / timeout | Up to 3 attempts with exponential backoff, then `503`/`502` |
| No image / invalid base64 / wrong magic bytes | `502`; no rendering starts |
| Invalid canvas / aspect ratio | `400` before any inference |
| Missing background / foreign case | `404` |
| Local storage failure | `500`; no success response |
| Remote storage failure | Logged warning; local copy retained |
| ImageMagick/SVG/export failure | `500` with stderr logged; no file is reported |
| ImageMagick output missing/too small | `500`; download is never returned |

Cloudflare response bodies are redacted (base64 and token-like fields removed)
and truncated before logging. Prompts contain no case PII; only the category and
generic art direction are sent to the model. The frontend never receives
`CLOUDFLARE_API_TOKEN`.

## Free-tier notes

- Default `IMAGE_STEPS=4`.
- Background caching avoids repeat generations for the same prompt.
- The one-shot flow generates at most one background per request; rendering
  additional canvases/formats does not call Cloudflare again.
- Cloudflare account quotas still apply. A 429 is surfaced with a clear
  “wait and retry” message; quota errors are not retried automatically.
- Flux returns a 1024×1024 JPEG; larger canvases are upscaled by ImageMagick.
  Keep the focal subject centred so crops work across square, portrait, story
  and landscape.

## Frontend workflow

From the report summary screen, choose **Create an AI awareness poster**:

1. Enter a visual prompt or leave it blank to auto-build one.
2. Pick art direction (style/palette) when using the automatic prompt.
3. Choose a canvas preset or custom dimensions.
4. Pick a template and PNG/JPEG/WebP.
5. Edit headline, subheadline, body, helpline and brand label; switch EN/हिंदी.
6. Generate the full poster, or generate a background first and render text
   separately.
7. Preview and download.

The UI shows a spinner while the synchronous pipeline runs, surfaces API error
messages, and revokes object URLs when previews are replaced.

## Local testing

```bash
# API
corepack pnpm --filter @cybersathi/api build
cd apps/api && node dist/main.js

# Frontend
corepack pnpm build
```

Verified live against Cloudflare, Supabase Postgres/Storage and ImageMagick:

- Cloudflare Flux Schnell accepted `{prompt, steps: 4}` and returned a 1024×1024
  JPEG.
- 1080×1080 PNG and 1200×628 WebP posters were composed, stored and downloaded
  through authenticated HTTP endpoints.
- Hindi text rendered correctly with Noto Sans Devanagari.
- Background cache reuse returned `cached: true` without a second inference.
- Failure checks: missing auth → `401`, invalid dimensions → `400`, too-short
  prompt → `400`, missing/foreign case → `404`.
- The earlier uppercase model request produced a real Cloudflare 400
  (`No route for that URI`), which was preserved in the API error and logs.

## Operational notes

- Mount `IMAGE_STORAGE_DIR` on a persistent volume in production, or rely on the
  Supabase Storage copy and a configured bucket.
- The API runs ImageMagick in-process via `magick`; run the API in a container or
  host that has ImageMagick 7 and the configured fonts.
- Orphaned remote background objects are possible when several cases reuse the
  same prompt. A periodic cleanup job can remove objects with no referencing
  `generated_images` row.
- AI output may still contain faint glyph-like artifacts despite the negative
  prompt. The renderer keeps all readable text in a high-contrast local layer,
  but a stronger scrim or post-blur can be added per template if required.
