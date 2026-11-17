import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { createHash } from "node:crypto"
import { PrismaService } from "../prisma/prisma.service"
import { CloudflareImagesClient } from "./cloudflare-images.client"
import { CompositionEngineService } from "./composition-engine.service"
import { GeneratedImageStorage } from "./image-storage.service"
import { ImagesConfigService } from "./images.config"
import {
  GenerateBackgroundDto,
  GeneratePosterDto,
  RenderPosterDto,
} from "./images.dto"
import {
  IMAGE_FORMATS,
  IMAGE_PRESETS,
  IMAGE_TEMPLATES,
  contentInfo,
  findPreset,
  isImageFormat,
  isImageTemplateId,
  type GeneratedImageDto,
  type ImageFormat,
  type ImageTemplateDefinition,
  type PosterContent,
} from "./images.types"
import { aspectRatioLabel, validateDimensions } from "./image-validator"
import { buildImagePrompt, DEFAULT_NEGATIVE_INSTRUCTIONS } from "./prompt-builder"

interface CaseContext {
  id: string
  category: string
  structuredFields: unknown
}

interface ResolvedCanvas {
  width: number
  height: number
  aspectRatio: string
  preset?: string
}

interface ResolvedPoster {
  template: ImageTemplateDefinition
  format: ImageFormat
  content: PosterContent
  accentColor?: string
}

