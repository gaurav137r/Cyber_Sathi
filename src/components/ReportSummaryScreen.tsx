import { useCallback, useEffect, useRef, useState } from "react"
import type { CaseRecord } from "../lib/cases"
import {
  buildAutoPosterInput,
  generatePoster,
  listGeneratedImages,
  loadGeneratedImageBlob,
} from "../lib/image-studio"
import {
  downloadReport,
  generateReportSummary,
  generateSocialDraft,
  getReportCenter,
  type ReportExportFormat,
  type ReportLanguage,
  type ReportSocialPlatform,
} from "../lib/report-center"
import {
  saveBlobInNativeApp,
  sharePostInNativeApp,
} from "../lib/native-file-save"

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
  success: "#3FAE5C",
  successBg: "#DFF3E4",
  divider: "#E6E8E6",
}

const platforms: Array<{
  id: ReportSocialPlatform
  name: string
  badge: string
  url: string
  limit: number
}> = [
  {
    id: "linkedin",
    name: "LinkedIn",
    badge: "in",
    url: "https://www.linkedin.com/feed/?shareActive=true",
    limit: 2800,
  },
  {
    id: "instagram",
    name: "Instagram",
    badge: "ig",
    url: "https://www.instagram.com/",
    limit: 2000,
  },
  {
    id: "facebook",
    name: "Facebook",
    badge: "f",
    url: "https://www.facebook.com/",
    limit: 2000,
  },
  {
    id: "twitter",
    name: "X / Twitter",
    badge: "X",
    url: "https://x.com/compose/post",
    limit: 260,
  },
]

function redact(text: string): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email hidden]")
    .replace(/https?:\/\/\S+|\bwww\.\S+/gi, "[link hidden]")
    .replace(/\b[\w.-]+@[\w.-]+\b/g, "[UPI hidden]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number hidden]")
}

function localSummary(record: CaseRecord, language: ReportLanguage): string {
  const category = (record.category || "cyber fraud").replace(/-/g, " ")
  const amount = record.amount ? redact(record.amount) : ""
  const platform = record.platform ? redact(record.platform) : ""
  const date = record.incidentDate ? redact(record.incidentDate) : ""
  const narrative = redact(
    record.complaintNarrative || record.summary || "",
  ).slice(0, 700)

  if (language === "hi") {
    const lines = [
      "साइबर साथी — मामला सारांश",
      "",
      `धोखाधड़ी का प्रकार: ${category}`,
      ...(amount ? [`रिपोर्ट की गई राशि: ${amount}`] : []),
      ...(platform ? [`इस्तेमाल किया गया माध्यम: ${platform}`] : []),
      ...(date ? [`घटना की तारीख: ${date}`] : []),
      "",
      narrative || "उपयोगकर्ता ने घटना का विवरण दर्ज किया है।",
      "",
      "सुरक्षा सलाह: किसी के साथ भी OTP, UPI पिन या बैंक पासवर्ड साझा न करें। संदिग्ध लेनदेन की सूचना तुरंत 1930 पर दें या cybercrime.gov.in पर शिकायत दर्ज करें।",
    ]
    return lines.join("\n")
  }

  const lines = [
    "Cyber Sathi — Case summary",
    "",
    `Fraud type: ${category}`,
    ...(amount ? [`Reported amount: ${amount}`] : []),
    ...(platform ? [`Platform or bank used: ${platform}`] : []),
    ...(date ? [`Incident date: ${date}`] : []),
    "",
    narrative || "The user recorded the details of the incident.",
    "",
    "Safety advice: never share an OTP, UPI PIN, or bank password with anyone. Report suspicious transactions immediately on 1930 or file a complaint at cybercrime.gov.in.",
  ]
  return lines.join("\n")
}

