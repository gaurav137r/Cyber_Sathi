import { Injectable, ServiceUnavailableException } from "@nestjs/common"

import { ConfigService } from "@nestjs/config"

import type { AppEnv } from "../config/env.schema"

import { SATHI_AGENT_NAME, buildSathiSystemInstruction } from "./sathi.prompt"

import { sathiFunctionDeclarations } from "./sathi.tools"

import { SathiFacts, SathiMessage } from "./sathi.types"

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

  voiceName: string

  expiresAt: string

  newSessionExpiresAt: string

  inputAudio: { mimeType: string; rateHz: number }

  outputAudio: { mimeType: string; rateHz: number }
}

@Injectable()
export class GeminiProvider {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  isConfigured(): boolean {
    return Boolean(this.config.get("GEMINI_API_KEY", { infer: true }))
  }

  async createLiveSession(
    language: string,
    facts: SathiFacts,
  ): Promise<GeminiLiveSession> {
    const apiKey = this.requireKey()

    const model = this.config.get("GEMINI_LIVE_MODEL", { infer: true })

    const voiceName = this.config.get("GEMINI_VOICE_NAME", { infer: true })

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString()

    const newSessionExpireTime = new Date(
      Date.now() + 2 * 60 * 1000,
    ).toISOString()

    const body = {
      uses: 1,

      expireTime,

      newSessionExpireTime,

      liveConnectConstraints: {
        model: `models/${model}`,

        config: {
          sessionResumption: {},

          responseModalities: ["AUDIO"],

          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },

          systemInstruction: {
            parts: [{ text: buildSathiSystemInstruction(language, facts) }],
          },

          tools: [{ functionDeclarations: sathiFunctionDeclarations }],
        },
      },
    }

    const payload = await this.postJson<{
      name?: string
      error?: { message?: string }
    }>(
      ["/v1beta/auth_tokens", "/v1alpha/auth_tokens"],

      body,

      apiKey,
    )

    if (!payload.name) {
      throw new ServiceUnavailableException(
        payload.error?.message ?? "Gemini did not issue a live session token",
      )
    }

    const websocketUrl = `${this.wsBaseUrl()}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`

    return {
      ephemeralToken: payload.name,

      model,

      websocketUrl,

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
    const apiKey = this.requireKey()

    const model = this.config.get("GEMINI_TEXT_MODEL", { infer: true })

    const contents: GeminiContent[] = [
      ...input.history.map((message) => ({
        role: message.role,
        parts: message.parts as GeminiPart[],
      })),

      { role: "user", parts: input.userParts },
    ]

    const payload = await this.postJson<GeminiResponse>(
      [`/v1beta/models/${model}:generateContent`],

      {
        systemInstruction: {
          parts: [
            { text: buildSathiSystemInstruction(input.language, input.facts) },
          ],
        },

        contents,

        tools: [{ functionDeclarations: sathiFunctionDeclarations }],

        generationConfig: { temperature: 0.3 },
      },

      apiKey,
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
      this.requireKey(),
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

  private requireKey(): string {
    const apiKey = this.config.get("GEMINI_API_KEY", { infer: true })

    if (!apiKey)
      throw new ServiceUnavailableException("GEMINI_API_KEY is not configured")

    return apiKey
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
    apiKey: string,
  ): Promise<T> {
    let lastError = "Gemini request failed"

    for (const path of paths) {
      const response = await fetch(`${this.apiBaseUrl()}${path}`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },

        body: JSON.stringify(body),
      })

      const payload = (await response.json().catch(() => ({}))) as T & {
        error?: { message?: string }
      }

      if (response.ok) return payload

      lastError =
        payload.error?.message ??
        `Gemini request failed with HTTP ${response.status}`
    }

    throw new ServiceUnavailableException(lastError)
  }
}
