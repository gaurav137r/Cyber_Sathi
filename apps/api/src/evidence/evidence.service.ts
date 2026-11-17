import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { randomUUID } from "node:crypto"
import { EvidenceType, Prisma } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { SupabaseStorageService } from "../storage/supabase-storage.service"
import { AuthUser } from "../auth/auth.service"
import { EntityResolutionService } from "./entity-resolution.service"
import {
  EvidenceExtractionService,
  type EvidenceFile,
} from "./evidence-extraction.service"
import { ExtractedEntities } from "./entity.types"
import type { AppEnv } from "../config/env.schema"

const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function extensionForMime(mimetype: string): string {
  const mime = mimetype.toLowerCase()
  if (mime === "image/png") return "png"
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/webp") return "webp"
  if (mime === "image/gif") return "gif"
  if (mime === "application/pdf") return "pdf"
  if (mime === "audio/mpeg") return "mp3"
  if (mime === "audio/wav" || mime === "audio/x-wav") return "wav"
  if (mime === "audio/ogg") return "ogg"
  if (mime === "audio/mp4") return "m4a"
  if (mime === "video/mp4") return "mp4"
  if (mime === "application/json") return "json"
  if (mime === "text/plain") return "txt"
  return "bin"
}

function detectEvidenceType(file: EvidenceFile): EvidenceType {
  const mime = file.mimetype.toLowerCase()
  if (mime.startsWith("image/")) return EvidenceType.IMAGE
  if (mime.startsWith("audio/")) return EvidenceType.AUDIO
  if (mime.startsWith("video/")) return EvidenceType.SCREENSHOT
  if (mime === "application/pdf") return EvidenceType.DOCUMENT
  if (mime.startsWith("text/") || mime === "application/json") return EvidenceType.DOCUMENT
  return EvidenceType.DOCUMENT
}

