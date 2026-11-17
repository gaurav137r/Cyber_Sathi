import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import { CaseStatus, Prisma } from "@prisma/client"

import { AuthUser } from "../auth/auth.service"

import { filingRoutes } from "../classification/routing.config"

import { classificationCategories } from "../classification/classification.types"

import { PrismaService } from "../prisma/prisma.service"
import type { AppEnv } from "../config/env.schema"
import { KeyPool } from "../ai/key-pool"
import { AiGateway } from "../ai/ai-gateway.service"
import { SupabaseStorageService } from "../storage/supabase-storage.service"
import { randomUUID } from "node:crypto"
import { CaseInteractionsService } from "./case-interactions.service"
import { ReportCompilerService } from "../reports/report-compiler.service"
import { caseInputFields, evidenceCategories } from "./case-interactions.dto"

import { GeminiProvider, type GeminiLiveSession } from "./gemini.provider"

import { SATHI_AGENT_NAME } from "./sathi.prompt"

import { DeviceContextDto } from "./sathi.dto"

import {
  DeviceContextSource,
  emptySathiFacts,
  SathiClientAction,
  SathiFacts,
  SathiMessage,
  SathiSessionState,
  sathiChannels,
} from "./sathi.types"
import { detectLanguage } from "./language-detect"

type SathiVoiceProvider = "bland" | "gemini"

