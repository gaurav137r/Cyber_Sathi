import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import type { CaseRecord } from "../lib/cases"
import {
  FALLBACK_CAPABILITIES,
  downloadGeneratedImage,
  generateBackground,
  generatePoster,
  getImageCapabilities,
  loadGeneratedImageBlob,
  renderPoster,
  type GeneratedImage,
  type ImageCapabilities,
  type ImageFormat,
} from "../lib/image-studio"

const C = {
  teal900: "#0B2E2E",
  teal700: "#0F4C4C",
  teal600: "#146B66",
  teal500: "#1D8577",
  mint300: "#7FD1C0",
  mint100: "#E3F3EF",
  bgCanvas: "#F4F5F3",
  white: "#FFFFFF",
  textPrimary: "#16211F",
  textSecondary: "#5B6B68",
  warning: "#FCEBB6",
  warningIcon: "#F0A93A",
  danger: "#E15347",
  dangerBg: "#FCE8E6",
  success: "#3FAE5C",
  successBg: "#DFF3E4",
  divider: "#E6E8E6",
}

const STYLE_OPTIONS = [
  {
    id: "pastel-3d",
    label: "3D pastel",
    value:
      "premium 3D pastel cybersecurity awareness illustration, realistic soft materials, gentle studio lighting, professional advertising-agency quality",
  },
  {
    id: "flat-vector",
    label: "Flat vector",
    value:
      "modern flat vector illustration, bold geometric shapes, clean edges, subtle grain, editorial poster style",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    value:
      "cinematic 3D render, dramatic soft rim lighting, shallow depth of field, premium technology campaign look",
  },
  {
    id: "paper-craft",
    label: "Paper craft",
    value:
      "layered paper-craft illustration, soft shadows, tactile cut-paper shapes, playful premium style",
  },
]

const PALETTE_OPTIONS = [
  {
    id: "pastel",
    label: "Pastel",
    value:
      "powder blue, pastel pink and mint green with a coral red warning accent",
    swatches: ["#BFE3F2", "#F6C9D8", "#BFE8D8", "#F08A7A"],
  },
  {
    id: "teal-coral",
    label: "Teal + coral",
    value: "deep teal, soft mint and warm coral with a cream background",
    swatches: ["#0F4C4C", "#7FD1C0", "#F08A7A", "#F7F1E8"],
  },
  {
    id: "mono",
    label: "Mono + mint",
    value: "charcoal grey, white and a single mint accent",
    swatches: ["#2B2F31", "#FFFFFF", "#7FD1C0", "#D9DEDD"],
  },
  {
    id: "warm",
    label: "Warm",
    value:
      "warm sand, terracotta and soft amber with a deep brown accent",
    swatches: ["#E8D3B9", "#C97B5A", "#F0A93A", "#4A3428"],
  },
]

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${C.divider}`,
  borderRadius: 10,
  padding: "10px 11px",
  fontSize: 13,
  color: C.textPrimary,
  background: C.white,
  fontFamily: "inherit",
  outlineColor: C.teal500,
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  lineHeight: 1.5,
}

function defaultCopy(category: string, language: "en" | "hi") {
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
      subheadline:
        "साइबर धोखाधड़ी तेज़ी से बढ़ रही है। भुगतान से पहले व्यक्ति, लिंक और अनुरोध की पुष्टि करें।",
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

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section
      style={{
        background: C.white,
        border: `1px solid ${C.divider}`,
        borderRadius: 16,
        padding: 15,
      }}
    >
      <p
        style={{
          margin: "0 0 4px",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.09em",
          color: C.teal700,
          textTransform: "uppercase",
        }}
      >
        {title}
      </p>
      {hint && (
        <p
          style={{
            margin: "0 0 12px",
            fontSize: 11,
            lineHeight: 1.5,
            color: C.textSecondary,
          }}
        >
          {hint}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </section>
  )
}

function Field({
  label,
  children,
  counter,
}: {
  label: string
  children: ReactNode
  counter?: string
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          color: C.textPrimary,
        }}
      >
        <span>{label}</span>
        {counter && (
          <span style={{ fontWeight: 500, color: C.textSecondary }}>
            {counter}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}

function Pill({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${active ? C.teal600 : C.divider}`,
        background: active ? C.mint100 : C.white,
        color: active ? C.teal700 : C.textPrimary,
        borderRadius: 20,
        padding: "8px 11px",
        fontSize: 11,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        textAlign: "left",
      }}
    >
      {children}
    </button>
  )
}

