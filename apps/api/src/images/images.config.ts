import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { AppEnv } from "../config/env.schema"

/**
 * Central, validated configuration for the image pipeline.
 *
 * Constructing this provider happens during Nest bootstrap, so a missing or
 * malformed Cloudflare credential fails fast with an actionable message
 * instead of surfacing as a confusing 502 on the first user request.
 */
@Injectable()
export class ImagesConfigService {
  private readonly logger = new Logger(ImagesConfigService.name)

  readonly provider: string
  readonly model: string
  readonly defaultSteps: number
  readonly timeoutMs: number
  readonly maxImageBytes: number
  readonly minDimension: number
  readonly maxDimension: number
  readonly fontRegularPath: string
  readonly fontBoldPath: string
  readonly fontDevanagariPath: string
  readonly fontFamily: string
  readonly fontFamilyBold: string
  readonly fontFamilyDevanagari: string
  readonly storageDir: string
  readonly imagesBucket: string

  private readonly accountId?: string
  private readonly apiToken?: string

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.provider = this.config.get("IMAGE_PROVIDER", { infer: true })
    this.model = this.config.get("IMAGE_MODEL", { infer: true })
    this.defaultSteps = this.config.get("IMAGE_STEPS", { infer: true })
    this.timeoutMs = this.config.get("IMAGE_TIMEOUT_MS", { infer: true })
    this.maxImageBytes = this.config.get("IMAGE_MAX_BYTES", { infer: true })
    this.minDimension = this.config.get("IMAGE_MIN_DIMENSION", { infer: true })
    this.maxDimension = this.config.get("IMAGE_MAX_DIMENSION", { infer: true })
    this.fontRegularPath = this.config.get("IMAGE_FONT_REGULAR", { infer: true })
    this.fontBoldPath = this.config.get("IMAGE_FONT_BOLD", { infer: true })
    this.fontDevanagariPath = this.config.get(
      "IMAGE_FONT_DEVANAGARI",
      { infer: true },
    )
    this.fontFamily = this.config.get("IMAGE_FONT_FAMILY", { infer: true })
    this.fontFamilyBold = this.config.get(
      "IMAGE_FONT_FAMILY_BOLD",
      { infer: true },
    )
    this.fontFamilyDevanagari = this.config.get(
      "IMAGE_FONT_FAMILY_DEVANAGARI",
      { infer: true },
    )
    this.storageDir = this.config.get("IMAGE_STORAGE_DIR", { infer: true })
    this.imagesBucket = this.config.get("SUPABASE_IMAGES_BUCKET", {
      infer: true,
    })

    if (this.provider === "disabled") {
      this.logger.warn(
        "IMAGE_PROVIDER=disabled: AI image generation endpoints will return a configuration error.",
      )
      return
    }

    if (this.provider !== "cloudflare") {
      throw new Error(
        `Invalid IMAGE_PROVIDER "${this.provider}". Supported values: "cloudflare" or "disabled".`,
      )
    }

    this.accountId = this.config.get("CLOUDFLARE_ACCOUNT_ID", { infer: true })
    this.apiToken = this.config.get("CLOUDFLARE_API_TOKEN", { infer: true })

    if (!this.accountId || !/^[a-f0-9]{32}$/i.test(this.accountId)) {
      throw new Error(
        "CLOUDFLARE_ACCOUNT_ID is missing or invalid. Set the 32-character Cloudflare account ID for the image-generation API.",
      )
    }
    if (
      !this.apiToken ||
      this.apiToken.length < 20 ||
      /your_|changeme|example|placeholder/i.test(this.apiToken)
    ) {
      throw new Error(
        "CLOUDFLARE_API_TOKEN is missing or still contains a placeholder. Create a Cloudflare API token with Workers AI: Read access.",
      )
    }
    if (
      !/^@[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
        this.model,
      )
    ) {
      throw new Error(
        `Invalid IMAGE_MODEL "${this.model}". Use a Cloudflare model identifier such as "@cf/black-forest-labs/flux-1-schnell".`,
      )
    }
  }

  assertReady(): { accountId: string; apiToken: string } {
    if (this.provider === "disabled") {
      throw new ServiceUnavailableException(
        "AI image generation is disabled on this server (IMAGE_PROVIDER=disabled).",
      )
    }
    if (!this.accountId || !this.apiToken) {
      throw new ServiceUnavailableException(
        "Cloudflare Workers AI is not configured on this server.",
      )
    }
    return { accountId: this.accountId, apiToken: this.apiToken }
  }

  endpoint(): string {
    const { accountId } = this.assertReady()
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${this.model}`
  }

  /** Safe metadata for the API/frontend. Never includes credentials. */
  publicInfo() {
    return {
      provider: this.provider,
      model: this.model,
      defaultSteps: this.defaultSteps,
      stepsRange: { min: 1, max: 8 },
      dimensions: {
        min: this.minDimension,
        max: this.maxDimension,
      },
      fonts: {
        regular: this.fontFamily,
        bold: this.fontFamilyBold,
        devanagari: this.fontFamilyDevanagari,
      },
      forcedTextRendering: "svg+imagemagick",
    }
  }
}
