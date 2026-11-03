import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"

import { CaseStatus, Prisma } from "@prisma/client"

import { AuthUser } from "../auth/auth.service"

import { filingRoutes } from "../classification/routing.config"

import { classificationCategories } from "../classification/classification.types"

import { PrismaService } from "../prisma/prisma.service"

import { RedisService } from "../redis/redis.service"

import { GeminiProvider } from "./gemini.provider"

import { SATHI_AGENT_NAME } from "./sathi.prompt"

import { DeviceContextDto } from "./sathi.dto"

import {
  DeviceContextSource,
  emptySathiFacts,
  SathiClientAction,
  SathiFacts,
  SathiMessage,
  SathiSessionState,
} from "./sathi.types"

const SESSION_TTL_SECONDS = 60 * 60 * 2

@Injectable()
export class SathiService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly redis: RedisService,

    private readonly gemini: GeminiProvider,
  ) {}

  async startNewSession(user: AuthUser, languageHint?: string) {
    const created = await this.prisma.case.create({
      data: {
        userId: user.id,

        detectedLanguage: languageHint,

        structuredFields: {} as Prisma.InputJsonValue,

        canonicalEntities: {} as Prisma.InputJsonValue,
      },
    })

    await this.audit(created.id, user.id, "CASE_CREATED", { source: "sathi" })

    return this.startSession(created.id, user, languageHint)
  }

  async startSession(caseId: string, user: AuthUser, languageHint?: string) {
    const foundCase = await this.requireCase(caseId, user.id)

    const language =
      languageHint ||
      foundCase.detectedLanguage ||
      user.preferredLanguage ||
      "en"

    const state =
      (await this.readState(caseId)) ??
      this.seedState(caseId, language, foundCase.structuredFields)

    state.language = language

    await this.writeState(state)

    if (foundCase.status === CaseStatus.DRAFT) {
      await this.prisma.case.update({
        where: { id: caseId },
        data: { status: CaseStatus.PROCESSING, detectedLanguage: language },
      })
    }

    await this.audit(caseId, user.id, "SATHI_SESSION_STARTED", {
      language,
      live: this.gemini.isConfigured(),
    })

    const live = this.gemini.isConfigured()
      ? await this.gemini.createLiveSession(language, state.facts)
      : null

    return this.toResponse(state, live)
  }

  async state(caseId: string, user: AuthUser) {
    await this.requireCase(caseId, user.id)

    const state =
      (await this.readState(caseId)) ??
      this.seedState(caseId, user.preferredLanguage || "en", null)

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
    input: { text?: string; language?: string; audio?: Express.Multer.File },
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

    state.language = language

    state.clientAction = null

    const userParts: Array<Record<string, unknown>> = []

    if (input.text?.trim()) userParts.push({ text: input.text.trim() })

    if (input.audio) {
      userParts.push({
        inlineData: {
          mimeType: input.audio.mimetype || "audio/webm",

          data: input.audio.buffer.toString("base64"),
        },
      })
    }

    const result = await this.gemini.generateTurn({
      language,

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
      const toolResult = await this.executeTool(state, call.name, call.args)

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
      const followUp = await this.gemini.generateTurn({
        language,

        facts: state.facts,

        history: [...state.messages, ...toolFollowUps],

        userParts: [
          {
            text: "Continue with the next short spoken question or confirmation.",
          },
        ],
      })

      state.messages.push(...toolFollowUps)

      state.messages.push({ role: "model", parts: followUp.modelParts })

      if (followUp.text) state.lastReply = followUp.text

      for (const call of followUp.functionCalls) {
        await this.executeTool(state, call.name, call.args)
      }
    } else {
      state.messages.push(...toolFollowUps)
    }

    await this.persistCase(foundCase.id, user.id, state, input.text)

    await this.writeState(state)

    return this.toResponse(state, null)
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

    await this.persistCase(caseId, user.id, state)

    await this.writeState(state)

    await this.audit(caseId, user.id, "SATHI_DEVICE_CONTEXT_SAVED", {
      source: body.source,
      hasLabel: Boolean(body.label),
    })

    return this.toResponse(state, null)
  }

  private async executeTool(
    state: SathiSessionState,
    name: string,
    args: Record<string, unknown>,
  ) {
    switch (name) {
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

  private nextPrompt(facts: SathiFacts): string {
    if (facts.missingFields.includes("amount"))
      return "How much money was lost, if any?"

    if (facts.missingFields.includes("incidentAt"))
      return "When did this happen?"

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
  ) {
    const found = await this.prisma.case.findFirst({
      where: { id: caseId, userId },
    })

    if (!found) return

    const transcript = [
      found.rawTranscript,
      extraTranscript,
      state.facts.narrative,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 20000)

    const category = state.facts.category

    const route = category ? filingRoutes[category] : undefined

    const structuredFields = {
      ...found.structuredFields as Record<string, unknown> | null,

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
    }

    await this.prisma.case.update({
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
    })
  }

  private toResponse(
    state: SathiSessionState,
    live: Awaited<ReturnType<GeminiProvider["createLiveSession"]>> | null,
  ) {
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
    const existing = (structuredFields ?? {}) as Record<string, unknown>

    const facts = emptySathiFacts()

    if (typeof existing.description === "string")
      facts.narrative = existing.description

    if (typeof existing.phone === "string") facts.suspectPhone = existing.phone

    if (typeof existing.amount === "number") facts.amount = existing.amount

    if (typeof existing.date === "string") facts.incidentAt = existing.date

    if (typeof existing.bankOrApp === "string")
      facts.bankOrApp = existing.bankOrApp

    facts.missingFields = this.computeMissing(facts)

    return {
      caseId,

      language,

      facts,

      messages: [],

      lastReply: `${SATHI_AGENT_NAME} is ready. Tell me what happened, in your own words.`,

      clientAction: null,

      updatedAt: new Date().toISOString(),
    }
  }

  private sessionKey(caseId: string): string {
    return `sathi:session:${caseId}`
  }

  private async readState(caseId: string): Promise<SathiSessionState | null> {
    const raw = await this.redis.client.get(this.sessionKey(caseId))

    return raw ? JSON.parse(raw) as SathiSessionState : null
  }

  private async writeState(state: SathiSessionState): Promise<void> {
    state.updatedAt = new Date().toISOString()

    if (state.messages.length > 24) state.messages = state.messages.slice(-24)

    await this.redis.client.set(
      this.sessionKey(state.caseId),
      JSON.stringify(state),
      "EX",
      SESSION_TTL_SECONDS,
    )
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
}
