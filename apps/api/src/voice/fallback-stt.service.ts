import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { AppEnv } from "../config/env.schema"
import { KeyPool } from "../ai/key-pool"

export interface SttResult {
  text: string
  language: string
  provider: "groq" | "cloudflare"
}

@Injectable()
export class FallbackSttService {
  private readonly logger = new Logger(FallbackSttService.name)

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly keys: KeyPool,
  ) {}

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<SttResult> {
    // Try Groq Whisper first
    try {
      return await this.transcribeWithGroq(audioBuffer, mimeType)
    } catch (groqError) {
      this.logger.warn(`Groq STT failed, trying Cloudflare: ${groqError instanceof Error ? groqError.message : String(groqError)}`)
    }

    // Fallback to Cloudflare Workers AI
    try {
      return await this.transcribeWithCloudflare(audioBuffer, mimeType)
    } catch (cfError) {
      this.logger.error(`Cloudflare STT also failed: ${cfError instanceof Error ? cfError.message : String(cfError)}`)
      throw new ServiceUnavailableException("Both STT providers unavailable")
    }
  }

  private async transcribeWithGroq(audioBuffer: Buffer, mimeType: string): Promise<SttResult> {
    const model = this.config.get("GROQ_WHISPER_MODEL", { infer: true }) ?? "whisper-large-v3"
    const baseUrl = this.config.get("GROQ_API_URL", { infer: true }).replace(/\/+$/, "")
    const apiKey = await this.keys.getGroqKey()

    const ext = this.getExtensionFromMime(mimeType)
    const form = new FormData()
    form.append("model", model)
    form.append("language", "hi")
    form.append("response_format", "json")
    form.append("temperature", "0")
    form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), `audio.${ext}`)

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new ServiceUnavailableException(`Groq STT HTTP ${response.status}: ${body.slice(0, 200)}`)
    }

    const payload = (await response.json()) as { text?: string; language?: string }
    const text = payload.text?.trim()

    if (!text) {
      throw new ServiceUnavailableException("Groq returned empty transcription")
    }

    return { text, language: payload.language || "hi", provider: "groq" }
  }

  private async transcribeWithCloudflare(audioBuffer: Buffer, mimeType: string): Promise<SttResult> {
    const accountId = this.config.get("CLOUDFLARE_ACCOUNT_ID", { infer: true })
    const apiToken = this.config.get("CLOUDFLARE_API_TOKEN", { infer: true })
    const model = "@cf/deepgram/nova-3"

    if (!accountId || !apiToken) {
      throw new ServiceUnavailableException("Cloudflare credentials not configured")
    }

    const ext = this.getExtensionFromMime(mimeType)
    const form = new FormData()
    form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), `audio.${ext}`)

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      },
    )

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new ServiceUnavailableException(`Cloudflare STT HTTP ${response.status}: ${body.slice(0, 200)}`)
    }

    const payload = (await response.json()) as { result?: { text?: string; language?: string }; errors?: Array<{ message: string }> }

    if (payload.errors?.length) {
      throw new ServiceUnavailableException(payload.errors.map((e) => e.message).join(", "))
    }

    const text = payload.result?.text?.trim()
    if (!text) {
      throw new ServiceUnavailableException("Cloudflare returned empty transcription")
    }

    return { text, language: payload.result?.language || "hi", provider: "cloudflare" }
  }

  private getExtensionFromMime(mimeType: string): string {
    const mime = mimeType.toLowerCase()
    if (mime.includes("webm")) return "webm"
    if (mime.includes("mp4") || mime.includes("m4a")) return "mp4"
    if (mime.includes("ogg") || mime.includes("opus")) return "ogg"
    if (mime.includes("wav")) return "wav"
    if (mime.includes("mp3") || mime.includes("mpeg")) return "mp3"
    return "webm"
  }
}