// ─── Screen type enum
type Screen = "loading" | "auth" | "onboard-profile" | "home" | "agent-chat" | "review-report" | "report-summary" | "success" | "my-cases" | "case-status" | "defend" | "profile" | "filing-preview"

// Add loading to the activeCaseStorageKey and lastScreenStorageKey if needed
import { useState, useEffect, useRef } from "react"
import { supabase } from "./lib/supabase"
import { apiRequest } from "./lib/api"
import type { ChatMessage, ExtractedCaseData } from "./lib/ai"
import {
  generateSathiSpeech,
  mergeSathiFactsIntoReport,
  resumeSathiSession,
  saveSathiTranscript,
  sendSathiTurn,
  sathiFactsToReport,
  startSathiSession,
  type SathiFacts,
  type SathiResponse,
} from "./lib/sathi"
import {
  fetchUserCases,
  isCaseOpen,
  caseStatusLabel,
  saveReviewedCase,
  confirmAndCompileCase,
  type CaseRecord,
} from "./lib/cases"
import { uploadCaseEvidence } from "./lib/evidence"
import { ensureProfile } from "./lib/profiles"
import {
  getMicrophoneErrorMessage,
  requestMicrophoneAccess,
} from "./lib/microphone"
import { BLAND_AGENT_ID, useBlandVoiceAgent } from "./lib/bland-voice"
import ReportSummaryScreen from "./components/ReportSummaryScreen"
import QuickOnboardScreen from "./components/QuickOnboardScreen"
import ProfileScreen from "./components/ProfileScreen"

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "home" | "my-cases" | "defend" | "profile"

// ─── Colors (Theme tokens) ────────────────────────────────────────────────────
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

const activeCaseStorageKey = (userId: string) =>
  `cyber-sathi:active-case:${userId}`

const lastReportStorageKey = (userId: string) =>
  `cyber-sathi:last-report:${userId}`

const lastScreenStorageKey = "cyber-sathi:last-screen"

const evidenceFieldLabels: Record<string, string> = {
  amount: "Amount",
  currency: "Currency",
  incident_datetime: "Date/time",
  bank_or_app: "Bank or app",
  provisional_fraud_category: "Fraud type",
  suspect_phone: "Suspect phone",
  upi_id: "UPI ID",
  url: "Link",
  transaction_id: "Transaction/UTR",
  victim_phone: "Your phone",
  caller_name: "Caller name",
  description: "What happened",
  sms_content: "Message text",
  uncertainty: "Unclear",
}

function summarizeExtractedEvidence(entities: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [key, label] of Object.entries(evidenceFieldLabels)) {
    const value = entities[key]
    if (value === null || value === undefined || value === "") continue
    const display = Array.isArray(value) ? value.join(", ") : String(value)
    const trimmed = display.replace(/\s+/g, " ").trim()
    if (!trimmed) continue
    lines.push(
      `• ${label}: ${trimmed.slice(0, 180)}${trimmed.length > 180 ? "…" : ""}`,
    )
  }
  return lines.join("\n")
}

const restorableScreens: Screen[] = [
  "home",
  "my-cases",
  "defend",
  "profile",
  "agent-chat",
  "review-report",
  "report-summary",
  "case-status",
]

function readLastScreen(): Screen | null {
  try {
    const value = window.sessionStorage.getItem(lastScreenStorageKey)
    return value && restorableScreens.includes(value as Screen)
      ? value as Screen
      : null
  } catch {
    return null
  }
}

function caseRecordToReport(record: CaseRecord): ExtractedCaseData {
  return {
    category: record.category,
    amount: record.amount,
    suspectPhone: record.suspectPhone,
    suspectUpi: record.suspectUpi,
    suspectDetails: record.suspectDetails,
    platform: record.platform,
    incidentDate: record.incidentDate,
    summary: record.summary,
    complaintNarrative: record.complaintNarrative,
    actionRequested: record.actionRequested,
    isComplete: !isCaseOpen(record),
  }
}

function caseSnapshotToReport(
  snapshot: SathiResponse["caseSnapshot"],
  fallback: ExtractedCaseData,
): ExtractedCaseData {
  const fields = snapshot?.structuredFields
  if (!fields) return fallback
  const candidates =
    typeof fields.extractedCandidates === "object" &&
    fields.extractedCandidates !== null &&
    !Array.isArray(fields.extractedCandidates)
      ? fields.extractedCandidates as Record<string, unknown>
      : {}
  const value = (key: string) => {
    const candidate = fields[key] ?? candidates[key]
    return typeof candidate === "string" || typeof candidate === "number"
      ? String(candidate)
      : ""
  }
  return {
    ...fallback,
    category: value("category") || fallback.category,
    amount: value("amount") || fallback.amount,
    suspectPhone:
      value("suspectPhone") ||
      value("suspect_phone") ||
      value("phone") ||
      fallback.suspectPhone,
    suspectUpi:
      value("suspectUpi") ||
      value("upi_id") ||
      value("upiId") ||
      fallback.suspectUpi,
    suspectDetails:
      value("suspectDetails") || value("url") || fallback.suspectDetails,
    platform:
      value("platform") ||
      value("bank_or_app") ||
      value("bankOrApp") ||
      fallback.platform,
    incidentDate:
      value("incidentDate") ||
      value("incident_datetime") ||
      value("date") ||
      fallback.incidentDate,
    summary: value("summary") || value("description") || fallback.summary,
    complaintNarrative: value("description") || fallback.complaintNarrative,
  }
}

function conversationToChatMessages(
  conversation: SathiResponse["conversation"] = [],
): ChatMessage[] {
  return conversation.flatMap((message, index) =>
    transcriptToChatMessages(
      message.text,
      message.role === "model" ? "agent" : "user",
      `restored-${index}`,
    ),
  )
}

function transcriptToChatMessages(
  transcript: string,
  fallbackSender: ChatMessage["sender"],
  idPrefix: string,
): ChatMessage[] {
  const markers = [
    ...transcript.matchAll(
      /(?:^|\n)\s*(agent|assistant|sathi|user|victim)\s*:\s*/gi,
    ),
  ]

  if (!markers.length) {
    return transcript.trim()
      ? [
          {
            id: `${idPrefix}-0`,
            sender: fallbackSender,
            text: transcript.trim(),
            timestamp: "Earlier",
          },
        ]
      : []
  }

  return markers.flatMap((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length
    const end =
      index + 1 < markers.length
        ? (markers[index + 1].index ?? transcript.length)
        : transcript.length
    const text = transcript.slice(start, end).trim()
    if (!text) return []

    return [
      {
        id: `${idPrefix}-${index}`,
        sender: /^(agent|assistant|sathi)$/i.test(marker[1])
          ? "agent" as const
          : "user" as const,
        text,
        timestamp: "Earlier",
      },
    ]
  })
}

