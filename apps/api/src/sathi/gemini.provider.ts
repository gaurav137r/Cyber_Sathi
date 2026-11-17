import { Injectable, ServiceUnavailableException } from "@nestjs/common"

import { ConfigService } from "@nestjs/config"

import type { AppEnv } from "../config/env.schema"

import { SATHI_AGENT_NAME, buildSathiSystemInstruction } from "./sathi.prompt"

import { sathiFunctionDeclarations } from "./sathi.tools"

import { SathiFacts, SathiMessage } from "./sathi.types"
import { KeyPool } from "../ai/key-pool"

type GeminiPart = {
  text?: string

  thought?: boolean

  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }

  functionResponse?: {
    id?: string
    name: string
    response: Record<string, unknown>
  }

  inlineData?: { mimeType: string; data: string }
}

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] }

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>

  error?: { message?: string }
}

type GeminiSpeechResponse = {
  output_audio?: { data?: string }
  steps?: Array<{
    type?: string
    content?: Array<{ type?: string; data?: string }>
  }>
  error?: { message?: string }
}

export type GeminiTurnResult = {
  text: string

  modelParts: GeminiPart[]

  functionCalls: Array<{
    id?: string
    name: string
    args: Record<string, unknown>
  }>
}

export type GeminiLiveSession = {
  ephemeralToken: string

  model: string

  websocketUrl: string

  setupConfig: {
    sessionResumption: Record<string, never>
    responseModalities: ["AUDIO"]
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: string } }
    }
    systemInstruction: { parts: Array<{ text: string }> }
    inputAudioTranscription: Record<string, never>
    outputAudioTranscription: Record<string, never>
  }

  voiceName: string

  expiresAt: string

  newSessionExpiresAt: string

  inputAudio: { mimeType: string; rateHz: number }

  outputAudio: { mimeType: string; rateHz: number }
}

