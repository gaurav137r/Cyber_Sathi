import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { AppEnv } from "../config/env.schema"

export interface TtsResult {
  audioBase64: string
  mimeType: string
  provider: "fish" | "google"
}

@Injectable()
export class FallbackTtsService {
  private readonly logger = new Logger(FallbackTtsService.name)

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async synthesize(text: string, language: "hi" | "en" = "hi"): Promise<TtsResult> {
    // Try Fish Audio first
    try {
      return await this.synthesizeWithFish(text, language)
    } catch (fishError) {
      this.logger.warn(`Fish Audio TTS failed, trying Google TTS: ${fishError instanceof Error ? fishError.message : String(fishError)}`)
    }

    // Fallback to Google Cloud TTS
    try {
      return await this.synthesizeWithGoogle(text, language)
    } catch (googleError) {
      this.logger.error(`Google TTS also failed: ${googleError instanceof Error ? googleError.message : String(googleError)}`)
      throw new ServiceUnavailableException("Both TTS providers unavailable")
    }
  }

  private async synthesizeWithFish(text: string, language: "hi" | "en"): Promise<TtsResult> {
    const apiKey = this.config.get("FISH_AUDIO_API_KEY", { infer: true })
    const voiceId = this.config.get("FISH_VOICE_ID", { infer: true }) || "hindi-female-01"

    if (!apiKey) {
      throw new ServiceUnavailableException("Fish Audio API key not configured")
    }

    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice_id: voiceId,
        model: "s2.1-pro-free",
        format: "mp3",
        sample_rate: 22050,
        language: language === "hi" ? "hi" : "en",
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new ServiceUnavailableException(`Fish Audio TTS HTTP ${response.status}: ${body.slice(0, 200)}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    return { audioBase64: base64, mimeType: "audio/mp3", provider: "fish" }
  }

  private async synthesizeWithGoogle(text: string, language: "hi" | "en"): Promise<TtsResult> {
    const apiKey = this.config.get("GCP_TTS_KEY", { infer: true })
    const voiceName = this.config.get("GCP_TTS_VOICE", { infer: true }) || (language === "hi" ? "hi-IN-Wavenet-A" : "en-IN-Wavenet-A")

    if (!apiKey) {
      throw new ServiceUnavailableException("Google Cloud TTS API key not configured")
    }

    const languageCode = language === "hi" ? "hi-IN" : "en-IN"
    const ssmlGender = language === "hi" ? "FEMALE" : "FEMALE"

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode, name: voiceName, ssmlGender },
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0 },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    )

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new ServiceUnavailableException(`Google TTS HTTP ${response.status}: ${body.slice(0, 200)}`)
    }

    const payload = (await response.json()) as { audioContent?: string }
    const audioBase64 = payload.audioContent

    if (!audioBase64) {
      throw new ServiceUnavailableException("Google TTS returned empty audio")
    }

    return { audioBase64, mimeType: "audio/mp3", provider: "google" }
  }
}