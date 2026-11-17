import { apiDownload, apiRequest } from "./api"
import type { CaseRecord } from "./cases"
import type { ReportLanguage, ReportSocialPlatform } from "./report-center"

export type ImageFormat = "png" | "jpeg" | "webp"
export type ImageFileKind = "background" | "final"

export interface ImagePreset {
  id: string
  name: string
  description: string
  width: number
  height: number
  aspectRatio: string
}

export interface ImageTemplate {
  id: string
  name: string
  description: string
  layout: string
  accent: string
}

export interface ImageCapabilities {
  provider: string
  model: string
  defaultSteps: number
  stepsRange: { min: number; max: number }
  dimensions: { min: number; max: number }
  fonts: { regular: string; bold: string; devanagari: string }
  forcedTextRendering: string
  presets: ImagePreset[]
  templates: ImageTemplate[]
  formats: Array<{
    id: ImageFormat
    label: string
    extension: string
    contentType: string
  }>
  defaults: {
    preset: string
    template: string
    format: ImageFormat
    steps: number
  }
  notes: { textRendering: string; freeTier: string }
}

export interface GeneratedImage {
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
  cached?: boolean
}

export interface PromptFields {
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
}

export interface CanvasFields {
  preset?: string
  width?: number
  height?: number
  steps?: number
  reuse?: boolean
}

export interface PosterTextFields {
  template?: string
  format?: ImageFormat
  headline?: string
  subheadline?: string
  body?: string
  footer?: string
  brandLabel?: string
  language?: "en" | "hi"
  accentColor?: string
}

export type GenerateBackgroundInput = PromptFields & CanvasFields
export type GeneratePosterInput = PromptFields &
  CanvasFields &
  PosterTextFields
export type RenderPosterInput = PosterTextFields &
  Pick<CanvasFields, "preset" | "width" | "height"> & {
    backgroundImageId: string
  }

export const FALLBACK_CAPABILITIES: Pick<
  ImageCapabilities,
  "presets" | "templates" | "formats" | "defaults" | "notes"
> = {
  presets: [
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
  ],
  templates: [
    {
      id: "cyber-shield",
      name: "Cyber shield",
      description: "Deep teal scrim with mint accents.",
      layout: "bottom-left",
      accent: "#7FD1C0",
    },
    {
      id: "alert-card",
      name: "Alert card",
      description: "White information card with dark text.",
      layout: "card",
      accent: "#F0A93A",
    },
    {
      id: "minimal-focus",
      name: "Minimal focus",
      description: "Editorial side gradient and large headline.",
      layout: "left-middle",
      accent: "#7FD1C0",
    },
    {
      id: "story-ribbon",
      name: "Story ribbon",
      description: "Centred text for vertical stories.",
      layout: "center",
      accent: "#7FD1C0",
    },
  ],
  formats: [
    { id: "png", label: "PNG", extension: "png", contentType: "image/png" },
    { id: "jpeg", label: "JPEG", extension: "jpg", contentType: "image/jpeg" },
    { id: "webp", label: "WebP", extension: "webp", contentType: "image/webp" },
  ],
  defaults: {
    preset: "instagram-square",
    template: "cyber-shield",
    format: "png",
    steps: 4,
  },
  notes: {
    textRendering:
      "All text is rendered locally with SVG + ImageMagick. The AI model only generates the background artwork.",
    freeTier:
      "Generation uses Cloudflare Workers AI Flux Schnell with 4 inference steps by default. Cloudflare account quotas still apply.",
  },
}

function casePath(caseId: string): string {
  return `/cases/${encodeURIComponent(caseId)}/images`
}

export function getImageCapabilities() {
  return apiRequest<ImageCapabilities>("/images/templates")
}

