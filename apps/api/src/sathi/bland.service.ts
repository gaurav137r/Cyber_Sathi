import { createHmac, timingSafeEqual } from "node:crypto"
import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Prisma } from "@prisma/client"
import type { AppEnv } from "../config/env.schema"
import { PrismaService } from "../prisma/prisma.service"
import { AiGateway } from "../ai/ai-gateway.service"
import {
  EVIDENCE_EXTRACTION_INSTRUCTION,
  parseExtractionJson,
} from "../evidence/evidence-extraction.service"
import { BLAND_API_BASE, SAATHI_AGENT_ID } from "./bland.config"

type TranscriptMessage = {
  role: string
  content: string
  channel?: string
  blandTurnId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const droppedVoiceKeys = /^(extracted_text|rawTranscript|canonicalTranscript|sathiConversation|content)$/i

/**
 * Keep the voice checkpoint small and always valid JSON. Raw OCR, full
 * transcripts and long report bodies add latency and get echoed by the model.
 */
function compactVoiceValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    const clean = value.replace(/\s+/g, " ").trim()
    return clean.length > 160 ? `${clean.slice(0, 159)}…` : clean
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  )
    return value
  if (Array.isArray(value))
    return value.slice(0, 8).map((item) => compactVoiceValue(item, depth + 1))
  if (isRecord(value)) {
    if (depth >= 2) return undefined
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value).slice(0, 24)) {
      if (droppedVoiceKeys.test(key)) continue
      const compact = compactVoiceValue(entry, depth + 1)
      if (compact !== undefined) result[key] = compact
    }
    return result
  }
  return undefined
}

@Injectable()
export class BlandService {
  private readonly logger = new Logger(BlandService.name)

  private readonly authorizationInFlight = new Map<
    string,
    Promise<{ sessionToken: string; caseId: string }>
  >()

