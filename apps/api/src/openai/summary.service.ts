import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { AppEnv } from "../config/env.schema"
import { AiGateway } from "../ai/ai-gateway.service"

@Injectable()
export class OpenAIService {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly ai: AiGateway,
  ) {}

  async generateSummary(text: string, language: "hi" | "en"): Promise<string> {
    const languageName = language === "hi" ? "simple Hindi" : "plain English"
    const redactedText = text
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
      .replace(/https?:\/\/\S+|\bwww\.\S+/gi, "[redacted link]")
      .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted number]")
      .replace(/\b\d{8,}\b/g, "[redacted identifier]")
    const result = await this.ai.generateText({
      primary: this.config.get("REPORT_MODEL_PROVIDER", { infer: true }),
      primaryModel: this.config.get("BILINGUAL_MODEL", { infer: true }),
      fallback: "gemini",
      fallbackModel: this.config.get("BILINGUAL_FALLBACK", { infer: true }),
      messages: [
        {
          role: "system",
          content: `Summarize this cyber-fraud case in ${languageName}. Use only supported facts, do not expose victim personal information, and return only the summary.`,
        },
        { role: "user", content: redactedText },
      ],
      temperature: 0.2,
      maxTokens: 900,
    })
    return result.text
  }
}
