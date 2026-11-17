import type { PromptInput } from "./images.types"

/**
 * Default negative instructions. These are deliberately explicit because
 * diffusion models will otherwise invent signage, labels or watermarks. All
 * real typography is added by the SVG renderer after generation.
 */
export const DEFAULT_NEGATIVE_INSTRUCTIONS =
  "absolutely no text, no letters, no words, no numbers, no typography, no lettering, no calligraphy, no captions, no signage, no labels, no logos, no watermarks, no signatures, no UI screenshots, no posters, no frames, no borders"

/** Flux responds best to a single, comma-separated art-direction brief. */
const MAX_PROMPT_LENGTH = 1900

function clean(value: unknown, maxLength = 400): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}

function sentence(value: string): string {
  return value.replace(/[.\s]+$/, "")
}

export interface PromptBuilderOptions extends Partial<PromptInput> {
  subject: string
}

/**
 * Build a production-ready Flux prompt from structured, reusable inputs.
 *
 * The module deliberately contains no Cyber Sathi-specific copy so it can be
 * reused by other project features (evidence thumbnails, campaign banners,
 * quiz cards, etc.). Callers supply the subject and art direction.
 */
export function buildImagePrompt(options: PromptBuilderOptions): string {
  const subject = clean(options.subject, 320)
  if (!subject) {
    throw new Error("A main subject is required to build an image prompt.")
  }

  const sections: string[] = []

  const purpose = clean(options.outputPurpose, 120)
  sections.push(
    `${purpose ? `${sentence(purpose)}: ` : ""}${sentence(subject)}`,
  )

  const objective = clean(options.campaignObjective, 240)
  if (objective) sections.push(`Campaign objective: ${sentence(objective)}`)

  const style = clean(options.visualStyle, 240)
  if (style) sections.push(`Visual style: ${sentence(style)}`)

  const palette = clean(options.colorPalette, 200)
  if (palette) sections.push(`Colour palette: ${sentence(palette)}`)

  const composition = clean(options.composition, 280)
  if (composition) sections.push(`Composition: ${sentence(composition)}`)

  const aspectRatio = clean(options.aspectRatio, 60)
  if (aspectRatio) {
    sections.push(
      `Aspect ratio guidance: ${aspectRatio} (the artwork will be cropped to the final canvas; keep the focal subject centred)`,
    )
  }

  const background = clean(options.backgroundRequirements, 220)
  if (background) sections.push(`Background: ${sentence(background)}`)

  const extra = clean(options.extraDetails, 300)
  if (extra) sections.push(sentence(extra))

  const negative =
    clean(options.negativeInstructions, 300) || DEFAULT_NEGATIVE_INSTRUCTIONS
  sections.push(`Negative instructions: ${sentence(negative)}`)

  const prompt = sections.join(". ").replace(/\.\.+/g, ".")
  return prompt.length > MAX_PROMPT_LENGTH
    ? `${prompt.slice(0, MAX_PROMPT_LENGTH - 1).trimEnd()}.`
    : prompt
}

/** Exposed for callers that want to show the effective negative prompt. */
export function effectiveNegativePrompt(value?: string): string {
  return clean(value, 300) || DEFAULT_NEGATIVE_INSTRUCTIONS
}