function localPost(
  record: CaseRecord,
  platform: ReportSocialPlatform,
  language: ReportLanguage,
): { caption: string hashtags: string[] } {
  const category = (record.category || "cyber fraud").replace(/-/g, " ")
  const limit = platforms.find((item) => item.id === platform)?.limit ?? 2000
  const hashtags =
    language === "hi"
      ? ["#साइबरसुरक्षा", "#साइबरसाथी", "#धोखाधड़ीसेबचें", "#StaySafeOnline"]
      : ["#CyberSafety", "#CyberSathi", "#FraudAlert", "#StaySafeOnline"]

  const caption =
    language === "hi"
      ? `साइबर धोखाधड़ी से सतर्क रहें। ${category} जैसी घटनाएँ तेज़ी से बढ़ रही हैं। भुगतान से पहले व्यक्ति और लिंक की पुष्टि करें, OTP या UPI पिन कभी साझा न करें। धोखाधड़ी होने पर तुरंत 1930 पर कॉल करें या cybercrime.gov.in पर शिकायत दर्ज करें।`
      : `Cyber fraud awareness: ${category} scams are rising. Verify the person and the link before you pay, and never share an OTP, UPI PIN, or bank password. If you are defrauded, call 1930 immediately or report at cybercrime.gov.in.`

  const tags = hashtags.join(" ")
  const full = `${caption}\n\n${tags}`
  if (full.length <= limit) return { caption, hashtags }
  return {
    caption: caption.slice(0, Math.max(40, limit - tags.length - 2)),
    hashtags,
  }
}

function normaliseTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string")
    : []
}

function composeUrl(platform: ReportSocialPlatform, text: string): string {
  const base =
    platforms.find((item) => item.id === platform)?.url ??
    "https://www.google.com"
  const encoded = encodeURIComponent(text)
  if (platform === "twitter") return `${base}?text=${encoded}`
  if (platform === "linkedin") return `${base}&text=${encoded}`
  return base
}

