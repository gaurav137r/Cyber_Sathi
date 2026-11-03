import { Injectable, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import {
  classificationCategories,
  classificationOutputSchema,
  ClassificationOutput,
} from "./classification.types"
import { ClassificationService } from "./classification-provider"

@Injectable()
export class OpenAiClassificationProvider implements ClassificationService {
  constructor(private readonly config: ConfigService) {}

  async classify(input: {
    canonicalTranscript: string
    extractedEntities: unknown
  }): Promise<ClassificationOutput> {
    const apiKey = this.config.get<string>("LLM_API_KEY")
    if (!apiKey)
      throw new ServiceUnavailableException("LLM_API_KEY is not configured")
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await this.requestStructuredClassification(input, apiKey)
      } catch (error) {
        if (attempt === 2) throw error
      }
    }
    throw new ServiceUnavailableException("Classification failed")
  }

  private async requestStructuredClassification(
    input: { canonicalTranscript: string; extractedEntities: unknown },
    apiKey: string,
  ): Promise<ClassificationOutput> {
    const response = await fetch(
      this.config.getOrThrow<string>("LLM_API_URL"),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.getOrThrow<string>("LLM_MODEL"),
          temperature: 0,
          messages: [
            {
              role: "system",
              content: `Classify this Indian cyber-fraud report. Return only the requested JSON. Categories: ${classificationCategories.join(", ")}. Extract only facts present in the transcript; use null when absent.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                canonicalTranscript: input.canonicalTranscript,
                extractedEntities: input.extractedEntities,
              }),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "cyber_sathi_classification",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: [
                  "category",
                  "confidence",
                  "explanation",
                  "extractedFields",
                ],
                properties: {
                  category: { type: "string", enum: classificationCategories },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  explanation: { type: "string", minLength: 1, maxLength: 500 },
                  extractedFields: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "phone",
                      "amount",
                      "date",
                      "bankOrApp",
                      "description",
                    ],
                    properties: {
                      phone: { type: ["string", "null"] },
                      amount: { type: ["number", "null"], minimum: 0 },
                      date: { type: ["string", "null"] },
                      bankOrApp: { type: ["string", "null"] },
                      description: { type: ["string", "null"] },
                    },
                  },
                },
              },
            },
          },
        }),
      },
    )
    if (!response.ok)
      throw new ServiceUnavailableException(
        `LLM classification failed with HTTP ${response.status}`,
      )
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = body.choices?.[0]?.message?.content
    if (!content)
      throw new ServiceUnavailableException(
        "LLM returned no structured classification",
      )
    let candidate: unknown
    try {
      candidate = JSON.parse(content)
    } catch {
      throw new ServiceUnavailableException("LLM returned invalid JSON")
    }
    const parsed = classificationOutputSchema.safeParse(candidate)
    if (!parsed.success)
      throw new ServiceUnavailableException(
        `LLM output failed schema validation: ${parsed.error.message}`,
      )
    return parsed.data
  }
}