export function generateBackground(
  caseId: string,
  input: GenerateBackgroundInput,
) {
  return apiRequest<GeneratedImage>(`${casePath(caseId)}/generate-background`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function renderPoster(caseId: string, input: RenderPosterInput) {
  return apiRequest<GeneratedImage>(`${casePath(caseId)}/render`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function generatePoster(caseId: string, input: GeneratePosterInput) {
  return apiRequest<GeneratedImage>(`${casePath(caseId)}/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function listGeneratedImages(caseId: string) {
  return apiRequest<GeneratedImage[]>(casePath(caseId))
}

export function getGeneratedImage(caseId: string, imageId: string) {
  return apiRequest<GeneratedImage>(
    `${casePath(caseId)}/${encodeURIComponent(imageId)}`,
  )
}

export async function loadGeneratedImageBlob(
  caseId: string,
  imageId: string,
  kind: ImageFileKind,
): Promise<Blob> {
  const { blob } = await apiDownload(
    `${casePath(caseId)}/${encodeURIComponent(imageId)}/file?kind=${kind}`,
  )
  return blob
}

export function downloadGeneratedImage(
  caseId: string,
  imageId: string,
  kind: ImageFileKind = "final",
) {
  return apiDownload(
    `${casePath(caseId)}/${encodeURIComponent(imageId)}/download?kind=${kind}`,
  )
}

/* ───────────────────────────────────────────────────────────── */
/* AI-decided poster generation (no user configuration).         */
/* The platform and case report drive canvas, style and copy so   */
/* poster creation is an automated extra step of sharing a post. */
/* ───────────────────────────────────────────────────────────── */

export type AutoPosterPreset = (typeof FALLBACK_CAPABILITIES.presets)[number]["id"]

/** Platform decides canvas size: LinkedIn/X get a link graphic, social feeds get square. */
export function presetForPlatform(platform: ReportSocialPlatform): AutoPosterPreset {
  return "instagram-square"
}

function categoryLabel(record: CaseRecord): string {
  return String(record.category || "cyber fraud").replace(/-/g, " ")
}

function isInvestmentFraud(record: CaseRecord): boolean {
  const key = categoryLabel(record).toLowerCase()
  return key.includes("invest") || key.includes("job") || key.includes("task")
}

function isPhishing(record: CaseRecord): boolean {
  const key = categoryLabel(record).toLowerCase()
  return key.includes("phish") || key.includes("link") || key.includes("sms")
}

/** The AI builds a safe, text-free background prompt from the case category. */
export function posterPromptForCase(record: CaseRecord, language: ReportLanguage): string {
  const category = categoryLabel(record)
  const base =
    language === "hi"
      ? `साइबर सुरक्षा जागरूकता पोस्टर का बैकग्राउंड आर्टवर्क: ${category} से जुड़ी घटना। प्रीमियम 3D इलस्ट्रेशन, ढाल और एक खाली स्क्रीन वाला स्मार्टफोन, साफ़ बैकग्राउंड जहां टेक्स्ट के लिए खाली जगह हो। कोई टेक्स्ट, अक्षर, नंबर या वॉटरमार्क नहीं।`
      : `Cyber safety awareness poster background artwork for a ${category} incident. Premium 3D illustration, a shield and a smartphone with a completely blank screen. Clean uncluttered background with negative space for text. No text, no letters, no numbers, no watermark, no logo.`

  return `${base} Mint and powder blue palette with a coral accent. The output is cropped to the chosen canvas; the focal artwork stays centred so it works across square, portrait and landscape.`
}

/** Template and accent chosen by the AI from the case category. */
export function posterTemplateForCase(record: CaseRecord): {
  template: (typeof FALLBACK_CAPABILITIES.templates)[number]["id"]
  accentColor: string
} {
  if (isInvestmentFraud(record)) {
    return { template: "alert-card", accentColor: "#F0A93A" }
  }
  return { template: "cyber-shield", accentColor: "#7FD1C0" }
}

/** Headline, subheadline, body, footer and brand label decided from the case + language. */
export function posterCopyForCase(record: CaseRecord, language: ReportLanguage) {
  const category = categoryLabel(record)
  const key = category.toLowerCase()

  if (language === "hi") {
    const headline = isInvestmentFraud(record)
      ? "निवेश धोखाधड़ी पहचानें"
      : isPhishing(record)
        ? "क्लिक करने से पहले सोचें"
        : key.includes("upi") || key.includes("payment")
          ? "UPI धोखाधड़ी से सतर्क रहें"
          : "ऑनलाइन सतर्क रहें"
    return {
      template: posterTemplateForCase(record).template,
      accentColor: posterTemplateForCase(record).accentColor,
      brandLabel: "साइबर साथी",
      headline,
      subheadline: "साइबर धोखाधड़ी तेज़ी से बढ़ रही है। भुगतान से पहले व्यक्ति, लिंक और अनुरोध की पुष्टि करें।",
      body: "OTP, UPI पिन या बैंक पासवर्ड कभी साझा न करें। धोखाधड़ी होने पर तुरंत 1930 पर कॉल करें या cybercrime.gov.in पर शिकायत दर्ज करें।",
      footer: "हेल्पलाइन 1930 · cybercrime.gov.in",
    }
  }

  const headline = isInvestmentFraud(record)
    ? "Spot fake investment schemes"
    : isPhishing(record)
      ? "Think before you click"
      : key.includes("upi") || key.includes("payment")
        ? "Stop UPI fraud"
        : "Stay alert online"

  return {
    template: posterTemplateForCase(record).template,
    accentColor: posterTemplateForCase(record).accentColor,
    brandLabel: "CYBER SATHI",
    headline,
    subheadline:
      "Cyber fraud is rising. Verify the person, the link and the payment request before you act.",
    body: "Never share an OTP, UPI PIN or bank password. If you are defrauded, call 1930 or report at cybercrime.gov.in.",
    footer: "Helpline 1930 · cybercrime.gov.in",
  }
}

/** Build every input the backend needs to auto-generate a poster for a social post. */
export function buildAutoPosterInput(
  record: CaseRecord,
  platform: ReportSocialPlatform,
  language: ReportLanguage,
) {
  const copy = posterCopyForCase(record, language)
  return {
    ...copy,
    prompt: posterPromptForCase(record, language),
    preset: presetForPlatform(platform),
    format: "png" as ImageFormat,
    language,
    steps: 4,
    reuse: true,
  }
}