export default function ReportSummaryScreen({
  caseRecord,
  preferredLanguage = "en",
  onViewCase,
  onHome,
  onBackToConversation,
  onFileCase,
}: {
  caseRecord: CaseRecord
  preferredLanguage?: "en" | "hi" | "bn"
  onViewCase: () => void
  onHome: () => void
  onBackToConversation: () => void
  onFileCase?: () => void
}) {
  const [language, setLanguage] = useState<ReportLanguage>(
    preferredLanguage === "hi" ? "hi" : "en",
  )
  const [summaries, setSummaries] =
    useState<Partial<Record<ReportLanguage, string>>>({})
  const [localLanguages, setLocalLanguages] = useState<Record<string, boolean>>(
    {},
  )
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [summaryError, setSummaryError] = useState("")
  const [platform, setPlatform] = useState<ReportSocialPlatform>("linkedin")
  const [draft, setDraft] = useState<{
    caption: string
    hashtags: string[]
  } | null>(null)
  const [postBusy, setPostBusy] = useState(false)
  const [postError, setPostError] = useState("")
  const [posterBusy, setPosterBusy] = useState(false)
  const [posterError, setPosterError] = useState("")
  const [posterImageUrl, setPosterImageUrl] = useState<string | null>(null)
  const [posterBlob, setPosterBlob] = useState<Blob | null>(null)
  const [posterFileName, setPosterFileName] = useState("")
  const [posterReady, setPosterReady] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [posterDownloadError, setPosterDownloadError] = useState("")
  const [posterDownloadNotice, setPosterDownloadNotice] = useState("")
  const [notice, setNotice] = useState("")
  const [centreLoaded, setCentreLoaded] = useState(false)
  const [centreError, setCentreError] = useState("")
  const [downloadBusy, setDownloadBusy] =
    useState<ReportExportFormat | "poster" | null>(null)
  const [downloadError, setDownloadError] = useState("")
  const [downloadNotice, setDownloadNotice] = useState("")
  const requestedRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    let live = true
    void getReportCenter(caseRecord.id)
      .then((centre) => {
        if (!live) return
        setSummaries((previous) => ({
          ...previous,
          ...(centre.report?.summaryEnglish
            ? { en: centre.report.summaryEnglish }
            : {}),
          ...(centre.report?.summaryHindi
            ? { hi: centre.report.summaryHindi }
            : {}),
        }))
        const savedPost = centre.socialPosts.find((post) =>
          platforms.some((item) => item.id === post.platform),
        )
        if (savedPost) {
          setPlatform(savedPost.platform as ReportSocialPlatform)
          setDraft({
            caption: savedPost.caption,
            hashtags: normaliseTags(savedPost.hashtags),
          })
          setNotice("Your previously saved awareness post has been restored.")
        }
        const savedPoster = centre.socialPosts.find(
          (post) => typeof post.imageUrl === "string" && post.imageUrl,
        )
        if (savedPoster?.imageUrl) {
          setPosterImageUrl(savedPoster.imageUrl)
          setPosterFileName("cyber-sathi-awareness-poster.png")
          setPosterReady(true)
        }
      })
      .catch((error) => {
        if (!live) return
        setCentreError(
          error instanceof Error
            ? error.message
            : "Could not load the saved report and posts.",
        )
      })
      .finally(() => {
        if (live) setCentreLoaded(true)
      })

    void listGeneratedImages(caseRecord.id)
      .then(async (images) => {
        const savedImage = images.find(
          (image) => image.status === "READY" && image.hasFinal,
        )
        if (!live || !savedImage) return
        const blob = await loadGeneratedImageBlob(
          caseRecord.id,
          savedImage.id,
          "final",
        )
        if (!live) return
        setPosterBlob(blob)
        setPosterImageUrl(URL.createObjectURL(blob))
        setPosterFileName(
          `cyber-sathi-${savedImage.template}-${savedImage.width}x${savedImage.height}.${
            savedImage.format === "jpeg" ? "jpg" : savedImage.format
          }`,
        )
        setPosterReady(true)
      })
      .catch((error) => {
        if (!live) return
        setPosterError(
          error instanceof Error
            ? `Could not restore the saved poster: ${error.message}`
            : "Could not restore the saved poster.",
        )
      })
    return () => {
      live = false
    }
  }, [caseRecord.id])

  useEffect(
    () => () => {
      if (posterImageUrl?.startsWith("blob:"))
        URL.revokeObjectURL(posterImageUrl)
    },
    [posterImageUrl],
  )

  const loadSummary = useCallback(
    async (target: ReportLanguage) => {
      if (requestedRef.current[target]) return
      requestedRef.current[target] = true
      setSummaryBusy(true)
      setSummaryError("")
      try {
        const generated = await generateReportSummary(caseRecord.id, target)
        setSummaries((previous) => ({
          ...previous,
          [target]: generated.summary,
        }))
      } catch (error) {
        setSummaries((previous) => ({
          ...previous,
          [target]: localSummary(caseRecord, target),
        }))
        setLocalLanguages((previous) => ({ ...previous, [target]: true }))
        setSummaryError(
          `${
            target === "hi"
              ? "सारांश सेवा उपलब्ध नहीं थी, इसलिए इस डिवाइस पर सुरक्षित सारांश बनाया गया है।"
              : "The summary service was unavailable, so a safe summary was created on this device."
          }${error instanceof Error ? ` ${error.message}` : ""}`,
        )
      } finally {
        setSummaryBusy(false)
      }
    },
    [caseRecord],
  )

  useEffect(() => {
    if (!centreLoaded || summaryBusy) return
    if (summaries[language] || requestedRef.current[language]) return
    void loadSummary(language)
  }, [centreLoaded, language, summaries, summaryBusy, loadSummary])

  const selectedPlatform =
    platforms.find((item) => item.id === platform) ?? platforms[0]
  const summaryText = summaries[language] ?? ""

  const switchLanguage = (next: ReportLanguage) => {
    setLanguage(next)
    setDraft(null)
    resetPoster()
    setNotice("")
    setPostError("")
    setDownloadError("")
    setDownloadNotice("")
  }

  const download = async (format: ReportExportFormat) => {
    setDownloadBusy(format)
    setDownloadError("")
    setDownloadNotice("")
    try {
      const { blob, fileName } = await downloadReport(
        caseRecord.id,
        format,
        language,
      )
      const savedNatively = await saveBlobInNativeApp(
        blob,
        fileName,
        blob.type || "application/octet-stream",
      )
      if (!savedNatively) {
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = fileName
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1_500)
      }
      setDownloadNotice(
        language === "hi"
          ? `${format.toUpperCase()} फ़ाइल ${
              savedNatively ? "शेयर शीट में खुल गई है।" : "डाउनलोड हो रही है।"
            }`
          : savedNatively
            ? `Your ${format.toUpperCase()} report is ready to save or share.`
            : `Your ${format.toUpperCase()} report is downloading.`,
      )
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : language === "hi"
            ? "रिपोर्ट डाउनलोड नहीं हो सकी।"
            : "The report could not be downloaded.",
      )
    } finally {
      setDownloadBusy(null)
    }
  }

  const downloadSummary = () => {
    if (!summaryText) return
    const url = URL.createObjectURL(
      new Blob([summaryText], { type: "text/plain;charset=utf-8" }),
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `cyber-sathi-summary-${language}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_500)
    setDownloadNotice(
      language === "hi"
        ? "सारांश डाउनलोड हो रहा है।"
        : "Your summary is downloading.",
    )
  }

  const createPost = async () => {
    setPostBusy(true)
    setPostError("")
    setNotice("")
    setPosterError("")
    setPosterReady(false)
    try {
      const created = await generateSocialDraft(
        caseRecord.id,
        platform,
        language,
      )
      setDraft({
        caption: created.caption,
        hashtags: normaliseTags(created.hashtags),
      })
      const posterOk = await generatePosterForPost()
      setNotice(
        posterOk
          ? language === "hi"
            ? "ड्राफ्ट और पोस्टर तैयार हैं। इन्हें जाँचें, फिर साझा करें।"
            : "Draft and poster are ready. Review them, then share when you are ready."
          : language === "hi"
            ? "ड्राफ्ट तैयार है, लेकिन पोस्टर नहीं बन सका। साझा करने से पहले दोबारा कोशिश करें।"
            : "Draft is ready, but the poster could not be generated. Try again before sharing.",
      )
    } catch (error) {
      setDraft(localPost(caseRecord, platform, language))
      setPostError(
        `${
          language === "hi"
            ? "पोस्ट सेवा उपलब्ध नहीं थी, इसलिए इस डिवाइस पर सुरक्षित ड्राफ्ट बनाया गया है।"
            : "The post service was unavailable, so a safe draft was created on this device."
        }${error instanceof Error ? ` ${error.message}` : ""}`,
      )
    } finally {
      setPostBusy(false)
    }
  }

  const generatePosterForPost = async (): Promise<boolean> => {
    setPosterBusy(true)
    setPosterError("")
    let ok = false
    try {
      const input = buildAutoPosterInput(caseRecord, platform, language)
      const created = await generatePoster(caseRecord.id, input)
      if (!created.finalUrl) throw new Error("Poster was not rendered.")
      const blob = await loadGeneratedImageBlob(
        caseRecord.id,
        created.id,
        "final",
      )
      const url = URL.createObjectURL(blob)
      setPosterBlob(blob)
      setPosterImageUrl(url)
      setPosterFileName(
        `cyber-sathi-${created.template}-${created.width}x${created.height}.png`,
      )
      setPosterReady(true)
      ok = true
    } catch (error) {
      setPosterError(
        error instanceof Error
          ? error.message
          : language === "hi"
            ? "पोस्टर नहीं बन सका।"
            : "The poster could not be generated.",
      )
      setPosterReady(false)
    } finally {
      setPosterBusy(false)
    }
    return ok
  }

  const resetPoster = () => {
    setPosterBlob(null)
    setPosterImageUrl(null)
    setPosterFileName("")
    setPosterReady(false)
    setPosterError("")
    setPosterDownloadError("")
    setPosterDownloadNotice("")
  }

  const copyDraft = async () => {
    if (!draft) return
    const text = `${draft.caption}${
      draft.hashtags.length ? `\n\n${draft.hashtags.join(" ")}` : ""
    }`
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(text)
      setNotice(
        language === "hi"
          ? "पोस्ट कॉपी हो गई। ऐप खोलकर पेस्ट करें।"
          : "Post copied. Open the app and paste it into a new post.",
      )
    } catch {
      setNotice(
        language === "hi"
          ? "कॉपी उपलब्ध नहीं है। टेक्स्ट चुनकर मैन्युअल रूप से कॉपी करें।"
          : "Copy is unavailable in this browser. Select the draft text and copy it manually.",
      )
    }
  }

  const downloadPost = async () => {
    if (!posterImageUrl || !posterBlob) return
    setDownloadBusy("poster")
    setPosterDownloadError("")
    setPosterDownloadNotice("")
    try {
      const savedNatively = await saveBlobInNativeApp(
        posterBlob,
        posterFileName || "cyber-sathi-poster.png",
        posterBlob.type || "image/png",
      )
      if (savedNatively) {
        setPosterDownloadNotice(
          language === "hi"
            ? "पोस्टर चुने गए फ़ोल्डर में सेव हो गया है।"
            : "Your poster was saved to the selected folder.",
        )
      } else {
        const anchor = document.createElement("a")
        anchor.href = posterImageUrl
        anchor.download = posterFileName || "cyber-sathi-poster.png"
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        setPosterDownloadNotice(
          language === "hi"
            ? "पोस्टर डाउनलोड हो रहा है।"
            : "Your poster is downloading.",
        )
      }
    } catch (error) {
      setPosterDownloadError(
        error instanceof Error
          ? error.message
          : language === "hi"
            ? "पोस्टर डाउनलोड नहीं हो सका।"
            : "The poster could not be downloaded.",
      )
    } finally {
      setDownloadBusy(null)
    }
  }

  const postToPlatform = async () => {
    if (!draft || !posterBlob || !posterReady) return
    const text = `${draft.caption}${
      draft.hashtags.length ? `\n\n${draft.hashtags.join(" ")}` : ""
    }`
    setShareBusy(true)
    try {
      try {
        const sharedNatively = await sharePostInNativeApp(
          posterBlob,
          posterFileName || "cyber-sathi-poster.png",
          posterBlob.type || "image/png",
          text,
          platform,
        )
        if (sharedNatively) {
          setNotice(
            `${selectedPlatform.name} opened with the poster and caption. Review the post and tap Post to publish.`,
          )
          return
        }
      } catch {
        // Try the browser's native share sheet before falling back to text-only sharing.
      }

      const file = new File(
        [posterBlob],
        posterFileName || "cyber-sathi-poster.png",
        {
          type: posterBlob.type || "image/png",
        },
      )
      if (
        navigator.share &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          files: [file],
          text,
          title: "Cyber Sathi awareness post",
        })
        setNotice(
          `${selectedPlatform.name} share sheet opened with the poster and caption. Review the post before publishing.`,
        )
        return
      }

      window.open(composeUrl(platform, text), "_blank", "noopener,noreferrer")
      try {
        await navigator.clipboard?.writeText(text)
      } catch {
        setNotice(
          `Could not attach the poster automatically. Download it and attach it in ${selectedPlatform.name}; the caption is shown above for copying.`,
        )
        return
      }
      setNotice(
        `The ${selectedPlatform.name} page is open and the caption is copied. Download the poster and attach it before publishing.`,
      )
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setNotice("Sharing was cancelled.")
        return
      }
      setPostError(
        error instanceof Error
          ? `Could not share the poster and caption: ${error.message}`
          : "Could not share the poster and caption.",
      )
    } finally {
      setShareBusy(false)
    }
  }

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
          padding: "16px 20px 14px",
          background: C.white,
          borderBottom: `1px solid ${C.divider}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: C.textPrimary,
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              Your report summary
            </h2>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 11,
                color: C.textSecondary,
              }}
            >
              Saved to your Cyber Sathi account. Choose a language, then share
              an awareness post.
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToConversation}
            style={{
              flexShrink: 0,
              border: `1px solid ${C.teal600}`,
              borderRadius: 18,
              padding: "8px 10px",
              background: C.white,
              color: C.teal700,
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to chat
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            background: C.successBg,
            borderRadius: 12,
            padding: "11px 13px",
            display: "flex",
            gap: 9,
            alignItems: "flex-start",
          }}
        >
          <span style={{ fontSize: 17 }}>✅</span>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              lineHeight: 1.5,
              color: C.teal700,
            }}
          >
            <strong>Report saved.</strong> Case ID:{" "}
            <span style={{ fontFamily: "monospace" }}>
              {caseRecord.trackingNumber || caseRecord.id}
            </span>
          </p>
        </div>

        {/* Case Status Indicator */}
        <div
          style={{
            background: C.white,
            border: `1px solid ${C.divider}`,
            borderRadius: 16,
            padding: "12px 15px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background:
                  caseRecord.status === "FILED" ||
                  caseRecord.status === "RESOLVED" ||
                  caseRecord.status === "ARCHIVED"
                    ? C.success
                    : caseRecord.status === "REVIEWED"
                      ? C.teal600
                      : C.warningIcon,
              }}
            />
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.textPrimary,
                }}
              >
                {caseRecord.status === "FILED" ||
                caseRecord.status === "RESOLVED" ||
                caseRecord.status === "ARCHIVED"
                  ? "Case Closed"
                  : caseRecord.status === "REVIEWED"
                    ? "Report Completed"
                    : "In Progress"}
              </p>
              <p style={{ margin: 0, fontSize: 10, color: C.textSecondary }}>
                Status:{" "}
                <strong>
                  {caseRecord.status === "REVIEWED"
                    ? "COMPLETED"
                    : caseRecord.status}
                </strong>
              </p>
            </div>
          </div>
          {caseRecord.status === "REVIEWED" && onFileCase && (
            <button
              type="button"
              onClick={onFileCase}
              style={{
                border: 0,
                borderRadius: 20,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                background: C.teal600,
                color: C.white,
              }}
            >
              File Case
            </button>
          )}
        </div>
        {centreError && (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: 10,
              lineHeight: 1.45,
              color: C.danger,
            }}
          >
            Saved report data could not be loaded: {centreError}
          </p>
        )}

        <div
          style={{
            background: C.white,
            border: `1px solid ${C.divider}`,
            borderRadius: 16,
            padding: 15,
          }}
        >
          <p
            style={{
              margin: "0 0 9px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: C.teal700,
            }}
          >
            SUMMARY LANGUAGE
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              background: C.bgCanvas,
              padding: 4,
              borderRadius: 12,
            }}
          >
            {([
              ["en", "English"],
              ["hi", "हिंदी (Hindi)"],
            ] as const).map(([value, label]) => {
              const active = language === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => switchLanguage(value)}
                  style={{
                    border: 0,
                    borderRadius: 9,
                    padding: "8px 6px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: active ? C.teal600 : "transparent",
                    color: active ? C.white : C.textSecondary,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div
            style={{
              marginTop: 13,
              background: C.bgCanvas,
              borderRadius: 12,
              padding: "12px 13px",
              border: `1px solid ${C.divider}`,
            }}
          >
            <p
              style={{
                margin: "0 0 7px",
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: C.teal700,
              }}
            >
              {language === "hi" ? "सारांश" : "REDACTED SUMMARY"}
            </p>
            {summaryBusy && !summaryText ? (
              <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>
                {language === "hi"
                  ? "सारांश तैयार हो रहा है…"
                  : "Preparing your summary…"}
              </p>
            ) : (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: C.textPrimary,
                  whiteSpace: "pre-wrap",
                }}
              >
                {summaryText ||
                  (language === "hi"
                    ? "सारांश उपलब्ध नहीं है।"
                    : "No summary is available yet.")}
              </p>
            )}
            {summaryError && (
              <p
                style={{
                  margin: "9px 0 0",
                  fontSize: 10,
                  lineHeight: 1.45,
                  color: C.textSecondary,
                }}
              >
                {summaryError}
              </p>
            )}
            <button
              type="button"
              onClick={downloadSummary}
              disabled={!summaryText}
              style={{
                marginTop: 10,
                border: `1px solid ${C.teal600}`,
                borderRadius: 18,
                padding: "7px 12px",
                background: summaryText ? C.white : C.bgCanvas,
                color: summaryText ? C.teal700 : C.textSecondary,
                fontSize: 11,
                fontWeight: 700,
                cursor: summaryText ? "pointer" : "not-allowed",
              }}
            >
              {language === "hi" ? "सारांश डाउनलोड करें" : "Download summary"}
            </button>
            {summaryBusy && summaryText && (
              <p
                style={{
                  margin: "9px 0 0",
                  fontSize: 10,
                  color: C.textSecondary,
                }}
              >
                {language === "hi" ? "अद्यतन हो रहा है…" : "Refreshing…"}
              </p>
            )}
          </div>
          <p
            style={{
              margin: "9px 0 0",
              fontSize: 10,
              lineHeight: 1.45,
              color: C.textSecondary,
            }}
          >
            Personal names, phone numbers, account numbers and links are hidden
            from this summary.
            {localLanguages[language]
              ? " This summary was built privately on your device."
              : ""}
          </p>
        </div>

        <div
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
              letterSpacing: "0.08em",
              color: C.teal700,
            }}
          >
            DOWNLOAD COMPLETE REPORT
          </p>
          <p
            style={{
              margin: "0 0 11px",
              fontSize: 11,
              color: C.textSecondary,
              lineHeight: 1.5,
            }}
          >
            {language === "hi"
              ? "इसमें सभी फ़ील्ड, घटना का विस्तृत विवरण, साक्ष्य और बिना संपादित तकनीकी जानकारी शामिल है।"
              : "Includes every field, the detailed incident narrative, evidence text, and unredacted technical details."}
          </p>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
          >
            {([
              [
                "json",
                "JSON",
                language === "hi" ? "संरचित डेटा" : "Structured data",
              ],
              [
                "docx",
                "DOCX",
                language === "hi" ? "वर्ड दस्तावेज़" : "Word document",
              ],
              ["pdf", "PDF", language === "hi" ? "प्रिंट-रेडी" : "Print-ready"],
              ["txt", "TXT", language === "hi" ? "सादा टेक्स्ट" : "Plain text"],
            ] as const).map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                onClick={() => void download(value)}
                disabled={downloadBusy !== null}
                style={{
                  border: `1px solid ${C.divider}`,
                  background: C.bgCanvas,
                  borderRadius: 11,
                  padding: "10px",
                  cursor: downloadBusy !== null ? "wait" : "pointer",
                  textAlign: "left",
                  opacity:
                    downloadBusy !== null && downloadBusy !== value ? 0.55 : 1,
                }}
              >
                <strong
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: C.textPrimary,
                  }}
                >
                  {downloadBusy === value ? `${label}…` : label}
                </strong>
                <span style={{ fontSize: 9.5, color: C.textSecondary }}>
                  {description}
                </span>
              </button>
            ))}
          </div>
          {downloadError && (
            <p
              role="alert"
              style={{
                margin: "9px 0 0",
                fontSize: 10,
                lineHeight: 1.45,
                color: C.danger,
              }}
            >
              {downloadError}
            </p>
          )}
          {downloadNotice && (
            <p
              role="status"
              style={{
                margin: "9px 0 0",
                fontSize: 10,
                lineHeight: 1.45,
                color: C.teal700,
              }}
            >
              {downloadNotice}
            </p>
          )}
        </div>

        <div
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
              letterSpacing: "0.08em",
              color: C.teal700,
            }}
          >
            SHARE AWARENESS
          </p>
          <p
            style={{
              margin: "0 0 11px",
              fontSize: 11,
              color: C.textSecondary,
              lineHeight: 1.5,
            }}
          >
            {language === "hi"
              ? "एक प्लेटफ़ॉर्म चुनें। Cyber Sathi आपके सारांश से एक सुरक्षित पोस्ट बनाएगा।"
              : "Pick a platform. Cyber Sathi will create a safe post from your summary."}
          </p>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
          >
            {platforms.map((item) => {
              const active = item.id === platform
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPlatform(item.id)
                    setDraft(null)
                    resetPoster()
                    setNotice("")
                    setPostError("")
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    border: `1px solid ${active ? C.teal600 : C.divider}`,
                    background: active ? C.mint100 : C.white,
                    borderRadius: 11,
                    padding: "10px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      background: active ? C.teal600 : C.bgCanvas,
                      color: active ? C.white : C.teal700,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {item.badge}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.textPrimary,
                    }}
                  >
                    {item.name}
                  </span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => void createPost()}
            disabled={postBusy || !summaryText}
            style={{
              width: "100%",
              marginTop: 12,
              border: 0,
              borderRadius: 24,
              padding: "12px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: postBusy || !summaryText ? "not-allowed" : "pointer",
              background: postBusy || !summaryText ? "#9AA6A3" : C.teal600,
              color: C.white,
            }}
          >
            {postBusy
              ? language === "hi"
                ? "पोस्ट बन रही है…"
                : "Creating post…"
              : language === "hi"
                ? `${selectedPlatform.name} के लिए पोस्ट बनाएं`
                : `Create post for ${selectedPlatform.name}`}
          </button>

          {postError && (
            <p
              style={{
                margin: "9px 0 0",
                fontSize: 10,
                lineHeight: 1.45,
                color: C.textSecondary,
              }}
            >
              {postError}
            </p>
          )}

          {draft && (
            <div
              style={{
                marginTop: 12,
                border: `1px solid ${C.divider}`,
                borderRadius: 12,
                padding: 12,
                background: C.bgCanvas,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 8,
                }}
              >
                <strong style={{ fontSize: 11, color: C.textPrimary }}>
                  {selectedPlatform.name} post
                </strong>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: C.teal700,
                    background: C.mint100,
                    borderRadius: 12,
                    padding: "3px 7px",
                  }}
                >
                  AI poster included
                </span>
              </div>
              {posterReady && posterImageUrl && (
                <div
                  style={{
                    width: "100%",
                    height: 190,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: `1px solid ${C.divider}`,
                    background: C.white,
                    margin: "8px 0 6px",
                  }}
                >
                  <img
                    src={posterImageUrl}
                    alt="Awareness poster"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  {posterBusy && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        background: "rgba(255,255,255,0.7)",
                        zIndex: 2,
                      }}
                    >
                      <span style={{ fontSize: 10, color: C.teal700 }}>
                        {language === "hi"
                          ? "पोस्टर बन रहा है…"
                          : "Building poster…"}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {posterError && (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 10,
                    lineHeight: 1.45,
                    color: C.danger,
                  }}
                >
                  {posterError}
                </p>
              )}
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: C.textPrimary,
                  whiteSpace: "pre-wrap",
                }}
              >
                {draft.caption}
              </p>
              {draft.hashtags.length > 0 && (
                <p
                  style={{
                    margin: "7px 0 0",
                    fontSize: 11,
                    lineHeight: 1.45,
                    color: C.teal700,
                  }}
                >
                  {draft.hashtags.join(" ")}
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 7,
                  marginTop: 11,
                }}
              >
                <button
                  type="button"
                  onClick={() => void copyDraft()}
                  style={{
                    border: `1px solid ${C.divider}`,
                    background: C.white,
                    color: C.teal700,
                    borderRadius: 18,
                    padding: "7px 11px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Copy
                </button>
                {posterReady && (
                  <button
                    type="button"
                    onClick={() => void downloadPost()}
                    disabled={downloadBusy === "poster"}
                    style={{
                      border: `1px solid ${C.divider}`,
                      background: C.white,
                      color: C.teal700,
                      borderRadius: 18,
                      padding: "7px 11px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: downloadBusy === "poster" ? "wait" : "pointer",
                    }}
                  >
                    {downloadBusy === "poster" ? "Saving…" : "Download post"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void postToPlatform()}
                  disabled={shareBusy || !posterReady || !posterBlob}
                  style={{
                    border: 0,
                    background:
                      shareBusy || !posterReady || !posterBlob
                        ? "#9AA6A3"
                        : C.teal600,
                    color: C.white,
                    borderRadius: 18,
                    padding: "7px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor:
                      shareBusy || !posterReady || !posterBlob
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {shareBusy
                    ? "Opening share…"
                    : `Share on ${selectedPlatform.name} ↗`}
                </button>
              </div>
              {posterDownloadError && (
                <p
                  role="alert"
                  style={{
                    margin: "9px 0 0",
                    fontSize: 10,
                    lineHeight: 1.45,
                    color: C.danger,
                  }}
                >
                  {posterDownloadError}
                </p>
              )}
              {posterDownloadNotice && (
                <p
                  role="status"
                  style={{
                    margin: "9px 0 0",
                    fontSize: 10,
                    lineHeight: 1.45,
                    color: C.teal700,
                  }}
                >
                  {posterDownloadNotice}
                </p>
              )}
            </div>
          )}

          {notice && (
            <p
              role="status"
              style={{
                margin: "10px 0 0",
                fontSize: 10,
                lineHeight: 1.45,
                color: C.teal700,
                background: C.mint100,
                borderRadius: 9,
                padding: "8px 10px",
              }}
            >
              {notice}
            </p>
          )}
        </div>

        <div style={{ marginTop: 2 }}>
          <button
            type="button"
            onClick={onBackToConversation}
            style={{
              width: "100%",
              border: `1px solid ${C.teal600}`,
              background: C.white,
              color: C.teal700,
              borderRadius: 24,
              padding: "12px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Return to conversation
          </button>
          <button
            type="button"
            onClick={onViewCase}
            style={{
              width: "100%",
              border: `1px solid ${C.teal600}`,
              background: C.white,
              color: C.teal700,
              borderRadius: 24,
              padding: "12px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            View saved case
          </button>
          <button
            type="button"
            onClick={onHome}
            style={{
              width: "100%",
              border: 0,
              background: "transparent",
              color: C.textSecondary,
              padding: "12px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Return to Home
          </button>
        </div>
      </div>
    </div>
  )
}
