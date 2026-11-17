import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { AppEnv } from "../config/env.schema"
import { KeyPool } from "../ai/key-pool"
import { AiGateway } from "../ai/ai-gateway.service"
import { FallbackSttService } from "./fallback-stt.service"
import { FallbackTtsService } from "./fallback-tts.service"
import { buildFallbackVoicePrompt } from "./voice-agent-prompt"
import { SathiFacts } from "../sathi/sathi.types"
import { BlandService } from "../sathi/bland.service"

export type VoiceMode = "primary" | "fallback" | "text-only"

export interface VoiceSession {
  caseId: string
  userId: string
  mode: VoiceMode
  blandTokensRemaining?: number
  fallbackTurnCount: number
  language: string
  facts: SathiFacts
  blandSessionToken?: string
}

export interface VoiceTurnResult {
  mode: VoiceMode
  text: string
  audioBase64?: string
  mimeType?: string
  sttProvider?: "groq" | "cloudflare"
  ttsProvider?: "fish" | "google"
  fallbackMessage?: string
  error?: string
}

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name)
  private readonly sessions = new Map<string, VoiceSession>()
  private readonly BLAND_TIMEOUT_MS = 10_000

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly keys: KeyPool,
    private readonly ai: AiGateway,
    private readonly fallbackStt: FallbackSttService,
    private readonly fallbackTts: FallbackTtsService,
    private readonly bland: BlandService,
  ) {}

  async startSession(caseId: string, userId: string, language: string, facts: SathiFacts): Promise<VoiceSession> {
    const sessionKey = `${userId}:${caseId}`

    // Try Bland first
    let blandToken: string | undefined
    let mode: VoiceMode = "primary"

    try {
      const result = await this.bland.createSessionToken(caseId, userId, language)
      blandToken = result.sessionToken
      mode = "primary"
      this.logger.log(`Bland session started for case ${caseId}`)
    } catch (error) {
      this.logger.warn(`Bland failed, starting fallback: ${error instanceof Error ? error.message : String(error)}`)
      mode = "fallback"
    }

    const session: VoiceSession = {
      caseId,
      userId,
      mode,
      fallbackTurnCount: 0,
      language,
      facts,
      blandSessionToken: blandToken,
    }

    this.sessions.set(sessionKey, session)
    return session
  }

  async processVoiceTurn(
    caseId: string,
    userId: string,
    audioBuffer: Buffer,
    mimeType: string,
  ): Promise<VoiceTurnResult> {
    const sessionKey = `${userId}:${caseId}`
    let session = this.sessions.get(sessionKey)

    if (!session) {
      const foundCase = await this.bland["prisma"].case.findFirst({ where: { id: caseId, userId } })
      if (!foundCase) throw new ServiceUnavailableException("Case not found")
      session = await this.startSession(caseId, userId, foundCase.detectedLanguage || "hi", {} as SathiFacts)
    }

    // If Bland mode, try Bland first
    if (session.mode === "primary" && session.blandSessionToken) {
      try {
        return await this.processWithBland(session, audioBuffer, mimeType)
      } catch (error) {
        this.logger.warn(`Bland turn failed, switching to fallback: ${error instanceof Error ? error.message : String(error)}`)
        session.mode = "fallback"
        session.fallbackTurnCount = 0
      }
    }

    // Fallback mode
    return this.processWithFallback(session, audioBuffer, mimeType)
  }

  private async processWithBland(
    session: VoiceSession,
    audioBuffer: Buffer,
    mimeType: string,
  ): Promise<VoiceTurnResult> {
    // For now, return a placeholder - Bland handles audio via WebSocket directly
    // This service coordinates the fallback logic
    // Actual Bland audio streaming happens client-side via Bland SDK
    throw new ServiceUnavailableException("Bland audio processing delegated to client SDK")
  }

  private async processWithFallback(
    session: VoiceSession,
    audioBuffer: Buffer,
    mimeType: string,
  ): Promise<VoiceTurnResult> {
    session.fallbackTurnCount++

    // STT
    let sttResult
    try {
      sttResult = await this.fallbackStt.transcribe(audioBuffer, mimeType)
    } catch (sttError) {
      return {
        mode: "text-only",
        text: "Aapki awaaz abhi samajh nahi paayi. Text mein likh sakte hain.",
        error: sttError instanceof Error ? sttError.message : String(sttError),
      }
    }

    // Update facts from transcript (simplified - in production use LLM extraction)
    session.facts.narrative = sttResult.text

    // Brain: Generate response using existing LLM
    const prompt = buildFallbackVoicePrompt(session.facts)
    const brainResult = await this.ai.generateText({
      primary: "groq",
      primaryModel: this.config.get("FAST_MODEL", { infer: true }) ?? "openai/gpt-oss-20b",
      fallback: "gemini",
      fallbackModel: this.config.get("GEMINI_TEXT_FALLBACK", { infer: true }) ?? "gemini-3.1-flash-lite",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: sttResult.text },
      ],
      temperature: 0.3,
      maxTokens: 150,
      timeoutMs: 15_000,
    })

    const replyText = brainResult.text.trim()

    // TTS
    let ttsResult
    try {
      ttsResult = await this.fallbackTts.synthesize(replyText, session.language as "hi" | "en")
    } catch (ttsError) {
      return {
        mode: "text-only",
        text: replyText,
        error: ttsError instanceof Error ? ttsError.message : String(ttsError),
      }
    }

    return {
      mode: "fallback",
      text: replyText,
      audioBase64: ttsResult.audioBase64,
      mimeType: ttsResult.mimeType,
      sttProvider: sttResult.provider,
      ttsProvider: ttsResult.provider,
      fallbackMessage: session.fallbackTurnCount === 1
        ? "Fallback voice active — quality may vary"
        : undefined,
    }
  }

  getSession(caseId: string, userId: string): VoiceSession | undefined {
    return this.sessions.get(`${userId}:${caseId}`)
  }

  setSessionMode(caseId: string, userId: string, mode: VoiceMode): void {
    const session = this.sessions.get(`${userId}:${caseId}`)
    if (session) {
      session.mode = mode
      if (mode === "primary") session.fallbackTurnCount = 0
    }
  }

  endSession(caseId: string, userId: string): void {
    this.sessions.delete(`${userId}:${caseId}`)
  }
}