function normalisePrompt(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function ensureNoTextInstruction(prompt: string): string {
  if (/\bno text\b|\bno letters\b|\bwithout text\b/i.test(prompt)) {
    return prompt
  }
  return `${prompt.replace(/[.\s]+$/, "")}. ${DEFAULT_NEGATIVE_INSTRUCTIONS}`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000)
  return "Unknown image generation error".slice(0, 1000)
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ImagesConfigService,
    private readonly cloudflare: CloudflareImagesClient,
    private readonly storage: GeneratedImageStorage,
    private readonly composition: CompositionEngineService,
  ) {}

  getCapabilities() {
    return {
      ...this.config.publicInfo(),
      presets: IMAGE_PRESETS,
      templates: IMAGE_TEMPLATES.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        layout: template.layout,
        accent: template.theme.accent,
      })),
      formats: IMAGE_FORMATS,
      defaults: {
        preset: "instagram-square",
        template: "cyber-shield",
        format: "png",
        steps: this.config.defaultSteps,
      },
      notes: {
        textRendering:
          "All text is rendered locally with SVG + ImageMagick. The AI model only generates the background artwork.",
        freeTier:
          "Generation uses Cloudflare Workers AI Flux Schnell with 4 inference steps by default. Cloudflare account quotas still apply.",
      },
    }
  }

  async generateBackground(
    caseId: string,
    userId: string,
    dto: GenerateBackgroundDto,
  ): Promise<GeneratedImageDto & { cached: boolean }> {
    const caseRecord = await this.assertCase(caseId, userId)
    const canvas = this.resolveCanvas(dto)
    const prompt = this.resolvePrompt(dto, caseRecord)
    const steps = dto.steps ?? this.config.defaultSteps
    const promptHash = this.hashPrompt(prompt, steps)

    const row = await this.prisma.generatedImage.create({
      data: {
        caseId,
        userId,
        status: "PROCESSING",
        prompt,
        promptHash,
        model: this.config.model,
        steps,
        template: "background",
        format: "png",
        width: canvas.width,
        height: canvas.height,
      },
    })

    try {
      const existingBuffer = dto.reuse === false
        ? null
        : await this.findCachedBackground(promptHash)

      if (existingBuffer) {
        const updated = await this.prisma.generatedImage.update({
          where: { id: row.id },
          data: {
            status: "READY",
            backgroundKey: existingBuffer.key,
            backgroundContentType: existingBuffer.contentType,
            reusedFromId: existingBuffer.sourceId,
          },
        })
        return { ...this.toDto(updated), cached: true }
      }

      const generated = await this.cloudflare.generate(prompt, steps)
      const extension = contentInfo(
        isImageFormat(generated.format as ImageFormat)
          ? (generated.format as ImageFormat)
          : "png",
      ).extension
      const key = `backgrounds/${promptHash}.${extension}`
      const stored = await this.storage.save(
        key,
        generated.buffer,
        generated.contentType,
      )

      const updated = await this.prisma.generatedImage.update({
        where: { id: row.id },
        data: {
          status: "READY",
          backgroundKey: stored.key,
          backgroundContentType: generated.contentType,
        },
      })
      return { ...this.toDto(updated), cached: false }
    } catch (error) {
      await this.markFailed(row.id, error)
      throw error
    }
  }

  async renderPoster(
    caseId: string,
    userId: string,
    dto: RenderPosterDto,
  ): Promise<GeneratedImageDto> {
    const caseRecord = await this.assertCase(caseId, userId)
    const background = await this.prisma.generatedImage.findFirst({
      where: {
        id: dto.backgroundImageId,
        caseId,
        userId,
        status: "READY",
        backgroundKey: { not: null },
      },
    })
    if (!background || !background.backgroundKey) {
      throw new NotFoundException(
        "That AI background was not found for this case. Generate a background first.",
      )
    }

    const canvas = this.resolveCanvas({
      preset: dto.preset,
      width: dto.width,
      height: dto.height,
    })
    const poster = this.resolvePoster(dto, caseRecord)
    const row = await this.prisma.generatedImage.create({
      data: {
        caseId,
        userId,
        status: "PROCESSING",
        prompt: background.prompt,
        promptHash: background.promptHash,
        model: background.model,
        steps: background.steps,
        template: poster.template.id,
        format: poster.format,
        width: canvas.width,
        height: canvas.height,
        backgroundKey: background.backgroundKey,
        backgroundContentType: background.backgroundContentType,
        reusedFromId: background.id,
        content: JSON.parse(JSON.stringify(poster.content)),
        accentColor: poster.accentColor,
      },
    })

    try {
      const backgroundBuffer = await this.storage.read(background.backgroundKey)
      return await this.composeAndStore(row.id, backgroundBuffer, canvas, poster)
    } catch (error) {
      await this.markFailed(row.id, error)
      throw error
    }
  }

  async generatePoster(
    caseId: string,
    userId: string,
    dto: GeneratePosterDto,
  ): Promise<GeneratedImageDto & { cached: boolean }> {
    const caseRecord = await this.assertCase(caseId, userId)
    const canvas = this.resolveCanvas(dto)
    const template = this.resolveTemplate(dto.template)
    const format = this.resolveFormat(dto.format)
    const poster: ResolvedPoster = {
      template,
      format,
      content: this.resolveContent(dto, caseRecord),
      accentColor: dto.accentColor,
    }
    const prompt = this.resolvePrompt(dto, caseRecord)
    const steps = dto.steps ?? this.config.defaultSteps
    const promptHash = this.hashPrompt(prompt, steps)

    const cached =
      dto.reuse === false ? null : await this.findCachedBackground(promptHash)

    const row = await this.prisma.generatedImage.create({
      data: {
        caseId,
        userId,
        status: "PROCESSING",
        prompt,
        promptHash,
        model: this.config.model,
        steps,
        template: template.id,
        format,
        width: canvas.width,
        height: canvas.height,
        backgroundKey: cached?.key,
        backgroundContentType: cached?.contentType,
        reusedFromId: cached?.sourceId,
        content: JSON.parse(JSON.stringify(poster.content)),
        accentColor: poster.accentColor,
      },
    })

    try {
      let backgroundBuffer: Buffer
      if (cached) {
        backgroundBuffer = await this.storage.read(cached.key)
      } else {
        const generated = await this.cloudflare.generate(prompt, steps)
        const extension = contentInfo(
          isImageFormat(generated.format as ImageFormat)
            ? (generated.format as ImageFormat)
            : "png",
        ).extension
        const key = `backgrounds/${promptHash}.${extension}`
        const stored = await this.storage.save(
          key,
          generated.buffer,
          generated.contentType,
        )
        backgroundBuffer = generated.buffer
        await this.prisma.generatedImage.update({
          where: { id: row.id },
          data: {
            backgroundKey: stored.key,
            backgroundContentType: generated.contentType,
          },
        })
      }

      const result = await this.composeAndStore(
        row.id,
        backgroundBuffer,
        canvas,
        poster,
      )
      return { ...result, cached: Boolean(cached) }
    } catch (error) {
      await this.markFailed(row.id, error)
      throw error
    }
  }

  async list(caseId: string, userId: string): Promise<GeneratedImageDto[]> {
    await this.assertCase(caseId, userId)
    const rows = await this.prisma.generatedImage.findMany({
      where: { caseId, userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    return rows.map((row) => this.toDto(row))
  }

  async get(
    caseId: string,
    userId: string,
    imageId: string,
  ): Promise<GeneratedImageDto> {
    const row = await this.findOwnedImage(caseId, userId, imageId)
    return this.toDto(row)
  }

  async readImageFile(
    caseId: string,
    userId: string,
    imageId: string,
    kind: "background" | "final",
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    const row = await this.findOwnedImage(caseId, userId, imageId)
    const key = kind === "final" ? row.finalKey : row.backgroundKey
    if (!key) {
      throw new NotFoundException(
        kind === "final"
          ? "This image does not have a rendered poster yet."
          : "This image does not have an AI background yet.",
      )
    }
    const buffer = await this.storage.read(key)
    const contentType =
      kind === "final"
        ? row.finalContentType || contentInfo(row.format as ImageFormat).contentType
        : row.backgroundContentType || "image/jpeg"
    const extension =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : contentType === "image/gif"
            ? "gif"
            : "jpg"
    const safeTemplate = String(row.template || "poster").replace(
      /[^a-z0-9-]/gi,
      "-",
    )
    const fileName =
      kind === "final"
        ? `cyber-sathi-${safeTemplate}-${row.width}x${row.height}.${extension}`
        : `cyber-sathi-background-${row.id.slice(0, 8)}.${extension}`
    return { buffer, contentType, fileName }
  }

  private async composeAndStore(
    rowId: string,
    backgroundBuffer: Buffer,
    canvas: ResolvedCanvas,
    poster: ResolvedPoster,
  ): Promise<GeneratedImageDto> {
    const composed = await this.composition.render({
      background: backgroundBuffer,
      width: canvas.width,
      height: canvas.height,
      format: poster.format,
      template: poster.template,
      content: poster.content,
      accentColor: poster.accentColor,
    })

    const extension = contentInfo(poster.format).extension
    // Each rendered poster is immutable, so give every row its own object.
    const stored = await this.storage.save(
      `posters/${rowId}/final.${extension}`,
      composed.buffer,
      composed.contentType,
    )
    const row = await this.prisma.generatedImage.update({
      where: { id: rowId },
      data: {
        status: "READY",
        finalKey: stored.key,
        finalContentType: composed.contentType,
        width: composed.width,
        height: composed.height,
      },
    })
    return this.toDto(row)
  }

  private resolvePrompt(
    dto: {
      prompt?: string
      subject?: string
      campaignObjective?: string
      visualStyle?: string
      palette?: string
      composition?: string
      aspectRatio?: string
      backgroundRequirements?: string
      negativeInstructions?: string
      outputPurpose?: string
    },
    caseRecord: CaseContext,
  ): string {
    if (dto.prompt?.trim()) {
      const prompt = normalisePrompt(dto.prompt)
      if (prompt.length < 12) {
        throw new BadRequestException(
          "The image prompt must be at least 12 characters long.",
        )
      }
      return ensureNoTextInstruction(prompt)
    }

    const category = (caseRecord.category || "cyber fraud").replace(/-/g, " ")
    return buildImagePrompt({
      subject:
        dto.subject ||
        `A premium symbolic 3D illustration about ${category} awareness, featuring a glossy smartphone with a completely blank screen, a protective shield and subtle payment or message icons`,
      campaignObjective:
        dto.campaignObjective ||
        `Raise awareness about ${category} cyber fraud and encourage people to report suspicious activity`,
      visualStyle:
        dto.visualStyle ||
        "premium 3D pastel cybersecurity awareness illustration, realistic soft materials, gentle studio lighting, professional advertising-agency quality",
      colorPalette:
        dto.palette ||
        "powder blue, pastel pink and mint green with a single coral red warning accent",
      composition:
        dto.composition ||
        "centred hero object with generous negative space in the lower third for typography, clean and uncluttered",
      aspectRatio: dto.aspectRatio,
      backgroundRequirements:
        dto.backgroundRequirements ||
        "clean seamless background, soft contact shadow, all device screens completely blank, no signs or placards, no lettering anywhere",
      negativeInstructions: dto.negativeInstructions,
      outputPurpose: dto.outputPurpose || "Social media cyber-fraud awareness poster",
    })
  }

  private resolvePoster(
    dto: RenderPosterDto,
    caseRecord: CaseContext,
  ): ResolvedPoster {
    return {
      template: this.resolveTemplate(dto.template),
      format: this.resolveFormat(dto.format),
      content: this.resolveContent(dto, caseRecord),
      accentColor: dto.accentColor,
    }
  }

  private resolveContent(
    dto: {
      headline?: string
      subheadline?: string
      body?: string
      footer?: string
      brandLabel?: string
      language?: "en" | "hi"
    },
    caseRecord: CaseContext,
  ): PosterContent {
    const language = dto.language === "hi" ? "hi" : "en"
    const defaults = defaultPosterCopy(caseRecord.category, language)

    const pick = (value: string | undefined, fallback: string) =>
      value === undefined ? fallback : value.trim()

    return {
      language,
      brandLabel: pick(dto.brandLabel, defaults.brandLabel) ||
        defaults.brandLabel,
      headline: pick(dto.headline, defaults.headline) || defaults.headline,
      subheadline: pick(dto.subheadline, defaults.subheadline) || undefined,
      body: pick(dto.body, defaults.body) || undefined,
      footer: pick(dto.footer, defaults.footer) || undefined,
    }
  }

  private resolveTemplate(value?: string): ImageTemplateDefinition {
    const template = IMAGE_TEMPLATES.find((item) => item.id === value)
    if (template) return template
    if (value && !isImageTemplateId(value)) {
      throw new BadRequestException(`Unknown poster template "${value}".`)
    }
    return IMAGE_TEMPLATES[0]
  }

  private resolveFormat(value?: string): ImageFormat {
    if (value && !isImageFormat(value)) {
      throw new BadRequestException(`Unknown image format "${value}".`)
    }
    return (value as ImageFormat | undefined) ?? "png"
  }

  private resolveCanvas(dto: {
    preset?: string
    width?: number
    height?: number
  }): ResolvedCanvas {
    if (dto.width !== undefined || dto.height !== undefined) {
      if (dto.width === undefined || dto.height === undefined) {
        throw new BadRequestException(
          "Provide both width and height for a custom canvas.",
        )
      }
      const validated = validateDimensions(dto.width, dto.height, {
        minDimension: this.config.minDimension,
        maxDimension: this.config.maxDimension,
      })
      return {
        ...validated,
        aspectRatio: aspectRatioLabel(validated.width, validated.height),
      }
    }

    const preset = findPreset(dto.preset) ?? IMAGE_PRESETS[0]
    const validated = validateDimensions(preset.width, preset.height, {
      minDimension: this.config.minDimension,
      maxDimension: this.config.maxDimension,
    })
    return {
      ...validated,
      aspectRatio: preset.aspectRatio,
      preset: preset.id,
    }
  }

  private hashPrompt(prompt: string, steps: number): string {
    return createHash("sha256")
      .update(`${this.config.model}\n${steps}\n${normalisePrompt(prompt)}`)
      .digest("hex")
  }

  private async findCachedBackground(
    promptHash: string,
  ): Promise<{
    key: string
    contentType: string
    sourceId: string
  } | null> {
    const cached = await this.prisma.generatedImage.findFirst({
      where: {
        promptHash,
        status: "READY",
        backgroundKey: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        backgroundKey: true,
        backgroundContentType: true,
      },
    })
    if (!cached?.backgroundKey) return null
    if (!(await this.storage.exists(cached.backgroundKey))) {
      try {
        await this.storage.read(cached.backgroundKey)
      } catch {
        return null
      }
    }
    return {
      key: cached.backgroundKey,
      contentType: cached.backgroundContentType || "image/jpeg",
      sourceId: cached.id,
    }
  }

  private async assertCase(
    caseId: string,
    userId: string,
  ): Promise<CaseContext> {
    const found = await this.prisma.case.findFirst({
      where: { id: caseId, userId },
      select: { id: true, category: true, structuredFields: true },
    })
    if (!found) throw new NotFoundException("Case was not found")
    return {
      id: found.id,
      category: found.category || "cyber fraud",
      structuredFields: found.structuredFields,
    }
  }

  private async findOwnedImage(caseId: string, userId: string, imageId: string) {
    const row = await this.prisma.generatedImage.findFirst({
      where: { id: imageId, caseId, userId },
    })
    if (!row) throw new NotFoundException("Generated image was not found")
    return row
  }

  private async markFailed(rowId: string, error: unknown): Promise<void> {
    this.logger.error(
      JSON.stringify({
        event: "images.generation.failed",
        imageId: rowId,
        error: errorMessage(error),
      }),
    )
    await this.prisma.generatedImage
      .update({
        where: { id: rowId },
        data: { status: "FAILED", error: errorMessage(error) },
      })
      .catch(() => {})
  }

  private toDto(row: {
    id: string
    caseId: string
    status: string
    prompt: string
    promptHash: string
    model: string
    steps: number
    template: string
    format: string
    width: number
    height: number
    backgroundKey: string | null
    finalKey: string | null
    reusedFromId: string | null
    error: string | null
    createdAt: Date
    updatedAt: Date
  }): GeneratedImageDto {
    const base = `/cases/${row.caseId}/images/${row.id}`
    return {
      id: row.id,
      caseId: row.caseId,
      status: row.status as GeneratedImageDto["status"],
      prompt: row.prompt,
      promptHash: row.promptHash,
      model: row.model,
      steps: row.steps,
      template: row.template,
      format: (isImageFormat(row.format) ? row.format : "png") as ImageFormat,
      width: row.width,
      height: row.height,
      hasBackground: Boolean(row.backgroundKey),
      hasFinal: Boolean(row.finalKey),
      browserUrl: base,
      downloadUrl: `${base}/download`,
      backgroundUrl: row.backgroundKey ? `${base}/file?kind=background` : null,
      finalUrl: row.finalKey ? `${base}/file?kind=final` : null,
      reusedFromId: row.reusedFromId,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}

function defaultPosterCopy(
  category: string | null | undefined,
  language: "en" | "hi",
): Required<
  Pick<PosterContent, "brandLabel" | "headline" | "subheadline" | "body" | "footer">
> {
  const key = String(category || "").toLowerCase()
  if (language === "hi") {
    const headline = key.includes("invest")
      ? "निवेश धोखाधड़ी पहचानें"
      : key.includes("phish") || key.includes("link")
        ? "क्लिक करने से पहले सोचें"
        : key.includes("job")
          ? "भुगतान से पहले पुष्टि करें"
          : key.includes("upi") || key.includes("payment")
            ? "UPI धोखाधड़ी से सतर्क रहें"
            : "ऑनलाइन सतर्क रहें"
    return {
      brandLabel: "साइबर साथी",
      headline,
      subheadline: "साइबर धोखाधड़ी तेज़ी से बढ़ रही है। भुगतान से पहले व्यक्ति, लिंक और अनुरोध की पुष्टि करें।",
      body: "OTP, UPI पिन या बैंक पासवर्ड कभी साझा न करें। धोखाधड़ी होने पर तुरंत 1930 पर कॉल करें या cybercrime.gov.in पर शिकायत दर्ज करें।",
      footer: "हेल्पलाइन 1930 · cybercrime.gov.in",
    }
  }

  const headline = key.includes("invest")
    ? "Spot fake investment schemes"
    : key.includes("phish") || key.includes("link")
      ? "Think before you click"
      : key.includes("job")
        ? "Verify before you pay"
        : key.includes("upi") || key.includes("payment")
          ? "Stop UPI fraud"
          : "Stay alert online"
  return {
    brandLabel: "CYBER SATHI",
    headline,
    subheadline:
      "Cyber fraud is rising. Verify the person, the link and the payment request before you act.",
    body: "Never share an OTP, UPI PIN or bank password. If you are defrauded, call 1930 or report at cybercrime.gov.in.",
    footer: "Helpline 1930 · cybercrime.gov.in",
  }
}
