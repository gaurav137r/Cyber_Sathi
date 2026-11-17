import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import type { AppEnv } from "../config/env.schema"
import { KeyPool } from "../ai/key-pool"

export interface CaseImageInput {
  category: string
  amount: string
  suspectPhone: string
  suspectUpi: string
  suspectDetails: string
  platform: string
  incidentDate: string
  summary: string
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function detectImageMime(base64: string, bytes?: Buffer): string {
  if (base64.startsWith("/9j/")) return "image/jpeg"
  if (base64.startsWith("iVBOR")) return "image/png"
  if (base64.startsWith("UklGR")) return "image/webp"
  if (base64.startsWith("R0lGOD")) return "image/gif"
  if (bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg"
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png"
    if (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    )
      return "image/webp"
    if (bytes.subarray(0, 3).toString("ascii") === "GIF")
      return "image/gif"
  }
  return "image/jpeg"
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

@Injectable()
export class CloudflareImageService {
  private readonly logger = new Logger(CloudflareImageService.name)

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly keys: KeyPool,
  ) {}

  /**
   * Produces a shareable case image using Cloudflare Workers AI (FLUX.1-schnell)
   * with Pollinations as fallback. Local SVG infographic is the final fallback.
   */
  async generateCaseImage(caseData: CaseImageInput): Promise<string> {
    // Try Cloudflare first
    const cloudflareEnabled = this.config.get("IMAGE_PROVIDER", { infer: true }) === "cloudflare"
    if (cloudflareEnabled) {
      try {
        const image = await this.generateWithCloudflare(this.generateImagePrompt(caseData))
        if (image) return image
      } catch (error) {
        this.logger.warn(
          `Cloudflare image generation failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    // Try Pollinations fallback
    const pollinationsEnabled = this.config.get("IMAGE_FALLBACK_PROVIDER", { infer: true }) === "pollinations"
    if (pollinationsEnabled) {
      try {
        const image = await this.generateWithPollinations(this.generateImagePrompt(caseData))
        if (image) return image
      } catch (error) {
        this.logger.warn(
          `Pollinations image generation failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    // Final fallback: deterministic SVG
    return this.buildInfographicDataUrl(caseData)
  }

  private async generateWithCloudflare(prompt: string): Promise<string | null> {
    const accountId = this.config.get("CLOUDFLARE_ACCOUNT_ID", { infer: true })
    const apiToken = this.config.get("CLOUDFLARE_API_TOKEN", { infer: true })
    const model =
      this.config.get("IMAGE_MODEL", { infer: true }) ||
      "@cf/black-forest-labs/flux-1-schnell"

    if (!accountId || !apiToken) {
      throw new Error("Cloudflare credentials not configured")
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, steps: 4 }),
        signal: AbortSignal.timeout(60_000),
      },
    )

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`Cloudflare HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`)
    }

    const payload = (await response.json()) as {
      result?: { image?: string }
      errors?: Array<{ message: string }>
    }

    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).join(", "))
    }

    const base64 = payload.result?.image
    if (!base64) return null

    return `data:${detectImageMime(base64)};base64,${base64}`
  }

  private async generateWithPollinations(prompt: string): Promise<string | null> {
    const baseUrl = this.config.get("IMAGE_FALLBACK_URL", { infer: true }) || "https://image.pollinations.ai/prompt/"
    const encodedPrompt = encodeURIComponent(prompt)
    const url = `${baseUrl}${encodedPrompt}?width=800&height=480&model=flux&nologo=true&private=true`

    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(60_000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`Pollinations HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`)
    }

    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const bytes = Buffer.from(arrayBuffer)
    return `data:${detectImageMime("", bytes)};base64,${bytes.toString("base64")}`
  }

  private generateImagePrompt(caseData: CaseImageInput): string {
    return this.buildInfographicPrompt(caseData)
  }

  private buildInfographicPrompt(caseData: CaseImageInput): string {
    const fraudType = caseData.category || "UPI fraud"
    const amount = caseData.amount || "an undisclosed amount"
    const platform = caseData.platform || "a payment app"
    return `Professional cyber-fraud awareness infographic. Fraud type: ${fraudType}. Amount lost: ${amount}. Platform: ${platform}. Clean minimal teal and white design, shield and warning icons, no faces, no personal data, no readable account numbers.`
  }

  /** Deterministic, always-available SVG fallback. */
  private buildInfographicDataUrl(caseData: CaseImageInput): string {
    const category = escapeXml(truncate(caseData.category || "Cyber fraud", 42))
    const amount = escapeXml(truncate(caseData.amount || "Amount not recorded", 34))
    const platform = escapeXml(
      truncate(caseData.platform || caseData.suspectDetails || "Platform not recorded", 42),
    )
    const date = escapeXml(truncate(caseData.incidentDate || "Date not recorded", 32))
    const summary = escapeXml(truncate(caseData.summary, 120))

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480" role="img" aria-label="Cyber Sathi case summary">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F766E"/>
      <stop offset="1" stop-color="#115E59"/>
    </linearGradient>
  </defs>
  <rect width="800" height="480" fill="url(#bg)"/>
  <rect x="32" y="32" width="736" height="416" rx="24" fill="#F8FAF9"/>
  <path d="M400 64l54 22v46c0 34-22 63-54 76-32-13-54-42-54-76V86z" fill="#0F766E" opacity="0.12"/>
  <path d="M400 84l34 14v34c0 24-14 44-34 54-20-10-34-30-34-54v-34z" fill="#0F766E"/>
  <path d="M386 132l10 10 20-22" fill="none" stroke="#F8FAF9" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="400" y="200" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="20" fill="#0F766E" font-weight="600">Cyber Sathi case summary</text>
  <text x="400" y="244" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#123B36" font-weight="700">${category}</text>
  <text x="400" y="280" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="#B45309" font-weight="600">${amount}</text>
  <text x="400" y="322" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="17" fill="#5B6B68">${platform}</text>
  <text x="400" y="350" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="15" fill="#5B6B68">${date}</text>
  <text x="400" y="392" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#5B6B68">${summary}</text>
  <text x="400" y="428" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#8A9996">Generated locally · no personal data included</text>
</svg>`

    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  }
}