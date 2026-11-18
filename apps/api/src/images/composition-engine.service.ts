import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common"
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { ImagesConfigService } from "./images.config"
import {
  detectImageFormat,
  type DecodedImageFormat,
} from "./image-decoder"
import { assertOutputFile, exportImage } from "./image-exporter"
import { inspectImage } from "./image-validator"
import type {
  ImageFormat,
  ImageTemplateDefinition,
  PosterContent,
} from "./images.types"
import { renderOverlaySvg } from "./svg-renderer"

const execFileAsync = promisify(execFile)

export interface CompositionRequest {
  background: Buffer
  width: number
  height: number
  format: ImageFormat
  template: ImageTemplateDefinition
  content: PosterContent
  accentColor?: string
}

export interface CompositionResult {
  buffer: Buffer
  format: ImageFormat
  contentType: string
  width: number
  height: number
  bytes: number
  durationMs: number
}

/**
 * ImageMagick-backed composition engine.
 *
 * The AI background is resized/cropped to the target canvas, then the SVG
 * overlay (all typography, badges, rules and gradients) is composited on top.
 * The result is exported to the requested delivery format and re-validated so
 * a missing or corrupt file can never be reported as success.
 */
@Injectable()
export class CompositionEngineService implements OnModuleInit {
  private readonly logger = new Logger(CompositionEngineService.name)
  private compositionReady = false

  constructor(private readonly config: ImagesConfigService) {}

  async onModuleInit(): Promise<void> {
    if (this.config.provider === "disabled") return
    try {
      await this.verifyImageMagick()
      await this.verifyFonts()
      this.compositionReady = true
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: "images.composition.unavailable",
          reason: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  private async verifyImageMagick(): Promise<void> {
    try {
      const { stdout } = await execFileAsync("magick", ["-version"], {
        timeout: 15_000,
      })
      const firstLine = stdout.split(/\r?\n/)[0]?.trim() ?? ""
      if (!/ImageMagick\s+7/i.test(firstLine)) {
        throw new Error(
          `ImageMagick 7 is required, but the server reported: ${firstLine || "unknown version"}`,
        )
      }
      this.logger.log(
        JSON.stringify({ event: "images.imagemagick.ready", version: firstLine }),
      )
    } catch (error) {
      throw new Error(
        `ImageMagick 7 is required for poster composition but was not found. Install it with "sudo dnf install ImageMagick dejavu-sans-fonts" and restart the API. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
      )
    }
  }

  private async verifyFonts(): Promise<void> {
    const required = [
      { label: "regular", file: this.config.fontRegularPath },
      { label: "bold", file: this.config.fontBoldPath },
    ]
    for (const font of required) {
      try {
        await fs.access(font.file)
      } catch {
        throw new Error(
          `The ${font.label} image font was not found at "${font.file}". Install DejaVu Sans ("sudo dnf install dejavu-sans-fonts") or set IMAGE_FONT_${font.label.toUpperCase()} to a valid TTF file.`,
        )
      }
    }

    try {
      await fs.access(this.config.fontDevanagariPath)
    } catch {
      this.logger.warn(
        JSON.stringify({
          event: "images.font.devanagari_missing",
          path: this.config.fontDevanagariPath,
          note: "Hindi posters will fall back to the Latin font. Install google-noto-sans-devanagari-fonts for proper glyphs.",
        }),
      )
    }
  }

  async render(request: CompositionRequest): Promise<CompositionResult> {
    const startedAt = Date.now()
    if (!this.compositionReady) {
      throw new ServiceUnavailableException(
        "Poster composition is unavailable because ImageMagick or the required fonts are missing. Other API features remain available.",
      )
    }
    if (!request.background || request.background.length < 64) {
      throw new InternalServerErrorException(
        "No background image was supplied to the composition engine.",
      )
    }

    const detected = detectImageFormat(request.background)
    if (!detected) {
      throw new InternalServerErrorException(
        "The background supplied to the composition engine is not a valid image.",
      )
    }

    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "cyber-sathi-compose-"),
    )
    const backgroundPath = path.join(directory, `background.${extension(detected)}`)
    const basePath = path.join(directory, "base.png")
    const overlayPath = path.join(directory, "overlay.svg")
    const composedPath = path.join(directory, "composed.png")

    try {
      await fs.writeFile(backgroundPath, request.background)

      // 1. Fit the AI artwork to the exact canvas without distortion.
      await this.runMagick(
        [
          backgroundPath,
          "-auto-orient",
          "-colorspace",
          "sRGB",
          "-resize",
          `${request.width}x${request.height}^`,
          "-gravity",
          "center",
          "-extent",
          `${request.width}x${request.height}`,
          "-strip",
          basePath,
        ],
        "resize background",
      )

      // 2. Render every human-readable element as SVG.
      const overlay = renderOverlaySvg({
        width: request.width,
        height: request.height,
        template: request.template,
        content: request.content,
        accentColor: request.accentColor,
        fontFamily: this.config.fontFamily,
        fontFamilyBold: this.config.fontFamilyBold,
        fontFamilyDevanagari: this.config.fontFamilyDevanagari,
      })
      await fs.writeFile(overlayPath, overlay, "utf8")

      // 3. Composite the overlay over the prepared background.
      await this.runMagick(
        [
          basePath,
          "-background",
          "none",
          overlayPath,
          "-compose",
          "over",
          "-composite",
          "-strip",
          composedPath,
        ],
        "composite SVG overlay",
      )

      await assertOutputFile(composedPath, 1_000)

      // 4. Export to PNG/JPEG/WebP and confirm the final file exists.
      const exported = await exportImage(
        composedPath,
        directory,
        "poster",
        request.format,
      )
      const buffer = await fs.readFile(exported.path)
      const metadata = await inspectImage(buffer)
      if (
        metadata.width !== request.width ||
        metadata.height !== request.height
      ) {
        throw new InternalServerErrorException(
          `The composed image has unexpected dimensions (${metadata.width}x${metadata.height}, expected ${request.width}x${request.height}).`,
        )
      }

      this.logger.log(
        JSON.stringify({
          event: "images.composition.ready",
          template: request.template.id,
          width: request.width,
          height: request.height,
          format: request.format,
          bytes: buffer.length,
          durationMs: Date.now() - startedAt,
        }),
      )

      return {
        buffer,
        format: request.format,
        contentType: exported.contentType,
        width: metadata.width,
        height: metadata.height,
        bytes: buffer.length,
        durationMs: Date.now() - startedAt,
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {})
    }
  }

  private async runMagick(args: string[], label: string): Promise<void> {
    try {
      await execFileAsync("magick", args, {
        maxBuffer: 20 * 1024 * 1024,
        timeout: 120_000,
      })
    } catch (error) {
      const stderr =
        typeof (error as { stderr?: unknown }).stderr === "string"
          ? ((error as { stderr: string }).stderr || "").slice(0, 800)
          : ""
      this.logger.error(
        JSON.stringify({
          event: "images.imagemagick.failed",
          stage: label,
          error: error instanceof Error ? error.message : String(error),
          stderr,
        }),
      )
      throw new InternalServerErrorException(
        `ImageMagick failed while trying to ${label}.${
          stderr ? ` ${stderr.trim()}` : ""
        }`,
      )
    }
  }
}

function extension(format: DecodedImageFormat): string {
  return format === "jpeg" ? "jpg" : format
}