// ─── Main Application ─────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading")
  const [activeTab, setActiveTab] = useState<Tab>("home")
  const [language, setLanguage] = useState<"en" | "hi" | "bn">("en")
  const [sessionUser, setSessionUser] = useState<any>(null)
  const [sathiCaseId, setSathiCaseId] = useState<string | null>(null)
  const [sathiFacts, setSathiFacts] = useState<SathiFacts | null>(null)

  // Real User Profile
  const [userProfile, setUserProfile] = useState({
    displayName: "",
    phone: "",
    email: "",
    stateDistrict: "",
    language: "en",
  })

  // Real Active Case Flow State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [extractedData, setExtractedData] = useState<ExtractedCaseData>({
    category: "",
    amount: "",
    suspectPhone: "",
    suspectUpi: "",
    suspectDetails: "",
    platform: "",
    incidentDate: "",
    summary: "",
    complaintNarrative: "",
    actionRequested: "",
    isComplete: false,
  })

  // Real Case Records from Database
  const [userCases, setUserCases] = useState<CaseRecord[]>([])
  const [casesLoading, setCasesLoading] = useState(false)
  const [casesError, setCasesError] = useState("")
  const [activeCase, setActiveCase] = useState<CaseRecord | null>(null)
  const [submittedCase, setSubmittedCase] = useState<CaseRecord | null>(null)
  const restoringActiveCaseRef = useRef(false)
  // Tracks which user session has already been bootstrapped. Supabase replays
  // SIGNED_IN when a tab becomes visible again, and that must not re-run the
  // login flow (which navigates back to Home).
  const establishedUserIdRef = useRef<string | null>(null)
  // Latest screen, so async auth callbacks can avoid clobbering an active flow.
  const screenRef = useRef<Screen>("loading")

  // Keep the screen ref truthful and remember the last meaningful screen.
  // Some browser workspaces unload/reload a tab when you switch away; this lets
  // the app resume the review screen instead of dropping back to Home.
  useEffect(() => {
    screenRef.current = screen
    if (screen === "loading" || screen === "auth" || screen === "success")
      return
    try {
      window.sessionStorage.setItem(lastScreenStorageKey, screen)
    } catch {
      // Session storage can be unavailable; navigation still works without it.
    }
  }, [screen])

  // 1. Check real Supabase Authentication session on boot
  useEffect(() => {
    async function initAuth() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()
        if (sessionError) {
          console.error("Supabase session error:", sessionError.message)
          establishedUserIdRef.current = null
          screenRef.current = "auth"
          setScreen("auth")
          return
        }
        if (session?.user) {
          console.log("Auth session found, user ID:", session.user.id)
          await handleSessionEstablished(session.user)
        } else {
          console.log("No auth session, showing auth screen")
          establishedUserIdRef.current = null
          screenRef.current = "auth"
          setScreen("auth")
        }
      } catch (err) {
        console.error(
          "Auth check failed:",
          err instanceof Error ? err.message : err,
        )
        establishedUserIdRef.current = null
        screenRef.current = "auth"
        setScreen("auth")
      }
    }

    void initAuth()

    // Listen to real-time auth changes.
    //
    // Supabase fires SIGNED_IN again from _recoverAndRefresh() every time the
    // tab becomes visible (switching browser tabs, OS windows or browser
    // workspaces). Treating that as a new login used to run
    // handleSessionEstablished(), which navigates to Home and discards the
    // in-progress chat. Bootstrap the session once per signed-in user instead.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setSessionUser(session.user)
        if (event === "SIGNED_IN") void handleSessionEstablished(session.user)
        return
      }
      if (event === "SIGNED_OUT") {
        establishedUserIdRef.current = null
        screenRef.current = "auth"
        try {
          window.sessionStorage.removeItem(lastScreenStorageKey)
        } catch {
          // Ignore storage failures.
        }
        setSessionUser(null)
        setScreen("auth")
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function handleSessionEstablished(user: any) {
    // Idempotent per user. Supabase re-emits SIGNED_IN on tab focus, and the
    // auth-ended callback can arrive at the same time as the explicit sign-in
    // callback; neither may restart the flow or navigate away.
    if (establishedUserIdRef.current === user.id) return
    establishedUserIdRef.current = user.id

    setSessionUser(user)
    const meta = user.user_metadata || {}
    const phone = meta.phone_e164 || meta.phone || ""
    const loc = meta.state_district || meta.state || ""
    const lang = meta.preferred_language as "en" | "hi" | "bn" || "en"

    let name =
      meta.full_name || meta.displayName || user.email?.split("@")[0] || ""

    try {
      const profile = await ensureProfile(user)
      if (profile.full_name) {
        name = profile.full_name
      }
    } catch (err) {
      console.warn("Could not load or create profile row:", err)
    }

    setUserProfile({
      displayName: name,
      phone,
      email: user.email || "",
      stateDistrict: loc,
      language: lang,
    })
    setLanguage(lang)

    void loadCases(user.id)

    // Only advance a session that is still booting/signing in. If the user is
    // already in a report, keep the current screen untouched.
    const isBootstrapping =
      screenRef.current === "loading" || screenRef.current === "auth"

    if (!name || name === user.email?.split("@")[0]) {
      if (isBootstrapping) {
        screenRef.current = "onboard-profile"
        setScreen("onboard-profile")
      }
      return
    }

    if (!isBootstrapping) return

    // A real page reload (some browser workspaces discard/reload tabs when you
    // switch away) should resume where the user left off instead of Home.
    const savedScreen = readLastScreen()

    if (savedScreen === "report-summary") {
      const reportId = window.localStorage.getItem(
        lastReportStorageKey(user.id),
      )
      if (reportId) {
        try {
          const records = await fetchUserCases()
          const report = records.find((record) => record.id === reportId)
          if (report) {
            setSubmittedCase(report)
            setActiveCase(report)
            setExtractedData(caseRecordToReport(report))
            screenRef.current = "report-summary"
            setScreen("report-summary")
            return
          }
        } catch (error) {
          console.warn("Could not restore the saved report:", error)
        }
      }
    }

    if (
      savedScreen === "my-cases" ||
      savedScreen === "defend" ||
      savedScreen === "profile"
    ) {
      screenRef.current = savedScreen
      setScreen(savedScreen)
      return
    }

    screenRef.current = "home"
    setScreen("home")
    void restoreActiveReport(user.id, lang, savedScreen)
  }

  async function restoreActiveReport(
    userId: string,
    lang: "en" | "hi" | "bn",
    resumeScreen: Screen | null = null,
  ) {
    if (restoringActiveCaseRef.current) return
    const caseId = window.localStorage.getItem(activeCaseStorageKey(userId))
    if (!caseId) return
    restoringActiveCaseRef.current = true
    try {
      const records = await fetchUserCases()
      const savedCase = records.find((record) => record.id === caseId)
      if (
        savedCase &&
        (isCaseOpen(savedCase) ||
          (savedCase.reviewed && resumeScreen === "agent-chat"))
      ) {
        await continueReport(savedCase, lang)
        if (resumeScreen === "review-report") go("review-report")
        else if (resumeScreen === "case-status") go("case-status")
      } else {
        window.localStorage.removeItem(activeCaseStorageKey(userId))
      }
    } catch (error) {
      // Keep the key: an offline launch should resume once connectivity returns.
      console.warn("Could not restore the active report:", error)
    } finally {
      restoringActiveCaseRef.current = false
    }
  }

  async function loadCases(userId: string) {
    if (!userId) return
    setCasesLoading(true)
    setCasesError("")
    try {
      const records = await fetchUserCases()
      setUserCases(records)
    } catch (err) {
      setCasesError(
        err instanceof Error
          ? err.message
          : "Could not load cases from the API.",
      )
    } finally {
      setCasesLoading(false)
    }
  }

  // Navigation helpers
  const go = (s: Screen) => setScreen(s)

  const switchTab = (tab: Tab) => {
    setActiveTab(tab)
    if (tab === "home") go("home")
    else if (tab === "my-cases") {
      if (sessionUser?.id) void loadCases(sessionUser.id)
      go("my-cases")
    } else if (tab === "defend") go("defend")
    else if (tab === "profile") go("profile")
  }

  const [autoStartMic, setAutoStartMic] = useState(false)

  const startNewReport = async (initialTopic?: string, enableMic = false) => {
    setSathiCaseId(null)
    setSathiFacts(null)
    const greetingText = initialTopic
      ? `Hello. I see you want to report an incident regarding "${initialTopic}". I am Cyber Sathi. Please describe what happened, when it occurred, and if any money was transferred.`
      : language === "hi"
        ? "नमस्ते, मैं साइबर साथी हूँ। कृपया बताएं कि आपके साथ क्या धोखाधड़ी हुई है? यदि हाल ही में पैसा कटा है, तो तुरंत 1930 पर भी कॉल करें।"
        : language === "bn"
          ? "নমস্কার, আমি সাইবার সাথী। আপনার সাথে কী ধরনের সাইবার জালিয়াতি হয়েছে তা বলুন।"
          : "Hello, I am Cyber Sathi, your cybercrime response assistant. Please tell me what happened in your own words. If you recently transferred money, please also call 1930 immediately."

    setChatMessages([])

    setExtractedData({
      category: initialTopic || "",
      amount: "",
      suspectPhone: "",
      suspectUpi: "",
      suspectDetails: "",
      platform: "",
      incidentDate: "",
      summary: "",
      complaintNarrative: "",
      actionRequested: "",
      isComplete: false,
    })

    setAutoStartMic(enableMic)
    go("agent-chat")
    try {
      const session = await startSathiSession(language)
      setSathiCaseId(session.caseId)
      if (sessionUser?.id)
        window.localStorage.setItem(
          activeCaseStorageKey(sessionUser.id),
          session.caseId,
        )
      setSathiFacts(session.facts)
      setExtractedData(sathiFactsToReport(session.facts))
      setChatMessages([
        {
          id: `msg-welcome-${Date.now()}`,
          sender: "agent",
          text: initialTopic
            ? `Let's talk about ${initialTopic}. ${session.reply ?? greetingText}`
            : (session.reply ?? greetingText),
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ])
    } catch (error) {
      setChatMessages([
        {
          id: `msg-error-${Date.now()}`,
          sender: "agent",
          text:
            error instanceof Error
              ? error.message
              : "Sathi is unavailable right now. Please try again.",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ])
    }
  }

  const continueReport = async (
    caseRecord: CaseRecord,
    resumeLanguage: "en" | "hi" | "bn" = language,
  ) => {
    setActiveCase(caseRecord)
    setAutoStartMic(false)
    setSathiCaseId(caseRecord.id)
    if (sessionUser?.id)
      window.localStorage.setItem(
        activeCaseStorageKey(sessionUser.id),
        caseRecord.id,
      )
    setSathiFacts(null)
    setExtractedData(caseRecordToReport(caseRecord))
    setChatMessages([
      {
        id: `restoring-${Date.now()}`,
        sender: "agent",
        text: "Restoring your saved report…",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ])
    go("agent-chat")

    try {
      const session = await resumeSathiSession(caseRecord.id, resumeLanguage)
      const restoredMessages = conversationToChatMessages(session.conversation)
      setSathiCaseId(session.caseId)
      setSathiFacts(session.facts)
      setExtractedData((current) =>
        mergeSathiFactsIntoReport(
          caseSnapshotToReport(session.caseSnapshot, current),
          session.facts,
        ),
      )
      setChatMessages(
        restoredMessages.length
          ? restoredMessages
          : [
              ...transcriptToChatMessages(
                caseRecord.complaintNarrative || caseRecord.summary,
                "user",
                `saved-statement-${Date.now()}`,
              ),
              {
                id: `resumed-${Date.now()}`,
                sender: "agent" as const,
                text:
                  session.reply ??
                  "Your saved report is ready. What would you like to add or correct?",
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ],
      )
    } catch (error) {
      setChatMessages([
        {
          id: `resume-error-${Date.now()}`,
          sender: "agent",
          text:
            error instanceof Error
              ? `We could not restore this report: ${error.message}`
              : "We could not restore this report. Please try again.",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ])
    }
  }

  const handleCaseSubmitted = async (caseRec: CaseRecord) => {
    setSubmittedCase(caseRec)
    setActiveCase(caseRec)
    setUserCases((prev) => [
      caseRec,
      ...prev.filter((record) => record.id !== caseRec.id),
    ])
    if (sessionUser?.id) {
      window.localStorage.removeItem(activeCaseStorageKey(sessionUser.id))
      window.localStorage.setItem(
        lastReportStorageKey(sessionUser.id),
        caseRec.id,
      )
    }
    try {
      window.sessionStorage.removeItem(lastScreenStorageKey)
    } catch {
      // Ignore storage failures.
    }
    // Send the user straight to the saved bilingual summary and awareness-post
    // screen instead of stopping on a dead-end success card.
    go("report-summary")
  }

  const summaryCase = submittedCase ?? activeCase
  const showTabBar = ["home", "my-cases", "defend", "profile"].includes(screen)

  return (
    <div
      className="app-canvas"
      style={{
        minHeight: "100dvh",
        background: "#132323",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Noto Sans', 'Noto Sans Devanagari', sans-serif",
      }}
    >
      {/* Mobile viewport frame */}
      <div
        className="app-device"
        style={{
          width: 390,
          height: "min(844px, 100dvh)",
          maxHeight: "100dvh",
          minHeight: 0,
          background: C.bgCanvas,
          borderRadius: 44,
          overflow: "hidden",
          boxShadow:
            "0 40px 120px rgba(0,0,0,0.6), 0 0 0 12px #1a1a1a, 0 0 0 14px #333",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Screen Routing */}
        <div
          className="app-screen-host"
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {screen === "auth" && (
            <RealAuthScreen
              onAuthenticated={(user) => handleSessionEstablished(user)}
              language={language}
            />
          )}

          {screen === "onboard-profile" && (
            <QuickOnboardScreen onDone={() => go("home")} language={language} />
          )}

          {screen === "home" && (
            <HomeScreen
              onStartReport={startNewReport}
              onViewCase={(c) => {
                setActiveCase(c)
                go("case-status")
              }}
              recentCases={userCases}
              language={language}
            />
          )}

          {screen === "agent-chat" && (
            <AgentChatScreen
              messages={chatMessages}
              setMessages={setChatMessages}
              extractedData={extractedData}
              setExtractedData={setExtractedData}
              caseId={sathiCaseId}
              previousFacts={sathiFacts}
              setPreviousFacts={setSathiFacts}
              language={language}
              autoStartMic={autoStartMic}
              reportFinalized={Boolean(
                activeCase?.id === sathiCaseId && activeCase.reviewed,
              )}
              onOpenFinalReport={() => {
                const report =
                  activeCase?.id === sathiCaseId ? activeCase : submittedCase
                if (!report) return
                setSubmittedCase(report)
                go("report-summary")
              }}
              onProceedToReview={() => go("review-report")}
              onBack={() => go("home")}
            />
          )}

          {screen === "review-report" && (
            <ReviewReportScreen
              extractedData={extractedData}
              setExtractedData={setExtractedData}
              userProfile={userProfile}
              onContinueChat={() => go("agent-chat")}
              onSubmit={async () => {
                if (!sessionUser?.id) {
                  window.alert("Please sign in to save this report.")
                  return
                }
                if (!sathiCaseId) {
                  throw new Error(
                    "There is no active case to save. Start a new report and try again.",
                  )
                }
                const caseRecord = await saveReviewedCase(
                  sathiCaseId,
                  extractedData,
                  userProfile,
                )
                await confirmAndCompileCase(sathiCaseId)
                await handleCaseSubmitted({
                  ...caseRecord,
                  status: "REVIEWED",
                  reviewed: true,
                })
              }}
              onBack={() => go("agent-chat")}
            />
          )}

          {screen === "report-summary" &&
            (summaryCase ? (
              <ReportSummaryScreen
                key={summaryCase.id}
                caseRecord={summaryCase}
                preferredLanguage={language}
                onViewCase={() => {
                  setActiveCase(summaryCase)
                  go("case-status")
                }}
                onHome={() => {
                  setActiveTab("home")
                  go("home")
                }}
                onBackToConversation={() => {
                  void continueReport(summaryCase)
                }}
                onFileCase={() => {
                  setActiveCase(summaryCase)
                  go("filing-preview")
                }}
              />
            ) : (
              <SuccessScreen
                caseRecord={submittedCase}
                onTrack={() => go("my-cases")}
                onHome={() => {
                  setActiveTab("home")
                  go("home")
                }}
              />
            ))}

          {screen === "filing-preview" && activeCase && (
            <FilingPreviewScreen
              caseRecord={activeCase}
              onBack={() => go("report-summary")}
              onHome={() => {
                setActiveTab("home")
                go("home")
              }}
            />
          )}

          {screen === "success" && (
            <SuccessScreen
              caseRecord={submittedCase}
              onTrack={() => {
                setActiveCase(submittedCase)
                go("case-status")
              }}
              onHome={() => {
                setActiveTab("home")
                go("home")
              }}
            />
          )}

          {screen === "my-cases" && (
            <MyCasesScreen
              cases={userCases}
              loading={casesLoading}
              error={casesError}
              onRetry={() => {
                if (sessionUser?.id) void loadCases(sessionUser.id)
              }}
              onSelectCase={(c) => {
                setActiveCase(c)
                go("case-status")
              }}
              onContinueCase={(c) => void continueReport(c)}
              onNewReport={() => startNewReport()}
            />
          )}

          {screen === "case-status" && (
            <CaseStatusScreen
              caseRecord={activeCase}
              onBack={() => switchTab("my-cases")}
              onContinue={(c) => void continueReport(c)}
              onSummary={(c) => {
                setSubmittedCase(c)
                go("report-summary")
              }}
            />
          )}

          {screen === "defend" && (
            <DefendScreen onStartReport={() => startNewReport()} />
          )}

          {screen === "profile" && (
            <ProfileScreen
              language={language}
              onLogout={async () => {
                await supabase.auth.signOut()
                setSessionUser(null)
                setUserProfile({
                  displayName: "",
                  phone: "",
                  email: "",
                  stateDistrict: "",
                  language: "en",
                })
                setUserCases([])
                go("auth")
              }}
            />
          )}
        </div>

        {/* Bottom Tab Bar */}
        {showTabBar && <TabBar active={activeTab} onSwitch={switchTab} />}

        {/* Home gesture bar */}
        <div
          style={{
            height: 24,
            flexShrink: 0,
            background: showTabBar
              ? C.white
              : screen === "agent-chat"
                ? C.teal900
                : C.bgCanvas,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 134,
              height: 5,
              background: showTabBar ? "#000" : "rgba(255,255,255,0.3)",
              borderRadius: 3,
              opacity: 0.2,
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Real Authentication Screen ───────────────────────────────────────────────

const getEmailConfirmationRedirect = () =>
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? window.location.origin
    : "https://cyber-sathi-frontend.onrender.com/"

function RealAuthScreen({
  onAuthenticated,
  language,
}: {
  onAuthenticated: (user: any) => void
  language: string
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [confirmationNeeded, setConfirmationNeeded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    const callback = new URLSearchParams(window.location.hash.slice(1))
    if (callback.get("error_code") === "otp_expired") {
      setMode("signin")
      setConfirmationNeeded(true)
      setError("")
      setNotice(
        "This confirmation link has expired or was already used. Request a fresh link below.",
      )
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      )
    }
  }, [])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setNotice("")
    setBusy(true)

    try {
      const trimmedEmail = email.trim()
      if (!trimmedEmail || !trimmedEmail.includes("@")) {
        throw new Error("Please enter a valid email address.")
      }
      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters.")
      }

      if (mode === "signup") {
        const cleanPhone = phone.trim()
          ? phone.startsWith("+91")
            ? phone.trim()
            : `+91 ${phone.replace(/\D/g, "")}`
          : ""
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: getEmailConfirmationRedirect(),
            data: {
              full_name: name.trim() || trimmedEmail.split("@")[0],
              displayName: name.trim() || trimmedEmail.split("@")[0],
              phone_e164: cleanPhone,
              preferred_language: language,
            },
          },
        })

        if (signUpErr) throw signUpErr

        if (data.session?.user) {
          onAuthenticated(data.session.user)
        } else if (data.user) {
          setConfirmationNeeded(true)
          setNotice(
            "Account created. Check your inbox and confirm your email before signing in.",
          )
          setMode("signin")
        }
      } else {
        // Sign In
        const { data, error: signInErr } =
          await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          })

        if (signInErr) throw signInErr

        if (data.session?.user) {
          onAuthenticated(data.session.user)
        } else {
          throw new Error(
            "Could not create session. Please check your credentials.",
          )
        }
      }
    } catch (cause: any) {
      setError(cause?.message || "Authentication error occurred.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        flex: 1,
        background: C.teal900,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "28px 24px 20px", textAlign: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: C.mint100,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            marginBottom: 12,
          }}
        >
          🛡️
        </div>
        <h1
          style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: 24,
            fontWeight: 700,
            color: C.white,
            margin: "0 0 4px",
          }}
        >
          CyberSathi
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: 0 }}>
          Official Cyber Crime Intake & Response Portal
        </p>
      </div>

      <div
        style={{
          flex: 1,
          background: C.white,
          borderRadius: "32px 32px 0 0",
          padding: "24px 20px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Mode Toggle */}
        <div
          style={{
            display: "flex",
            background: C.bgCanvas,
            borderRadius: 12,
            padding: 4,
            marginBottom: 20,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode("signin")
              setError("")
              setNotice("")
            }}
            style={{
              flex: 1,
              padding: "10px 0",
              border: 0,
              borderRadius: 8,
              background: mode === "signin" ? C.white : "transparent",
              color: mode === "signin" ? C.teal900 : C.textSecondary,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              boxShadow:
                mode === "signin" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup")
              setError("")
              setNotice("")
            }}
            style={{
              flex: 1,
              padding: "10px 0",
              border: 0,
              borderRadius: 8,
              background: mode === "signup" ? C.white : "transparent",
              color: mode === "signup" ? C.teal900 : C.textSecondary,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              boxShadow:
                mode === "signup" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            }}
          >
            Create Account
          </button>
        </div>

        <form
          onSubmit={handleAuth}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          {mode === "signup" && (
            <>
              <div>
                <label
                  className="cy-label"
                  style={labelStyle}
                  htmlFor="auth-name"
                >
                  Full Name (Legal Name)
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Sharma"
                  className="cy-input"
                  style={inputStyle}
                />
              </div>

              <div>
                <label
                  className="cy-label"
                  style={labelStyle}
                  htmlFor="auth-phone"
                >
                  Mobile Number
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    ...inputStyle,
                  }}
                >
                  <span style={{ color: C.textSecondary, fontWeight: 600 }}>
                    +91
                  </span>
                  <input
                    id="auth-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    placeholder="10-digit mobile number"
                    style={{
                      border: 0,
                      outline: "none",
                      width: "100%",
                      background: "transparent",
                      font: "inherit",
                      color: C.textPrimary,
                    }}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="cy-label" style={labelStyle} htmlFor="auth-email">
              Official Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. citizen@example.com"
              className="cy-input"
              style={inputStyle}
            />
          </div>

          <div>
            <label
              className="cy-label"
              style={labelStyle}
              htmlFor="auth-password"
            >
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="cy-input"
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              style={{
                background: "#FEE2E2",
                border: `1px solid ${C.danger}40`,
                borderRadius: 10,
                padding: "10px 12px",
                color: C.danger,
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {notice && (
            <div
              style={{
                background: C.mint100,
                border: `1px solid ${C.teal600}40`,
                borderRadius: 10,
                padding: "10px 12px",
                color: C.teal700,
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              ✉️ {notice}
            </div>
          )}

          {confirmationNeeded && mode === "signin" && (
            <button
              type="button"
              disabled={busy || !email.trim()}
              onClick={async () => {
                setBusy(true)
                setError("")
                try {
                  const { error: resendError } = await supabase.auth.resend({
                    type: "signup",
                    email: email.trim(),
                    options: {
                      emailRedirectTo: getEmailConfirmationRedirect(),
                    },
                  })
                  if (resendError) throw resendError
                  setNotice(
                    "A fresh confirmation link was sent. Check your inbox and spam folder.",
                  )
                } catch (cause: any) {
                  setError(
                    cause?.message || "Could not resend the confirmation link.",
                  )
                } finally {
                  setBusy(false)
                }
              }}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                color: C.teal600,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13,
                textAlign: "left",
              }}
            >
              Resend confirmation link
            </button>
          )}

          <div style={{ marginTop: 8 }}>
            <PrimaryButton
              label={
                busy
                  ? "Processing..."
                  : mode === "signin"
                    ? "Sign In to Cyber Sathi"
                    : "Register Official Account"
              }
              disabled={busy}
              onClick={() => {}}
            />
          </div>
        </form>

        <p
          style={{
            marginTop: "auto",
            paddingTop: 20,
            fontSize: 11,
            color: C.textSecondary,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          🔒 Connected to official Supabase Authentication with Row Level
          Security.
        </p>
      </div>
    </div>
  )
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({
  onStartReport,
  onViewCase,
  recentCases,
  language,
}: {
  onStartReport: (topic?: string, enableMic?: boolean) => void
  onViewCase: (c: CaseRecord) => void
  recentCases: CaseRecord[]
  language: string
}) {
  const [pulse, setPulse] = useState(false)
  const [micStatus, setMicStatus] = useState("")
  const [micBusy, setMicBusy] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => !p), 1200)
    return () => clearInterval(t)
  }, [])

  const handleMicrophone = () => {
    setMicStatus("")
    void onStartReport(undefined, true)
  }

  const topics = [
    {
      icon: "💸",
      label: "Lost Money / UPI Fraud",
      desc: "Unauthorized debit or QR scan",
    },
    {
      icon: "⚡",
      label: "Utility / Electricity Bill",
      desc: "SMS threatening disconnection",
    },
    {
      icon: "💼",
      label: "Part-Time Job / Telegram",
      desc: "Fake task or investment schemes",
    },
    {
      icon: "🛑",
      label: "Blackmail / Digital Arrest",
      desc: "Video call or police impersonation",
    },
  ]

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        background: C.bgCanvas,
        padding: "14px 20px 24px",
      }}
    >
      {/* Top Advisory Banner */}
      <div
        style={{
          background: C.warning,
          borderRadius: 14,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 20 }}>🚨</span>
        <div style={{ flex: 1 }}>
          <p
            style={{
              margin: "0 0 2px",
              fontSize: 12,
              fontWeight: 700,
              color: "#7a4d00",
            }}
          >
            Golden Hour Alert: Helpline 1930
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: "#7a4d00",
              lineHeight: 1.4,
            }}
          >
            Report financial fraud within 2 hours to freeze fraudulent money
            before withdrawal.
          </p>
        </div>
      </div>

      {/* Prompt Card */}
      <div
        style={{
          background: C.mint100,
          borderRadius: 20,
          padding: "18px 20px",
          display: "flex",
          gap: 14,
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            background: C.teal600,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          🎙️
        </div>
        <div>
          <p
            style={{
              margin: "0 0 2px",
              fontWeight: 700,
              color: C.textPrimary,
              fontSize: 14,
            }}
          >
            Speak or Chat with Sathi
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: C.textSecondary,
              lineHeight: 1.4,
            }}
          >
            Describe the incident in{" "}
            {language === "hi"
              ? "Hindi"
              : language === "bn"
                ? "Bengali"
                : "English"}
            . Sathi formats your legal report.
          </p>
        </div>
      </div>

      {/* Main Mic / Action Orb */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: 28,
        }}
      >
        <div style={{ position: "relative", marginBottom: 12 }}>
          <div
            style={{
              position: "absolute",
              inset: -18,
              borderRadius: "50%",
              border: `2px solid ${C.teal500}`,
              opacity: pulse ? 0.2 : 0.45,
              transform: pulse ? "scale(1.12)" : "scale(1)",
              transition: "opacity 1.2s ease, transform 1.2s ease",
              pointerEvents: "none",
            }}
          />
          <button
            type="button"
            onClick={handleMicrophone}
            style={{
              width: 92,
              height: 92,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${C.teal600}, ${C.teal500})`,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              boxShadow: `0 8px 30px ${C.teal600}60`,
            }}
            aria-label="Start voice intake"
            title="Tap to start voice intake"
          >
            🎙️
          </button>
        </div>
        <p
          style={{ fontSize: 13, fontWeight: 600, color: C.teal700, margin: 0 }}
        >
          Tap Orb to Start Voice Intake
        </p>
        {micStatus && (
          <p
            role="status"
            style={{
              margin: "8px 0 0",
              fontSize: 11,
              color: C.textSecondary,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {micStatus}
          </p>
        )}
      </div>

      {/* Common Scam Incident Categories */}
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.textSecondary,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          margin: "0 0 12px",
        }}
      >
        Report By Category
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {topics.map((t, idx) => (
          <div
            key={idx}
            onClick={() => onStartReport(t.label)}
            style={{
              background: C.white,
              borderRadius: 14,
              padding: "14px",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(11,46,46,0.06)",
              border: `1px solid ${C.divider}`,
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 6 }}>{t.icon}</div>
            <p
              style={{
                margin: "0 0 3px",
                fontSize: 13,
                fontWeight: 700,
                color: C.textPrimary,
              }}
            >
              {t.label}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: C.textSecondary,
                lineHeight: 1.3,
              }}
            >
              {t.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Real Cases Section */}
      {recentCases.length > 0 && (
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.textSecondary,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: "0 0 10px",
            }}
          >
            Your Filed Complaints ({recentCases.length})
          </p>
          {recentCases.slice(0, 2).map((c) => (
            <div
              key={c.id}
              onClick={() => onViewCase(c)}
              style={{
                background: C.white,
                borderRadius: 14,
                padding: "12px 14px",
                marginBottom: 10,
                cursor: "pointer",
                border: `1px solid ${C.divider}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 2px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.textPrimary,
                  }}
                >
                  {c.category}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: C.textSecondary }}>
                  {c.trackingNumber || `Case ID: ${c.id}`} •{" "}
                  {c.amount || "Amount not provided"}
                </p>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: C.mint100,
                  color: C.teal700,
                  padding: "4px 8px",
                  borderRadius: 8,
                }}
              >
                {caseStatusLabel(c.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function audioBufferToWav(audio: AudioBuffer): ArrayBuffer {
  const channels = 1
  const samples = audio.getChannelData(0)
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i))
  }
  write(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, "WAVE")
  write(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, audio.sampleRate, true)
  view.setUint32(28, audio.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  write(36, "data")
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (const sample of samples) {
    const value = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true)
    offset += 2
  }
  return buffer
}

