import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common"
import { Prisma, ReportKind } from "@prisma/client"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { PrismaService } from "../prisma/prisma.service"

const execFileAsync = promisify(execFile)

export type ReportExportFormat = "json" | "docx" | "pdf" | "txt"
export type ReportExportLanguage = "en" | "hi"

const exportFormats: ReportExportFormat[] = ["json", "docx", "pdf", "txt"]
const exportLanguages: ReportExportLanguage[] = ["en", "hi"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseContent(value: Prisma.JsonValue | string | null): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown
      return isRecord(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return isRecord(value) ? value : {}
}

function deduplicateTranscriptLines(lines: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function cleanTranscript(raw: string): string {
  if (!raw) return ""
  const lines = raw.split("\n")
  // Remove lines that are pure entity extraction repeats (e.g. start with a number followed by a period and contain "Online shopping fraud")
  const filtered = lines.filter((line) => {
    const trimmed = line.trim()
    // Skip lines that are just entity extraction repeats
    if (/^\d+[\.\s].{0,100}online shopping fraud/i.test(trimmed)) return false
    // Skip lines that are just "5000. User lost Rs" patterns
    if (/^\d+[\.\s].{0,50}user lost rs/i.test(trimmed)) return false
    // Skip lines that are just ".confirmed" or similar trailing tags
    if (/^\s*\.\s*confirmed\s*$/i.test(trimmed)) return false
    // Skip lines that are just punctuation/markers like ", ." or ", ."
    if (/^[\s,.\"\']{1,5}$/.test(trimmed)) return false
    return true
  })
  // Deduplicate identical lines
  const deduped = deduplicateTranscriptLines(filtered)
  // Join back, removing excessive whitespace
  return deduped.join(" ").replace(/\\s+/g, " ").trim()
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function text(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value, null, 2)
}

function pretty(value: unknown): string {
  if (value == null) return "Not provided"
  if (typeof value === "string") return value || "Not provided"
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value, null, 2)
}

function field(fields: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = fields[key]
    if (value !== undefined && value !== null && value !== "") return value
  }
  return null
}

function fileNameFor(
  caseId: string,
  trackingNumber: string | null,
  language: ReportExportLanguage,
  extension: string,
): string {
  const base = (trackingNumber || caseId).replace(/[^a-zA-Z0-9._-]/g, "-")
  return `cyber-sathi-report-${base}-${language}.${extension}`
}

@Injectable()
export class ReportExportService {
  constructor(private readonly prisma: PrismaService) {}

  async export(
    caseId: string,
    userId: string,
    rawFormat: string | undefined,
    rawLanguage: string | undefined,
  ): Promise<{
    buffer: Buffer
    contentType: string
    fileName: string
  }> {
    const format = (rawFormat || "pdf") as ReportExportFormat
    const language = (rawLanguage || "en") as ReportExportLanguage
    if (!exportFormats.includes(format))
      throw new BadRequestException("Choose json, docx, pdf, or txt.")
    if (!exportLanguages.includes(language))
      throw new BadRequestException("Choose English or Hindi.")

    const found = await this.prisma.case.findFirst({
      where: { id: caseId, userId },
      include: {
        evidenceItems: { orderBy: { uploadedAt: "asc" } },
        reportVersions: {
          where: {
            kind: { in: [ReportKind.INTERNAL, ReportKind.PUBLIC_REDACTED] },
          },
          orderBy: [{ generatedAt: "desc" }],
          take: 10,
        },
      },
    })
    if (!found) throw new NotFoundException("Case was not found")

    const fields = isRecord(found.structuredFields)
      ? found.structuredFields
      : {}
    const internalVersion = found.reportVersions.find(
      (version) => version.kind === ReportKind.INTERNAL,
    )
    const publicVersion = found.reportVersions.find(
      (version) => version.kind === ReportKind.PUBLIC_REDACTED,
    )
    const internal = parseContent(internalVersion?.content ?? null)
    const publicReport = parseContent(publicVersion?.content ?? null)

    const summaryEnglish =
      (typeof internal.summaryEnglish === "string" && internal.summaryEnglish) ||
      (typeof publicReport.summaryEnglish === "string" && publicReport.summaryEnglish) ||
      ""
    const summaryHindi =
      (typeof internal.summaryHindi === "string" && internal.summaryHindi) ||
      (typeof publicReport.summaryHindi === "string" && publicReport.summaryHindi) ||
      ""
    const summary =
      language === "hi"
        ? summaryHindi || summaryEnglish
        : summaryEnglish || summaryHindi

    const narrativeEnglish =
      (typeof internal.unredactedNarrative === "string" &&
        internal.unredactedNarrative) ||
      (typeof internal.narrative === "string" && internal.narrative) ||
      (typeof fields.description === "string" && fields.description) ||
      found.rawTranscript ||
      "No incident narrative was recorded."
    const narrativeHindi =
      (typeof internal.narrativeHindi === "string" && internal.narrativeHindi) ||
      (typeof fields.description === "string" &&
        /[\u0900-\u097F]/.test(fields.description) &&
        fields.description) ||
      summaryHindi ||
      ""
    const narrative =
      language === "hi" ? narrativeHindi || narrativeEnglish : narrativeEnglish

    const report = {
      exportVersion: "1.0",
      generatedAt: new Date().toISOString(),
      language,
      case: {
        id: found.id,
        trackingNumber: found.trackingNumber,
        status: found.status,
        category: found.category,
        categoryConfidence: found.categoryConfidence,
        classificationExplanation: found.classificationExplanation,
        detectedLanguage: found.detectedLanguage,
        filingDestination: found.filingDestination,
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
      },
      complainant: {
        name: field(fields, "complainantName"),
        phone: field(fields, "complainantPhone"),
        email: field(fields, "complainantEmail"),
        location: field(fields, "complainantLocation"),
        victimPhone: field(fields, "victimPhone"),
      },
      incident: {
        date: field(fields, "incidentDate", "date"),
        amount: field(fields, "amount"),
        currency: field(fields, "currency"),
        channel: field(fields, "channel"),
        platform: field(fields, "platform", "bankOrApp"),
        suspectName: field(fields, "suspectName", "callerName"),
        suspectPhone: field(fields, "suspectPhone", "phone"),
        suspectUpi: field(fields, "suspectUpi", "upiId"),
        suspectUrl: field(fields, "url", "suspectDetails"),
        transactionIds: field(fields, "transactionIds", "transactionId"),
        actionRequested: field(fields, "actionRequested"),
        description: field(fields, "description"),
      },
      summary: {
        selectedLanguage: language,
        english: summaryEnglish || null,
        hindi: summaryHindi || null,
        text: summary || null,
      },
      narrative,
      narratives: {
        english: narrativeEnglish,
        hindi: narrativeHindi || null,
      },
      fields,
      confirmedFields: field(fields, "confirmedFields"),
      extractionCandidates: field(fields, "extractedCandidates"),
      canonicalEntities: found.canonicalEntities,
      transcript: {
        raw: cleanTranscript(found.rawTranscript ?? ""),
        canonical: cleanTranscript(found.canonicalTranscript ?? ""),
      },
      evidence: found.evidenceItems.map((item) => ({
        id: item.id,
        type: item.type,
        fileName: item.storageKey.split("/").at(-1) ?? item.storageKey,
        storageKey: item.storageKey,
        uploadedAt: item.uploadedAt,
        extractedText: item.extractedText,
        extractedEntities: item.extractedEntities,
      })),
      reportVersion: internalVersion
        ? {
            id: internalVersion.id,
            version: internalVersion.version,
            generatedAt: internalVersion.generatedAt,
            content: internal,
          }
        : null,
      publicSummaryVersion: publicVersion
        ? {
            id: publicVersion.id,
            version: publicVersion.version,
            generatedAt: publicVersion.generatedAt,
            content: publicReport,
          }
        : null,
    }

    const fileNameBase = fileNameFor(
      found.id,
      found.trackingNumber,
      language,
      format,
    )

    if (format === "json") {
      return {
        buffer: Buffer.from(JSON.stringify(report, null, 2), "utf8"),
        contentType: "application/json; charset=utf-8",
        fileName: fileNameBase,
      }
    }

    if (format === "txt") {
      return {
        buffer: Buffer.from(this.toPlainText(report), "utf8"),
        contentType: "text/plain; charset=utf-8",
        fileName: fileNameBase,
      }
    }

    const html = this.toHtml(report, language)
    const buffer = await this.convert(html, format, fileNameBase)
    return {
      buffer,
      contentType:
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: fileNameBase,
    }
  }

  private toPlainText(report: Record<string, any>): string {
    const lines: string[] = []
    const add = (label: string, value: unknown) => {
      if (value == null || value === "") return
      lines.push(`${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    }
    lines.push("CYBER SATHI — CASE REPORT")
    lines.push("=".repeat(48))
    add("Case ID", report.case?.trackingNumber || report.case?.id)
    add("Status", report.case?.status)
    add("Category", report.case?.category)
    add("Filing destination", report.case?.filingDestination)
    add("Generated", report.generatedAt)
    lines.push("", "COMPLAINANT", "-".repeat(48))
    add("Name", report.complainant?.name)
    add("Phone", report.complainant?.phone)
    add("Email", report.complainant?.email)
    add("Location", report.complainant?.location)
    lines.push("", "INCIDENT", "-".repeat(48))
    add("Date", report.incident?.date)
    add("Amount", report.incident?.amount)
    add("Channel", report.incident?.channel)
    add("Platform / bank", report.incident?.platform)
    add("Suspect name", report.incident?.suspectName)
    add("Suspect phone", report.incident?.suspectPhone)
    add("Suspect UPI", report.incident?.suspectUpi)
    add("Suspect URL / details", report.incident?.suspectUrl)
    add("Transaction IDs", report.incident?.transactionIds)
    add("Action requested", report.incident?.actionRequested)
    lines.push("", "SUMMARY", "-".repeat(48))
    lines.push(report.summary?.text || "No summary available.")
    lines.push("", "INCIDENT NARRATIVE", "-".repeat(48))
    lines.push(report.narrative || "No narrative available.")
    lines.push("", "TECHNICAL DETAILS", "-".repeat(48))
    lines.push(JSON.stringify(report.fields ?? {}, null, 2))
    lines.push("", "EVIDENCE", "-".repeat(48))
    for (const item of report.evidence ?? []) {
      lines.push(`- ${item.type}: ${item.fileName} (${item.uploadedAt})`)
      if (item.extractedText) lines.push(`  Text: ${item.extractedText}`)
      if (item.extractedEntities)
        lines.push(`  Entities: ${JSON.stringify(item.extractedEntities)}`)
    }
    lines.push("", "TRANSCRIPTS", "-".repeat(48))
    add("Raw transcript", report.transcript?.raw)
    add("Canonical transcript", report.transcript?.canonical)
    lines.push(
      "",
      "This report was prepared from information supplied to Cyber Sathi. It is not an official police acknowledgment.",
    )
    return lines.join("\n")
  }

  private toHtml(report: Record<string, any>, language: ReportExportLanguage): string {
    const rows = (pairs: Array<[string, unknown]>) =>
      pairs
        .filter(([, value]) => value != null && value !== "")
        .map(
          ([label, value]) =>
            `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(
              typeof value === "string" ? value : pretty(value),
            ).replace(/\n/g, "<br />")}</td></tr>`,
        )
        .join("")

    const evidence = (report.evidence ?? [])
      .map(
        (item: Record<string, unknown>) => `
          <div class="evidence">
            <h3>${escapeHtml(item.type)} — ${escapeHtml(item.fileName)}</h3>
            <p><strong>Uploaded:</strong> ${escapeHtml(item.uploadedAt)}</p>
            ${
              item.extractedText
                ? `<p><strong>Extracted text:</strong><br />${escapeHtml(item.extractedText).replace(/\n/g, "<br />")}</p>`
                : ""
            }
            ${
              item.extractedEntities
                ? `<p><strong>Extracted entities:</strong></p><pre>${escapeHtml(JSON.stringify(item.extractedEntities, null, 2))}</pre>`
                : ""
            }
          </div>`,
      )
      .join("")

    return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8" />
<title>Cyber Sathi Case Report</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Noto Sans Devanagari", "Noto Sans", "Droid Sans Devanagari", Arial, sans-serif;
    color: #16211f;
    font-size: 11pt;
    line-height: 1.55;
  }
  h1 { font-size: 22pt; margin: 0 0 4pt; color: #0f4c4c; }
  h2 { font-size: 14pt; margin: 20pt 0 8pt; color: #0f4c4c; border-bottom: 1px solid #d9e2df; padding-bottom: 4pt; }
  h3 { font-size: 11pt; margin: 0 0 6pt; }
  .meta { color: #5b6b68; font-size: 9.5pt; margin-bottom: 14pt; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; }
  th, td { border: 1px solid #dfe7e4; padding: 6pt 8pt; vertical-align: top; text-align: left; }
  th { width: 32%; background: #f2f7f5; font-weight: 600; color: #0f4c4c; }
  td { white-space: pre-wrap; word-break: break-word; }
  p { margin: 0 0 9pt; white-space: pre-wrap; }
  .summary { background: #f5faf8; border: 1px solid #dfe7e4; border-radius: 6pt; padding: 10pt; }
  .evidence { border: 1px solid #dfe7e4; border-radius: 6pt; padding: 8pt 10pt; margin-bottom: 9pt; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f7f8f7; padding: 8pt; border-radius: 4pt; font-size: 9pt; }
  .disclaimer { margin-top: 18pt; font-size: 9pt; color: #5b6b68; border-top: 1px solid #d9e2df; padding-top: 8pt; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>
  <h1>Cyber Sathi — Case Report</h1>
  <div class="meta">
    Case ID: ${escapeHtml(report.case?.trackingNumber || report.case?.id)} &nbsp;|&nbsp;
    Status: ${escapeHtml(report.case?.status)} &nbsp;|&nbsp;
    Generated: ${escapeHtml(report.generatedAt)} &nbsp;|&nbsp;
    Language: ${language === "hi" ? "हिंदी" : "English"}
  </div>

  <h2>Case overview</h2>
  <table>
    ${rows([
      ["Category", report.case?.category],
      ["Classification confidence", report.case?.categoryConfidence],
      ["Classification explanation", report.case?.classificationExplanation],
      ["Filing destination", report.case?.filingDestination],
      ["Detected language", report.case?.detectedLanguage],
    ])}
  </table>

  <h2>Complainant</h2>
  <table>
    ${rows([
      ["Name", report.complainant?.name],
      ["Phone", report.complainant?.phone],
      ["Email", report.complainant?.email],
      ["Location", report.complainant?.location],
      ["Victim phone", report.complainant?.victimPhone],
    ])}
  </table>

  <h2>Incident</h2>
  <table>
    ${rows([
      ["Date", report.incident?.date],
      ["Amount", report.incident?.amount],
      ["Currency", report.incident?.currency],
      ["Channel", report.incident?.channel],
      ["Platform / bank", report.incident?.platform],
      ["Suspect name", report.incident?.suspectName],
      ["Suspect phone", report.incident?.suspectPhone],
      ["Suspect UPI", report.incident?.suspectUpi],
      ["Suspect URL / details", report.incident?.suspectUrl],
      ["Transaction IDs", report.incident?.transactionIds],
      ["Action requested", report.incident?.actionRequested],
    ])}
  </table>

  <h2>${language === "hi" ? "सारांश" : "Summary"}</h2>
  <div class="summary"><p>${escapeHtml(report.summary?.text || "No summary available.").replace(/\n/g, "<br />")}</p></div>

  <h2>${language === "hi" ? "घटना का विस्तृत विवरण" : "Detailed incident narrative"}</h2>
  <p>${escapeHtml(report.narrative || "No narrative available.").replace(/\n/g, "<br />")}</p>

  <h2>Technical details</h2>
  <p>All recorded fields, including unredacted identifiers and evidence-derived values.</p>
  <pre>${escapeHtml(JSON.stringify(report.fields ?? {}, null, 2))}</pre>
  ${
    report.canonicalEntities
      ? `<h3>Canonical entities</h3><pre>${escapeHtml(JSON.stringify(report.canonicalEntities, null, 2))}</pre>`
      : ""
  }
  ${
    report.extractionCandidates
      ? `<h3>Extraction candidates</h3><pre>${escapeHtml(JSON.stringify(report.extractionCandidates, null, 2))}</pre>`
      : ""
  }

  <h2>Evidence</h2>
  ${evidence || "<p>No evidence was uploaded.</p>"}

  <h2 class="page-break">Transcripts</h2>
  ${
    report.transcript?.raw
      ? `<h3>Raw transcript</h3><p>${escapeHtml(report.transcript.raw).replace(/\n/g, "<br />")}</p>`
      : ""
  }
  ${
    report.transcript?.canonical
      ? `<h3>Canonical transcript</h3><p>${escapeHtml(report.transcript.canonical).replace(/\n/g, "<br />")}</p>`
      : ""
  }

  <div class="disclaimer">
    This report was prepared from information supplied to Cyber Sathi. It is not an official police acknowledgment.
  </div>
</body>
</html>`
  }

  private async convert(
    html: string,
    format: "docx" | "pdf",
    baseName: string,
  ): Promise<Buffer> {
    const root = process.env.CYBER_SATHI_TMP_DIR || tmpdir()
    const dir = await mkdtemp(join(root, "report-export-"))
    try {
      const htmlPath = join(dir, `${baseName}.html`)
      await writeFile(htmlPath, html, "utf8")
      const profile = pathToFileURL(join(dir, "lo-profile")).href
      try {
        await execFileAsync(
          "soffice",
          [
            "--headless",
            "--norestore",
            "--nolockcheck",
            `-env:UserInstallation=${profile}`,
            "--convert-to",
            format === "pdf" ? "pdf" : "docx:MS Word 2007 XML",
            "--outdir",
            dir,
            htmlPath,
          ],
          { timeout: 90_000, maxBuffer: 10 * 1024 * 1024 },
        )
      } catch (error) {
        throw new ServiceUnavailableException(
          `Could not prepare the ${format.toUpperCase()} report: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
      return await readFile(join(dir, `${baseName}.${format}`))
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
