import { Injectable, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { AppEnv } from "../config/env.schema"
import { KeyPool, type Provider, type ProviderAttempt } from "./key-pool"

export interface AiMessage {
  role: "system" | "user" | "assistant"
  content: string
}

function uniqueModels(models: Array<string | undefined>): string[] {
  return [...new Set(models.map((model) => model?.trim()).filter((model): model is string => Boolean(model)))]
}

export interface AiTextResult {
  text: string
  provider: Provider
  model: string
  keyId: string
}

export interface AiTextInput {
  primary: Provider
  primaryModel: string
  /** Optional ordered model list; overrides primaryModel when provided. */
  primaryModels?: string[]
  fallback?: Provider
  fallbackModel?: string
  fallbackModels?: string[]
  messages: AiMessage[]
  temperature?: number
  maxTokens?: number
  json?: boolean
  timeoutMs?: number
}

@Injectable()
export class AiGateway {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly keys: KeyPool,
  ) {}

  /**
   * Runs a text request with two layers of resilience:
   *   1. rotate through the configured model list for the primary provider,
   *   2. switch to the fallback provider/model list when the primary fails.
   */
  async generateText(input: AiTextInput): Promise<AiTextResult> {
    const primaryModels = uniqueModels([
      ...(input.primaryModels ?? []),
      input.primaryModel,
    ])
    const fallbackModels = uniqueModels([
      ...(input.fallbackModels ?? []),
      input.fallbackModel,
    ])
    if (!primaryModels.length)
      throw new ServiceUnavailableException("No primary model is configured")

    let result: ProviderAttempt<{ text: string; model: string }>
    try {
      result = await this.attemptProvider(input.primary, primaryModels, input)
    } catch (primaryError) {
      if (!input.fallback || input.fallback === input.primary || !fallbackModels.length)
        throw primaryError
      try {
        result = await this.attemptProvider(input.fallback, fallbackModels, input)
      } catch {
        throw new ServiceUnavailableException(
          `${input.primary} (${primaryModels.join(", ")}) and ${input.fallback} (${fallbackModels.join(", ")}) are unavailable`,
        )
      }
    }

    return {
      text: result.value.text,
      provider: result.provider,
      model: result.value.model,
      keyId: result.keyId,
    }
  }

  private async attemptProvider(
    provider: Provider,
    models: string[],
    input: AiTextInput,
  ): Promise<ProviderAttempt<{ text: string; model: string }>> {
    // One shared budget across models and keys so a failing provider cannot
    // stall the caller for minutes.
    const deadline = Date.now() + (input.timeoutMs ?? 45_000)
    return this.keys.withProviderDetailed(provider, async (apiKey) => {
      if (Date.now() >= deadline)
        throw new ServiceUnavailableException(`${provider} request budget exhausted`)
      let lastError: unknown
      for (const model of models) {
        const remaining = deadline - Date.now()
        if (remaining <= 2_000) break
        const perModelTimeout = Math.max(8_000, Math.min(remaining, 30_000))
        try {
          const text =
            provider === "gemini"
              ? await this.generateGemini(apiKey, model, { ...input, timeoutMs: perModelTimeout })
              : await this.generateOpenAiCompatible(apiKey, model, { ...input, timeoutMs: perModelTimeout })
          return { text, model }
        } catch (error) {
          lastError = error
        }
      }
      throw lastError ??
        new ServiceUnavailableException(`${provider} returned no response`)
    })
  }

  private async generateOpenAiCompatible(
    apiKey: string,
    model: string,
    input: AiTextInput,
  ): Promise<string> {
    const base = this.config.get("GROQ_API_URL", { infer: true }).replace(/\/+$/, "")
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 1200,
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new ServiceUnavailableException(
        `Groq ${model} failed with HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      )
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> }
    const text = payload.choices?.[0]?.message?.content?.trim()
    if (!text) throw new ServiceUnavailableException(`Groq ${model} returned an empty response`)
    return text
  }

  private async generateGemini(
    apiKey: string,
    model: string,
    input: AiTextInput,
  ): Promise<string> {
    const base = this.config.get("GEMINI_API_URL", { infer: true }).replace(/\/+$/, "")
    const system = input.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n")
    const contents = input.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }))
    const response = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          temperature: input.temperature ?? 0.2,
          maxOutputTokens: input.maxTokens ?? 1200,
          ...(input.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new ServiceUnavailableException(
        `Gemini ${model} failed with HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      )
    }
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim()
    if (!text) throw new ServiceUnavailableException(`Gemini ${model} returned an empty response`)
    return text
  }
}
