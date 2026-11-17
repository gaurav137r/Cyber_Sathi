import type {
  ImageTemplateDefinition,
  ImageTheme,
  PosterContent,
} from "./images.types"

export interface OverlayRenderOptions {
  width: number
  height: number
  template: ImageTemplateDefinition
  content: PosterContent
  theme?: Partial<ImageTheme>
  fontFamily: string
  fontFamilyBold: string
  fontFamilyDevanagari: string
  accentColor?: string
}

interface TextBlock {
  lines: string[]
  fontSize: number
  lineHeight: number
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function cleanLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength)
}

function fontStack(
  family: string,
  fallbackDevanagari: string,
  hindi: boolean,
): string {
  const primary = escapeXml(family.trim() || "DejaVu Sans")
  const fallback = escapeXml(fallbackDevanagari.trim() || "DejaVu Sans")
  return hindi
    ? `${fallback}, ${primary}, sans-serif`
    : `${primary}, ${fallback}, sans-serif`
}

function estimatedCharWidth(char: string, fontSize: number): number {
  if (/\s/.test(char)) return fontSize * 0.3
  if (/[ilI1.,:;'|!]/.test(char)) return fontSize * 0.3
  if (/[MW@#%&]/.test(char)) return fontSize * 0.84
  if (/[A-Z0-9]/.test(char)) return fontSize * 0.6
  if (/[\u0900-\u097F]/.test(char)) return fontSize * 0.58
  return fontSize * 0.52
}

function measureText(value: string, fontSize: number): number {
  let width = 0
  for (const char of value) width += estimatedCharWidth(char, fontSize)
  return width
}

function wrapText(
  value: string,
  maxWidth: number,
  fontSize: number,
  maxLines = 8,
): string[] {
  const text = cleanLine(value, 2000)
  if (!text) return []

  const words = text.split(" ")
  const lines: string[] = []
  let current = ""

  const pushWord = (word: string) => {
    const candidate = current ? `${current} ${word}` : word
    if (measureText(candidate, fontSize) <= maxWidth) {
      current = candidate
      return
    }
    if (current) {
      lines.push(current)
      current = ""
    }
    if (measureText(word, fontSize) <= maxWidth) {
      current = word
      return
    }
    // Hard-break an unusually long token (URLs, long numbers).
    let chunk = ""
    for (const char of word) {
      if (measureText(chunk + char, fontSize) > maxWidth && chunk) {
        lines.push(chunk)
        chunk = char
      } else {
        chunk += char
      }
    }
    current = chunk
  }

  for (const word of words) pushWord(word)
  if (current) lines.push(current)

  if (lines.length <= maxLines) return lines
  const clipped = lines.slice(0, maxLines)
  const last = clipped[maxLines - 1]
  clipped[maxLines - 1] = `${last.replace(/[.,;:!?-]+$/, "")}…`
  return clipped
}

function fitText(
  value: string,
  options: {
    maxWidth: number
    baseSize: number
    minSize: number
    maxLines: number
    lineHeight?: number
  },
): TextBlock {
  const text = cleanLine(value, 2000)
  if (!text) return { lines: [], fontSize: options.baseSize, lineHeight: 0 }

  let fontSize = options.baseSize
  let lines = wrapText(text, options.maxWidth, fontSize, options.maxLines)
  while (
    (lines.length > options.maxLines ||
      measureText(lines[lines.length - 1] ?? "", fontSize) >
        options.maxWidth + 1) &&
    fontSize > options.minSize
  ) {
    fontSize -= 2
    lines = wrapText(text, options.maxWidth, fontSize, options.maxLines)
  }

  return {
    lines,
    fontSize,
    lineHeight: Math.round(fontSize * (options.lineHeight ?? 1.18)),
  }
}

function blockHeight(block: TextBlock): number {
  return block.lines.length === 0
    ? 0
    : block.lines.length * block.lineHeight
}

function textBlock(
  block: TextBlock,
  options: {
    x: number
    y: number
    fill: string
    fontFamily: string
    weight?: number
    anchor?: "start" | "middle" | "end"
    letterSpacing?: number
  },
): string {
  if (block.lines.length === 0) return ""
  const baselineOffset = Math.round(block.fontSize * 0.82)
  return block.lines
    .map(
      (line, index) =>
        `<text x="${options.x}" y="${
          options.y + index * block.lineHeight + baselineOffset
        }" font-family="${options.fontFamily}" font-size="${
          block.fontSize
        }" font-weight="${options.weight ?? 400}" fill="${
          options.fill
        }" text-anchor="${options.anchor ?? "start"}"${
          options.letterSpacing
            ? ` letter-spacing="${options.letterSpacing}"`
            : ""
        }>${escapeXml(line)}</text>`,
    )
    .join("")
}

function logoMark(
  x: number,
  y: number,
  size: number,
  theme: ImageTheme,
  label: string,
  fontFamilyBold: string,
  lightPlate: boolean,
): string {
  const plateFill = lightPlate ? theme.panel : theme.primary
  const markFill = lightPlate ? theme.primary : theme.accent
  const textFill = lightPlate ? theme.primary : theme.text
  const safeLabel = label.length > 28 ? `${label.slice(0, 27)}…` : label
  const labelSize = Math.round(size * 0.34)
  const gap = Math.round(size * 0.3)
  const plateWidth =
    size +
    gap +
    Math.ceil(measureText(safeLabel, labelSize)) +
    Math.round(size * 0.3)
  const shield = [
    `M ${size * 0.5} ${size * 0.2}`,
    `L ${size * 0.78} ${size * 0.32}`,
    `L ${size * 0.74} ${size * 0.58}`,
    `Q ${size * 0.7} ${size * 0.76} ${size * 0.5} ${size * 0.84}`,
    `Q ${size * 0.3} ${size * 0.76} ${size * 0.26} ${size * 0.58}`,
    `L ${size * 0.22} ${size * 0.32} Z`,
  ].join(" ")
  return `<g transform="translate(${x} ${y})">
  <rect x="0" y="0" width="${plateWidth}" height="${size}" rx="${
    size * 0.28
  }" fill="${plateFill}" fill-opacity="${lightPlate ? "0.95" : "0.9"}"/>
  <path d="${shield}" fill="${markFill}"/>
  <path d="M ${size * 0.38} ${size * 0.51} L ${size * 0.47} ${
    size * 0.6
  } L ${size * 0.64} ${size * 0.4}" fill="none" stroke="${plateFill}" stroke-width="${
    size * 0.075
  }" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${size + gap}" y="${
    size * 0.63
  }" font-family="${fontFamilyBold}" font-size="${labelSize}" font-weight="700" fill="${textFill}" letter-spacing="1.2">${escapeXml(
    safeLabel,
  )}</text>
</g>`
}

function accentRule(
  x: number,
  y: number,
  width: number,
  color: string,
): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="${Math.max(
    5,
    Math.round(width * 0.02),
  )}" rx="${Math.max(2, Math.round(width * 0.01))}" fill="${color}"/>`
}

function scrimDefs(theme: ImageTheme): string {
  return `<defs>
    <linearGradient id="scrim-bottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${theme.primary}" stop-opacity="0"/>
      <stop offset="0.45" stop-color="${theme.primary}" stop-opacity="0.55"/>
      <stop offset="0.78" stop-color="${theme.primary}" stop-opacity="0.88"/>
      <stop offset="1" stop-color="${theme.primary}" stop-opacity="0.97"/>
    </linearGradient>
    <linearGradient id="scrim-left" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${theme.primary}" stop-opacity="0.96"/>
      <stop offset="0.55" stop-color="${theme.primary}" stop-opacity="0.76"/>
      <stop offset="1" stop-color="${theme.primary}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="scrim-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${theme.primary}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${theme.primary}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="accent-fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${theme.accent}" stop-opacity="1"/>
      <stop offset="1" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft-shadow" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="16" result="blur"/>
      <feOffset in="blur" dx="0" dy="12" result="offset"/>
      <feComponentTransfer in="offset" result="shadow">
        <feFuncA type="linear" slope="0.3"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode in="shadow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>`
}

/**
 * Render the complete typography/graphic overlay as SVG. Every human-readable
 * element in the final poster comes from this function; the AI image is only
 * the background plate beneath it.
 */
export function renderOverlaySvg(options: OverlayRenderOptions): string {
  const { width, height, template } = options
  const theme: ImageTheme = {
    ...template.theme,
    ...(options.accentColor ? { accent: options.accentColor } : {}),
    ...options.theme,
  }
  const content = options.content
  const hindi = content.language === "hi"
  const latinStack = fontStack(
    options.fontFamily,
    options.fontFamilyDevanagari,
    false,
  )
  const boldLatinStack = fontStack(
    options.fontFamilyBold,
    options.fontFamilyDevanagari,
    false,
  )
  const hindiStack = fontStack(
    options.fontFamilyBold,
    options.fontFamilyDevanagari,
    true,
  )
  const regularStack = hindi ? hindiStack : latinStack
  const strongStack = hindi ? hindiStack : boldLatinStack

  const pad = Math.max(28, Math.round(Math.min(width, height) * 0.065))
  const scale = Math.max(
    0.72,
    Math.min(1.32, Math.min(width / 1000, height / 1000) + 0.18),
  )
  const brandLabel = cleanLine(content.brandLabel, 40) || "CYBER SATHI"
  const logoSize = Math.round(Math.max(42, Math.min(72, width * 0.052)))
  const headlineText = cleanLine(content.headline, 180)
  const subheadlineText = cleanLine(content.subheadline, 260)
  const bodyText = cleanLine(content.body, 900)
  const footerText = cleanLine(content.footer, 160)

  const defs = scrimDefs(theme)
  const parts: string[] = []

  if (template.layout === "card") {
    const cardPad = Math.round(pad * 0.9)
    const cardWidth = width - pad * 2
    const textWidth = cardWidth - cardPad * 2
    const accentBarHeight = Math.max(8, Math.round(cardWidth * 0.012))
    const headline = fitText(headlineText, {
      maxWidth: textWidth,
      baseSize: Math.round(60 * scale),
      minSize: Math.round(30 * scale),
      maxLines: 3,
    })
    const subheadline = fitText(subheadlineText, {
      maxWidth: textWidth,
      baseSize: Math.round(29 * scale),
      minSize: 16,
      maxLines: 3,
    })
    const body = fitText(bodyText, {
      maxWidth: textWidth,
      baseSize: Math.round(23 * scale),
      minSize: 14,
      maxLines: 5,
    })
    const footer = fitText(footerText, {
      maxWidth: textWidth,
      baseSize: Math.round(20 * scale),
      minSize: 12,
      maxLines: 2,
    })
    const gap = Math.round(14 * scale)
    const contentHeight =
      blockHeight(headline) +
      blockHeight(subheadline) +
      blockHeight(body) +
      blockHeight(footer) +
      gap * 4
    const cardHeight = contentHeight + cardPad * 2 + accentBarHeight
    const cardY = height - pad - cardHeight
    const textX = pad + cardPad
    let cursorY = cardY + cardPad + accentBarHeight + gap

    parts.push(
      `<rect x="${pad}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="${Math.round(
        pad * 0.55,
      )}" fill="${theme.panel}" fill-opacity="0.97" stroke="#E6E8E6" stroke-width="2" filter="url(#soft-shadow)"/>`,
      `<rect x="${pad}" y="${cardY}" width="${cardWidth}" height="${accentBarHeight}" rx="${Math.round(
        pad * 0.55,
      )}" fill="${theme.accent}"/>`,
      accentRule(textX, cursorY - gap / 2, Math.round(textWidth * 0.18), theme.accent),
    )
    cursorY += Math.round(gap * 0.4)
    parts.push(
      textBlock(headline, {
        x: textX,
        y: cursorY,
        fill: theme.text,
        fontFamily: strongStack,
        weight: 700,
      }),
    )
    cursorY += blockHeight(headline) + gap
    if (subheadline.lines.length) {
      parts.push(
        textBlock(subheadline, {
          x: textX,
          y: cursorY,
          fill: theme.muted,
          fontFamily: regularStack,
        }),
      )
      cursorY += blockHeight(subheadline) + gap
    }
    if (body.lines.length) {
      parts.push(
        textBlock(body, {
          x: textX,
          y: cursorY,
          fill: theme.muted,
          fontFamily: regularStack,
        }),
      )
      cursorY += blockHeight(body) + gap
    }
    if (footer.lines.length) {
      parts.push(
        `<rect x="${textX}" y="${cursorY + 2}" width="${Math.min(
          textWidth,
          72,
        )}" height="4" rx="2" fill="${theme.accent}"/>`,
        textBlock(footer, {
          x: textX,
          y: cursorY + 14,
          fill: theme.primary,
          fontFamily: strongStack,
          weight: 700,
        }),
      )
    }
    // A light logo plate keeps the brand readable above a light card.
    parts.push(
      logoMark(pad, pad, logoSize, theme, brandLabel, strongStack, true),
    )
  } else if (template.layout === "center") {
    const maxWidth = width - pad * 2
    const headline = fitText(headlineText, {
      maxWidth,
      baseSize: Math.round(66 * scale),
      minSize: 30,
      maxLines: 4,
    })
    const subheadline = fitText(subheadlineText, {
      maxWidth,
      baseSize: Math.round(31 * scale),
      minSize: 16,
      maxLines: 3,
    })
    const body = fitText(bodyText, {
      maxWidth,
      baseSize: Math.round(24 * scale),
      minSize: 14,
      maxLines: 4,
    })
    const footer = fitText(footerText, {
      maxWidth,
      baseSize: Math.round(21 * scale),
      minSize: 12,
      maxLines: 2,
    })
    const gap = Math.round(16 * scale)
    const contentHeight =
      blockHeight(headline) +
      blockHeight(subheadline) +
      blockHeight(body) +
      blockHeight(footer) +
      gap * 3
    let cursorY = height - pad - contentHeight - Math.round(pad * 0.2)

    parts.push(
      `<rect x="0" y="0" width="${width}" height="${Math.round(
        pad * 3.2,
      )}" fill="url(#scrim-top)"/>`,
      `<rect x="0" y="${Math.round(height * 0.38)}" width="${width}" height="${Math.round(
        height * 0.62,
      )}" fill="url(#scrim-bottom)"/>`,
    )
    parts.push(
      logoMark(pad, pad, logoSize, theme, brandLabel, strongStack, false),
    )
    const badgeY = Math.max(pad, Math.round(height * 0.19))
    parts.push(
      `<rect x="${width / 2 - 74}" y="${badgeY}" width="148" height="38" rx="19" fill="${
        theme.primary
      }" fill-opacity="0.82" stroke="${theme.accent}" stroke-width="1.4"/>`,
      `<text x="${width / 2}" y="${
        badgeY + 25
      }" text-anchor="middle" font-family="${strongStack}" font-size="${Math.round(
        15 * scale,
      )}" font-weight="700" fill="${theme.accent}" letter-spacing="2.2">${
        hindi ? "सतर्क रहें" : "STAY ALERT"
      }</text>`,
    )
    parts.push(
      `<rect x="${width / 2 - 34}" y="${cursorY - gap}" width="68" height="6" rx="3" fill="${
        theme.accent
      }"/>`,
      textBlock(headline, {
        x: width / 2,
        y: cursorY,
        fill: theme.text,
        fontFamily: strongStack,
        weight: 700,
        anchor: "middle",
      }),
    )
    cursorY += blockHeight(headline) + gap
    if (subheadline.lines.length) {
      parts.push(
        textBlock(subheadline, {
          x: width / 2,
          y: cursorY,
          fill: theme.muted,
          fontFamily: regularStack,
          anchor: "middle",
        }),
      )
      cursorY += blockHeight(subheadline) + gap
    }
    if (body.lines.length) {
      parts.push(
        textBlock(body, {
          x: width / 2,
          y: cursorY,
          fill: theme.muted,
          fontFamily: regularStack,
          anchor: "middle",
        }),
      )
      cursorY += blockHeight(body) + gap
    }
    if (footer.lines.length) {
      parts.push(
        textBlock(footer, {
          x: width / 2,
          y: cursorY,
          fill: theme.accent,
          fontFamily: strongStack,
          weight: 700,
          anchor: "middle",
        }),
      )
    }
  } else {
    const middle = template.layout === "left-middle"
    const maxWidth = Math.round(
      middle ? width * (width > height ? 0.58 : 0.66) : width - pad * 2,
    )
    const headline = fitText(headlineText, {
      maxWidth,
      baseSize: Math.round((middle ? 70 : 64) * scale),
      minSize: 28,
      maxLines: middle ? 4 : 3,
    })
    const subheadline = fitText(subheadlineText, {
      maxWidth,
      baseSize: Math.round(30 * scale),
      minSize: 15,
      maxLines: 3,
    })
    const body = fitText(bodyText, {
      maxWidth,
      baseSize: Math.round(23 * scale),
      minSize: 14,
      maxLines: 4,
    })
    const footer = fitText(footerText, {
      maxWidth,
      baseSize: Math.round(21 * scale),
      minSize: 12,
      maxLines: 2,
    })
    const gap = Math.round(15 * scale)
    const contentHeight =
      blockHeight(headline) +
      blockHeight(subheadline) +
      blockHeight(body) +
      blockHeight(footer) +
      gap * 3
    const startY = middle
      ? Math.max(pad + logoSize + gap * 2, Math.round((height - contentHeight) / 2))
      : height - pad - contentHeight
    const textX = pad
    let cursorY = startY

    if (middle) {
      parts.push(
        `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#scrim-left)"/>`,
        `<rect x="0" y="${Math.round(
          height * 0.7,
        )}" width="${width}" height="${Math.round(
          height * 0.3,
        )}" fill="url(#scrim-bottom)"/>`,
      )
    } else {
      parts.push(
        `<rect x="0" y="${Math.round(
          height * 0.36,
        )}" width="${width}" height="${Math.round(
          height * 0.64,
        )}" fill="url(#scrim-bottom)"/>`,
      )
    }

    parts.push(
      logoMark(pad, pad, logoSize, theme, brandLabel, strongStack, false),
      `<rect x="${textX}" y="${cursorY}" width="${Math.round(
        maxWidth * 0.2,
      )}" height="6" rx="3" fill="${theme.accent}"/>`,
    )
    cursorY += Math.round(gap * 0.9)
    parts.push(
      textBlock(headline, {
        x: textX,
        y: cursorY,
        fill: theme.text,
        fontFamily: strongStack,
        weight: 700,
      }),
    )
    cursorY += blockHeight(headline) + gap
    if (subheadline.lines.length) {
      parts.push(
        textBlock(subheadline, {
          x: textX,
          y: cursorY,
          fill: theme.muted,
          fontFamily: regularStack,
        }),
      )
      cursorY += blockHeight(subheadline) + gap
    }
    if (body.lines.length) {
      parts.push(
        textBlock(body, {
          x: textX,
          y: cursorY,
          fill: theme.muted,
          fontFamily: regularStack,
        }),
      )
      cursorY += blockHeight(body) + gap
    }
    if (footer.lines.length) {
      parts.push(
        accentRule(textX, cursorY + 2, Math.min(maxWidth, 110), theme.accent),
        textBlock(footer, {
          x: textX,
          y: cursorY + 16,
          fill: theme.accent,
          fontFamily: strongStack,
          weight: 700,
        }),
      )
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defs}
  ${parts.join("\n  ")}
</svg>`
}

export { escapeXml, wrapText, measureText }
