import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"
import { ImagesConfigService } from "./images.config"
import {
  decodeImagePayload,
  detectImageFormat,
  type DecodedImageFormat,
} from "./image-decoder"
import { inspectImage } from "./image-validator"

export interface CloudflareGenerationResult {
  buffer: Buffer
  format: DecodedImageFormat
  contentType: string
  width: number
  height: number
  model: string
  steps: number
  durationMs: number
}

interface CloudflareJsonBody {
  success?: boolean
  result?: { image?: unknown } | string
  errors?: Array<{ code?: number; message?: string }>
  messages?: unknown
}

const MAX_ATTEMPTS = 3
const BASE_RETRY_DELAY_MS = 700

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Trim a response body for logs/errors without ever echoing base64 image data
 * or credentials.
 */
export function safeBodySnippet(body: string, maxLength = 600): string {
  if (!body) return ""
  return body
    .replace(/[A-Za-z0-9+/]{300,}={0,2}/g, "[binary omitted]")
    .replace(
      /("?(?:token|authorization|api[_-]?token|secret)"?\s*[:=]\s*"?)[^",}\s]+/gi,
      "$1[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}

function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("retry-after")
  if (!header) return undefined
  const asNumber = Number(header)
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber
  const asDate = Date.parse(header)
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000))
  }
  return undefined
}

function isTimeoutOrNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return true
  if (error.name === "TimeoutError" || error.name === "AbortError") return true
  return error instanceof TypeError
}

@Injectable()
export class CloudflareImagesClient {
  private readonly logger = new Logger(CloudflareImagesClient.name)

  constructor(private readonly config: ImagesConfigService) {}