type SathiCaseSnapshot = Prisma.CaseGetPayload<{
  select: {
    structuredFields: true
    evidenceItems: {
      select: {
        id: true
        type: true
        storageKey: true
        extractedEntities: true
        uploadedAt: true
      }
    }
    reportVersions: {
      select: { id: true; version: true; content: true; generatedAt: true }
    }
  }
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

@Injectable()
export class SathiService {
  private readonly logger = new Logger(SathiService.name)
  private readonly stateStore = new Map<string, SathiSessionState>()
  // Sathi uses one durable conversation per case/user. Caching its id removes
  // a remote lookup from every chat turn and every streamed voice transcript.
  private readonly sathiConversationIds = new Map<string, string>()

  constructor(
    private readonly prisma: PrismaService,

    private readonly gemini: GeminiProvider,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly keyPool: KeyPool,
    private readonly ai: AiGateway,
    private readonly storage: SupabaseStorageService,
    private readonly interactions: CaseInteractionsService,
    private readonly reportCompiler: ReportCompilerService,
  ) {}

  async startNewSession(
    user: AuthUser,
    languageHint?: string,
    provider: SathiVoiceProvider = "gemini",
  ) {
    const created = await this.prisma.case.create({
      data: {
        userId: user.id,

        detectedLanguage: languageHint,

        structuredFields: {} as Prisma.InputJsonValue,

        canonicalEntities: {} as Prisma.InputJsonValue,
      },
    })

    await this.audit(created.id, user.id, "CASE_CREATED", { source: "sathi" })

    return this.startSession(created.id, user, languageHint, provider)
  }

  async startSession(
    caseId: string,
    user: AuthUser,
    languageHint?: string,
    provider: SathiVoiceProvider = "gemini",
  ) {
    const foundCase = await this.requireCase(caseId, user.id)

    const language =
      languageHint ||
      foundCase.detectedLanguage ||
      user.preferredLanguage ||
      "en"

    const state =
      (await this.readState(caseId)) ??
      this.seedState(caseId, language, foundCase.structuredFields)

    await this.restorePersistedConversation(state, caseId, user.id)
    this.hydrateFactsFromEvidence(state.facts, foundCase.structuredFields)

    state.language = language

    // The greeting is a real chat turn too. Persist it immediately so a
    // refresh or API restart can restore a brand-new conversation verbatim.
    if (!state.messages.length && state.lastReply) {
      state.messages.push({ role: "model", parts: [{ text: state.lastReply }] })
      await this.appendTranscriptMessages(caseId, user.id, [
        { role: "model", text: state.lastReply, channel: "chat" },
      ])
    }

    await this.writeState(state)

    const snapshot = await this.persistCase(
      foundCase.id,
      user.id,
      state,
      undefined,
      foundCase,
    )

    const liveEnabled =
      provider === "gemini" &&
      this.config.get("GEMINI_LIVE_ENABLED", { infer: true }) &&
      this.gemini.isConfigured()

    await this.audit(caseId, user.id, "SATHI_SESSION_STARTED", {
      language,
      provider,
      live: liveEnabled,
    })

    let live: GeminiLiveSession | null = null
    if (liveEnabled) {
      try {
        live = await this.gemini.createLiveSession(language, state.facts)
      } catch (error) {
        // Live voice is optional; text chat must keep working even when the
        // Gemini Live endpoint/model is unavailable.
        this.logger.warn(
          `Gemini Live session unavailable; continuing in text mode: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    return this.toResponse(state, live, snapshot)
  }

  async state(caseId: string, user: AuthUser) {
    const foundCase = await this.requireCase(caseId, user.id)

    const state =
      (await this.readState(caseId)) ??
      this.seedState(
        caseId,
        user.preferredLanguage || "en",
        foundCase.structuredFields,
      )

    await this.restorePersistedConversation(state, caseId, user.id)
    this.hydrateFactsFromEvidence(state.facts, foundCase.structuredFields)

    return this.toResponse(state, null)
  }

  async speech(caseId: string, user: AuthUser, text: string, language: string) {
    await this.requireCase(caseId, user.id)
    const audio = await this.gemini.generateSpeech(text, language)
    return { mimeType: "audio/wav", data: audio }
  }

  async turn(
    caseId: string,
    user: AuthUser,
    input: {
      text?: string
      language?: string
      audio?: { mimetype: string; buffer: Buffer }
    },
  ) {
    if (!input.text?.trim() && !input.audio)
      throw new BadRequestException("Provide spoken audio or text for Sathi")

    const foundCase = await this.requireCase(caseId, user.id)

    const language =
      input.language ||
      foundCase.detectedLanguage ||
      user.preferredLanguage ||
      "en"

    const state =
      (await this.readState(caseId)) ??
      this.seedState(caseId, language, foundCase.structuredFields)

    // The in-memory state already has the greeting/history for a live session.
    // Only hit the transcript table when the state was rebuilt (for example
    // after an API restart) to avoid a slow round trip on every chat turn.
    if (!state.messages.length)
      await this.restorePersistedConversation(state, caseId, user.id)
    this.hydrateFactsFromEvidence(state.facts, foundCase.structuredFields)
    const messageCountBeforeTurn = state.messages.length

    state.language = language

    state.clientAction = null

    const userParts: Array<Record<string, unknown>> = []

    if (input.text?.trim()) userParts.push({ text: input.text.trim() })

    // Detect language from user's latest text message
    const userText = input.text?.trim() || ""
    const detectedLang = userText ? detectLanguage(userText) : language

    if (input.audio) {
      userParts.push({
        inlineData: {
          mimeType: input.audio.mimetype || "audio/webm",

          data: input.audio.buffer.toString("base64"),
        },
      })
    }

    // Save the caller's turn before any model/network work, but let the write
    // overlap the model call. A transient model failure must not make the
    // user's statement disappear.
    const userTranscriptWrite = this.appendTranscriptMessages(caseId, user.id, [
      {
        role: "user",
        text: input.audio
          ? "The user shared a voice statement in this turn."
          : input.text!.trim(),
        channel: input.audio ? "voice" : "chat",
      },
    ]).catch((error) => {
      this.logger.warn(
        `Could not save the user turn: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })

    const result = await this.gemini.generateTurn({
      language: detectedLang,

      facts: state.facts,

      history: state.messages,

      userParts,
    })

    // Audio is forwarded to Gemini for this turn, but its base64 payload is never
    // retained in the Redis conversation history.
    state.messages.push({
      role: "user",
      parts: input.audio
        ? [{ text: "The user shared a voice statement in this turn." }]
        : userParts,
    })

    state.messages.push({ role: "model", parts: result.modelParts })

    state.lastReply = result.text || null

    const toolFollowUps: SathiMessage[] = []

    for (const call of result.functionCalls) {
      const toolResult = await this.executeTool(state, call.name, call.args, user)

      toolFollowUps.push({
        role: "user",

        parts: [
          {
            functionResponse: {
              ...(call.id ? { id: call.id } : {}),
              name: call.name,
              response: toolResult,
            },
          },
        ],
      })

      if (state.clientAction) break
    }

    if (toolFollowUps.length && !state.clientAction) {
      state.messages.push(...toolFollowUps)
      // The prompt asks for the follow-up question in the same response as the
      // tool call. Only compose a deterministic question when the model
      // returned no text, so saving facts never costs a second AI round trip.
      if (!result.text?.trim()) {
        const prompt = this.nextPrompt(state.facts)
        state.lastReply = prompt
        state.messages.push({ role: "model", parts: [{ text: prompt }] })
      }
    } else {
      state.messages.push(...toolFollowUps)
    }

    const modelTranscriptWrite = this.appendTranscriptMessages(
      caseId,
      user.id,
      this.transcriptMessagesFrom(state.messages.slice(messageCountBeforeTurn), "chat")
        .filter((message) => message.role === "model"),
    )

    const [, , snapshot] = await Promise.all([
      userTranscriptWrite,
      modelTranscriptWrite,
      this.persistCase(foundCase.id, user.id, state, input.text, foundCase),
    ])

    await this.writeState(state)

    return this.toResponse(state, null, snapshot)
  }

  async submitDeviceContext(
    caseId: string,
    user: AuthUser,
    body: DeviceContextDto,
  ) {
    const foundCase = await this.requireCase(caseId, user.id)

    const state =
      (await this.readState(caseId)) ??
      this.seedState(
        caseId,
        user.preferredLanguage || "en",
        foundCase.structuredFields,
      )

    if (!state.messages.length)
      await this.restorePersistedConversation(state, caseId, user.id)
    this.hydrateFactsFromEvidence(state.facts, foundCase.structuredFields)

    const phone = this.normalizePhone(body.phone)

    state.facts.suspectPhone = phone

    if (body.source === "CALL" || body.source === "SMS")
      state.facts.channel = body.source

    state.facts.missingFields = state.facts.missingFields.filter(
      (field) => field !== "suspectPhone" && field !== "channel",
    )

    state.clientAction = null

    state.lastReply = `${SATHI_AGENT_NAME} saved the ${body.source.toLowerCase()} number ${phone}. ${this.nextPrompt(state.facts)}`

    state.messages.push({
      role: "user",

      parts: [
        {
          text: `Selected ${body.source} number ${phone}${
            body.label ? ` (${body.label})` : ""
          }.`,
        },
      ],
    })

    state.messages.push({
      role: "model",
      parts: [{ text: state.lastReply }],
    })

    const [, snapshot] = await Promise.all([
      this.appendTranscriptMessages(caseId, user.id, [
        {
          role: "user",
          text: `Selected ${body.source} number ${phone}${
            body.label ? ` (${body.label})` : ""
          }.`,
          channel: "chat",
        },
        { role: "model", text: state.lastReply, channel: "chat" },
      ]),
      this.persistCase(caseId, user.id, state, undefined, foundCase),
    ])

    await this.writeState(state)

    await this.audit(caseId, user.id, "SATHI_DEVICE_CONTEXT_SAVED", {
      source: body.source,
      hasLabel: Boolean(body.label),
    })

    return this.toResponse(state, null, snapshot)
  }

  /**
   * Bland voice turns arrive over a separate websocket, so they do not pass
   * through `turn`. Store their final display transcript in the same durable
   * conversation as typed turns before a disconnect can lose it.
   */
  async recordTranscript(
    caseId: string,
    user: AuthUser,
    role: "user" | "model",
    text: string,
  ) {
    const cleanText = text.trim()
    if (!cleanText) throw new BadRequestException("Transcript text is required")

    const foundCase = await this.requireCase(caseId, user.id)
    const state =
      (await this.readState(caseId)) ??
      this.seedState(
        caseId,
        foundCase.detectedLanguage || user.preferredLanguage || "en",
        foundCase.structuredFields,
      )

    if (!state.messages.length)
      await this.restorePersistedConversation(state, caseId, user.id)
    this.hydrateFactsFromEvidence(state.facts, foundCase.structuredFields)

    state.messages.push({ role, parts: [{ text: cleanText }] })
    if (role === "model") state.lastReply = cleanText

    await Promise.all([
      this.appendTranscriptMessages(caseId, user.id, [
        { role, text: cleanText, channel: "voice" },
      ]),
      this.persistCase(
        caseId,
        user.id,
        state,
        role === "user" ? cleanText : undefined,
        foundCase,
      ),
    ])
    await this.writeState(state)
    return { saved: true }
  }

  private async executeTool(
    state: SathiSessionState,
    name: string,
    args: Record<string, unknown>,
    user: AuthUser,
  ) {
    switch (name) {
      case "request_case_input": {
        const field = String(args.field ?? "")
        if (!caseInputFields.includes(field as (typeof caseInputFields)[number]))
          return { ok: false, error: "unsupported_field" }
        return {
          ok: true,
          ...(await this.interactions.requestField(
            state.caseId,
            user.id,
            field as (typeof caseInputFields)[number],
            typeof args.displayPrompt === "string" ? args.displayPrompt.slice(0, 160) : undefined,
          )),
        }
      }
      case "request_case_evidence": {
        const category = String(args.category ?? "")
        if (!evidenceCategories.includes(category as (typeof evidenceCategories)[number]))
          return { ok: false, error: "unsupported_evidence_category" }
        return {
          ok: true,
          ...(await this.interactions.requestEvidence(
            state.caseId,
            user.id,
            category as (typeof evidenceCategories)[number],
          )),
        }
      }
      case "get_case_state":
        return { ok: true, ...(await this.interactions.getState(state.caseId, user.id)) }
      case "request_case_review":
        return { ok: true, ...(await this.interactions.requestReview(state.caseId, user.id)) }
      case "generate_case_report": {
        const caseState = await this.interactions.getState(state.caseId, user.id)
        if (!caseState.review.currentRevisionConfirmed) {
          const request = await this.interactions.requestReview(state.caseId, user.id)
          return { ok: false, status: "review_required", requestId: request.requestId }
        }
        const report = await this.reportCompiler.compile(
          state.caseId,
          user,
          undefined,
          caseState.revision,
        )
        return { ok: true, reportId: report.id, status: "ready" }
      }
      case "generate_social_post": {
        const platform = String(args.platform ?? "")
        const tone = String(args.tone ?? "")
        if (!["twitter", "instagram", "whatsapp"].includes(platform) || !["warning", "informational"].includes(tone))
          return { ok: false, error: "unsupported_post_option" }
        return {
          ok: true,
          status: "ready",
          ...(await this.createSocialPost(
            state.caseId,
            tone as "warning" | "informational",
            platform as "twitter" | "instagram" | "whatsapp",
            user,
          )),
        }
      }
      case "flag_human_support":
        return this.interactions.flagHumanSupport(state.caseId, user.id)
      case "save_incident_facts":
        this.mergeFacts(state.facts, args)

        return { ok: true, facts: state.facts }

      case "set_fraud_category": {
        const category = String(args.category ?? "UNCERTAIN")

        state.facts.category =
          (classificationCategories as readonly string[]).includes(category)
            ? category as SathiFacts["category"]
            : "UNCERTAIN"

        state.facts.categoryConfidence =
          typeof args.confidence === "number" ? args.confidence : 0

        state.facts.explanation =
          typeof args.explanation === "string" ? args.explanation : null

        return {
          ok: true,
          category: state.facts.category,
          route: filingRoutes[state.facts.category ?? "UNCERTAIN"],
        }
      }

      case "request_device_phone_picker": {
        const source = this.asSource(args.source)

        const candidates = Array.isArray(args.candidates)
          ? args.candidates.map(String)
          : []

        state.clientAction = {
          type: "PICK_PHONE_NUMBER",

          source,

          prompt: String(args.prompt ?? "Which number contacted you?"),

          candidates,
        }

        return { ok: true, waitingForUser: true, source }
      }

      case "mark_missing_fields":
        state.facts.missingFields = Array.isArray(args.missingFields)
          ? args.missingFields.map(String)
          : state.facts.missingFields

        if (typeof args.nextQuestion === "string")
          state.lastReply = args.nextQuestion

        return { ok: true, missingFields: state.facts.missingFields }

      case "complete_intake":
        state.facts.intakeComplete = Boolean(
          state.facts.narrative &&
            state.facts.category &&
            state.facts.category !== "UNCERTAIN",
        )

        if (typeof args.summary === "string") {
          state.facts.description = args.summary

          state.lastReply = args.summary
        }

        return { ok: true, intakeComplete: state.facts.intakeComplete }

      default:
        return { ok: false, error: `Unknown tool ${name}` }
    }
  }

  private mergeFacts(facts: SathiFacts, args: Record<string, unknown>) {
    const assignString = (key: keyof SathiFacts) => {
      if (typeof args[key] === "string" && args[key])
        (facts[key] as string) = (args[key] as string)
    }

    assignString("narrative")

    assignString("incidentAt")

    assignString("suspectPhone")

    assignString("victimPhone")

    assignString("upiId")

    assignString("bankOrApp")

    assignString("url")

    assignString("description")

    if (typeof args.amount === "number" && Number.isFinite(args.amount))
      facts.amount = args.amount

    if (typeof args.channel === "string")
      facts.channel = (args.channel as SathiFacts["channel"])

    if (Array.isArray(args.transactionIds))
      facts.transactionIds = args.transactionIds.map(String)

    if (isRecord(args.portalFields)) {
      const blocked = /(^|\.)(nationalId(Number)?|aadhaar|pan|passport|voterId|drivingLicence|cardNumber|cvv|otp|pin|password|accountNumber)$/i
      const safeEntries = Object.entries(args.portalFields).filter(([key, value]) =>
        !blocked.test(key) &&
        (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value)),
      )
      facts.portalFields = { ...facts.portalFields, ...Object.fromEntries(safeEntries) }
    }

    facts.missingFields = this.computeMissing(facts)
  }

  private computeMissing(facts: SathiFacts): string[] {
    const missing: string[] = []

    if (!facts.narrative) missing.push("narrative")

    if (!facts.category || facts.category === "UNCERTAIN")
      missing.push("category")

    if (!facts.incidentAt) missing.push("incidentAt")

    if (!facts.channel) missing.push("channel")

    if (!facts.suspectPhone && !facts.url && !facts.upiId)
      missing.push("suspectIdentifier")

    if (
      (facts.category === "UPI_FRAUD" ||
        facts.category === "CARD_FRAUD" ||
        facts.category === "NET_BANKING_FRAUD") &&
      facts.amount == null
    ) {
      missing.push("amount")
    }

    return missing
  }

  /**
   * Evidence is deliberately stored as an unconfirmed candidate. On a resumed
   * conversation it still needs to inform Sathi's next question; otherwise a
   * receipt can be present in Supabase yet the assistant asks for the same
   * amount, UPI ID, or transaction reference again.
   */
  private hydrateFactsFromEvidence(facts: SathiFacts, structuredFields: unknown) {
    const fields = isRecord(structuredFields) ? structuredFields : {}
    const storedCandidates = isRecord(fields.extractedCandidates)
      ? fields.extractedCandidates
      : {}
    // Older cases stored extracted fields only on the evidence rows. Merge them
    // so agents can still read evidence uploaded before the pipeline change.
    const candidates: Record<string, unknown> = { ...storedCandidates }
    const evidenceEntries = Array.isArray(fields.evidence) ? fields.evidence : []
    for (const entry of evidenceEntries) {
      if (!isRecord(entry) || !isRecord(entry.fields)) continue
      for (const [key, value] of Object.entries(entry.fields)) {
        if (candidates[key] === undefined && value !== null && value !== "") {
          candidates[key] = value
        }
      }
    }
    facts.evidenceCandidates = candidates
    const text = (...keys: string[]) => {
      for (const key of keys) {
        const value = candidates[key]
        if (typeof value === "string" && value.trim()) return value.trim()
        if (typeof value === "number" && Number.isFinite(value)) return String(value)
      }
      return null
    }
    const amount = text("amount", "amount_lost", "total_fraud_amount")
    const parsedAmount = amount ? Number(amount.replace(/[^\d.]/g, "")) : NaN

    if (!facts.suspectPhone)
      facts.suspectPhone = text("suspect_phone", "suspectPhone", "caller_number")
    if (!facts.upiId) facts.upiId = text("upi_id", "upiId", "suspect_upi")
    if (!facts.url) facts.url = text("url", "suspect_url")
    if (!facts.bankOrApp)
      facts.bankOrApp = text("bank_or_app", "platform", "upi_app_used", "mode_of_transfer")
    if (!facts.incidentAt)
      facts.incidentAt = text("incident_datetime", "incidentDate", "date_of_incident")
    if (facts.amount == null && Number.isFinite(parsedAmount)) facts.amount = parsedAmount
    if (!facts.description)
      facts.description = text("description", "narrative", "short_description", "summary")
    if (!facts.narrative && facts.description) facts.narrative = facts.description
    if (!facts.category) {
      const category = text("provisional_fraud_category", "fraud_type", "category")
      if (category && (classificationCategories as readonly string[]).includes(category))
        facts.category = category as SathiFacts["category"]
    }
    const transactionId = text("transaction_id", "transactionId", "utr_number", "reference_number")
    if (transactionId && !facts.transactionIds.includes(transactionId))
      facts.transactionIds.push(transactionId)
    if (!facts.victimPhone)
      facts.victimPhone = text("victim_phone", "victimPhone", "complainant_phone")
    if (!facts.channel) {
      const channel = text("channel", "contact_channel", "mode_of_contact")?.toUpperCase()
      if (channel && (sathiChannels as readonly string[]).includes(channel))
        facts.channel = channel as SathiFacts["channel"]
    }

    facts.missingFields = this.computeMissing(facts)
  }

  private nextPrompt(facts: SathiFacts): string {
    if (facts.missingFields.includes("amount"))
      return "How much money was lost, if any?"

    if (facts.missingFields.includes("incidentAt"))
      return "When did this happen?"

    if (facts.missingFields.includes("narrative"))
      return "Could you tell me what happened?"

    if (facts.missingFields.includes("category"))
      return "Which type of fraud was this — a call, UPI payment, card, or investment scam?"

    if (facts.missingFields.includes("channel"))
      return "How did the scammer first contact you — a call, SMS, or WhatsApp?"

    if (facts.missingFields.includes("suspectIdentifier"))
      return "Do you have the suspect's phone number, UPI ID, or link?"

    if (facts.missingFields.includes("bankOrApp"))
      return "Which bank or app was involved?"

    return "Is there anything else that should go in the report?"
  }

  private asSource(value: unknown): DeviceContextSource {
    if (
      value === "CALL" ||
      value === "SMS" ||
      value === "EITHER" ||
      value === "MANUAL"
    )
      return value

    return "EITHER"
  }

  private normalizePhone(value: string): string {
    const digits = value.replace(/\D/g, "")

    if (digits.length === 10) return `+91${digits}`

    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`

    if (value.startsWith("+") && digits.length >= 10) return `+${digits}`

    throw new BadRequestException("Provide a valid phone number")
  }

  private async persistCase(
    caseId: string,
    userId: string,
    state: SathiSessionState,
    extraTranscript?: string,
    existingCase?: Awaited<ReturnType<SathiService["requireCase"]>>,
  ): Promise<SathiCaseSnapshot | null> {
    const found =
      existingCase ??
      (await this.prisma.case.findFirst({
        where: { id: caseId, userId },
      }))

    if (!found) return null

    const transcript = [
      found.rawTranscript,
      extraTranscript,
      state.facts.narrative,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 20000)

    const existingFields = isRecord(found.structuredFields)
      ? found.structuredFields
      : {}
    const confirmedFields = isRecord(existingFields.confirmedFields)
      ? existingFields.confirmedFields
      : {}
    const category =
      typeof confirmedFields.category === "string" &&
      confirmedFields.category in filingRoutes
        ? confirmedFields.category as SathiFacts["category"]
        : state.facts.category

    const route = category ? filingRoutes[category] : undefined

    const inferredFields = {
      category: state.facts.category,

      phone: state.facts.suspectPhone,

      amount: state.facts.amount,

      date: state.facts.incidentAt,

      bankOrApp: state.facts.bankOrApp,

      description: state.facts.description ?? state.facts.narrative,

      channel: state.facts.channel,

      upiId: state.facts.upiId,

      url: state.facts.url,

      transactionIds: state.facts.transactionIds,

      victimPhone: state.facts.victimPhone,

      portalFields: state.facts.portalFields,
    }
    const structuredFields = {
      ...existingFields,
      ...inferredFields,
      ...confirmedFields,
      confirmedFields,
    }

    return this.prisma.case.update({
      where: { id: caseId },

      data: {
        detectedLanguage: state.language,

        rawTranscript: transcript || found.rawTranscript,

        canonicalTranscript: state.facts.narrative ?? found.canonicalTranscript,

        category: category ?? found.category,

        categoryConfidence:
          state.facts.categoryConfidence ?? found.categoryConfidence,

        classificationExplanation:
          state.facts.explanation ?? found.classificationExplanation,

        clarificationRequired:
          !state.facts.intakeComplete || category === "UNCERTAIN",

        filingDestination: route?.destinationName ?? found.filingDestination,

        structuredFields: structuredFields as Prisma.InputJsonValue,

        status:
          state.facts.intakeComplete && category && category !== "UNCERTAIN"
            ? CaseStatus.CLASSIFIED
            : CaseStatus.PROCESSING,
      },

      select: {
        structuredFields: true,

        evidenceItems: {
          select: {
            id: true,
            type: true,
            storageKey: true,
            extractedEntities: true,
            uploadedAt: true,
          },
          orderBy: { uploadedAt: "asc" },
        },

        reportVersions: {
          where: { kind: "INTERNAL" },
          select: { id: true, version: true, content: true, generatedAt: true },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    })
  }

  private async toResponse(
    state: SathiSessionState,
    live: Awaited<ReturnType<GeminiProvider["createLiveSession"]>> | null,
    snapshot?: SathiCaseSnapshot | null,
  ) {
    const savedCase =
      snapshot === undefined
        ? await this.prisma.case.findUnique({
            where: { id: state.caseId },
            select: {
              structuredFields: true,
              evidenceItems: {
                select: {
                  id: true,
                  type: true,
                  storageKey: true,
                  extractedEntities: true,
                  uploadedAt: true,
                },
                orderBy: { uploadedAt: "asc" },
              },
              reportVersions: {
                where: { kind: "INTERNAL" },
                select: {
                  id: true,
                  version: true,
                  content: true,
                  generatedAt: true,
                },
                orderBy: { version: "desc" },
                take: 1,
              },
            },
          })
        : snapshot
    const category = state.facts.category ?? "UNCERTAIN"

    const route = filingRoutes[category]

    return {
      agent: {
        name: SATHI_AGENT_NAME,
        purpose: "Voice intake specialist for cyber-fraud victims",
      },

      caseId: state.caseId,

      language: state.language,

      reply: state.lastReply,

      // Send only displayable text. Tool payloads and audio data stay server-side.
      conversation: this.conversationForClient(state),

      // A continue/resume response is a complete case checkpoint. File bytes
      // stay in private storage; the client receives owned evidence metadata
      // and can request an individual signed URL when it needs to open one.
      caseSnapshot: savedCase
        ? {
            structuredFields: savedCase.structuredFields,
            evidence: savedCase.evidenceItems.map((item) => ({
              id: item.id,
              type: item.type,
              fileName: item.storageKey.split("/").at(-1) ?? item.storageKey,
              extractedEntities: item.extractedEntities,
              uploadedAt: item.uploadedAt,
            })),
            latestReport: savedCase.reportVersions[0]
              ? {
                  ...savedCase.reportVersions[0],
                  content: savedCase.reportVersions[0].content,
                }
              : null,
          }
        : null,

      facts: state.facts,

      clientAction: state.clientAction,

      route: {
        category,

        destinationName: route.destinationName,

        guidance: route.guidance,
      },

      live: live
        ? {
            ...live,

            authQueryParam: "access_token",
          }
        : null,

      device: {
        phonePicker: {
          sources: ["CALL", "SMS"] as const,

          submitPath: `/cases/${state.caseId}/sathi/device-context`,

          nativeMessageType: "SATHI_PICK_PHONE_NUMBER",
        },
      },
    }
  }

  private seedState(
    caseId: string,
    language: string,
    structuredFields: unknown,
  ): SathiSessionState {
    const existing = isRecord(structuredFields) ? structuredFields : {}
    const conversation = this.readSavedConversation(existing.sathiConversation)

    const facts = emptySathiFacts()

    if (typeof existing.description === "string")
      facts.narrative = existing.description

    if (
      typeof existing.category === "string" &&
      (classificationCategories as readonly string[]).includes(existing.category)
    ) {
      facts.category = existing.category as SathiFacts["category"]
    }

    if (typeof existing.phone === "string") facts.suspectPhone = existing.phone

    if (typeof existing.amount === "number") facts.amount = existing.amount

    if (typeof existing.date === "string") facts.incidentAt = existing.date

    if (typeof existing.bankOrApp === "string")
      facts.bankOrApp = existing.bankOrApp

    if (typeof existing.upiId === "string") facts.upiId = existing.upiId

    if (typeof existing.url === "string") facts.url = existing.url

    if (typeof existing.channel === "string")
      facts.channel = existing.channel as SathiFacts["channel"]

    if (Array.isArray(existing.transactionIds))
      facts.transactionIds = existing.transactionIds.map(String)

    facts.missingFields = this.computeMissing(facts)
    facts.intakeComplete = Boolean(
      facts.narrative &&
        facts.category &&
        facts.category !== "UNCERTAIN" &&
        !facts.missingFields.length,
    )

    return {
      caseId,

      language,

      facts,

      messages: conversation.map((message) => ({
        role: message.role,
        parts: [{ text: message.text }],
      })),

      lastReply:
        [...conversation].reverse().find((message) => message.role === "model")?.text ??
        `${SATHI_AGENT_NAME} is ready. Tell me what happened, in your own words.`,

      clientAction: null,

      updatedAt: new Date().toISOString(),
    }
  }

  private sessionKey(caseId: string): string {
    return `sathi:session:${caseId}`
  }

  private conversationForClient(state: SathiSessionState) {
    return state.messages.flatMap((message) => {
      const text = message.parts
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n")

      return text ? [{ role: message.role, text }] : []
    })
  }

  private transcriptMessagesFrom(
    messages: SathiMessage[],
    channel: "chat" | "voice",
  ): Array<{ role: "user" | "model"; text: string; channel: "chat" | "voice" }> {
    return messages.flatMap((message) => {
      const text = message.parts
        .map((part) =>
          typeof part.text === "string" && !part.thought ? part.text : "",
        )
        .filter(Boolean)
        .join("\n")
        .trim()
      return text && (message.role === "user" || message.role === "model")
        ? [{ role: message.role, text, channel }]
        : []
    })
  }

  private async restorePersistedConversation(
    state: SathiSessionState,
    caseId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { caseId, userId, channel: "sathi" },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    })
    if (!conversation?.messages.length) return

    state.messages = conversation.messages.flatMap((message) =>
      message.role === "user" || message.role === "model"
        ? [{ role: message.role, parts: [{ text: message.content }] }]
        : [],
    )
    state.lastReply =
      [...conversation.messages]
        .reverse()
        .find((message) => message.role === "model")?.content ?? state.lastReply
  }

  private async appendTranscriptMessages(
    caseId: string,
    userId: string,
    messages: Array<{
      role: "user" | "model"
      text: string
      channel: "chat" | "voice"
    }>,
  ): Promise<void> {
    const visibleMessages = messages.filter((message) => message.text.trim())
    if (!visibleMessages.length) return

    const cacheKey = `${userId}:${caseId}`
    const write = (conversationId: string) =>
      this.prisma.$transaction([
        this.prisma.message.createMany({
          data: visibleMessages.map((message) => ({
            conversationId,
            role: message.role,
            content: message.text.trim(),
            channel: message.channel,
          })),
        }),
        this.prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        }),
      ])

    let conversationId = await this.getSathiConversationId(caseId, userId)
    try {
      await write(conversationId)
    } catch {
      // The cached conversation may have been deleted, or the id may belong to
      // a row that was cleaned up. Re-resolve once before surfacing the error.
      this.sathiConversationIds.delete(cacheKey)
      conversationId = await this.getSathiConversationId(caseId, userId)
      await write(conversationId)
    }
  }

  private async getSathiConversationId(
    caseId: string,
    userId: string,
  ): Promise<string> {
    const cacheKey = `${userId}:${caseId}`
    const cached = this.sathiConversationIds.get(cacheKey)
    if (cached) return cached

    const existing = await this.prisma.conversation.findFirst({
      where: { caseId, userId, channel: "sathi" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })
    if (existing) {
      this.sathiConversationIds.set(cacheKey, existing.id)
      return existing.id
    }

    try {
      const created = await this.prisma.conversation.create({
        data: { caseId, userId, channel: "sathi", status: "active" },
        select: { id: true },
      })
      this.sathiConversationIds.set(cacheKey, created.id)
      return created.id
    } catch {
      // The partial unique index prevents a duplicate transcript if two first
      // turns arrive concurrently; use the winning row instead.
      const winner = await this.prisma.conversation.findFirst({
        where: { caseId, userId, channel: "sathi" },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      })
      if (!winner)
        throw new ServiceUnavailableException(
          "Could not open the case transcript",
        )
      this.sathiConversationIds.set(cacheKey, winner.id)
      return winner.id
    }
  }

  private readSavedConversation(value: unknown): Array<{ role: "user" | "model"; text: string }> {
    if (!Array.isArray(value)) return []

    return value.flatMap((message) => {
      if (!isRecord(message) || (message.role !== "user" && message.role !== "model") || typeof message.text !== "string")
        return []

      const text = message.text.trim()
      return text ? [{ role: message.role, text }] : []
    })
  }

  private async readState(caseId: string): Promise<SathiSessionState | null> {
    const raw = this.stateStore.get(this.sessionKey(caseId))

    return raw ?? null
  }

  private async writeState(state: SathiSessionState): Promise<void> {
    state.updatedAt = new Date().toISOString()

    this.stateStore.set(this.sessionKey(state.caseId), state)
  }

  private async requireCase(caseId: string, userId: string) {
    const found = await this.prisma.case.findFirst({
      where: { id: caseId, userId },
    })

    if (!found) throw new NotFoundException(`Case ${caseId} was not found`)

    return found
  }

  private audit(
    caseId: string,
    actorUserId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId,
        action,
        metadata: metadata as Prisma.InputJsonValue,
      },
    })
  }

  async createSocialPost(
    caseId: string,
    tone: "warning" | "informational",
    platform: "twitter" | "instagram" | "whatsapp",
    user: AuthUser,
  ) {
    const caseData = await this.requireCase(caseId, user.id)
    const fraudType = caseData.category || "unknown cyber fraud"

    const platformSpecs = {
      twitter: { maxChars: 280, format: "3-4 short paragraphs" },
      instagram: { maxChars: 2200, format: "caption with line breaks" },
      whatsapp: { maxChars: 1000, format: "3-4 short paragraphs" },
    }

    const platformInfo = platformSpecs[platform]
    const prompt = `Create a ${tone} cyber-fraud safety post for ${platform}, about ${fraudType}. Do not include real names, phone numbers, transaction details, or other personal data. Include 2-3 warning signs and end with a CTA to report at cybercrime.gov.in. Maximum ${platformInfo.maxChars} characters; use ${platformInfo.format}. Return only JSON with caption (string), hashtags (array of 3-5 strings), and image_prompt (abstract, no people or logos).`

    const generatedPost = await this.ai.generateText({
      primary: "groq",
      primaryModel: this.config.get("REPORT_MODEL_NAME", { infer: true }),
      fallback: "gemini",
      fallbackModel: this.config.get("REPORT_MODEL_FALLBACK", { infer: true }),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      maxTokens: 700,
      json: true,
    })
    const text = generatedPost.text

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new ServiceUnavailableException("Gemini returned invalid JSON")
    }

    if (
      !isRecord(parsed) ||
      typeof parsed.caption !== "string" ||
      !Array.isArray(parsed.hashtags) ||
      !parsed.hashtags.every((tag) => typeof tag === "string") ||
      parsed.hashtags.length < 3 ||
      parsed.hashtags.length > 5
    ) {
      throw new ServiceUnavailableException(
        "Gemini returned an invalid social post",
      )
    }
    if (parsed.caption.length > platformInfo.maxChars) {
      throw new ServiceUnavailableException(
        "Gemini returned a caption that exceeds the platform limit",
      )
    }

    const hashtags = (parsed.hashtags as string[]).slice(0, 5)
    let image_url: string | null = null
    let image_preview_url: string | null = null
    const imageModel = this.config.get("GEMINI_IMAGE_MODEL", { infer: true })
    if (imageModel && this.keyPool.isKeyAvailable("gemini")) {
      const imagePayload = await this.keyPool.withFailover(async (apiKey) => {
        const imageResponse = await fetch(
          `${this.config.get("GEMINI_API_URL", { infer: true }).replace(/\/+$/, "")}/v1beta/interactions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
              "Api-Revision": "2026-05-20",
            },
            body: JSON.stringify({
              model: imageModel,
              input: [
                {
                  type: "text",
                  text:
                    typeof parsed.image_prompt === "string"
                      ? parsed.image_prompt
                      : "Abstract cyber fraud prevention illustration, no people or logos.",
                },
              ],
            }),
          },
        )
        if (!imageResponse.ok) {
          throw new ServiceUnavailableException(
            `Gemini image generation failed with HTTP ${imageResponse.status}`,
          )
        }
        return (await imageResponse.json()) as {
          output_image?: { mime_type?: string; data?: string }
        }
      })
      const image = imagePayload.output_image
      if (!image?.data)
        throw new ServiceUnavailableException(
          "Gemini did not return a generated image",
        )
      const mimeType = image.mime_type ?? "image/png"
      if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(mimeType))
        throw new ServiceUnavailableException(
          "Gemini returned an unsupported social image format",
        )
      const imageBytes = Buffer.from(image.data, "base64")
      if (!imageBytes.length || imageBytes.length > 10 * 1024 * 1024)
        throw new ServiceUnavailableException(
          "Gemini returned an invalid or oversized social image",
        )
      const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice(6)
      image_url = `${caseId}/${randomUUID()}.${extension}`
      try {
        await this.storage.upload("social-posts", image_url, imageBytes, mimeType)
        image_preview_url = await this.storage.createSignedUrl(
          "social-posts",
          image_url,
        )
      } catch (error) {
        await this.storage.remove("social-posts", image_url).catch(() => undefined)
        throw error
      }
    }

    let post
    try {
      post = await this.prisma.socialPost.create({
        data: {
          caseId,
          caption: parsed.caption,
          hashtags: hashtags as Prisma.InputJsonValue,
          imageUrl: image_url,
          platform,
        },
      })
    } catch (error) {
      if (image_url)
        await this.storage.remove("social-posts", image_url).catch(() => undefined)
      throw error
    }

    return {
      caption: parsed.caption,
      hashtags,
      image_url,
      image_preview_url,
      post_id: post.id,
    }
  }
}
