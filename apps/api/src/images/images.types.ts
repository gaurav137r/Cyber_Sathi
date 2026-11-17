/**
 * Shared types, canvas presets and design templates for the AI image
 * generation + composition pipeline.
 *
 * The AI model only produces the visual background. Every piece of text is
 * added later by the SVG renderer, so templates here describe layout only and
 * never prompt the model for typography.
 */

export type ImageFormat = "png" | "jpeg" | "webp"

export interface ImagePreset {
  id: string
  name: string
  description: string
  width: number
  height: number
  aspectRatio: string
}

export const IMAGE_PRESETS: readonly ImagePreset[] = [
  {
    id: "instagram-square",
    name: "Instagram square",
    description: "1080 x 1080 feed post",
    width: 1080,
    height: 1080,
    aspectRatio: "1:1",
  },
  {
    id: "instagram-portrait",
    name: "Instagram portrait",
    description: "1080 x 1350 feed post",
    width: 1080,
    height: 1350,
    aspectRatio: "4:5",
  },
  {
    id: "story",
    name: "Story / reel cover",
    description: "1080 x 1920 vertical",
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
  },
  {
    id: "landscape",
    name: "Landscape graphic",
    description: "1200 x 628 link / banner",
    width: 1200,
    height: 628,
    aspectRatio: "1.91:1",
  },
] as const

export type ImageTemplateId =
  | "cyber-shield"
  | "alert-card"
  | "minimal-focus"
  | "story-ribbon"

export type TemplateLayout =
  | "bottom-left"
  | "card"
  | "left-middle"
  | "center"

export interface ImageTheme {
  /** Deep base colour used for scrims and logo plate. */
  primary: string
  /** Accent used for badges, rules and highlights. */
  accent: string
  /** Main text colour over the artwork. */
  text: string
  /** Secondary text colour. */
  muted: string
  /** Card background for the alert-card template. */
  panel: string
}

export interface ImageTemplateDefinition {
  id: ImageTemplateId
  name: string
  description: string
  layout: TemplateLayout
  theme: ImageTheme
}

export const IMAGE_TEMPLATES: readonly ImageTemplateDefinition[] = [
  {
    id: "cyber-shield",
    name: "Cyber shield",
    description:
      "Deep teal gradient scrim, mint badge and footer. Works on every canvas.",
    layout: "bottom-left",
    theme: {
      primary: "#0B2E2E",
      accent: "#7FD1C0",
      text: "#FFFFFF",
      muted: "#D7EDE8",
      panel: "#FFFFFF",
    },
  },
  {
    id: "alert-card",
    name: "Alert card",
    description:
      "Rounded white information card with a coral warning rule and dark text.",
    layout: "card",
    theme: {
      primary: "#0B2E2E",
      accent: "#F0A93A",
      text: "#16211F",
      muted: "#5B6B68",
      panel: "#FFFFFF",
    },
  },
  {
    id: "minimal-focus",
    name: "Minimal focus",
    description:
      "Wide side gradient and oversized headline for editorial-style posts.",
    layout: "left-middle",
    theme: {
      primary: "#0F4C4C",
      accent: "#7FD1C0",
      text: "#FFFFFF",
      muted: "#E3F3EF",
      panel: "#FFFFFF",
    },
  },
  {
    id: "story-ribbon",
    name: "Story ribbon",
    description:
      "Top and bottom ribbons with centred text, built for 9:16 stories.",
    layout: "center",
    theme: {
      primary: "#0B2E2E",
      accent: "#7FD1C0",
      text: "#FFFFFF",
      muted: "#D7EDE8",
      panel: "#FFFFFF",
    },
  },
] as const

export const IMAGE_FORMATS: ReadonlyArray<{
  id: ImageFormat
  label: string
  extension: string
  contentType: string
}> = [
  { id: "png", label: "PNG", extension: "png", contentType: "image/png" },
  { id: "jpeg", label: "JPEG", extension: "jpg", contentType: "image/jpeg" },
  { id: "webp", label: "WebP", extension: "webp", contentType: "image/webp" },
]

export function isImageFormat(value: unknown): value is ImageFormat {
  return (
    typeof value === "string" &&
    IMAGE_FORMATS.some((format) => format.id === value)
  )
}

export function isImageTemplateId(value: unknown): value is ImageTemplateId {
  return (
    typeof value === "string" &&
    IMAGE_TEMPLATES.some((template) => template.id === value)
  )
}

export function findPreset(value: unknown): ImagePreset | undefined {
  return typeof value === "string"
    ? IMAGE_PRESETS.find((preset) => preset.id === value)
    : undefined
}

export function contentInfo(format: ImageFormat) {
  return (
    IMAGE_FORMATS.find((item) => item.id === format) ?? IMAGE_FORMATS[0]
  )
}

export interface PromptInput {
  /** Main subject of the artwork. */
  subject: string
  /** What the campaign is trying to achieve. */
  campaignObjective: string
  /** Visual style, e.g. "premium 3D pastel illustration". */
  visualStyle: string
  /** Colour palette description. */
  colorPalette: string
  /** Composition guidance, including negative space for typography. */
  composition: string
  /** Aspect ratio in human-readable form. */
  aspectRatio: string
  /** Background requirements such as "clean white background". */
  backgroundRequirements: string
  /** Things the model must avoid. */
  negativeInstructions: string
  /** Where the image will be used. */
  outputPurpose: string
  /** Optional extra art direction. */
  extraDetails?: string
}

export interface PosterContent {
  brandLabel?: string
  headline: string
  subheadline?: string
  body?: string
  footer?: string
  language?: "en" | "hi"
}

export interface CanvasDimensions {
  width: number
  height: number
}

export interface GeneratedImageDto {
  id: string
  caseId: string
  status: "PROCESSING" | "READY" | "FAILED"
  prompt: string
  promptHash: string
  model: string
  steps: number
  template: string
  format: ImageFormat
  width: number
  height: number
  hasBackground: boolean
  hasFinal: boolean
  browserUrl: string
  downloadUrl: string
  backgroundUrl: string | null
  finalUrl: string | null
  reusedFromId: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}