export type EvidenceItemView = {
  id: string
  caseId: string
  type: EvidenceType
  storageKey: string
  extractedText: string | null
  extractedEntities: Record<string, unknown> | null
  processingStatus: "ready" | "failed" | "processing"
  extractionError?: string
  uploadedAt: Date
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly storage: SupabaseStorageService,
    private readonly entities: EntityResolutionService,
    private readonly extraction: EvidenceExtractionService,
  ) {}

  async upload(
    caseId: string,
    file: EvidenceFile & { originalname?: string },
    user: AuthUser,
    requestedType?: EvidenceType,
  ): Promise<EvidenceItemView> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Evidence must be a non-empty file.")
    }
    if (file.buffer.length > MAX_EVIDENCE_BYTES) {
      throw new BadRequestException("Evidence must be no larger than 25 MB.")
    }
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId: user.id },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)

    const type = requestedType ?? detectEvidenceType(file)
    const objectKey = `${caseId}/${randomUUID()}.${extensionForMime(file.mimetype)}`
    await this.storage.upload("evidence", objectKey, file.buffer, file.mimetype || "application/octet-stream")

    let evidence
    try {
      evidence = await this.prisma.evidenceItem.create({
        data: { caseId, storageKey: objectKey, type },
      })
    } catch (error) {
      await this.storage.remove("evidence", objectKey).catch(() => undefined)
      throw error
    }

    await this.prisma.auditLogEntry
      .create({
        data: {
          caseId,
          actorUserId: user.id,
          action: "EVIDENCE_UPLOADED",
          metadata: { evidenceId: evidence.id, type },
        },
      })
      .catch(() => undefined)

    const processed = await this.extractAndStore(caseId, evidence.id, file, type, user.id)

    return {
      id: evidence.id,
      caseId,
      type,
      storageKey: objectKey,
      extractedText: processed.extractedText,
      extractedEntities: processed.extractedEntities,
      processingStatus: processed.processingStatus,
      extractionError: processed.extractionError,
      uploadedAt: evidence.uploadedAt,
    }
  }

  async getEvidence(
    caseId: string,
    evidenceId: string,
    user: AuthUser,
  ): Promise<EvidenceItemView> {
    const item = await this.prisma.evidenceItem.findFirst({
      where: { id: evidenceId, caseId, case: { userId: user.id } },
    })
    if (!item) throw new NotFoundException(`Evidence ${evidenceId} was not found`)
    return {
      id: item.id,
      caseId: item.caseId,
      type: item.type,
      storageKey: item.storageKey,
      extractedText: item.extractedText,
      extractedEntities: (item.extractedEntities ?? null) as Record<string, unknown> | null,
      processingStatus: item.extractedEntities
        ? "ready"
        : item.extractedText
          ? "ready"
          : "failed",
      ...(item.extractedEntities || item.extractedText
        ? {}
        : { extractionError: "No structured fields were extracted for this file." }),
      uploadedAt: item.uploadedAt,
    }
  }

  async processEvidence(
    caseId: string,
    evidenceId: string,
    user: AuthUser,
  ): Promise<EvidenceItemView> {
    return this.processOwnedEvidence(caseId, evidenceId, user.id)
  }

  /** Re-runs extraction for a stored item (used by tests / retry flows). */
  async processQueuedEvidence(
    caseId: string,
    evidenceId: string,
    userId: string,
  ): Promise<EvidenceItemView> {
    return this.processOwnedEvidence(caseId, evidenceId, userId)
  }

  private async processOwnedEvidence(
    caseId: string,
    evidenceId: string,
    userId: string,
  ): Promise<EvidenceItemView> {
    const item = await this.prisma.evidenceItem.findFirst({
      where: { id: evidenceId, caseId, case: { userId } },
    })
    if (!item) throw new NotFoundException(`Evidence ${evidenceId} was not found`)
    const buffer = await this.storage.download("evidence", item.storageKey)
    const file: EvidenceFile & { originalname?: string } = {
      buffer,
      mimetype: this.mimeFromKey(item.storageKey),
      size: buffer.length,
    }
    const processed = await this.extractAndStore(caseId, item.id, file, item.type, userId)
    return {
      id: item.id,
      caseId,
      type: item.type,
      storageKey: item.storageKey,
      extractedText: processed.extractedText,
      extractedEntities: processed.extractedEntities,
      processingStatus: processed.processingStatus,
      extractionError: processed.extractionError,
      uploadedAt: item.uploadedAt,
    }
  }

  private async extractAndStore(
    caseId: string,
    evidenceId: string,
    file: EvidenceFile & { originalname?: string },
    type: EvidenceType,
    actorUserId?: string,
  ): Promise<{
    extractedText: string | null
    extractedEntities: Record<string, unknown> | null
    processingStatus: "ready" | "failed"
    extractionError?: string
  }> {
    const result = await this.extraction.extract(file, type)
    const entities = result.entities
    const extractedText = result.text ?? (typeof entities?.extracted_text === "string" ? entities.extracted_text : null)

    await this.prisma.evidenceItem.update({
      where: { id: evidenceId },
      data: {
        extractedText: extractedText ? extractedText.slice(0, 30_000) : null,
        ...(entities ? { extractedEntities: entities as Prisma.InputJsonValue } : {}),
      },
    })

    await this.mergeIntoCaseReport(caseId, evidenceId, type, extractedText, entities)

    if (actorUserId) {
      await this.prisma.auditLogEntry
        .create({
          data: {
            caseId,
            actorUserId,
            action: entities ? "EVIDENCE_READY" : "EVIDENCE_FAILED",
            metadata: {
              evidenceId,
              status: entities ? "ready" : "failed",
              provider: result.provider ?? "none",
              ...(result.error ? { error: result.error.slice(0, 500) } : {}),
            },
          },
        })
        .catch(() => undefined)
    }

    if (!entities) {
      if (result.error) this.logger.warn(`Evidence ${evidenceId} extraction failed: ${result.error}`)
      return {
        extractedText,
        extractedEntities: null,
        processingStatus: "failed",
        extractionError: result.error ?? "No structured fields could be extracted.",
      }
    }
    return { extractedText, extractedEntities: entities, processingStatus: "ready" }
  }

  /**
   * Adds AI-extracted fields to the case report JSON so the Sathi/Bland agent can
   * read them, confirm them with the user, and ask for whatever is still missing.
   */
  private async mergeIntoCaseReport(
    caseId: string,
    evidenceId: string,
    type: EvidenceType,
    extractedText: string | null,
    entities: Record<string, unknown> | null,
  ): Promise<void> {
    const foundCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: { evidenceItems: true },
    })
    if (!foundCase) return

    const existingFields = isRecord(foundCase.structuredFields) ? foundCase.structuredFields : {}
    const existingCandidates = isRecord(existingFields.extractedCandidates)
      ? existingFields.extractedCandidates
      : {}

    const candidates: Record<string, unknown> = {}
    if (entities) {
      for (const [key, value] of Object.entries(entities)) {
        if (key === "extracted_text" || key === "uncertainty") continue
        if (value === null || value === undefined || value === "") continue
        candidates[key] = value
      }

      // Keep a stable, UI/report-friendly alias beside the extraction model's
      // snake_case output. These remain *candidates* until the victim confirms
      // them; they must never overwrite a confirmed case field.
      const alias = (target: string, ...keys: string[]) => {
        const value = keys.map((key) => candidates[key]).find(
          (candidate) => candidate !== null && candidate !== undefined && candidate !== "",
        )
        if (value !== undefined) candidates[target] = value
      }
      alias("suspectPhone", "suspect_phone", "caller_number", "mobile_number")
      alias("suspectUpi", "upi_id", "suspect_upi")
      alias("suspectDetails", "url", "suspect_url")
      alias("platform", "bank_or_app", "upi_app_used", "mode_of_transfer")
      alias("incidentDate", "incident_datetime", "date_of_incident")
      alias("summary", "description", "narrative", "short_description")
      alias("transactionId", "transaction_id", "utr_number", "reference_number")
    }
    const extractedCandidates = { ...existingCandidates, ...candidates }
    const evidenceSummary = Array.isArray(existingFields.evidence)
      ? existingFields.evidence
      : []
    const nextEvidence = [
      ...evidenceSummary.filter((entry) => !isRecord(entry) || entry.evidenceId !== evidenceId),
      {
        evidenceId,
        type,
        extractedAt: new Date().toISOString(),
        fields: candidates,
        ...(extractedText ? { textPreview: extractedText.slice(0, 500) } : {}),
      },
    ]

    const structuredFields = {
      ...existingFields,
      extractedCandidates,
      evidence: nextEvidence,
    }

    await this.prisma.case.update({
      where: { id: caseId },
      data: { structuredFields: structuredFields as Prisma.InputJsonValue },
    })

    // Also refresh the canonical entity view (phone / UPI / URL / amount).
    const canonicalInput = this.extraction.toCanonicalInputs(entities, `evidence-${type.toLowerCase()}`)
    const sources = foundCase.evidenceItems
      .filter((item) => item.id !== evidenceId)
      .map((item) => ({
        evidenceId: item.id,
        sourceType: `evidence-${item.type.toLowerCase()}`,
        entities: this.entities.extractFromText(item.extractedText ?? ""),
      }))
      .concat(
        canonicalInput
          ? [{ evidenceId, sourceType: canonicalInput.sourceType, entities: canonicalInput.entities }]
          : [],
      )
    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        canonicalEntities: this.entities.merge(
          sources,
          foundCase.rawTranscript ? this.entities.extractFromText(foundCase.rawTranscript) : undefined,
        ) as unknown as Prisma.InputJsonValue,
      },
    })
  }

  async signedUrl(id: string, user: AuthUser): Promise<{
    id: string
    url: string
    expiresInSeconds: number
  }> {
    const evidence = await this.prisma.evidenceItem.findFirst({
      where: { id, case: { userId: user.id } },
    })
    if (!evidence) throw new NotFoundException(`Evidence ${id} was not found`)
    const expiresInSeconds = 900
    let url: string
    try {
      url = await this.storage.createSignedUrl("evidence", evidence.storageKey, expiresInSeconds)
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : "Evidence preview is unavailable.",
      )
    }
    return { id, url, expiresInSeconds }
  }

  async resolveCaseEntities(
    caseId: string,
    transcript: string | null,
    sources: Array<{
      evidenceId: string
      sourceType: string
      entities: ExtractedEntities
    }>,
  ) {
    return this.prisma.case.update({
      where: { id: caseId },
      data: {
        canonicalEntities: this.entities.merge(
          sources,
          transcript ? this.entities.extractFromText(transcript) : undefined,
        ) as unknown as Prisma.InputJsonValue,
      },
    })
  }

  private mimeFromKey(key: string): string {
    const ext = key.split(".").pop()?.toLowerCase()
    switch (ext) {
      case "png":
        return "image/png"
      case "jpg":
      case "jpeg":
        return "image/jpeg"
      case "webp":
        return "image/webp"
      case "gif":
        return "image/gif"
      case "pdf":
        return "application/pdf"
      case "mp3":
        return "audio/mpeg"
      case "wav":
        return "audio/wav"
      case "ogg":
        return "audio/ogg"
      case "m4a":
        return "audio/mp4"
      case "mp4":
        return "video/mp4"
      case "json":
        return "application/json"
      case "txt":
        return "text/plain"
      default:
        return "application/octet-stream"
    }
  }
}