@Injectable()
export class GeminiProvider {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly keyPool: KeyPool,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.keyPool.isKeyAvailable("gemini"))
  }

  async createLiveSession(
    language: string,
    facts: SathiFacts,
  ): Promise<GeminiLiveSession> {
    const model = this.config.get("GEMINI_LIVE_MODEL", { infer: true })

    const voiceName = this.config.get("GEMINI_VOICE_NAME", { infer: true })

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString()

    const newSessionExpireTime = new Date(
      Date.now() + 2 * 60 * 1000,
    ).toISOString()

    const setupConfig: GeminiLiveSession["setupConfig"] = {
      sessionResumption: {},
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      systemInstruction: {
        parts: [{ text: buildSathiSystemInstruction(language, facts) }],
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    }

    const body = {
      uses: 1,

      expireTime,

      newSessionExpireTime,

      liveConnectConstraints: {
        model: `models/${model}`,

        config: setupConfig,
      },
    }

    const payload = await this.postJson<{
      name?: string
      error?: { message?: string }
    }>(
      ["/v1beta/auth_tokens", "/v1alpha/auth_tokens"],

      body,
    )

    if (!payload.name) {
      throw new ServiceUnavailableException(
        payload.error?.message ?? "Gemini did not issue a live session token",
      )
    }

    const websocketUrl = `${this.wsBaseUrl()}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained`

    return {
      ephemeralToken: payload.name,

      model,

      websocketUrl,

      setupConfig,

      voiceName,

      expiresAt: expireTime,

      newSessionExpiresAt: newSessionExpireTime,

      inputAudio: { mimeType: "audio/pcm", rateHz: 16000 },

      outputAudio: { mimeType: "audio/pcm", rateHz: 24000 },
    }
  }

  async generateTurn(input: {
    language: string

    facts: SathiFacts

    history: SathiMessage[]

    userParts: GeminiPart[]
  }): Promise<GeminiTurnResult> {
    const chatModel = this.config.get("GEMINI_CHAT_MODEL", { infer: true })

    const chatFallback = this.config.get("GEMINI_CHAT_FALLBACK", { infer: true })

    const primaryModel = this.config.get("GEMINI_TEXT_MODEL", { infer: true })

    const fallbackModel = this.config.get("GEMINI_TEXT_FALLBACK", { infer: true })

    // Prefer the lite chat models: the interactive reply is one or two short
    // sentences, and the full Flash model spends 10-25s on hidden thinking.
    const models = [
      ...new Set(
        [
          chatModel,
          chatFallback,
          primaryModel,
          fallbackModel,
          "gemini-3.1-flash-lite",
          "gemini-3.5-flash-lite",
        ].filter((model): model is string => Boolean(model)),
      ),
    ]

    const contents: GeminiContent[] = [
      ...input.history.map((message) => ({
        role: message.role,
        parts: message.parts as GeminiPart[],
      })),

      { role: "user", parts: input.userParts },
    ]

    const latestUserText = input.userParts
      .map((part) => ("text" in part ? (part as { text?: string }).text : "") || "")
      .join(" ")
      .trim()
      .slice(0, 500)

    const languageLabel =
      input.language === "hi"
        ? "Hindi (Devanagari script)"
        : input.language === "hinglish"
          ? "Hinglish (Hindi + English in Roman script, e.g. 'kya hua', 'main samajh gaya')"
          : "English"

    const payload = await this.postJson<GeminiResponse>(
      models.map((candidate) => `/v1beta/models/${encodeURIComponent(candidate)}:generateContent`),

      {
        systemInstruction: {
          parts: [
            { text: buildSathiSystemInstruction(input.language, input.facts) },
            ...(latestUserText
              ? [
                  {
                    text: `CRITICAL LANGUAGE RULE: The user's latest message was: "${latestUserText}". This is ${languageLabel}. You MUST reply in the EXACT SAME language/style. If Hinglish → reply in Hinglish (use "aap", mix Hindi verbs + English nouns). If Hindi → reply in Devanagari Hindi. If English → reply in English. NEVER default to English.`,
                  },
                ]
              : []),
          ],
        },

        contents,

        tools: [{ functionDeclarations: sathiFunctionDeclarations }],

        generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
      },
    )

    const parts = payload.candidates?.[0]?.content?.parts ?? []

    const functionCalls = parts

      .filter((part) => part.functionCall?.name)

      .map((part) => ({
        id: part.functionCall!.id,
        name: part.functionCall!.name,
        args: part.functionCall!.args ?? {},
      }))

    const text = parts

      .filter((part) => part.text && !part.thought)

      .map((part) => part.text!)

      .join("\n")

      .trim()

    return {
      text,
      modelParts: parts.length
        ? parts
        : [{ text: `${SATHI_AGENT_NAME} is listening.` }],
      functionCalls,
    }
  }

  async generateSpeech(text: string, language: string): Promise<string> {
    const languageName =
      ({ en: "English", hi: "Hindi", bn: "Bengali" } as Record<string, string>)[
        language
      ] ?? language
    const payload = await this.postJson<GeminiSpeechResponse>(
      ["/v1beta/interactions"],
      {
        model: this.config.get("GEMINI_TTS_MODEL", { infer: true }),
        input: [
          {
            type: "user_input",
            content: [
              {
                type: "text",
                text,
                annotations: [
                  {
                    type: "speech_metadata",
                    style: `Speak clearly in ${languageName} with a calm, reassuring, natural voice.`,
                  },
                ],
              },
            ],
          },
        ],
        response_format: { type: "audio" },
        generation_config: {
          speech_config: [
            { voice: this.config.get("GEMINI_VOICE_NAME", { infer: true }) },
          ],
        },
      },
    )

    const audio =
      payload.output_audio?.data ??
      payload.steps
        ?.slice()
        .reverse()
        .flatMap((step) => step.content ?? [])
        .find((content) => content.type === "audio")?.data

    if (!audio)
      throw new ServiceUnavailableException(
        payload.error?.message ?? "Gemini did not return speech audio",
      )

    return audio
  }

  private apiBaseUrl(): string {
    return this.config
      .get("GEMINI_API_URL", { infer: true })
      .replace(/\/+$/, "")
  }

  private wsBaseUrl(): string {
    return this.apiBaseUrl().replace(/^http/, "ws")
  }

  private async postJson<T,>(
    paths: string[],
    body: unknown,
    totalTimeoutMs = 60_000,
  ): Promise<T> {
    const deadline = Date.now() + totalTimeoutMs
    return this.keyPool.withFailover(async (apiKey) => {
      let lastError = "Gemini request failed"

      for (const path of paths) {
        const remaining = deadline - Date.now()
        if (remaining <= 2_000) break
        let response: Response
        try {
          response = await fetch(`${this.apiBaseUrl()}${path}`, {
            method: "POST",
            signal: AbortSignal.timeout(Math.min(30_000, remaining)),
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify(body),
          })
        } catch (error) {
          lastError = `Gemini request failed: ${
            error instanceof Error ? error.message : String(error)
          }`
          continue
        }

        const payload = (await response.json().catch(() => ({}))) as T & {
          error?: { message?: string }
        }

        if (response.ok) return payload

        lastError = `Gemini request failed with HTTP ${response.status}: ${
          (payload as { error?: { message?: string } })?.error?.message ??
          JSON.stringify(payload).slice(0, 300)
        }`
      }

      throw new ServiceUnavailableException(lastError)
    })
  }
}