// ─── Real Agent Conversation Screen ───────────────────────────────────────────

function AgentChatScreen({
  messages,
  setMessages,
  extractedData,
  setExtractedData,
  caseId,
  previousFacts,
  setPreviousFacts,
  language,
  autoStartMic = false,
  reportFinalized = false,
  onOpenFinalReport,
  onProceedToReview,
  onBack,
}: {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  extractedData: ExtractedCaseData
  setExtractedData: React.Dispatch<React.SetStateAction<ExtractedCaseData>>
  caseId: string | null
  previousFacts: SathiFacts | null
  setPreviousFacts: React.Dispatch<React.SetStateAction<SathiFacts | null>>
  language: "en" | "hi" | "bn"
  autoStartMic?: boolean
  reportFinalized?: boolean
  onOpenFinalReport: () => void
  onProceedToReview: () => void
  onBack: () => void
}) {
  const [inputText, setInputText] = useState("")
  const [isListening, setIsListening] = useState(false)
  const [micStatus, setMicStatus] = useState("")
  const [loadingReply, setLoadingReply] = useState(false)
  const [showExtractedPanel, setShowExtractedPanel] = useState(false)
  const [showLiveVoice, setShowLiveVoice] = useState(Boolean(autoStartMic))
  const [evidenceStatus, setEvidenceStatus] = useState("")
  const [evidenceBusy, setEvidenceBusy] = useState(false)
  const [chatEnded, setChatEnded] = useState(false)
  const evidenceInputRef = useRef<HTMLInputElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const speechAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastSpokenReplyRef = useRef<string | null>(null)
  const autoStartAttemptedRef = useRef(false)

  const voiceMsgIds = useRef<Set<string>>(new Set())
  const blandVoice = useBlandVoiceAgent(
    caseId,
    BLAND_AGENT_ID,
    language,
    (role, text, turnId) => {
      const id = turnId || `${role}:${text}`
      if (voiceMsgIds.current.has(id)) return
      voiceMsgIds.current.add(id)
      setMessages((prev) => [
        ...prev,
        {
          id: `voice-${id}`,
          sender: role === "agent" ? "agent" : "user",
          text,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ])
      if (caseId) {
        void saveSathiTranscript(caseId, { role, text }).catch((error) => {
          console.warn("Could not save voice transcript:", error)
        })
      }
    },
  )
  const voiceLive = blandVoice.isStarted || blandVoice.state === "open"
  const voiceConnecting =
    blandVoice.isStarting || blandVoice.state === "connecting"

  useEffect(() => {
    if (autoStartMic) setShowLiveVoice(true)
  }, [autoStartMic])

  // If live voice view is closed, ensure any active connection is stopped.
  useEffect(() => {
    if (showLiveVoice) return
    if (
      blandVoice.isStarted ||
      blandVoice.isStarting ||
      blandVoice.state !== "closed"
    ) {
      blandVoice.stop()
    }
  }, [
    showLiveVoice,
    blandVoice.isStarted,
    blandVoice.isStarting,
    blandVoice.state,
    blandVoice.stop,
  ])

  useEffect(() => {
    if (!showLiveVoice || !autoStartMic || autoStartAttemptedRef.current) return
    if (!caseId) return
    if (blandVoice.isStarted || blandVoice.isStarting) return
    autoStartAttemptedRef.current = true
    void blandVoice.start()
  }, [
    showLiveVoice,
    autoStartMic,
    caseId,
    blandVoice.isStarted,
    blandVoice.isStarting,
    blandVoice.start,
  ])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      })
    }
  }, [messages, loadingReply])

  useEffect(
    () => () => {
      speechAudioRef.current?.pause()
      if (speechAudioRef.current?.src.startsWith("blob:"))
        URL.revokeObjectURL(speechAudioRef.current.src)
    },
    [],
  )

  const speakReply = async (_text: string) => {
    // Browser speech synthesis disabled.
    return
  }

  useEffect(() => {
    const latest = messages[messages.length - 1]
    if (
      caseId &&
      latest?.sender === "agent" &&
      latest.id !== lastSpokenReplyRef.current
    ) {
      lastSpokenReplyRef.current = latest.id
      void speakReply(latest.text)
    }
  }, [messages, caseId, language])

  const submitTurn = async (input: { text?: string; audio?: Blob }) => {
    if (!caseId || loadingReply || reportFinalized) return
    const text = input.text?.trim()
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: text || "🎙️ Voice message",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoadingReply(true)
    try {
      const response: SathiResponse = await sendSathiTurn(caseId, {
        language,
        text,
        audio: input.audio,
      })
      setExtractedData((current) =>
        mergeSathiFactsIntoReport(current, response.facts, previousFacts),
      )
      setPreviousFacts(response.facts)
      if (response.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            sender: "agent",
            text: response.reply!,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ])
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-error-${Date.now()}`,
          sender: "agent",
          text:
            error instanceof Error
              ? error.message
              : "Sathi could not process that message. Please try again.",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ])
    } finally {
      setLoadingReply(false)
    }
  }

  const toggleMic = async () => {
    if (reportFinalized) return
    if (isListening && recorderRef.current) {
      recorderRef.current.stop()
      setIsListening(false)
      return
    }
    if (!window.isSecureContext) {
      setMicStatus("Microphone access requires HTTPS or localhost.")
      return
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setMicStatus("Audio recording is unavailable in this browser.")
      return
    }
    try {
      setMicStatus("Listening… speak now. Tap ⏹ to stop and send.")
      const stream = await requestMicrophoneAccess()
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const recorded = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        })
        stream.getTracks().forEach((track) => track.stop())
        if (!caseId) {
          setMicStatus(
            recorded.size
              ? "Microphone recording succeeded. Start a Sathi session to send audio to the agent."
              : "No audio was captured. Check the microphone and try again.",
          )
          return
        }
        if (recorded.size) void recorded.arrayBuffer().then(async (buffer) => {
            const AudioContextClass =
              window.AudioContext || (window as any).webkitAudioContext
            const context = new AudioContextClass()
            try {
              const decoded = await context.decodeAudioData(buffer)
              void submitTurn({
                audio: new Blob([audioBufferToWav(decoded)], {
                  type: "audio/wav",
                }),
              })
            } catch {
              setMicStatus(
                "The recording format could not be decoded. Please try again or type your message.",
              )
            } finally {
              await context.close()
            }
          })
      }
      recorder.start()
      setIsListening(true)
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "UnknownError"
      const detail =
        name === "NotAllowedError"
          ? "Allow microphone access for this site. If the app is inside a preview frame, open it directly or allow microphone access to the frame."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : name === "NotReadableError"
              ? "The microphone is busy or unavailable to the browser."
              : `Microphone error (${name}). Check this site's microphone permission and try again.`
      setMicStatus(detail)
    }
  }

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || loadingReply) return
    setInputText("")
    void submitTurn({ text })
  }

  const mergeEvidenceEntities = (entities: Record<string, any>) => {
    setExtractedData((current) => {
      const next = { ...current }
      const amount =
        entities.amount ?? entities.amount_lost ?? entities.total_fraud_amount
      if (amount != null && amount !== "" && !current.amount) {
        const s = String(amount)
        next.amount = s.includes("₹")
          ? s
          : `₹${Number(s.replace(/[^0-9.]/g, "")) || s}`
      }
      const phone =
        entities.suspect_phone ??
        entities.suspectPhone ??
        entities.mobile_number ??
        entities.caller_number ??
        entities.phoneNumbers?.[0]
      if (phone && !current.suspectPhone) next.suspectPhone = String(phone)
      const upi =
        entities.upi_id ??
        entities.upiId ??
        entities.suspect_upi ??
        entities.upiIds?.[0]
      if (upi && !current.suspectUpi) next.suspectUpi = String(upi)
      const url = entities.url ?? entities.urls?.[0]
      if (url && !current.suspectDetails) next.suspectDetails = String(url)
      const platform =
        entities.bank_or_app ??
        entities.platform ??
        entities.upi_app_used ??
        entities.mode_of_transfer
      if (platform && !current.platform) next.platform = String(platform)
      const when =
        entities.incident_datetime ??
        entities.date ??
        entities.incidentDate ??
        entities.date_of_incident
      if (when && !current.incidentDate) next.incidentDate = String(when)
      const cat =
        entities.provisional_fraud_category ??
        entities.fraud_type ??
        entities.category
      if (cat && !current.category) next.category = String(cat)
      const desc =
        entities.description ??
        entities.narrative ??
        entities.short_description ??
        entities.summary
      if (desc && !current.summary) next.summary = String(desc).slice(0, 2000)
      if (desc && !current.complaintNarrative)
        next.complaintNarrative = String(desc).slice(0, 4000)
      return next
    })
  }

  const getMissingVitalFields = (d: ExtractedCaseData) => {
    const missing: string[] = []
    if (!d.category?.trim()) missing.push("fraud category")
    if (!d.incidentDate?.trim()) missing.push("incident date/time")
    if (!d.amount?.trim()) missing.push("amount lost (if any)")
    if (!d.summary?.trim() && !d.complaintNarrative?.trim())
      missing.push("incident description")
    if (
      !d.suspectPhone?.trim() &&
      !d.suspectUpi?.trim() &&
      !d.suspectDetails?.trim() &&
      !d.platform?.trim()
    )
      missing.push("suspect/platform details (phone, UPI, link, or app)")
    return missing
  }

  const uploadEvidence = async (files: FileList | null) => {
    if (!caseId || !files?.length || evidenceBusy) return
    setEvidenceBusy(true)
    try {
      for (const file of Array.from(files)) {
        setEvidenceStatus(`Uploading ${file.name} and reading it with AI…`)
        setMessages((prev) => [
          ...prev,
          {
            id: `ev-up-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            sender: "user",
            text: `📎 Uploaded evidence: ${file.name}`,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ])
        void saveSathiTranscript(caseId, {
          role: "user",
          text: `📎 Uploaded evidence: ${file.name}`,
        }).catch((error) =>
          console.warn("Could not save evidence transcript:", error),
        )
        const item = await uploadCaseEvidence(caseId, file)
        if (item.processingStatus === "failed") {
          const reason =
            item.extractionError || "No details could be extracted."
          setEvidenceStatus(
            `Evidence uploaded, but extraction failed: ${reason}`,
          )
          setMessages((prev) => [
            ...prev,
            {
              id: `ev-failed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              sender: "agent",
              text: `I saved "${file.name}", but could not read its details yet. ${reason} You can retry the upload or type the amount, date, and payment reference.`,
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ])
          continue
        }
        const entities = (item.extractedEntities || {}) as Record<string, any>
        if (Object.keys(entities).length) mergeEvidenceEntities(entities)
        const summary = summarizeExtractedEvidence(entities)
        const evidenceReply = summary
          ? `I read "${file.name}" and found:\n${summary}\n\nPlease confirm these details or correct anything that is wrong. I'll then ask only for what is still missing.`
          : `I received "${file.name}" but could not extract structured fields. Please describe the key details (amount, date, suspect number/UPI/link, what happened).`
        setMessages((prev) => [
          ...prev,
          {
            id: `ev-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            sender: "agent",
            text: evidenceReply,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ])
        void saveSathiTranscript(caseId, {
          role: "agent",
          text: evidenceReply,
        }).catch((error) =>
          console.warn("Could not save evidence transcript:", error),
        )
      }
      setEvidenceStatus("Evidence processed. Please verify extracted details.")
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Evidence upload/processing failed."
      setEvidenceStatus(msg)
      setMessages((prev) => [
        ...prev,
        {
          id: `ev-err-${Date.now()}`,
          sender: "agent",
          text: `Could not process evidence: ${msg}`,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ])
    } finally {
      setEvidenceBusy(false)
      if (evidenceInputRef.current) evidenceInputRef.current.value = ""
    }
  }

  const hasAnyData = Boolean(
    Boolean(extractedData.amount) ||
      extractedData.suspectPhone ||
      extractedData.suspectUpi ||
      messages.length > 2,
  )

  const missingVital = getMissingVitalFields(extractedData)
  const intakeFinalized = Boolean(
    extractedData.isComplete || previousFacts?.intakeComplete,
  )
  const canReview =
    !reportFinalized &&
    hasAnyData &&
    !evidenceBusy &&
    !loadingReply &&
    missingVital.length === 0 &&
    (chatEnded || intakeFinalized)

  if (showLiveVoice) {
    const voiceStatus = voiceLive
      ? "Live voice conversation"
      : voiceConnecting
        ? "Connecting to Saathi…"
        : blandVoice.error
          ? "Voice connection unavailable"
          : !caseId
            ? "Preparing secure session…"
            : "Ready to start voice"
    return (
      <LiveVoiceScreen
        status={voiceStatus}
        error={blandVoice.error}
        language={language}
        canStart={Boolean(caseId)}
        isConnected={voiceLive}
        isAgentSpeaking={blandVoice.isAgentSpeaking}
        onOpenChat={() => {
          if (!voiceLive) setShowLiveVoice(false)
        }}
        onEnd={() => {
          blandVoice.stop()
          setShowLiveVoice(false)
          autoStartAttemptedRef.current = false
          setChatEnded(true)
        }}
        onStart={() => void blandVoice.start()}
        voiceMode={blandVoice.voiceMode}
      />
    )
  }

  return (
    <div
      className="chat-screen"
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: C.bgCanvas,
      }}
    >
      {/* Dark Agent Header */}
      <div
        style={{
          background: C.teal900,
          padding: "12px 18px",
          flexShrink: 0,
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: C.white,
              fontSize: 20,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ‹
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: C.mint300,
                }}
              />
              <span style={{ color: C.white, fontWeight: 700, fontSize: 15 }}>
                Cyber Sathi AI
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              Official Cyber Crime Intake Agent
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowLiveVoice(true)}
            disabled={reportFinalized}
            style={{
              background: reportFinalized
                ? "rgba(255,255,255,.1)"
                : voiceLive
                  ? "rgba(34,197,94,.22)"
                  : "rgba(255,255,255,0.15)",
              border: reportFinalized
                ? "1px solid rgba(255,255,255,.2)"
                : voiceLive
                  ? "1px solid rgba(34,197,94,.5)"
                  : "none",
              borderRadius: 8,
              padding: "6px 10px",
              color: reportFinalized
                ? "rgba(255,255,255,.45)"
                : voiceLive
                  ? "#bbf7d0"
                  : C.mint300,
              fontSize: 11,
              fontWeight: 700,
              cursor: reportFinalized ? "not-allowed" : "pointer",
            }}
          >
            {voiceLive ? "● Live" : voiceConnecting ? "… Voice" : "🎙 Voice"}
          </button>
          <button
            onClick={() => setShowExtractedPanel((p) => !p)}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              borderRadius: 8,
              padding: "6px 10px",
              color: C.mint300,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            📋 Facts {hasAnyData ? "✓" : ""}
          </button>
        </div>
      </div>

      {/* Extracted Facts Drawer (Collapsible) */}
      {showExtractedPanel && (
        <div
          style={{
            background: C.mint100,
            padding: "12px 16px",
            borderBottom: `1px solid ${C.divider}`,
            maxHeight: "32%",
            overflowY: "auto",
            flexShrink: 0,
            animation: "fadeIn 0.2s",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.teal700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Extracted Case Intelligence
            </span>
            <span
              onClick={() => setShowExtractedPanel(false)}
              style={{ fontSize: 11, color: C.teal700, cursor: "pointer" }}
            >
              ✕
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              fontSize: 11,
            }}
          >
            <div>
              <span style={{ color: C.textSecondary }}>Category:</span>{" "}
              <strong>{extractedData.category}</strong>
            </div>
            <div>
              <span style={{ color: C.textSecondary }}>Loss:</span>{" "}
              <strong style={{ color: C.danger }}>
                {extractedData.amount}
              </strong>
            </div>
            <div>
              <span style={{ color: C.textSecondary }}>Suspect Phone:</span>{" "}
              <strong>{extractedData.suspectPhone || "Pending"}</strong>
            </div>
            <div>
              <span style={{ color: C.textSecondary }}>Suspect UPI:</span>{" "}
              <strong>{extractedData.suspectUpi || "Pending"}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages Container */}
      <div
        ref={messagesContainerRef}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          padding: "16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.map((m) => {
          const isAgent = m.sender === "agent"
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isAgent ? "flex-start" : "flex-end",
                maxWidth: "88%",
                alignSelf: isAgent ? "flex-start" : "flex-end",
              }}
            >
              <div
                style={{
                  background: isAgent ? C.white : C.teal600,
                  color: isAgent ? C.textPrimary : C.white,
                  borderRadius: isAgent
                    ? "18px 18px 18px 4px"
                    : "18px 18px 4px 18px",
                  padding: "12px 16px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  border: isAgent ? `1px solid ${C.divider}` : "none",
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text}
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: C.textSecondary,
                  marginTop: 4,
                  padding: "0 4px",
                }}
              >
                {m.timestamp}
              </span>
            </div>
          )
        })}

        {loadingReply && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: C.white,
              borderRadius: 16,
              width: "fit-content",
              border: `1px solid ${C.divider}`,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: C.teal600,
                animation: "blink 1s infinite",
              }}
            />
            <span style={{ fontSize: 12, color: C.textSecondary }}>
              Sathi is analyzing incident details...
            </span>
          </div>
        )}
      </div>

      {reportFinalized && (
        <div
          style={{
            flexShrink: 0,
            padding: "10px 16px",
            background: C.white,
            borderTop: `1px solid ${C.divider}`,
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              textAlign: "center",
              fontSize: 11,
              color: C.textSecondary,
            }}
          >
            This report is finalized. Your saved conversation is available to
            review.
          </p>
          <button
            type="button"
            onClick={onOpenFinalReport}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 24,
              border: 0,
              background: `linear-gradient(135deg, ${C.teal700}, ${C.teal600})`,
              color: C.white,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Open finalized report
          </button>
        </div>
      )}
      {!reportFinalized && hasAnyData && !canReview && (
        <div
          style={{
            flexShrink: 0,
            padding: "8px 16px",
            background: C.white,
            borderTop: `1px solid ${C.divider}`,
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 11,
              color: C.textSecondary,
              lineHeight: 1.45,
            }}
          >
            {evidenceBusy
              ? "Processing evidence… review will be available when extraction is complete."
              : missingVital.length
                ? `Missing vital fields: ${missingVital.join(", ")}. Please provide them in chat or upload evidence.`
                : "When all details are collected and verified, end the chat to review and edit your report."}
          </p>
          {!evidenceBusy && !loadingReply && missingVital.length === 0 && (
            <button
              type="button"
              onClick={() => setChatEnded(true)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 20,
                border: `1px solid ${C.teal600}`,
                background: C.white,
                color: C.teal700,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              End chat & prepare review
            </button>
          )}
        </div>
      )}
      {canReview && (
        <div
          style={{
            flexShrink: 0,
            padding: "8px 16px",
            background: C.white,
            borderTop: `1px solid ${C.divider}`,
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              textAlign: "center",
              fontSize: 11,
              color: C.textSecondary,
            }}
          >
            All vital details collected. Review, edit, and confirm your report.
          </p>
          <button
            onClick={onProceedToReview}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 24,
              border: "none",
              background: `linear-gradient(135deg, ${C.teal700}, ${C.teal600})`,
              color: C.white,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 4px 12px rgba(11,46,46,0.15)",
            }}
          >
            <span>Review & edit report</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* Input Row */}
      <div
        style={{
          padding: "10px 16px 14px",
          background: C.white,
          borderTop: `1px solid ${C.divider}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <input
          ref={evidenceInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          multiple
          style={{ display: "none" }}
          onChange={(e) => void uploadEvidence(e.target.files)}
        />
        <button
          type="button"
          onClick={() => evidenceInputRef.current?.click()}
          disabled={!caseId || loadingReply || evidenceBusy || reportFinalized}
          aria-label="Upload evidence"
          title="Upload evidence (screenshot/document)"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: `1px solid ${C.divider}`,
            background: C.white,
            color:
              !caseId || loadingReply || evidenceBusy || reportFinalized
                ? C.textSecondary
                : C.teal700,
            fontSize: 16,
            cursor:
              !caseId || loadingReply || evidenceBusy || reportFinalized
                ? "not-allowed"
                : "pointer",
            flexShrink: 0,
          }}
        >
          📎
        </button>
        <button
          type="button"
          onClick={toggleMic}
          disabled={loadingReply || evidenceBusy || reportFinalized}
          aria-label={isListening ? "Stop recording" : "Record voice message"}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: isListening ? C.danger : C.mint100,
            color: isListening ? C.white : C.teal700,
            fontSize: 20,
            cursor: "pointer",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: isListening ? "pulse 1s infinite" : "none",
          }}
          title={isListening ? "Listening... click to stop" : "Speak to Sathi"}
        >
          {isListening ? "⏹" : "🎙️"}
        </button>

        <input
          type="text"
          aria-label="Type or dictate incident details"
          value={inputText}
          disabled={loadingReply || reportFinalized}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void handleSend()
            }
          }}
          placeholder={
            isListening
              ? "Listening... speak now"
              : "Type or dictate incident details..."
          }
          style={{
            flex: 1,
            minWidth: 0,
            padding: "12px 16px",
            borderRadius: 24,
            border: `1.5px solid ${isListening ? C.danger : C.divider}`,
            outline: "none",
            fontSize: 14,
            color: C.textPrimary,
            background: C.bgCanvas,
          }}
        />

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={
            !caseId || !inputText.trim() || loadingReply || reportFinalized
          }
          aria-label="Send message"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background:
              !caseId || !inputText.trim() || loadingReply || reportFinalized
                ? C.divider
                : C.teal600,
            color:
              !caseId || !inputText.trim() || loadingReply || reportFinalized
                ? C.textSecondary
                : C.white,
            fontSize: 18,
            cursor:
              !caseId || !inputText.trim() || loadingReply
                ? "not-allowed"
                : "pointer",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ➤
        </button>
      </div>

      <div
        style={{
          padding: "0 16px 6px",
          background: C.white,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {!caseId && (
          <span style={{ fontSize: 10, color: C.danger }}>
            Sathi session unavailable
          </span>
        )}
      </div>
      {micStatus && (
        <p
          role="status"
          style={{
            margin: 0,
            flexShrink: 0,
            padding: "2px 16px 8px",
            background: C.white,
            color: C.textSecondary,
            fontSize: 10,
            lineHeight: 1.4,
          }}
        >
          {micStatus}
        </p>
      )}
      <p
        style={{
          margin: "-4px 16px 8px",
          flexShrink: 0,
          fontSize: 10,
          color: C.textSecondary,
          background: C.white,
        }}
      >
        Browser speech features are disabled. Use 🎙️ to record audio for Sathi or
        type your message.
      </p>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}

function LiveVoiceScreen({
  status,
  error,
  language,
  canStart = true,
  isConnected = false,
  isAgentSpeaking = false,
  onOpenChat,
  onEnd,
  onStart,
  voiceMode = "primary",
}: {
  status: string
  error: string
  language: "en" | "hi" | "bn"
  canStart?: boolean
  isConnected?: boolean
  isAgentSpeaking?: boolean
  onOpenChat: () => void
  onEnd: () => void
  onStart: () => void
  voiceMode?: "primary" | "fallback"
}) {
  const active = status === "Live voice conversation"
  const connecting = status === "Connecting to Saathi…"
  const preparing = status === "Preparing secure session…"
  const langLabel =
    language === "hi" ? "Hindi" : language === "bn" ? "Bengali" : "English"
  const isFallback = voiceMode === "fallback"
  const showBreathing = active || connecting || preparing
  return (
    <>
      {isFallback && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: "#FEF3C7",
            borderBottom: `1px solid ${C.warningIcon}`,
            padding: "8px 16px",
            textAlign: "center",
            fontSize: 11,
            fontWeight: 600,
            color: "#92400E",
            animation: "slideDown 0.3s ease-out",
          }}
        >
          ⚠️ Fallback voice active — quality may vary
        </div>
      )}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "28px 22px 24px",
          background: C.teal900,
          color: C.white,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ textAlign: "left" }}>
            <strong style={{ fontSize: 15 }}>Cyber Sathi</strong>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 11,
                color: "rgba(255,255,255,.65)",
              }}
            >
              {status}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {active && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.mint300,
                  letterSpacing: "0.06em",
                }}
              >
                LIVE
              </span>
            )}
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: active
                  ? "#22c55e"
                  : connecting || preparing
                    ? C.warningIcon
                    : error
                      ? C.danger
                      : "rgba(255,255,255,.35)",
                boxShadow: active
                  ? "0 0 0 6px rgba(34,197,94,.25)"
                  : connecting || preparing
                    ? "0 0 0 6px rgba(240,169,58,.2)"
                    : "none",
                animation:
                  connecting || preparing ? "pulse-dot 1s infinite" : "none",
              }}
            />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div className={showBreathing ? "voice-orb live" : "voice-orb"}>
            <div className="voice-orb-core">🎙️</div>
            <i />
            <i />
            <i />
          </div>
          {isConnected && (
            <div
              className={isAgentSpeaking ? "voice-wave active" : "voice-wave"}
            >
              <div className="voice-wave-bars" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 11,
                  color: "rgba(255,255,255,.75)",
                  fontWeight: 600,
                }}
              >
                {isAgentSpeaking
                  ? "Saathi is speaking…"
                  : "Connected · listening for your voice"}
              </p>
            </div>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>
              {active
                ? "Speak naturally"
                : connecting
                  ? "Connecting…"
                  : preparing
                    ? "Preparing…"
                    : error
                      ? "Voice unavailable"
                      : "Ready for voice"}
            </h1>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 13,
                lineHeight: 1.5,
                color: "rgba(255,255,255,.7)",
                maxWidth: 290,
              }}
            >
              {active
                ? `Saathi is connected and listening in ${langLabel}. Speak naturally; you can interrupt anytime.`
                : connecting
                  ? `Requesting microphone and connecting Saathi in ${langLabel}…`
                  : preparing
                    ? "Preparing your secure case session. Voice will connect automatically."
                    : error ||
                      "Tap Start to connect microphone and begin a live voice conversation with Saathi."}
            </p>
          </div>
        </div>
        <div style={{ width: "100%", display: "grid", gap: 10 }}>
          {!active && !connecting && !preparing && (
            <button
              type="button"
              onClick={onStart}
              disabled={!canStart}
              style={{
                border: 0,
                borderRadius: 24,
                padding: "13px",
                fontWeight: 700,
                cursor: canStart ? "pointer" : "not-allowed",
                background: canStart ? C.mint300 : "rgba(127,209,192,.35)",
                color: canStart ? C.teal900 : C.white,
              }}
            >
              {error ? "Try voice again" : "Start Voice"}
            </button>
          )}
          {(connecting || preparing) && (
            <button
              type="button"
              disabled
              style={{
                border: 0,
                borderRadius: 24,
                padding: "13px",
                fontWeight: 700,
                cursor: "wait",
                background: "rgba(127,209,192,.35)",
                color: C.white,
              }}
            >
              {preparing ? "Preparing…" : "Connecting…"}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenChat}
            disabled={isConnected}
            style={{
              border: `1px solid ${
                isConnected ? "rgba(255,255,255,.25)" : C.mint300
              }`,
              borderRadius: 24,
              padding: "13px",
              fontWeight: 700,
              cursor: isConnected ? "not-allowed" : "pointer",
              background: "transparent",
              color: isConnected ? "rgba(255,255,255,.45)" : C.white,
            }}
          >
            {isConnected
              ? "Voice call active (stay on live screen)"
              : "Open text chat"}
          </button>
          <button
            type="button"
            onClick={onEnd}
            style={{
              border: 0,
              background: "transparent",
              color: "rgba(255,255,255,.72)",
              padding: 7,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            End voice conversation
          </button>
        </div>
        <style>{`
        .voice-orb{width:152px;height:152px;display:grid;place-items:center;position:relative}
        .voice-orb-core{z-index:2;width:84px;height:84px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#1d8577,#7fd1c0);font-size:32px;box-shadow:0 0 0 12px rgba(127,209,192,.12)}
        .voice-orb i{position:absolute;inset:8px;border:1.5px solid rgba(127,209,192,.55);border-radius:50%;opacity:0}
        .voice-orb i:nth-of-type(2){inset:24px}.voice-orb i:nth-of-type(3){inset:40px}
        .voice-orb.live .voice-orb-core{animation:core-breathe 2.4s ease-in-out infinite}
        .voice-orb.live i{animation:voice-breathe 2.4s ease-out infinite}
        .voice-orb.live i:nth-of-type(2){animation-delay:.6s}.voice-orb.live i:nth-of-type(3){animation-delay:1.2s}
        .voice-wave{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:44px}
        .voice-wave-bars{display:flex;align-items:center;justify-content:center;gap:5px;height:36px}
        .voice-wave-bars span{width:4px;height:22px;border-radius:999px;background:rgba(127,209,192,.45);transform-origin:center;animation:wave-breathe 2.4s ease-in-out infinite;opacity:.55}
        .voice-wave.active .voice-wave-bars span{background:${C.mint300};animation-duration:1.4s;opacity:.9}
        .voice-wave-bars span:nth-child(1){animation-delay:0s;height:12px}
        .voice-wave-bars span:nth-child(2){animation-delay:.12s;height:18px}
        .voice-wave-bars span:nth-child(3){animation-delay:.24s;height:26px}
        .voice-wave-bars span:nth-child(4){animation-delay:.36s;height:32px}
        .voice-wave-bars span:nth-child(5){animation-delay:.48s;height:26px}
        .voice-wave-bars span:nth-child(6){animation-delay:.6s;height:18px}
        .voice-wave-bars span:nth-child(7){animation-delay:.72s;height:12px}
        .voice-wave-bars span:nth-child(8){animation-delay:.84s;height:18px}
        .voice-wave-bars span:nth-child(9){animation-delay:.96s;height:26px}
        .voice-wave-bars span:nth-child(10){animation-delay:1.08s;height:32px}
        .voice-wave-bars span:nth-child(11){animation-delay:1.2s;height:20px}
        .voice-wave-bars span:nth-child(12){animation-delay:1.32s;height:14px}
        @keyframes wave-breathe{0%,100%{transform:scaleY(.28);opacity:.35}50%{transform:scaleY(1);opacity:1}}
        @keyframes voice-breathe{0%{transform:scale(.72);opacity:.85}100%{transform:scale(1.18);opacity:0}}
        @keyframes core-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        @keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes slideDown{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>
      </div>
    </>
  )
}

// ─── Real Review Report Screen ────────────────────────────────────────────────

function ReviewReportScreen({
  extractedData,
  setExtractedData,
  userProfile,
  onContinueChat,
  onSubmit,
  onBack,
}: {
  extractedData: ExtractedCaseData
  setExtractedData: React.Dispatch<React.SetStateAction<ExtractedCaseData>>
  userProfile: any
  onContinueChat: () => void
  onSubmit: () => Promise<void>
  onBack: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  const handleSpeakSummary = () => {
    // Browser speech synthesis disabled.
    setSpeaking(false)
    return

    const textToSpeak = `Official incident report. Category: ${extractedData.category}. Amount lost: ${extractedData.amount}. Suspect: ${extractedData.suspectPhone || extractedData.suspectUpi || "Unspecified"}. Statement: ${extractedData.complaintNarrative}`
    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    utterance.rate = 1.0
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)

    setSpeaking(true)
  }

  const handleFormSubmit = async () => {
    setSubmitting(true)
    try {
      await onSubmit()
    } catch (err: any) {
      window.alert(`Submission error: ${err?.message || "Failed to submit"}`)
    } finally {
      setSubmitting(false)
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
      {/* Header */}
      <div
        style={{
          padding: "16px 20px 14px",
          background: C.white,
          borderBottom: `1px solid ${C.divider}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: C.teal600,
            }}
          >
            ‹
          </button>
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
              Review & edit your complaint
            </h2>
            <p style={{ margin: 0, fontSize: 11, color: C.textSecondary }}>
              Check every detail. Nothing is submitted until you confirm below.
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            background: C.mint100,
            border: `1px solid ${C.mint300}`,
            borderRadius: 14,
            padding: "12px 14px",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              color: C.teal700,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            You can edit the report fields here, or return to Sathi to add
            information or correct the conversation before filing.
          </p>
          <button
            type="button"
            onClick={onContinueChat}
            style={{
              border: 0,
              padding: 0,
              background: "transparent",
              color: C.teal700,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Add or correct details with Sathi
          </button>
        </div>

        {/* Listen Audio Card */}
        <div
          onClick={handleSpeakSummary}
          style={{
            background: C.mint100,
            borderRadius: 14,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            cursor: "pointer",
            border: `1px solid ${C.mint300}`,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: C.teal600,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.white,
              fontSize: 16,
            }}
          >
            {speaking ? "⏹" : "▶"}
          </div>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: C.teal700,
              }}
            >
              {speaking
                ? "Playing Complaint Audio Summary..."
                : "Listen to Generated Audio Summary"}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: C.textSecondary }}>
              Browser Text-to-Speech playback of this report
            </p>
          </div>
        </div>

        {/* Complaint Details Card */}
        <div
          style={{
            background: C.white,
            borderRadius: 16,
            padding: "18px 16px",
            border: `1px solid ${C.divider}`,
            boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
          }}
        >
          <p
            style={{
              margin: "0 0 14px",
              fontSize: 11,
              fontWeight: 700,
              color: C.teal700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            NCRP Standard Intake Fields
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label
                className="cy-label"
                style={labelStyle}
                htmlFor="rev-category"
              >
                Incident Category
              </label>
              <input
                id="rev-category"
                type="text"
                value={extractedData.category}
                onChange={(e) =>
                  setExtractedData({
                    ...extractedData,
                    category: e.target.value,
                  })
                }
                className="cy-input"
                style={inputStyle}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <label
                  className="cy-label"
                  style={labelStyle}
                  htmlFor="rev-amount"
                >
                  Amount Defrauded
                </label>
                <input
                  id="rev-amount"
                  type="text"
                  value={extractedData.amount}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      amount: e.target.value,
                    })
                  }
                  className="cy-input"
                  style={{ ...inputStyle, fontWeight: 700, color: C.danger }}
                />
              </div>

              <div>
                <label
                  className="cy-label"
                  style={labelStyle}
                  htmlFor="rev-date"
                >
                  Incident Date
                </label>
                <input
                  id="rev-date"
                  type="text"
                  value={extractedData.incidentDate}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      incidentDate: e.target.value,
                    })
                  }
                  className="cy-input"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label
                className="cy-label"
                style={labelStyle}
                htmlFor="rev-phone"
              >
                Suspect Phone Number
              </label>
              <input
                id="rev-phone"
                type="text"
                value={extractedData.suspectPhone}
                placeholder="e.g. +91 98765 00000"
                onChange={(e) =>
                  setExtractedData({
                    ...extractedData,
                    suspectPhone: e.target.value,
                  })
                }
                className="cy-input"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="cy-label" style={labelStyle} htmlFor="rev-upi">
                Suspect UPI / VPA / Account
              </label>
              <input
                id="rev-upi"
                type="text"
                value={extractedData.suspectUpi}
                placeholder="e.g. fraudulent.merchant@upi"
                onChange={(e) =>
                  setExtractedData({
                    ...extractedData,
                    suspectUpi: e.target.value,
                  })
                }
                className="cy-input"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                className="cy-label"
                style={labelStyle}
                htmlFor="rev-suspect-details"
              >
                Suspect Website / Other Details
              </label>
              <input
                id="rev-suspect-details"
                type="text"
                value={extractedData.suspectDetails}
                placeholder="Website, account details, or other identifier"
                onChange={(e) =>
                  setExtractedData({
                    ...extractedData,
                    suspectDetails: e.target.value,
                  })
                }
                className="cy-input"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                className="cy-label"
                style={labelStyle}
                htmlFor="rev-platform"
              >
                Platform / Banking App
              </label>
              <input
                id="rev-platform"
                type="text"
                value={extractedData.platform}
                placeholder="e.g. PhonePe / Google Pay / SBI Yono"
                onChange={(e) =>
                  setExtractedData({
                    ...extractedData,
                    platform: e.target.value,
                  })
                }
                className="cy-input"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                className="cy-label"
                style={labelStyle}
                htmlFor="rev-summary"
              >
                Report Summary
              </label>
              <textarea
                id="rev-summary"
                rows={3}
                value={extractedData.summary}
                onChange={(e) =>
                  setExtractedData({
                    ...extractedData,
                    summary: e.target.value,
                  })
                }
                className="cy-input"
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }}
              />
            </div>

            <div>
              <label
                className="cy-label"
                style={labelStyle}
                htmlFor="rev-narrative"
              >
                Formal Incident Narrative for Cyber Cell
              </label>
              <textarea
                id="rev-narrative"
                rows={4}
                value={extractedData.complaintNarrative}
                onChange={(e) =>
                  setExtractedData({
                    ...extractedData,
                    complaintNarrative: e.target.value,
                  })
                }
                className="cy-input"
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }}
              />
            </div>

            <div>
              <label
                className="cy-label"
                style={labelStyle}
                htmlFor="rev-action-requested"
              >
                Requested Action
              </label>
              <textarea
                id="rev-action-requested"
                rows={2}
                value={extractedData.actionRequested}
                onChange={(e) =>
                  setExtractedData({
                    ...extractedData,
                    actionRequested: e.target.value,
                  })
                }
                className="cy-input"
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }}
              />
            </div>
          </div>
        </div>

        {/* Complainant Profile Box */}
        <div
          style={{
            background: C.white,
            borderRadius: 16,
            padding: "14px 16px",
            border: `1px solid ${C.divider}`,
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 11,
              fontWeight: 700,
              color: C.textSecondary,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Complainant Credentials
          </p>
          <p
            style={{
              margin: "0 0 2px",
              fontSize: 13,
              fontWeight: 700,
              color: C.textPrimary,
            }}
          >
            {userProfile.displayName || "Complainant"}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>
            {userProfile.phone || userProfile.email} •{" "}
            {userProfile.stateDistrict}
          </p>
        </div>

        {/* Submit Button */}
        <div style={{ marginTop: 8 }}>
          <PrimaryButton
            label={submitting ? "Saving report..." : "Save reviewed report"}
            disabled={submitting}
            onClick={handleFormSubmit}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Real Success Screen ──────────────────────────────────────────────────────

function SuccessScreen({
  caseRecord,
  onTrack,
  onHome,
}: {
  caseRecord: CaseRecord | null
  onTrack: () => void
  onHome: () => void
}) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "28px 20px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: C.bgCanvas,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: C.successBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
          marginBottom: 16,
        }}
      >
        ✓
      </div>

      <h1
        style={{
          fontFamily: "'Poppins', sans-serif",
          fontSize: 22,
          fontWeight: 700,
          color: C.textPrimary,
          margin: "0 0 6px",
          textAlign: "center",
        }}
      >
        Report saved
      </h1>
      <p
        style={{
          fontSize: 13,
          color: C.textSecondary,
          textAlign: "center",
          margin: "0 0 24px",
          lineHeight: 1.5,
        }}
      >
        Your reviewed report is saved to your Cyber Sathi account. It has not
        been submitted to a government portal.
      </p>

      <div
        style={{
          width: "100%",
          background: C.white,
          border: `1px solid ${C.teal600}`,
          borderRadius: 16,
          padding: "16px 18px",
          marginBottom: 20,
          boxSizing: "border-box",
        }}
      >
        <p
          style={{
            margin: "0 0 4px",
            fontSize: 10,
            fontWeight: 700,
            color: C.textSecondary,
            letterSpacing: "0.08em",
          }}
        >
          CYBER SATHI CASE ID
        </p>
        <p
          style={{
            margin: 0,
            overflowWrap: "anywhere",
            fontFamily: "monospace",
            fontSize: 14,
            fontWeight: 700,
            color: C.teal700,
          }}
        >
          {caseRecord?.id || "Unavailable"}
        </p>
      </div>

      {/* Case Summary Snapshot */}
      <div
        style={{
          width: "100%",
          background: C.white,
          borderRadius: 16,
          padding: "16px",
          marginBottom: 24,
          border: `1px solid ${C.divider}`,
          boxSizing: "border-box",
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 12,
            fontWeight: 700,
            color: C.teal700,
            textTransform: "uppercase",
          }}
        >
          Saved Report Details
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: C.textSecondary }}>Incident Category:</span>
            <strong>{caseRecord?.category || "Not classified"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: C.textSecondary }}>Amount Involved:</span>
            <strong style={{ color: C.danger }}>
              {caseRecord?.amount || "Not provided"}
            </strong>
          </div>
          {caseRecord?.suspectPhone && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: C.textSecondary }}>Suspect Phone:</span>
              <strong>{caseRecord.suspectPhone}</strong>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: C.textSecondary }}>Filing Destination:</span>
            <strong style={{ fontSize: 11, textAlign: "right" }}>
              Not submitted
            </strong>
          </div>
        </div>
      </div>

      {/* Next Actions */}
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          boxSizing: "border-box",
        }}
      >
        <PrimaryButton label="View saved case" onClick={onTrack} />
        <a
          href="https://cybercrime.gov.in/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            padding: "12px 16px",
            borderRadius: 24,
            background: C.teal600,
            color: C.white,
            textAlign: "center",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Open official cybercrime portal
        </a>
        <SecondaryButton label="Return to Home Dashboard" onClick={onHome} />
      </div>
    </div>
  )
}