  /** Avoid re-running AI extraction for overlapping webhook transcripts. */
  private readonly voiceExtractionInFlight = new Set<string>()

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly prisma: PrismaService,
    private readonly ai: AiGateway,
  ) {}

  private get apiKey(): string {
    const key = this.config.get("BLAND_API_KEY", { infer: true }) as string | undefined
    if (!key) throw new ServiceUnavailableException("BLAND_API_KEY is not configured")
    return key
  }

  private get webhookSecret(): string | undefined {
    return this.config.get("BLAND_WEBHOOK_SECRET", { infer: true }) as string | undefined
  }

  private get agentId(): string {
    return (this.config.get("BLAND_AGENT_ID", { infer: true }) as string | undefined) || SAATHI_AGENT_ID
  }

  async createSessionToken(
    caseId: string,
    userId: string,
    language?: string,
  ): Promise<{ sessionToken: string; caseId: string }> {
    const foundCase = await this.prisma.case.findFirst({
      where: { id: caseId, userId },
      include: {
        evidenceItems: {
          select: {
            id: true,
            type: true,
            extractedText: true,
            extractedEntities: true,
            uploadedAt: true,
          },
          orderBy: { uploadedAt: "asc" },
        },
        reportVersions: {
          where: { kind: "INTERNAL" },
          select: { version: true, content: true, generatedAt: true },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    })
    if (!foundCase) throw new NotFoundException(`Case ${caseId} was not found`)

    const key = `${userId}:${caseId}`
    const inFlight = this.authorizationInFlight.get(key)
    if (inFlight) return inFlight

    const authorization = this.authorizeOwnedCase(foundCase, userId, language)
    this.authorizationInFlight.set(key, authorization)
    try {
      return await authorization
    } finally {
      if (this.authorizationInFlight.get(key) === authorization) {
        this.authorizationInFlight.delete(key)
      }
    }
  }

  private async authorizeOwnedCase(
    foundCase: Awaited<ReturnType<BlandService["getOwnedCaseForVoice"]>>,
    userId: string,
    language?: string,
  ): Promise<{ sessionToken: string; caseId: string }> {
    const caseId = foundCase.id
    const apiKey = this.apiKey
    const agentId = this.agentId
    let conversation = await this.prisma.conversation.findFirst({
      where: { caseId, userId, status: "active", channel: "voice" },
      orderBy: { updatedAt: "desc" },
    })
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          caseId,
          userId,
          blandAgentId: agentId,
          status: "active",
          channel: "voice",
        },
      })
    }

    const lang = (language || "hi").toLowerCase()
    const authorizeUrl = `${BLAND_API_BASE}/v1/agents/${encodeURIComponent(agentId)}/authorize`
    let response: Response | null = null
    let lastError = ""
    // A transient Cloudflare connect timeout used to surface as a 500 and drop
    // the call before it started. Retry once, then fail with a clear 503.
    for (let attempt = 0; attempt < 2 && !response; attempt += 1) {
      try {
        response = await fetch(authorizeUrl, {
          method: "POST",
          signal: AbortSignal.timeout(8_000),
          headers: {
            Authorization: apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            environment: "production",
            request_data: {
              case_id: caseId,
              conversation_id: conversation.id,
              language: lang,
              // Voice is an agent-level setting. Sending a per-session voice
              // override caused the caller to hear different voices between
              // reconnects, so the agent snapshot is the single source of truth.
              // The Bland agent is never asked to fetch Supabase directly.
              // It receives this bounded, server-generated checkpoint instead.
              case_context_json: this.caseContextForVoice(foundCase),
            },
          }),
        })
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    if (!response) {
      throw new ServiceUnavailableException(
        `Bland authorization could not be reached: ${lastError}`,
      )
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new ServiceUnavailableException(
        `Bland authorization failed (${response.status}${body ? ": " + body.slice(0, 200) : ""})`,
      )
    }

    const data = (await response.json().catch(() => ({}))) as {
      token?: string
      session_token?: string
      sessionToken?: string
    }
    const sessionToken = data.token || data.session_token || data.sessionToken
    if (!sessionToken) {
      throw new ServiceUnavailableException("Bland did not return a session token")
    }
    return { sessionToken, caseId }
  }

  private async getOwnedCaseForVoice(caseId: string, userId: string) {
    return this.prisma.case.findFirst({
      where: { id: caseId, userId },
      include: {
        evidenceItems: {
          select: {
            id: true,
            type: true,
            extractedText: true,
            extractedEntities: true,
            uploadedAt: true,
          },
          orderBy: { uploadedAt: "asc" },
        },
        reportVersions: {
          where: { kind: "INTERNAL" },
          select: { version: true, content: true, generatedAt: true },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    })
  }

  /**
   * Bland only needs a compact, authoritative checkpoint. Avoid sending raw OCR
   * text blobs or the full previous report: they add latency, cost and prompt
   * load to every voice call.
   */
  private caseContextForVoice(foundCase: NonNullable<Awaited<ReturnType<BlandService["getOwnedCaseForVoice"]>>>) {
    const fields = isRecord(foundCase.structuredFields)
      ? foundCase.structuredFields
      : {}
    const confirmed = isRecord(fields.confirmedFields)
      ? compactVoiceValue(fields.confirmedFields)
      : {}
    const extracted = isRecord(fields.extractedCandidates)
      ? compactVoiceValue(fields.extractedCandidates)
      : {}
    const latestReport = foundCase.reportVersions[0]
    const snapshot: Record<string, unknown> = {
      caseId: foundCase.id,
      category: foundCase.category,
      confirmedFields: confirmed,
      extractedCandidates: extracted,
      evidence: foundCase.evidenceItems.slice(-3).map((item) => ({
        id: item.id,
        type: item.type,
        at: item.uploadedAt,
        fields: compactVoiceValue(item.extractedEntities),
      })),
      latestReport: latestReport
        ? {
            version: latestReport.version,
            generatedAt: latestReport.generatedAt,
          }
        : null,
    }
    let serialized = JSON.stringify(snapshot)
    // Never slice JSON text: half an object is not valid JSON and makes the
    // voice model hallucinate. Drop the optional blocks instead.
    if (serialized.length > 6_000) {
      snapshot.evidence = []
      serialized = JSON.stringify(snapshot)
    }
    if (serialized.length > 6_000) {
      delete snapshot.extractedCandidates
      serialized = JSON.stringify(snapshot)
    }
    return serialized
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): void {
    const secret = this.webhookSecret
    if (!secret) return
    if (!signature) throw new UnauthorizedException("Missing Bland webhook signature")
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("Invalid Bland webhook signature")
    }
  }

  async saveWebhookTranscript(
    conversationId: string | undefined,
    blandCallId: string | undefined,
    messages: TranscriptMessage[],
  ): Promise<void> {
    if (!messages.length) return
    let conversation = conversationId
      ? await this.prisma.conversation.findUnique({ where: { id: conversationId } })
      : null
    if (!conversation && blandCallId) {
      conversation = await this.prisma.conversation.findFirst({
        where: { blandSessionId: blandCallId },
      })
    }
    if (!conversation) return

    await this.prisma.$transaction(async (tx) => {
      await tx.message.createMany({
        data: messages.map((msg) => ({
          conversationId: conversation!.id,
          role: msg.role,
          content: msg.content,
          channel: msg.channel || "voice",
          blandTurnId: msg.blandTurnId,
        })),
      })
      await tx.conversation.update({
        where: { id: conversation!.id },
        data: {
          blandSessionId: blandCallId ?? conversation!.blandSessionId,
          updatedAt: new Date(),
        },
      })
    }, { timeout: 20_000 })

    // Extract report fields from the call in the background. Bland stays a
    // voice channel; the backend owns understanding, storage and report merges.
    if (!this.voiceExtractionInFlight.has(conversation.id)) {
      this.voiceExtractionInFlight.add(conversation.id)
      void this.extractCallFacts(conversation.id, messages)
        .catch((error) => {
          this.logger.warn(
            `Voice transcript field extraction failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        })
        .finally(() => this.voiceExtractionInFlight.delete(conversation!.id))
    }
  }

  /**
   * Turns a finished voice transcript into unconfirmed case fields. The user
   * validates them in chat or the review screen before they become final.
   */
  private async extractCallFacts(
    conversationId: string,
    messages: TranscriptMessage[],
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    })
    if (!conversation) return

    const transcript = messages
      .filter((message) => message.content?.trim())
      .map((message) => `${message.role === "user" ? "USER" : "AGENT"}: ${message.content.trim()}`)
      .join("\n")
      .slice(0, 24_000)
    if (transcript.length < 20) return

    const primaryModel = this.config.get("FAST_MODEL", { infer: true }) ?? "openai/gpt-oss-20b"
    const fallbackModel = this.config.get("GEMINI_TEXT_FALLBACK", { infer: true }) ?? "gemini-3.1-flash-lite"
    const result = await this.ai.generateText({
      primary: "groq",
      primaryModel,
      primaryModels: [primaryModel, "openai/gpt-oss-120b"],
      fallback: "gemini",
      fallbackModel,
      fallbackModels: [fallbackModel, this.config.get("GEMINI_TEXT_MODEL", { infer: true })],
      messages: [
        { role: "system", content: EVIDENCE_EXTRACTION_INSTRUCTION },
        {
          role: "user",
          content: `Untrusted voice-call transcript:\n"""\n${transcript}\n"""`,
        },
      ],
      temperature: 0,
      maxTokens: 1600,
      json: true,
      timeoutMs: 60_000,
    })

    const entities = parseExtractionJson(result.text)
    if (!entities) return

    const foundCase = await this.prisma.case.findUnique({
      where: { id: conversation.caseId },
    })
    if (!foundCase) return

    const fields = isRecord(foundCase.structuredFields)
      ? foundCase.structuredFields
      : {}
    const existingCandidates = isRecord(fields.extractedCandidates)
      ? fields.extractedCandidates
      : {}
    const candidates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(entities)) {
      if (key === "extracted_text" || key === "uncertainty") continue
      if (value === null || value === undefined || value === "") continue
      candidates[key] = value
    }
    if (!Object.keys(candidates).length) return

    const sourceId = `voice:${conversationId}`
    const evidenceSummary = Array.isArray(fields.evidence) ? fields.evidence : []
    const nextEvidence = [
      ...evidenceSummary.filter((entry) => !isRecord(entry) || entry.evidenceId !== sourceId),
      {
        evidenceId: sourceId,
        type: "VOICE_CALL",
        extractedAt: new Date().toISOString(),
        fields: candidates,
      },
    ]

    await this.prisma.case.update({
      where: { id: conversation.caseId },
      data: {
        rawTranscript: [foundCase.rawTranscript, transcript]
          .filter(Boolean)
          .join("\n")
          .slice(0, 20_000),
        structuredFields: {
          ...fields,
          extractedCandidates: { ...existingCandidates, ...candidates },
          evidence: nextEvidence,
        } as unknown as Prisma.InputJsonValue,
      },
    })
  }
}