  /**
   * Call Cloudflare Workers AI with the tested Flux Schnell request shape.
   * Only `prompt` and `steps` are sent: width/height are intentionally not
   * assumed to be supported by this model.
   */
  async generate(
    prompt: string,
    steps: number,
  ): Promise<CloudflareGenerationResult> {
    const { apiToken } = this.config.assertReady()
    if (!prompt.trim()) {
      throw new BadGatewayException(
        "The image prompt is empty after prompt processing.",
      )
    }

    const endpoint = this.config.endpoint()
    const payload = JSON.stringify({ prompt, steps })
    let lastError: unknown = null

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now()
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: payload,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        })

        if (response.ok) {
          return await this.parseSuccess(
            response,
            prompt,
            steps,
            Date.now() - startedAt,
          )
        }

        const bodyText = await response.text().catch(() => "")
        const snippet = safeBodySnippet(bodyText)
        this.logger.error(
          JSON.stringify({
            event: "cloudflare.image.request_failed",
            status: response.status,
            attempt,
            model: this.config.model,
            body: snippet,
          }),
        )

        if (response.status === HttpStatus.TOO_MANY_REQUESTS) {
          const retryAfter = retryAfterSeconds(response)
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message:
                `Cloudflare Workers AI rate limit reached. Wait${
                  retryAfter !== undefined
                    ? ` ${retryAfter} second(s)`
                    : " a little while"
                } and try again. Free-tier daily limits are shared across the account.`,
              retryAfterSeconds: retryAfter,
              provider: "cloudflare",
            },
            HttpStatus.TOO_MANY_REQUESTS,
          )
        }

        if (
          response.status === HttpStatus.UNAUTHORIZED ||
          response.status === HttpStatus.FORBIDDEN
        ) {
          throw new ServiceUnavailableException(
            `Cloudflare authentication failed with HTTP ${response.status}. Check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then restart the API.${
              snippet ? ` Cloudflare said: ${snippet}` : ""
            }`,
          )
        }

        if (response.status === HttpStatus.BAD_REQUEST) {
          throw new BadGatewayException(
            `Cloudflare rejected the image request with HTTP 400.${
              snippet ? ` ${snippet}` : ""
            }`,
          )
        }

        if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
          lastError = new Error(`Cloudflare HTTP ${response.status}: ${snippet}`)
          await sleep(
            BASE_RETRY_DELAY_MS * 2 ** (attempt - 1) +
              Math.floor(Math.random() * 250),
          )
          continue
        }

        throw new BadGatewayException(
          `Cloudflare Workers AI request failed with HTTP ${response.status}.${
            snippet ? ` ${snippet}` : ""
          }`,
        )
      } catch (error) {
        if (error instanceof HttpException) throw error

        this.logger.error(
          JSON.stringify({
            event: "cloudflare.image.request_error",
            attempt,
            model: this.config.model,
            error: error instanceof Error ? error.message : String(error),
          }),
        )

        if (isTimeoutOrNetworkError(error) && attempt < MAX_ATTEMPTS) {
          lastError = error
          await sleep(
            BASE_RETRY_DELAY_MS * 2 ** (attempt - 1) +
              Math.floor(Math.random() * 250),
          )
          continue
        }

        throw new ServiceUnavailableException(
          error instanceof Error &&
            (error.name === "TimeoutError" || error.name === "AbortError")
            ? `Cloudflare Workers AI did not respond within ${Math.round(
                this.config.timeoutMs / 1000,
              )} seconds. Try again in a moment.`
            : "Could not reach Cloudflare Workers AI. Check the API server's network connection and try again.",
        )
      }
    }

    throw new ServiceUnavailableException(
      `Cloudflare Workers AI failed after ${MAX_ATTEMPTS} attempts. ${
        lastError instanceof Error ? lastError.message : ""
      }`.trim(),
    )
  }

  private async parseSuccess(
    response: Response,
    prompt: string,
    steps: number,
    durationMs: number,
  ): Promise<CloudflareGenerationResult> {
    const contentType = response.headers.get("content-type") ?? ""

    // Some Workers AI routes can answer with the binary image directly. Accept
    // it when it happens, but keep the documented JSON path as the primary.
    if (contentType.toLowerCase().startsWith("image/")) {
      const buffer = Buffer.from(await response.arrayBuffer())
      const format = detectImageFormat(buffer)
      if (!format) {
        throw new BadGatewayException(
          "Cloudflare returned a binary response that is not a valid image.",
        )
      }
      const metadata = await inspectImage(buffer)
      return {
        buffer,
        format,
        contentType:
          format === "jpeg"
            ? "image/jpeg"
            : format === "webp"
              ? "image/webp"
              : format === "gif"
                ? "image/gif"
                : "image/png",
        width: metadata.width,
        height: metadata.height,
        model: this.config.model,
        steps,
        durationMs,
      }
    }

    const text = await response.text()
    let body: CloudflareJsonBody
    try {
      body = JSON.parse(text) as CloudflareJsonBody
    } catch {
      throw new BadGatewayException(
        `Cloudflare returned a response that was not valid JSON.${
          text ? ` ${safeBodySnippet(text)}` : ""
        }`,
      )
    }

    if (body.success !== true) {
      const detail = safeBodySnippet(
        JSON.stringify(body.errors ?? body.messages ?? body),
      )
      this.logger.error(
        JSON.stringify({
          event: "cloudflare.image.unsuccessful",
          model: this.config.model,
          body: detail,
        }),
      )
      throw new BadGatewayException(
        `Cloudflare reported an unsuccessful image generation.${
          detail ? ` ${detail}` : ""
        }`,
      )
    }

    const imagePayload =
      typeof body.result === "string"
        ? body.result
        : body.result && typeof body.result === "object"
          ? body.result.image
          : undefined

    if (!imagePayload) {
      throw new BadGatewayException(
        "Cloudflare reported success but the response did not contain an image.",
      )
    }

    const decoded = decodeImagePayload(imagePayload, this.config.maxImageBytes)
    const metadata = await inspectImage(decoded.buffer)
    if (
      metadata.width < this.config.minDimension ||
      metadata.height < this.config.minDimension
    ) {
      throw new BadGatewayException(
        `Cloudflare returned an image that is too small (${metadata.width}x${metadata.height}).`,
      )
    }

    this.logger.log(
      JSON.stringify({
        event: "cloudflare.image.generated",
        model: this.config.model,
        steps,
        width: metadata.width,
        height: metadata.height,
        bytes: decoded.buffer.length,
        durationMs,
        promptLength: prompt.length,
      }),
    )

    return {
      buffer: decoded.buffer,
      format: decoded.format,
      contentType: decoded.contentType,
      width: metadata.width,
      height: metadata.height,
      model: this.config.model,
      steps,
      durationMs,
    }
  }
}
