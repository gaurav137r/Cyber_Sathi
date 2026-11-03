import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { SpeechResult, SpeechService } from "./speech-provider"
import { TextToSpeechResult, TextToSpeechService } from "./tts-provider"

type BhashiniResponse = {
  response?: Array<{
    output?: Array<{ source?: string; target?: string; audio?: string }>
  }>
  output?: Array<{ source?: string; target?: string; audio?: string }>
  config?: { language?: { sourceLanguage?: string } }
}

@Injectable()
export class BhashiniProvider implements SpeechService, TextToSpeechService {
  constructor(private readonly config: ConfigService) {}

  async transcribe(audio: Buffer, languageHint = "en"): Promise<SpeechResult> {
    const detectedLanguage = languageHint || "en"
    const asr = await this.callPipeline({
      pipelineTasks: [
        {
          taskType: "asr",
          config: {
            language: { sourceLanguage: detectedLanguage },
            serviceId: this.config.getOrThrow<string>(
              "BHASHINI_ASR_SERVICE_ID",
            ),
            audioFormat: "wav",
            samplingRate: 16000,
          },
        },
      ],
      inputData: { audio: [{ audioContent: audio.toString("base64") }] },
    })
    const transcript = this.readText(asr)
    const canonicalTranscript = detectedLanguage.toLowerCase().startsWith("en")
      ? transcript
      : this.readText(
          await this.callPipeline({
            pipelineTasks: [
              {
                taskType: "translation",
                config: {
                  language: {
                    sourceLanguage: detectedLanguage,
                    targetLanguage: "en",
                  },
                  serviceId: this.config.getOrThrow<string>(
                    "BHASHINI_TRANSLATION_SERVICE_ID",
                  ),
                },
              },
            ],
            inputData: { input: [{ source: transcript }] },
          }),
        )
    return { detectedLanguage, transcript, canonicalTranscript }
  }

  async synthesize(
    text: string,
    language: string,
  ): Promise<TextToSpeechResult> {
    const response = await this.callPipeline({
      pipelineTasks: [
        {
          taskType: "tts",
          config: {
            language: { sourceLanguage: language },
            serviceId: this.config.getOrThrow<string>(
              "BHASHINI_TTS_SERVICE_ID",
            ),
          },
        },
      ],
      inputData: { input: [{ source: text }] },
    })
    const audio = this.readAudio(response)
    return { audio, contentType: "audio/wav", extension: "wav" }
  }

  private async callPipeline(
    body: Record<string, unknown>,
  ): Promise<BhashiniResponse> {
    const apiKey = this.config.get<string>("BHASHINI_API_KEY")
    if (!apiKey)
      throw new ServiceUnavailableException("Bhashini API is not configured")
    const headers: Record<string, string> = {
      Authorization: apiKey,
      "Content-Type": "application/json",
    }
    const userId = this.config.get<string>("BHASHINI_USER_ID")
    if (userId) headers["userID"] = userId
    const response = await fetch(
      this.config.getOrThrow<string>("BHASHINI_API_URL"),
      { method: "POST", headers, body: JSON.stringify(body) },
    )
    if (!response.ok)
      throw new ServiceUnavailableException(
        `Bhashini request failed with HTTP ${response.status}`,
      )
    return response.json() as Promise<BhashiniResponse>
  }

  private readText(response: BhashiniResponse): string {
    const output = response.response?.[0]?.output?.[0] ?? response.output?.[0]
    const text = output?.source ?? output?.target
    if (!text)
      throw new ServiceUnavailableException(
        "Bhashini returned no transcript text",
      )
    return text
  }

  private readAudio(response: BhashiniResponse): Buffer {
    const encoded =
      response.response?.[0]?.output?.[0]?.audio ?? response.output?.[0]?.audio
    if (!encoded)
      throw new ServiceUnavailableException("Bhashini returned no audio")
    return Buffer.from(encoded, "base64")
  }
}