export default function ImageStudioScreen({
  caseRecord,
  preferredLanguage = "en",
  onBack,
}: {
  caseRecord: CaseRecord
  preferredLanguage?: "en" | "hi" | "bn"
  onBack: () => void
}) {
  const initialLanguage: "en" | "hi" = preferredLanguage === "hi" ? "hi" : "en"
  const [language, setLanguage] = useState<"en" | "hi">(initialLanguage)
  const [copy, setCopy] = useState(() =>
    defaultCopy(caseRecord.category, initialLanguage),
  )
  const [copyTouched, setCopyTouched] = useState(false)
  const [capabilities, setCapabilities] = useState<ImageCapabilities | null>(null)

  const presets = capabilities?.presets ?? FALLBACK_CAPABILITIES.presets
  const templates = capabilities?.templates ?? FALLBACK_CAPABILITIES.templates
  const formats = capabilities?.formats ?? FALLBACK_CAPABILITIES.formats
  const defaults = capabilities?.defaults ?? FALLBACK_CAPABILITIES.defaults
  const dimensionMax = capabilities?.dimensions.max ?? 2048

  const [prompt, setPrompt] = useState("")
  const [styleId, setStyleId] = useState(STYLE_OPTIONS[0].id)
  const [paletteId, setPaletteId] = useState(PALETTE_OPTIONS[0].id)
  const [presetId, setPresetId] = useState(defaults.preset)
  const [customWidth, setCustomWidth] = useState("1080")
  const [customHeight, setCustomHeight] = useState("1080")
  const [templateId, setTemplateId] = useState(defaults.template)
  const [format, setFormat] = useState<ImageFormat>(defaults.format)
  const [accentColor, setAccentColor] = useState(
    templates[0]?.accent ?? C.mint300,
  )
  const [accentTouched, setAccentTouched] = useState(false)
  const [reuse, setReuse] = useState(true)

  const [busy, setBusy] = useState<
    "background" | "render" | "generate" | "download" | null
  >(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [background, setBackground] = useState<GeneratedImage | null>(null)
  const [poster, setPoster] = useState<GeneratedImage | null>(null)
  const [bgPreview, setBgPreview] = useState("")
  const [finalPreview, setFinalPreview] = useState("")
  const [previewError, setPreviewError] = useState("")
  const activeRequest = useRef(0)

  const style = useMemo(
    () => STYLE_OPTIONS.find((item) => item.id === styleId) ?? STYLE_OPTIONS[0],
    [styleId],
  )
  const palette = useMemo(
    () =>
      PALETTE_OPTIONS.find((item) => item.id === paletteId) ??
      PALETTE_OPTIONS[0],
    [paletteId],
  )
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === templateId) ?? templates[0],
    [templates, templateId],
  )

  useEffect(() => {
    let live = true
    void getImageCapabilities()
      .then((value) => {
        if (!live) return
        setCapabilities(value)
        setPresetId((current) =>
          value.presets.some((item) => item.id === current)
            ? current
            : value.defaults.preset,
        )
        setTemplateId((current) =>
          value.templates.some((item) => item.id === current)
            ? current
            : value.defaults.template,
        )
        setFormat((current) =>
          value.formats.some((item) => item.id === current)
            ? current
            : value.defaults.format,
        )
      })
      .catch(() => {
        // The local fallback list keeps the studio usable if the capability
        // endpoint is temporarily unavailable.
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    let url = ""
    setPreviewError("")
    if (!background?.hasBackground) {
      setBgPreview("")
      return
    }
    void loadGeneratedImageBlob(caseRecord.id, background.id, "background")
      .then((blob) => {
        url = URL.createObjectURL(blob)
        if (live) setBgPreview(url)
        else URL.revokeObjectURL(url)
      })
      .catch((reason: unknown) => {
        if (live) {
          setPreviewError(
            reason instanceof Error
              ? reason.message
              : "The background preview could not be loaded.",
          )
        }
      })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [background?.id, background?.hasBackground, caseRecord.id])

  useEffect(() => {
    let live = true
    let url = ""
    setPreviewError("")
    if (!poster?.hasFinal) {
      setFinalPreview("")
      return
    }
    void loadGeneratedImageBlob(caseRecord.id, poster.id, "final")
      .then((blob) => {
        url = URL.createObjectURL(blob)
        if (live) setFinalPreview(url)
        else URL.revokeObjectURL(url)
      })
      .catch((reason: unknown) => {
        if (live) {
          setPreviewError(
            reason instanceof Error
              ? reason.message
              : "The final poster preview could not be loaded.",
          )
        }
      })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [poster?.id, poster?.hasFinal, caseRecord.id])

  const changeLanguage = (next: "en" | "hi") => {
    setLanguage(next)
    if (!copyTouched) setCopy(defaultCopy(caseRecord.category, next))
  }

  const updateCopy = (key: keyof typeof copy, value: string) => {
    setCopy((current) => ({ ...current, [key]: value }))
    setCopyTouched(true)
  }

  const selectTemplate = (id: string) => {
    setTemplateId(id)
    const next = templates.find((item) => item.id === id)
    if (next && !accentTouched) setAccentColor(next.accent)
  }

  const canvasPayload = useCallback((): {
    preset?: string
    width?: number
    height?: number
  } | null => {
    if (presetId !== "custom") return { preset: presetId }
    const width = Number(customWidth)
    const height = Number(customHeight)
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 256 ||
      height < 256
    ) {
      setError("Custom width and height must both be at least 256px.")
      return null
    }
    if (width > dimensionMax || height > dimensionMax) {
      setError(`Custom dimensions must not exceed ${dimensionMax}px.`)
      return null
    }
    return { width: Math.round(width), height: Math.round(height) }
  }, [customHeight, customWidth, dimensionMax, presetId])

  const textPayload = useCallback(
    () => ({
      template: templateId,
      format,
      headline: copy.headline.trim(),
      subheadline: copy.subheadline.trim(),
      body: copy.body.trim(),
      footer: copy.footer.trim(),
      brandLabel: copy.brandLabel.trim(),
      language,
      accentColor,
    }),
    [accentColor, copy, format, language, templateId],
  )

  const promptPayload = useCallback(
    () => ({
      prompt: prompt.trim() || undefined,
      visualStyle: style.value,
      palette: palette.value,
      reuse,
    }),
    [palette.value, prompt, reuse, style.value],
  )

  const runGenerate = async () => {
    const canvas = canvasPayload()
    if (!canvas) return
    if (!copy.headline.trim()) {
      setError("Add a headline before generating the poster.")
      return
    }
    const request = ++activeRequest.current
    setBusy("generate")
    setError("")
    setNotice("")
    setPreviewError("")
    try {
      const result = await generatePoster(caseRecord.id, {
        ...canvas,
        ...promptPayload(),
        ...textPayload(),
      })
      if (request !== activeRequest.current) return
      setPoster(result)
      if (result.hasBackground) setBackground(result)
      setNotice(
        language === "hi"
          ? "पोस्टर तैयार है। इसे डाउनलोड करें या साझा करें।"
          : result.cached
            ? "Poster ready. A cached AI background was reused, so no new generation was needed."
            : "Poster ready. Download it or use it with your awareness post.",
      )
    } catch (reason) {
      if (request !== activeRequest.current) return
      setError(
        reason instanceof Error
          ? reason.message
          : "The poster could not be generated.",
      )
    } finally {
      if (request === activeRequest.current) setBusy(null)
    }
  }

  const runBackground = async () => {
    const canvas = canvasPayload()
    if (!canvas) return
    const request = ++activeRequest.current
    setBusy("background")
    setError("")
    setNotice("")
    setPreviewError("")
    try {
      const result = await generateBackground(caseRecord.id, {
        ...canvas,
        ...promptPayload(),
      })
      if (request !== activeRequest.current) return
      setBackground(result)
      setPoster(null)
      setNotice(
        language === "hi"
          ? "AI बैकग्राउंड तैयार है। इसे देखें, फिर पोस्टर रेंडर करें।"
          : result.cached
            ? "Background ready (reused from cache). Render your poster with the text you want."
            : "AI background ready. Review it, then render your poster with the text you want.",
      )
    } catch (reason) {
      if (request !== activeRequest.current) return
      setError(
        reason instanceof Error
          ? reason.message
          : "The AI background could not be generated.",
      )
    } finally {
      if (request === activeRequest.current) setBusy(null)
    }
  }

  const runRender = async () => {
    if (!background) {
      setError("Generate or reuse a background first.")
      return
    }
    const canvas = canvasPayload()
    if (!canvas) return
    if (!copy.headline.trim()) {
      setError("Add a headline before rendering the poster.")
      return
    }
    const request = ++activeRequest.current
    setBusy("render")
    setError("")
    setNotice("")
    setPreviewError("")
    try {
      const result = await renderPoster(caseRecord.id, {
        backgroundImageId: background.id,
        ...canvas,
        ...textPayload(),
      })
      if (request !== activeRequest.current) return
      setPoster(result)
      setNotice(
        language === "hi"
          ? "पोस्टर तैयार है। इसे डाउनलोड करें या साझा करें।"
          : "Poster ready. Download it or use it with your awareness post.",
      )
    } catch (reason) {
      if (request !== activeRequest.current) return
      setError(
        reason instanceof Error
          ? reason.message
          : "The poster could not be rendered.",
      )
    } finally {
      if (request === activeRequest.current) setBusy(null)
    }
  }

  const runDownload = async () => {
    if (!poster) return
    setBusy("download")
    setError("")
    try {
      const { blob, fileName } = await downloadGeneratedImage(
        caseRecord.id,
        poster.id,
        "final",
      )
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_500)
      setNotice(
        language === "hi"
          ? "आपका पोस्टर डाउनलोड हो रहा है।"
          : "Your poster is downloading.",
      )
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The poster could not be downloaded.",
      )
    } finally {
      setBusy(null)
    }
  }

  const suggestPrompt = () => {
    const category = (caseRecord.category || "cyber fraud")
      .replace(/-/g, " ")
      .toLowerCase()
    setPrompt(
      `${style.value} about ${category} awareness, glossy smartphone with a completely blank screen, protective shield, subtle payment or message icons, ${palette.value}, clean uncluttered background with negative space in the lower third, no text, no letters, no watermark.`,
    )
  }

  const busyLabel =
    busy === "generate"
      ? language === "hi"
        ? "AI पोस्टर बन रहा है…"
        : "Generating artwork with Flux Schnell…"
      : busy === "background"
        ? language === "hi"
          ? "AI बैकग्राउंड बन रहा है…"
          : "Generating AI background…"
        : busy === "render"
          ? language === "hi"
            ? "पोस्टर रेंडर हो रहा है…"
            : "Composing your poster with ImageMagick…"
          : busy === "download"
            ? language === "hi"
              ? "डाउनलोड हो रहा है…"
              : "Preparing download…"
            : ""

  const previewImage = finalPreview || bgPreview
  const previewIsFinal = Boolean(finalPreview)

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: C.bgCanvas,
      }}
    >
      <div
        style={{
          padding: "14px 18px 13px",
          background: C.white,
          borderBottom: `1px solid ${C.divider}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to summary"
          style={{
            border: `1px solid ${C.divider}`,
            background: C.white,
            color: C.teal700,
            borderRadius: 20,
            width: 34,
            height: 34,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            fontSize: 16,
            flex: "0 0 auto",
          }}
        >
          ←
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: C.textPrimary,
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            AI poster studio
          </h2>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 11,
              color: C.textSecondary,
            }}
          >
            Flux Schnell artwork · SVG typography · ImageMagick render
          </p>
        </div>
        <span
          style={{
            flex: "0 0 auto",
            fontSize: 9,
            fontWeight: 800,
            color: C.teal700,
            background: C.mint100,
            borderRadius: 12,
            padding: "5px 8px",
            letterSpacing: "0.04em",
          }}
        >
          CLOUDFLARE
        </span>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 16px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <SectionCard
          title="Visual prompt"
          hint="Describe the artwork. Leave it blank and Cyber Sathi builds a safe background prompt from this case. The AI never draws your text — headlines and details are rendered locally."
        >
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value.slice(0, 2000))}
            rows={4}
            placeholder="Example: premium 3D pastel cybersecurity illustration, glossy phone with a blank screen, shield, coral warning accent, clean background with negative space for text, no text, no letters, no watermark."
            style={textareaStyle}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 7 }}>
              <button
                type="button"
                onClick={suggestPrompt}
                style={{
                  border: `1px solid ${C.divider}`,
                  background: C.white,
                  color: C.teal700,
                  borderRadius: 16,
                  padding: "6px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Use case summary
              </button>
              {prompt && (
                <button
                  type="button"
                  onClick={() => setPrompt("")}
                  style={{
                    border: `1px solid ${C.divider}`,
                    background: C.white,
                    color: C.textSecondary,
                    borderRadius: 16,
                    padding: "6px 10px",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <span style={{ fontSize: 10, color: C.textSecondary }}>
              {prompt.length}/2000
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 10,
              lineHeight: 1.45,
              color: C.textSecondary,
            }}
          >
            A custom prompt overrides the art-direction presets below. The
            output is always cropped to your chosen canvas.
          </p>
        </SectionCard>

        <SectionCard
          title="Art direction"
          hint="Used when the prompt is blank. These values feed the reusable prompt builder."
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {STYLE_OPTIONS.map((option) => (
              <Pill
                key={option.id}
                active={styleId === option.id}
                onClick={() => setStyleId(option.id)}
              >
                {option.label}
              </Pill>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {PALETTE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPaletteId(option.id)}
                style={{
                  border: `1px solid ${
                    paletteId === option.id ? C.teal600 : C.divider
                  }`,
                  background:
                    paletteId === option.id ? C.mint100 : C.white,
                  borderRadius: 11,
                  padding: "8px 9px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    gap: 4,
                  }}
                >
                  {option.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: 4,
                        background: swatch,
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    />
                  ))}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.textPrimary,
                  }}
                >
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Canvas & format"
          hint="Choose a ready-made size or enter a custom canvas. The renderer reflows text and spacing for each size."
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPresetId(preset.id)}
                style={{
                  border: `1px solid ${
                    presetId === preset.id ? C.teal600 : C.divider
                  }`,
                  background: presetId === preset.id ? C.mint100 : C.white,
                  borderRadius: 11,
                  padding: "9px 10px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.textPrimary,
                  }}
                >
                  {preset.name}
                </span>
                <span
                  style={{
                    display: "block",
                    marginTop: 2,
                    fontSize: 9,
                    color: C.textSecondary,
                  }}
                >
                  {preset.description}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPresetId("custom")}
              style={{
                border: `1px solid ${
                  presetId === "custom" ? C.teal600 : C.divider
                }`,
                background: presetId === "custom" ? C.mint100 : C.white,
                borderRadius: 11,
                padding: "9px 10px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textPrimary,
                }}
              >
                Custom
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 2,
                  fontSize: 9,
                  color: C.textSecondary,
                }}
              >
                256–{dimensionMax}px
              </span>
            </button>
          </div>
          {presetId === "custom" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="Width (px)">
                <input
                  type="number"
                  min={256}
                  max={dimensionMax}
                  value={customWidth}
                  onChange={(event) => setCustomWidth(event.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Height (px)">
                <input
                  type="number"
                  min={256}
                  max={dimensionMax}
                  value={customHeight}
                  onChange={(event) => setCustomHeight(event.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
          )}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {formats.map((item) => (
              <Pill
                key={item.id}
                active={format === item.id}
                onClick={() => setFormat(item.id)}
              >
                {item.label}
              </Pill>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Design template"
          hint="Templates control the scrim, card, accent rule and where text sits on the artwork."
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template.id)}
                style={{
                  border: `1px solid ${
                    templateId === template.id ? C.teal600 : C.divider
                  }`,
                  background:
                    templateId === template.id ? C.mint100 : C.white,
                  borderRadius: 12,
                  padding: "10px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 6,
                      background: template.accent,
                      border: "1px solid rgba(0,0,0,0.08)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.textPrimary,
                    }}
                  >
                    {template.name}
                  </span>
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 9,
                    lineHeight: 1.4,
                    color: C.textSecondary,
                  }}
                >
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Poster text"
          hint="Every field below is rendered with SVG and ImageMagick. Keep the headline short and put details in the body."
        >
          <div style={{ display: "flex", gap: 7 }}>
            <Pill
              active={language === "en"}
              onClick={() => changeLanguage("en")}
            >
              English
            </Pill>
            <Pill
              active={language === "hi"}
              onClick={() => changeLanguage("hi")}
            >
              हिंदी
            </Pill>
          </div>
          <Field
            label="Headline"
            counter={`${copy.headline.length}/180`}
          >
            <input
              value={copy.headline}
              onChange={(event) =>
                updateCopy("headline", event.target.value.slice(0, 180))
              }
              style={inputStyle}
            />
          </Field>
          <Field
            label="Subheadline"
            counter={`${copy.subheadline.length}/260`}
          >
            <textarea
              value={copy.subheadline}
              onChange={(event) =>
                updateCopy("subheadline", event.target.value.slice(0, 260))
              }
              rows={2}
              style={textareaStyle}
            />
          </Field>
          <Field label="Body" counter={`${copy.body.length}/900`}>
            <textarea
              value={copy.body}
              onChange={(event) =>
                updateCopy("body", event.target.value.slice(0, 900))
              }
              rows={4}
              style={textareaStyle}
            />
          </Field>
          <Field
            label="Footer / helpline"
            counter={`${copy.footer.length}/160`}
          >
            <input
              value={copy.footer}
              onChange={(event) =>
                updateCopy("footer", event.target.value.slice(0, 160))
              }
              style={inputStyle}
            />
          </Field>
          <Field
            label="Brand label"
            counter={`${copy.brandLabel.length}/40`}
          >
            <input
              value={copy.brandLabel}
              onChange={(event) =>
                updateCopy("brandLabel", event.target.value.slice(0, 40))
              }
              style={inputStyle}
            />
          </Field>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.textPrimary,
              }}
            >
              Accent colour
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="color"
                value={accentColor}
                onChange={(event) => {
                  setAccentTouched(true)
                  setAccentColor(event.target.value)
                }}
                style={{
                  width: 44,
                  height: 36,
                  padding: 2,
                  border: `1px solid ${C.divider}`,
                  borderRadius: 8,
                  background: C.white,
                  cursor: "pointer",
                }}
              />
              <input
                value={accentColor}
                onChange={(event) => {
                  setAccentTouched(true)
                  const value = event.target.value
                  if (/^#[0-9a-fA-F]{0,6}$/.test(value)) {
                    setAccentColor(value)
                  }
                }}
                maxLength={7}
                style={{ ...inputStyle, width: 92, fontFamily: "monospace" }}
              />
            </div>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 10,
              lineHeight: 1.45,
              color: C.textSecondary,
            }}
          >
            Template accent: {selectedTemplate?.accent ?? C.mint300}. Changing
            the template updates the accent unless you picked a custom colour.
          </p>
        </SectionCard>

        <SectionCard
          title="Generate"
          hint="The one-shot flow generates or reuses an AI background, then composites the SVG text and exports the final image."
        >
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 9,
              fontSize: 11,
              lineHeight: 1.45,
              color: C.textPrimary,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={reuse}
              onChange={(event) => setReuse(event.target.checked)}
              style={{ marginTop: 2, accentColor: C.teal600 }}
            />
            <span>
              Reuse an existing AI background when the prompt matches. This
              avoids duplicate Cloudflare generations.
            </span>
          </label>

          <button
            type="button"
            onClick={() => void runGenerate()}
            disabled={Boolean(busy)}
            style={{
              width: "100%",
              border: 0,
              borderRadius: 24,
              padding: "13px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              background: busy ? "#9AA6A3" : C.teal600,
              color: C.white,
            }}
          >
            {busy === "generate"
              ? language === "hi"
                ? "पोस्टर बन रहा है…"
                : "Generating poster…"
              : language === "hi"
                ? "AI पोस्टर बनाएं"
                : "Generate AI poster"}
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void runBackground()}
              disabled={Boolean(busy)}
              style={{
                flex: 1,
                border: `1px solid ${C.divider}`,
                borderRadius: 20,
                padding: "10px 12px",
                fontSize: 11,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                background: C.white,
                color: C.teal700,
              }}
            >
              Background only
            </button>
            <button
              type="button"
              onClick={() => void runRender()}
              disabled={Boolean(busy) || !background}
              style={{
                flex: 1,
                border: `1px solid ${
                  background ? C.teal600 : C.divider
                }`,
                borderRadius: 20,
                padding: "10px 12px",
                fontSize: 11,
                fontWeight: 700,
                cursor:
                  busy || !background ? "not-allowed" : "pointer",
                background: background ? C.mint100 : C.white,
                color: background ? C.teal700 : C.textSecondary,
                opacity: busy ? 0.6 : 1,
              }}
            >
              Render with this background
            </button>
          </div>

          {busy && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                background: C.mint100,
                borderRadius: 10,
                padding: "9px 11px",
              }}
            >
              <span
                className="animate-spin"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: `2px solid #BFE3DA`,
                  borderTopColor: C.teal600,
                  flex: "0 0 auto",
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  lineHeight: 1.4,
                  color: C.teal700,
                  fontWeight: 600,
                }}
              >
                {busyLabel}
              </span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                background: C.dangerBg,
                border: `1px solid #F3C4BF`,
                borderRadius: 10,
                padding: "9px 11px",
                fontSize: 10,
                lineHeight: 1.5,
                color: C.danger,
              }}
            >
              {error}
            </div>
          )}

          {notice && (
            <div
              role="status"
              style={{
                background: C.successBg,
                border: `1px solid #BFE4C7`,
                borderRadius: 10,
                padding: "9px 11px",
                fontSize: 10,
                lineHeight: 1.5,
                color: "#256B3A",
              }}
            >
              {notice}
            </div>
          )}

          {previewError && (
            <div
              role="alert"
              style={{
                background: C.warning,
                border: `1px solid #EAD48A`,
                borderRadius: 10,
                padding: "9px 11px",
                fontSize: 10,
                lineHeight: 1.5,
                color: "#6B5318",
              }}
            >
              {previewError}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Preview"
          hint={
            previewIsFinal
              ? "Final composition — AI artwork with locally rendered SVG text."
              : previewImage
                ? "AI background only. Render the poster to add your text."
                : "Generate a background or a complete poster to see it here."
          }
        >
          {previewImage ? (
            <img
              src={previewImage}
              alt={
                previewIsFinal
                  ? "Final cyber safety poster preview"
                  : "AI generated background preview"
              }
              style={{
                width: "100%",
                display: "block",
                borderRadius: 12,
                border: `1px solid ${C.divider}`,
                background: C.bgCanvas,
              }}
            />
          ) : (
            <div
              style={{
                minHeight: 180,
                border: `1px dashed #C9D3D0`,
                borderRadius: 12,
                display: "grid",
                placeItems: "center",
                padding: 18,
                textAlign: "center",
                color: C.textSecondary,
                fontSize: 11,
                lineHeight: 1.5,
                background: C.bgCanvas,
              }}
            >
              Your AI artwork and final poster will appear here.
            </div>
          )}

          {poster && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 10, color: C.textSecondary }}>
                {poster.width} × {poster.height} · {poster.format.toUpperCase()}{" "}
                · {poster.template}
              </span>
              <button
                type="button"
                onClick={() => void runDownload()}
                disabled={busy === "download"}
                style={{
                  border: 0,
                  borderRadius: 20,
                  padding: "9px 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: busy === "download" ? "wait" : "pointer",
                  background: C.teal600,
                  color: C.white,
                }}
              >
                {busy === "download" ? "Preparing…" : "Download poster"}
              </button>
            </div>
          )}

          {background && !poster && (
            <p
              style={{
                margin: 0,
                fontSize: 10,
                lineHeight: 1.5,
                color: C.textSecondary,
              }}
            >
              Background cached for this prompt. Use{" "}
              <strong>Render with this background</strong> to add the current
              text without another Cloudflare request.
            </p>
          )}
        </SectionCard>

        <p
          style={{
            margin: "2px 2px 0",
            fontSize: 10,
            lineHeight: 1.55,
            color: C.textSecondary,
          }}
        >
          {capabilities?.notes.freeTier ??
            FALLBACK_CAPABILITIES.notes.freeTier}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 10,
            lineHeight: 1.55,
            color: C.textSecondary,
          }}
        >
          {capabilities?.notes.textRendering ??
            FALLBACK_CAPABILITIES.notes.textRendering}{" "}
          Generation can take a few seconds. If Cloudflare reports a rate
          limit, wait and retry; invalid requests are not retried
          automatically.
        </p>
      </div>
    </div>
  )
}