// ─── Filing Preview Screen ────────────────────────────────────────────────────

type FilingPreviewResponse = {
  previewChecksum: string
  destinationName: string
  destinationUrl: string
  explanation: string
  submissionData: unknown
}

function FilingPreviewScreen({
  caseRecord,
  onBack,
  onHome,
}: {
  caseRecord: CaseRecord
  onBack: () => void
  onHome: () => void
}) {
  const [preview, setPreview] = useState<FilingPreviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [handoff, setHandoff] = useState<any>(null)

  useEffect(() => {
    let live = true
    async function loadPreview() {
      try {
        const data = await apiRequest<FilingPreviewResponse>(
          `/cases/${encodeURIComponent(caseRecord.id)}/filing-preview`,
        )
        if (live) setPreview(data)
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Failed to load preview")
      } finally {
        if (live) setLoading(false)
      }
    }
    loadPreview()
    return () => {
      live = false
    }
  }, [caseRecord.id])

  const handleConfirm = async () => {
    if (!preview) return
    setConfirming(true)
    try {
      const data = await apiRequest<{ handoff: unknown }>(
        `/cases/${encodeURIComponent(caseRecord.id)}/confirm-filing`,
        {
          method: "POST",
          body: JSON.stringify({
            previewChecksum: preview.previewChecksum,
            acknowledgment: `I_REVIEWED_PREVIEW:${preview.previewChecksum}`,
          }),
        },
      )
      setHandoff(data.handoff)
      setConfirmed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm filing")
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.bgCanvas,
        }}
      >
        <div style={{ fontSize: 13, color: C.textSecondary }}>
          Loading filing preview…
        </div>
      </div>
    )
  }

  if (error && !preview) {
    return (
      <div style={{ flex: 1, padding: 20, background: C.bgCanvas }}>
        <div
          style={{
            background: C.white,
            borderRadius: 16,
            padding: 20,
            border: `1px solid ${C.danger}`,
          }}
        >
          <p style={{ margin: 0, color: C.danger }}>{error}</p>
          <button
            onClick={onBack}
            style={{
              marginTop: 16,
              padding: "10px 16px",
              borderRadius: 20,
              border: `1px solid ${C.teal600}`,
              background: C.white,
              color: C.teal700,
              fontWeight: 700,
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px 20px 24px",
        background: C.bgCanvas,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            color: C.teal600,
          }}
        >
          ‹
        </button>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: C.textPrimary,
          }}
        >
          File Case
        </h2>
      </div>

      {preview && (
        <div
          style={{
            background: C.white,
            borderRadius: 16,
            padding: 16,
            border: `1px solid ${C.divider}`,
            marginBottom: 16,
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 10,
              fontWeight: 700,
              color: C.teal700,
              letterSpacing: "0.08em",
            }}
          >
            FILING DESTINATION
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: C.textPrimary,
            }}
          >
            {preview.destinationName}
          </p>
          <p
            style={{ margin: "8px 0 0", fontSize: 11, color: C.textSecondary }}
          >
            {preview.explanation}
          </p>
          <a
            href={preview.destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              marginTop: 8,
              fontSize: 11,
              color: C.teal600,
              textDecoration: "underline",
            }}
          >
            {preview.destinationUrl}
          </a>
        </div>
      )}

      {preview && (
        <div
          style={{
            background: C.white,
            borderRadius: 16,
            padding: 16,
            border: `1px solid ${C.divider}`,
            marginBottom: 16,
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 10,
              fontWeight: 700,
              color: C.teal700,
              letterSpacing: "0.08em",
            }}
          >
            CASE DATA TO BE SUBMITTED
          </p>
          <pre
            style={{
              margin: 0,
              fontSize: 10,
              maxHeight: 300,
              overflow: "auto",
              background: C.bgCanvas,
              padding: 12,
              borderRadius: 8,
              whiteSpace: "pre-wrap",
            }}
          >
            {JSON.stringify(preview.submissionData, null, 2)}
          </pre>
          <p
            style={{ margin: "8px 0 0", fontSize: 10, color: C.textSecondary }}
          >
            Checksum: <code>{preview.previewChecksum}</code>
          </p>
        </div>
      )}

      {!confirmed && (
        <button
          onClick={handleConfirm}
          disabled={confirming}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 24,
            border: "none",
            background: confirming ? "#9AA6A3" : C.teal600,
            color: C.white,
            fontSize: 14,
            fontWeight: 700,
            cursor: confirming ? "not-allowed" : "pointer",
          }}
        >
          {confirming ? "Confirming…" : "Confirm & Open Filing Portal"}
        </button>
      )}

      {confirmed && handoff && (
        <div
          style={{
            marginTop: 16,
            background: C.successBg,
            borderRadius: 16,
            padding: 16,
            border: `1px solid ${C.teal600}`,
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 12,
              fontWeight: 700,
              color: C.teal700,
            }}
          >
            ✅ Case Filed Successfully
          </p>
          <p style={{ margin: 0, fontSize: 11, color: C.teal700 }}>
            Your case has been filed. The portal handoff is ready.
          </p>
          {handoff.url && (
            <a
              href={handoff.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginTop: 12,
                padding: "12px 16px",
                borderRadius: 20,
                background: C.teal600,
                color: C.white,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Open Portal Handoff
            </a>
          )}
          {handoff.trackingNumber && (
            <p style={{ margin: "12px 0 0", fontSize: 11, color: C.teal700 }}>
              Tracking Number: <strong>{handoff.trackingNumber}</strong>
            </p>
          )}
        </div>
      )}

      <button
        onClick={onHome}
        style={{
          marginTop: 16,
          width: "100%",
          padding: "12px",
          borderRadius: 24,
          border: `1px solid ${C.teal600}`,
          background: C.white,
          color: C.teal700,
          fontWeight: 700,
        }}
      >
        Return to Home
      </button>
    </div>
  )
}

// ─── Real "My Cases" Screen ───────────────────────────────────────────────────

function MyCasesScreen({
  cases,
  loading,
  error,
  onRetry,
  onSelectCase,
  onContinueCase,
  onNewReport,
}: {
  cases: CaseRecord[]
  loading: boolean
  error: string
  onRetry: () => void
  onSelectCase: (c: CaseRecord) => void
  onContinueCase: (c: CaseRecord) => void
  onNewReport: () => void
}) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        background: C.bgCanvas,
        padding: "18px 20px 24px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <h1
          style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: 22,
            fontWeight: 700,
            color: C.textPrimary,
            margin: 0,
          }}
        >
          My Cases
        </h1>
        <button
          onClick={onNewReport}
          style={{
            background: C.teal600,
            border: "none",
            borderRadius: 20,
            padding: "8px 14px",
            color: C.white,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + New Report
        </button>
      </div>

      {loading ? (
        <p
          style={{ marginTop: 24, textAlign: "center", color: C.textSecondary }}
        >
          Loading saved reports...
        </p>
      ) : error ? (
        <div
          role="alert"
          style={{
            marginTop: 20,
            padding: 16,
            background: C.white,
            border: `1px solid ${C.danger}`,
            borderRadius: 16,
            color: C.textPrimary,
          }}
        >
          <p style={{ margin: "0 0 12px", fontSize: 13 }}>{error}</p>
          <SecondaryButton label="Retry loading reports" onClick={onRetry} />
        </div>
      ) : cases.length === 0 ? (
        <div
          style={{
            background: C.white,
            borderRadius: 20,
            padding: "36px 20px",
            textAlign: "center",
            border: `1px solid ${C.divider}`,
            marginTop: 20,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
          <h3
            style={{
              margin: "0 0 6px",
              fontSize: 16,
              fontWeight: 700,
              color: C.textPrimary,
            }}
          >
            No Saved Reports Yet
          </h3>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: 13,
              color: C.textSecondary,
              lineHeight: 1.5,
            }}
          >
            Reports saved to your Cyber Sathi account will appear here. Official
            portal acknowledgment numbers appear only after you submit there.
          </p>
          <PrimaryButton label="Report an Incident Now" onClick={onNewReport} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cases.map((c) => {
            const open = isCaseOpen(c)
            return (
              <div
                key={c.id}
                onClick={() => onSelectCase(c)}
                style={{
                  background: C.white,
                  borderRadius: 16,
                  padding: "16px",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(11,46,46,0.06)",
                  border: `1px solid ${open ? C.teal600 : C.divider}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.teal700,
                      fontFamily: "monospace",
                    }}
                  >
                    {c.trackingNumber || `Case ID: ${c.id}`}
                  </span>
                  <span
                    style={{
                      background: open ? "#FFF4D6" : C.mint100,
                      color: open ? "#9A6100" : C.teal700,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 8,
                    }}
                  >
                    {open ? "OPEN" : caseStatusLabel(c.status)}
                  </span>
                </div>

                <p
                  style={{
                    margin: "0 0 4px",
                    fontSize: 15,
                    fontWeight: 700,
                    color: C.textPrimary,
                  }}
                >
                  {c.category || "Unclassified incident"}
                </p>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 12,
                    color: C.textSecondary,
                  }}
                >
                  Loss:{" "}
                  <strong style={{ color: C.danger }}>
                    {c.amount || "Not provided"}
                  </strong>{" "}
                  • {c.incidentDate || "Date not set"}
                </p>
                <p
                  style={{
                    margin: "0 0 10px",
                    fontSize: 12,
                    color: C.textSecondary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.complaintNarrative || c.summary || "No details saved yet."}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  {open && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onContinueCase(c)
                      }}
                      style={{
                        flex: 1,
                        background: C.teal700,
                        color: C.white,
                        border: "none",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Continue report
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectCase(c)
                    }}
                    style={{
                      flex: open ? "0 0 auto" : 1,
                      background: C.white,
                      color: C.teal700,
                      border: `1px solid ${C.teal600}`,
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    View details
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Real Case Status Screen ──────────────────────────────────────────────────

function CaseStatusScreen({
  caseRecord,
  onBack,
  onContinue,
  onSummary,
}: {
  caseRecord: CaseRecord | null
  onBack: () => void
  onContinue: (c: CaseRecord) => void
  onSummary?: (c: CaseRecord) => void
}) {
  if (!caseRecord) {
    return (
      <div style={{ flex: 1, padding: 20 }}>
        <button onClick={onBack}>‹ Back</button>
        <p>Case not found.</p>
      </div>
    )
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: C.teal600,
            }}
          >
            ‹
          </button>
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
              Case Tracking
            </h2>
            <p style={{ margin: 0, fontSize: 11, color: C.textSecondary }}>
              {caseRecord.trackingNumber
                ? `Official acknowledgment: ${caseRecord.trackingNumber}`
                : `Cyber Sathi case ID: ${caseRecord.id}`}
            </p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
        {isCaseOpen(caseRecord) && (
          <div style={{ marginBottom: 14 }}>
            <PrimaryButton
              label="Continue open report"
              onClick={() => onContinue(caseRecord)}
            />
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 11,
                color: C.textSecondary,
                lineHeight: 1.4,
              }}
            >
              Open case: your saved report fields and uploaded evidence stay
              linked to this case. Continue to add details, upload evidence, and
              finalize.
            </p>
          </div>
        )}
        {onSummary && (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => onSummary(caseRecord)}
              style={{
                width: "100%",
                border: `1px solid ${C.teal600}`,
                background: C.white,
                color: C.teal700,
                borderRadius: 24,
                padding: "11px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Summary & awareness post
            </button>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 11,
                color: C.textSecondary,
                lineHeight: 1.4,
              }}
            >
              Read the saved English or Hindi summary, or create a safe social
              media post from it.
            </p>
          </div>
        )}
        {/* Summary Card */}
        <div
          style={{
            background: C.white,
            borderRadius: 16,
            padding: "16px",
            marginBottom: 20,
            border: `1px solid ${C.divider}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.teal700,
                fontFamily: "monospace",
              }}
            >
              {caseRecord.trackingNumber || `Case ID: ${caseRecord.id}`}
            </span>
            <span
              style={{
                background: isCaseOpen(caseRecord) ? "#FFF4D6" : C.mint100,
                color: isCaseOpen(caseRecord) ? "#9A6100" : C.teal700,
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 8,
              }}
            >
              {isCaseOpen(caseRecord)
                ? "OPEN"
                : caseStatusLabel(caseRecord.status)}
            </span>
          </div>
          <h3
            style={{
              margin: "0 0 4px",
              fontSize: 16,
              fontWeight: 700,
              color: C.textPrimary,
            }}
          >
            {caseRecord.category}
          </h3>
          <p
            style={{ margin: "0 0 10px", fontSize: 13, color: C.textSecondary }}
          >
            Reported Amount:{" "}
            <strong style={{ color: C.danger }}>
              {caseRecord.amount || "Not provided"}
            </strong>
          </p>
          <div
            style={{
              background: C.bgCanvas,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 10,
                fontWeight: 700,
                color: C.textSecondary,
                textTransform: "uppercase",
              }}
            >
              Report Narrative
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: C.textPrimary,
                lineHeight: 1.4,
              }}
            >
              {caseRecord.complaintNarrative}
            </p>
          </div>
        </div>

        <div
          style={{
            padding: 14,
            background: C.mint100,
            border: `1px solid ${C.mint300}`,
            borderRadius: 12,
          }}
        >
          <strong style={{ color: C.teal700, fontSize: 12 }}>
            Cyber Sathi record status
          </strong>
          <p
            style={{
              margin: "6px 0 0",
              color: C.textPrimary,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            This status reflects the saved record in Cyber Sathi only. It does
            not show government portal processing or bank action. An official
            acknowledgment is shown only when one has been recorded.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Real Defend Community Feed Screen ────────────────────────────────────────

function DefendScreen({ onStartReport }: { onStartReport: () => void }) {
  const officialResources = [
    {
      name: "CERT-In advisories",
      description:
        "Open the Indian Computer Emergency Response Team website for current security advisories.",
      url: "https://www.cert-in.org.in/",
    },
    {
      name: "National Cyber Crime Reporting Portal",
      description:
        "Use the Government of India's official portal to report cybercrime and financial fraud.",
      url: "https://cybercrime.gov.in/",
    },
  ]

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        background: C.bgCanvas,
        padding: "18px 20px 24px",
      }}
    >
      <h1
        style={{
          fontFamily: "'Poppins', sans-serif",
          fontSize: 22,
          fontWeight: 700,
          color: C.textPrimary,
          margin: "0 0 4px",
        }}
      >
        Defend & Protect
      </h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSecondary }}>
        Official resources for current cyber security guidance and reporting.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            background: C.warning,
            borderRadius: 12,
            padding: 12,
            color: "#7a4d00",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Live advisory feeds are not connected in this app. Open an official
          source below to see current information; Cyber Sathi does not display
          unverified or sample alerts.
        </div>
        {officialResources.map((resource) => (
          <div
            key={resource.url}
            style={{
              background: C.white,
              borderRadius: 16,
              padding: "16px",
              border: `1px solid ${C.divider}`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            <h2
              style={{
                margin: "0 0 6px",
                color: C.textPrimary,
                fontSize: 15,
              }}
            >
              {resource.name}
            </h2>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 13,
                color: C.textPrimary,
                lineHeight: 1.4,
              }}
            >
              {resource.description}
            </p>
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: C.teal700,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              Visit official source ↗
            </a>
          </div>
        ))}

        <div style={{ marginTop: 12 }}>
          <SecondaryButton
            label="Got targeted by a scam? Report with Sathi"
            onClick={onStartReport}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Tab Bar Component ────────────────────────────────────────────────────────

function TabBar({
  active,
  onSwitch,
}: {
  active: Tab
  onSwitch: (t: Tab) => void
}) {
  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: "home", icon: "🎙️", label: "Assistant" },
    { key: "my-cases", icon: "📋", label: "My Cases" },
    { key: "defend", icon: "🛡️", label: "Defend" },
    { key: "profile", icon: "👤", label: "Profile" },
  ]

  return (
    <nav
      aria-label="Primary navigation"
      style={{
        background: C.white,
        borderTop: `1px solid ${C.divider}`,
        display: "flex",
        height: "calc(62px + env(safe-area-inset-bottom, 0px))",
        flexShrink: 0,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-label={t.label}
          aria-current={active === t.key ? "page" : undefined}
          onClick={() => onSwitch(t.key)}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            position: "relative",
          }}
        >
          {active === t.key && (
            <div
              style={{
                position: "absolute",
                top: 6,
                borderRadius: 12,
                background: C.mint100,
                width: 44,
                height: 28,
              }}
            />
          )}
          <span style={{ fontSize: 18, position: "relative", zIndex: 1 }}>
            {t.icon}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: active === t.key ? 700 : 400,
              color: active === t.key ? C.teal600 : C.textSecondary,
              position: "relative",
              zIndex: 1,
            }}
          >
            {t.label}
          </span>
        </button>
      ))}
    </nav>
  )
}

// ─── Button Helpers & Styling ─────────────────────────────────────────────────

function PrimaryButton({
  label,
  onClick,
  disabled = false,
  style = {},
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  style?: React.CSSProperties
}) {
  return (
    <button
      className="cy-btn cy-btn-primary"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "14px 20px",
        borderRadius: 28,
        border: "none",
        background: disabled ? "#ccc" : C.teal600,
        color: disabled ? "#888" : C.white,
        fontSize: 14,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform 0.1s, background 0.2s",
        ...style,
      }}
    >
      {label}
    </button>
  )
}

function SecondaryButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      className="cy-btn cy-btn-secondary"
      onClick={onClick}
      style={{
        width: "100%",
        padding: "13px 20px",
        borderRadius: 28,
        border: `2px solid ${C.teal600}`,
        background: "transparent",
        color: C.teal600,
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  )
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 700,
  color: C.textPrimary,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1.5px solid ${C.divider}`,
  borderRadius: 12,
  padding: "12px 14px",
  color: C.textPrimary,
  background: C.white,
  fontSize: 14,
  outline: "none",
}
