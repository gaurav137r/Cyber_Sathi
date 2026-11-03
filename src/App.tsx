import { useState, useEffect, useRef } from "react"
import { supabase } from "./lib/supabase"
import type { ChatMessage, ExtractedCaseData } from "./lib/ai"
import {
  generateSathiSpeech,
  mergeSathiFactsIntoReport,
  sendSathiTurn,
  sathiFactsToReport,
  startSathiSession,
  type SathiFacts,
  type SathiResponse,
} from "./lib/sathi"
import { fetchUserCases, saveReviewedCase, type CaseRecord } from "./lib/cases"
import { ensureProfile, updateProfile } from "./lib/profiles"

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = "loading" | "auth" | "onboard-profile" | "home" | "agent-chat" | "review-report" | "success" | "my-cases" | "case-status" | "defend" | "profile"

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

  // 1. Check real Supabase Authentication session on boot
  useEffect(() => {
    async function initAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.user) {
          await handleSessionEstablished(session.user)
        } else {
          setScreen("auth")
        }
      } catch (err) {
        console.warn("Auth check note:", err)
        setScreen("auth")
      }
    }

    void initAuth()

    // Listen to real-time auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void handleSessionEstablished(session.user)
      } else {
        setSessionUser(null)
        setScreen("auth")
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function handleSessionEstablished(user: any) {
    setSessionUser(user)
    const meta = user.user_metadata || {}
    const phone = meta.phone_e164 || meta.phone || ""
    const loc = meta.state_district || meta.state || ""
    const lang = (meta.preferred_language as "en" | "hi" | "bn") || "en"

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

    if (!name || name === user.email?.split("@")[0]) {
      setScreen("onboard-profile")
    } else {
      setScreen("home")
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

  const startNewReport = async (initialTopic?: string) => {
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

    go("agent-chat")
    try {
      const session = await startSathiSession(language)
      setSathiCaseId(session.caseId)
      setSathiFacts(session.facts)
      setExtractedData(sathiFactsToReport(session.facts))
      setChatMessages([
        {
          id: `msg-welcome-${Date.now()}`,
          sender: "agent",
          text: initialTopic
            ? `Let's talk about ${initialTopic}. ${session.reply ?? greetingText}`
            : session.reply ?? greetingText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ])
    } catch (error) {
      setChatMessages([
        {
          id: `msg-error-${Date.now()}`,
          sender: "agent",
          text: error instanceof Error ? error.message : "Sathi is unavailable right now. Please try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ])
    }
  }

  const handleCaseSubmitted = async (caseRec: CaseRecord) => {
    setSubmittedCase(caseRec)
    setUserCases((prev) => [caseRec, ...prev])
    go("success")
  }

  const showTabBar = ["home", "my-cases", "defend", "profile"].includes(screen)

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#132323",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Noto Sans', 'Noto Sans Devanagari', sans-serif",
      }}
    >
      {/* Mobile viewport frame */}
      <div
        style={{
          width: 390,
          height: 844,
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
        {/* Top Status Bar */}
        <div
          style={{
            height: 44,
            background: screen === "agent-chat" ? C.teal900 : C.bgCanvas,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            flexShrink: 0,
            transition: "background 0.2s",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color:
                screen === "agent-chat"
                  ? "rgba(255,255,255,0.8)"
                  : C.textSecondary,
            }}
          >
            9:41
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11 }}>📶</span>
            <span style={{ fontSize: 11 }}>🔋</span>
          </div>
        </div>

        {/* Screen Routing */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {screen === "loading" && <LoadingScreen />}

          {screen === "auth" && (
            <RealAuthScreen
              onAuthenticated={(user) => handleSessionEstablished(user)}
              language={language}
            />
          )}

          {screen === "onboard-profile" && (
            <ProfileSetupScreen
              userId={sessionUser?.id}
              userProfile={userProfile}
              setUserProfile={setUserProfile}
              onDone={() => go("home")}
              language={language}
            />
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
                  window.alert(
                    "Please sign in to save this report.",
                  )
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
                await handleCaseSubmitted(caseRecord)
              }}
              onBack={() => go("agent-chat")}
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
              onNewReport={() => startNewReport()}
            />
          )}

          {screen === "case-status" && (
            <CaseStatusScreen
              caseRecord={activeCase}
              onBack={() => switchTab("my-cases")}
            />
          )}

          {screen === "defend" && (
            <DefendScreen
              onStartReport={() => startNewReport()}
            />
          )}

          {screen === "profile" && (
            <ProfileScreen
              userProfile={userProfile}
              setUserProfile={setUserProfile}
              language={language}
              setLanguage={setLanguage}
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
              userId={sessionUser?.id}
            />
          )}
        </div>

        {/* Bottom Tab Bar */}
        {showTabBar && <TabBar active={activeTab} onSwitch={switchTab} />}

        {/* Home gesture bar */}
        <div
          style={{
            height: 24,
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

// ─── Loading State ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div
      style={{
        flex: 1,
        background: C.teal900,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 12 }}>🛡️</div>
      <h2
        style={{
          color: C.white,
          fontFamily: "'Poppins', sans-serif",
          fontSize: 24,
          fontWeight: 700,
          margin: "0 0 6px",
        }}
      >
        CyberSathi
      </h2>
      <p style={{ color: C.mint300, fontSize: 13, letterSpacing: "0.1em" }}>
        CONNECTING TO SECURE SERVICES...
      </p>
    </div>
  )
}

// ─── Real Authentication Screen ───────────────────────────────────────────────

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

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
            emailRedirectTo: window.location.origin,
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
                <label style={labelStyle} htmlFor="auth-name">
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
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle} htmlFor="auth-phone">
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
            <label style={labelStyle} htmlFor="auth-email">
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
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle} htmlFor="auth-password">
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
              <button
                type="button"
                disabled={busy || !email.trim()}
                onClick={async () => {
                  setBusy(true)
                  setError("")
                  try {
                    const { error: resendErr } = await supabase.auth.resend({
                      type: "signup",
                      email: email.trim(),
                      options: { emailRedirectTo: window.location.origin },
                    })
                    if (resendErr) throw resendErr
                    setNotice(
                      "Confirmation email sent again. Check your inbox and spam folder.",
                    )
                  } catch (cause: any) {
                    setError(
                      cause?.message || "Could not resend confirmation email.",
                    )
                  } finally {
                    setBusy(false)
                  }
                }}
                style={{
                  display: "block",
                  marginTop: 8,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: C.teal600,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Resend confirmation email
              </button>
            </div>
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

// ─── Profile Setup ────────────────────────────────────────────────────────────

function ProfileSetupScreen({
  userId,
  userProfile,
  setUserProfile,
  onDone,
  language,
}: {
  userId?: string
  userProfile: any
  setUserProfile: any
  onDone: () => void
  language: string
}) {
  const [name, setName] = useState(userProfile.displayName || "")
  const [phone, setPhone] = useState(
    userProfile.phone.replace("+91 ", "") || "",
  )
  const [stateDistrict, setStateDistrict] = useState(
    userProfile.stateDistrict || "",
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const handleSave = async () => {
    if (name.trim().length < 2) {
      setError("Please enter your legal name for the report.")
      return
    }

    setBusy(true)
    setError("")

    try {
      const cleanPhone = phone.trim()
        ? phone.startsWith("+91")
          ? phone.trim()
          : `+91 ${phone.replace(/\D/g, "")}`
        : ""
      const updated = {
        displayName: name.trim(),
        phone: cleanPhone,
        email: userProfile.email,
        stateDistrict: stateDistrict.trim(),
        language,
      }

      setUserProfile(updated)

      if (userId) {
        await updateProfile(userId, { full_name: name.trim() })
      }

      await supabase.auth.updateUser({
        data: {
          full_name: name.trim(),
          displayName: name.trim(),
          phone_e164: cleanPhone,
          state_district: stateDistrict.trim(),
        },
      })

      onDone()
    } catch (err: any) {
      setError(err?.message || "Could not update profile.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        flex: 1,
        background: C.white,
        display: "flex",
        flexDirection: "column",
        padding: "28px 20px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: C.mint100,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            marginBottom: 8,
          }}
        >
          👤
        </div>
        <h2
          style={{
            margin: "0 0 6px",
            fontSize: 20,
            fontWeight: 700,
            color: C.textPrimary,
            fontFamily: "'Poppins', sans-serif",
          }}
        >
          Complainant Profile
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: C.textSecondary }}>
          Used to prepare your report and identify the relevant jurisdiction
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle} htmlFor="setup-name">
            Legal Full Name
          </label>
          <input
            id="setup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As per Aadhaar / PAN"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="setup-phone">
            Contact Mobile Number
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              ...inputStyle,
            }}
          >
            <span style={{ color: C.textSecondary, fontWeight: 600 }}>+91</span>
            <input
              id="setup-phone"
              type="tel"
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

        <div>
          <label style={labelStyle} htmlFor="setup-location">
            State & District Jurisdiction
          </label>
          <input
            id="setup-location"
            type="text"
            value={stateDistrict}
            onChange={(e) => setStateDistrict(e.target.value)}
            placeholder="e.g. Maharashtra, Mumbai Suburban"
            style={inputStyle}
          />
        </div>

        {error && (
          <p style={{ color: C.danger, fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <div style={{ marginTop: 24 }}>
          <PrimaryButton
            label={busy ? "Saving Profile..." : "Save & Continue to Dashboard"}
            disabled={busy || name.trim().length < 2}
            onClick={handleSave}
          />
        </div>
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
  onStartReport: (topic?: string) => void
  onViewCase: (c: CaseRecord) => void
  recentCases: CaseRecord[]
  language: string
}) {
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => !p), 1200)
    return () => clearInterval(t)
  }, [])

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
            }}
          />
          <button
            onClick={() => onStartReport()}
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
          >
            🎙️
          </button>
        </div>
        <p
          style={{ fontSize: 13, fontWeight: 600, color: C.teal700, margin: 0 }}
        >
          Tap Orb to Start Incident Intake
        </p>
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
                {c.status}
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
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
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
  onProceedToReview: () => void
  onBack: () => void
}) {
  const [inputText, setInputText] = useState("")
  const [isListening, setIsListening] = useState(false)
  const [loadingReply, setLoadingReply] = useState(false)
  const [showExtractedPanel, setShowExtractedPanel] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const speechAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastSpokenReplyRef = useRef<string | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loadingReply])

  useEffect(
    () => () => {
      speechAudioRef.current?.pause()
      if (speechAudioRef.current?.src.startsWith("blob:"))
        URL.revokeObjectURL(speechAudioRef.current.src)
    },
    [],
  )

  const speakReply = async (text: string) => {
    if (!caseId) return
    try {
      const wav = await generateSathiSpeech(caseId, text, language)
      const url = URL.createObjectURL(wav)
      const player = new Audio(url)
      speechAudioRef.current?.pause()
      speechAudioRef.current = player
      player.onended = () => URL.revokeObjectURL(url)
      await player.play()
    } catch {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = language === "hi" ? "hi-IN" : language === "bn" ? "bn-IN" : "en-IN"
        window.speechSynthesis.speak(utterance)
      }
    }
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
    if (!caseId || loadingReply) return
    const text = input.text?.trim()
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: text || "🎙️ Voice message",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoadingReply(true)
    try {
      const response: SathiResponse = await sendSathiTurn(caseId, { language, text, audio: input.audio })
      setExtractedData((current) =>
        mergeSathiFactsIntoReport(current, response.facts, previousFacts),
      )
      setPreviousFacts(response.facts)
      if (response.reply) {
        setMessages((prev) => [...prev, {
          id: `agent-${Date.now()}`, sender: "agent", text: response.reply!,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }])
      }
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: `agent-error-${Date.now()}`, sender: "agent",
        text: error instanceof Error ? error.message : "Sathi could not process that message. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }])
    } finally {
      setLoadingReply(false)
    }
  }

  const toggleMic = async () => {
    if (isListening && recorderRef.current) {
      recorderRef.current.stop()
      setIsListening(false)
      return
    }
    if (!window.isSecureContext) {
      window.alert(
        "Microphone access requires HTTPS or localhost. Open Cyber Sathi through its secure app URL, then try again.",
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      window.alert(
        "This browser does not support microphone recording. Please use a current browser or type your message.",
      )
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const recorded = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" })
        stream.getTracks().forEach((track) => track.stop())
        if (recorded.size) void recorded.arrayBuffer().then(async (buffer) => {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
          const context = new AudioContextClass()
          try {
            const decoded = await context.decodeAudioData(buffer)
            void submitTurn({ audio: new Blob([audioBufferToWav(decoded)], { type: "audio/wav" }) })
          } catch {
            setMessages((prev) => [...prev, {
              id: `agent-audio-error-${Date.now()}`, sender: "agent",
              text: "I couldn't read that recording. Please try again or type your message.",
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            }])
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
      window.alert(`${detail} You can type your message instead.`)
    }
  }

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || loadingReply) return
    setInputText("")
    void submitTurn({ text })
  }

  const hasAnyData = Boolean(
    Boolean(extractedData.amount) ||
      extractedData.suspectPhone ||
      extractedData.suspectUpi ||
      messages.length > 2,
  )

  return (
    <div
      style={{
        flex: 1,
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
        style={{
          flex: 1,
          overflowY: "auto",
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

        <div ref={messagesEndRef} />
      </div>

      {/* Keep the intake open for corrections and extra details before review. */}
      {hasAnyData && (
        <div
          style={{
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
            Add corrections or missing details in the chat above before reviewing.
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
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={toggleMic}
          disabled={!caseId || loadingReply}
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
          value={inputText}
          disabled={!caseId || loadingReply}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void handleSend()
            }
          }}
          placeholder={
            !caseId
              ? "Starting secure Sathi session..."
              : isListening
                ? "Listening... speak now"
                : "Type incident details here..."
          }
          style={{
            flex: 1,
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
          disabled={!caseId || !inputText.trim() || loadingReply}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background:
              !caseId || !inputText.trim() || loadingReply ? C.divider : C.teal600,
            color:
              !caseId || !inputText.trim() || loadingReply ? C.textSecondary : C.white,
            fontSize: 18,
            cursor:
              !caseId || !inputText.trim() || loadingReply ? "not-allowed" : "pointer",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ➤
        </button>
      </div>

      <p style={{ margin: "-4px 16px 8px", fontSize: 10, color: C.textSecondary, background: C.white }}>
        After voice input, type here to add or correct details with Sathi. Voice recordings are sent to Gemini; API credentials stay on the server.
      </p>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
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
    if (!window.speechSynthesis) return

    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }

    const textToSpeak = `Official incident report. Category: ${extractedData.category}. Amount lost: ${extractedData.amount}. Suspect: ${extractedData.suspectPhone || extractedData.suspectUpi || "Unspecified"}. Statement: ${extractedData.complaintNarrative}`
    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    utterance.rate = 1.0
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)

    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
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
              <label style={labelStyle} htmlFor="rev-category">
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
                <label style={labelStyle} htmlFor="rev-amount">
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
                  style={{ ...inputStyle, fontWeight: 700, color: C.danger }}
                />
              </div>

              <div>
                <label style={labelStyle} htmlFor="rev-date">
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
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle} htmlFor="rev-phone">
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
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle} htmlFor="rev-upi">
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
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle} htmlFor="rev-suspect-details">
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
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle} htmlFor="rev-platform">
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
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle} htmlFor="rev-summary">
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
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }}
              />
            </div>

            <div>
              <label style={labelStyle} htmlFor="rev-narrative">
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
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }}
              />
            </div>

            <div>
              <label style={labelStyle} htmlFor="rev-action-requested">
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
            label={
              submitting
                ? "Saving report..."
                : "Save reviewed report"
            }
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

// ─── Real "My Cases" Screen ───────────────────────────────────────────────────

function MyCasesScreen({
  cases,
  loading,
  error,
  onRetry,
  onSelectCase,
  onNewReport,
}: {
  cases: CaseRecord[]
  loading: boolean
  error: string
  onRetry: () => void
  onSelectCase: (c: CaseRecord) => void
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
        <p style={{ marginTop: 24, textAlign: "center", color: C.textSecondary }}>
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
          {cases.map((c) => (
            <div
              key={c.id}
              onClick={() => onSelectCase(c)}
              style={{
                background: C.white,
                borderRadius: 16,
                padding: "16px",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(11,46,46,0.06)",
                border: `1px solid ${C.divider}`,
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
                    background: c.status === "FILED" ? C.mint100 : "#FDECC8",
                    color: c.status === "FILED" ? C.teal700 : "#9A6100",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 8,
                  }}
                >
                  {c.status}
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
                {c.category}
              </p>
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 12,
                  color: C.textSecondary,
                }}
              >
                Loss: <strong style={{ color: C.danger }}>{c.amount}</strong> •{" "}
                {c.incidentDate}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: C.textSecondary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.complaintNarrative}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Real Case Status Screen ──────────────────────────────────────────────────

function CaseStatusScreen({
  caseRecord,
  onBack,
}: {
  caseRecord: CaseRecord | null
  onBack: () => void
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
                background: C.mint100,
                color: C.teal700,
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 8,
              }}
            >
              {caseRecord.status}
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

function DefendScreen({
  onStartReport,
}: {
  onStartReport: () => void
}) {
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

// ─── Real Profile Screen ──────────────────────────────────────────────────────

function ProfileScreen({
  userProfile,
  setUserProfile,
  language,
  setLanguage,
  onLogout,
  userId,
}: {
  userProfile: any
  setUserProfile: any
  language: "en" | "hi" | "bn"
  setLanguage: (l: "en" | "hi" | "bn") => void
  onLogout: () => Promise<void>
  userId?: string
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(userProfile.displayName || "")
  const [phone, setPhone] = useState(
    (userProfile.phone || "").replace("+91 ", ""),
  )
  const [stateDistrict, setStateDistrict] = useState(
    userProfile.stateDistrict || "",
  )
  const [lang, setLang] = useState<"en" | "hi" | "bn">(language)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (!editing) return
    setName(userProfile.displayName || "")
    setPhone((userProfile.phone || "").replace("+91 ", ""))
    setStateDistrict(userProfile.stateDistrict || "")
    setLang(language)
    setError("")
    setNotice("")
  }, [editing, userProfile, language])

  const startEditing = () => {
    setName(userProfile.displayName || "")
    setPhone((userProfile.phone || "").replace("+91 ", ""))
    setStateDistrict(userProfile.stateDistrict || "")
    setLang(language)
    setError("")
    setNotice("")
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setError("")
    setNotice("")
  }

  const handleSave = async () => {
    if (name.trim().length < 2) {
      setError("Please enter your legal name for the report.")
      return
    }
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const cleanPhone = phone.trim()
        ? phone.startsWith("+91")
          ? phone.trim()
          : `+91 ${phone.replace(/\D/g, "")}`
        : ""
      const updated = {
        displayName: name.trim(),
        phone: cleanPhone,
        email: userProfile.email,
        stateDistrict: stateDistrict.trim(),
        language: lang,
      }
      setUserProfile(updated)
      setLanguage(lang)

      if (userId) {
        await updateProfile(userId, { full_name: name.trim() })
      }
      await supabase.auth.updateUser({
        data: {
          full_name: name.trim(),
          displayName: name.trim(),
          phone_e164: cleanPhone,
          state_district: stateDistrict.trim(),
          preferred_language: lang,
        },
      })

      setNotice("Profile updated successfully.")
      setEditing(false)
    } catch (err: any) {
      setError(err?.message || "Could not update profile.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        background: C.bgCanvas,
        padding: "20px",
      }}
    >
      {/* Avatar Header */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.teal600}, ${C.teal500})`,
            margin: "0 auto 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            color: C.white,
            fontWeight: 700,
          }}
        >
          {userProfile.displayName
            ? userProfile.displayName.slice(0, 2).toUpperCase()
            : "👤"}
        </div>
        <p
          style={{
            margin: "0 0 2px",
            fontSize: 17,
            fontWeight: 700,
            color: C.textPrimary,
          }}
        >
          {userProfile.displayName || "Complainant"}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>
          {userProfile.email}
        </p>
        {!editing && (
          <button
            onClick={startEditing}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              borderRadius: 20,
              border: `1.5px solid ${C.teal600}`,
              background: C.white,
              color: C.teal600,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ✏️ Edit Profile
          </button>
        )}
      </div>

{editing && (
        <ProfileSetupScreen
          userId={userId}
          userProfile={userProfile}
          setUserProfile={setUserProfile}
          onDone={cancelEditing}
          language={language}
        />
      )}

      {!editing && (
      <div
        style={{
          background: C.white,
          borderRadius: 16,
          overflow: "hidden",
          marginBottom: 16,
          border: `1px solid ${C.divider}`,
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${C.divider}`,
          }}
        >
          <p
            style={{ margin: "0 0 2px", fontSize: 11, color: C.textSecondary }}
          >
            Contact Phone
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: C.textPrimary,
              fontWeight: 600,
            }}
          >
            {userProfile.phone || "Not provided"}
          </p>
        </div>

        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${C.divider}`,
          }}
        >
          <p
            style={{ margin: "0 0 2px", fontSize: 11, color: C.textSecondary }}
          >
            State / Jurisdiction
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: C.textPrimary,
              fontWeight: 600,
            }}
          >
            {userProfile.stateDistrict || "Not provided"}
          </p>
        </div>

        <div
          style={{
            padding: "14px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 2px",
                fontSize: 11,
                color: C.textSecondary,
              }}
            >
              App Language
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: C.textPrimary,
                fontWeight: 600,
              }}
            >
              {language === "hi"
                ? "हिंदी (Hindi)"
                : language === "bn"
                  ? "বাংলা (Bengali)"
                  : "English"}
            </p>
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "hi" | "bn")}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${C.divider}`,
              fontSize: 12,
              background: C.mint100,
              color: C.teal700,
              fontWeight: 600,
            }}
          >
            <option value="en">English</option>
            <option value="hi">हिंदी</option>
            <option value="bn">বাংলা</option>
          </select>
        </div>
      </div>
      )}

      {/* Sign Out Button */}
      <button
        onClick={() => void onLogout()}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: 24,
          border: `2px solid ${C.danger}`,
          background: "transparent",
          color: C.danger,
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Sign Out of Cyber Sathi
      </button>
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
    <div
      style={{
        background: C.white,
        borderTop: `1px solid ${C.divider}`,
        display: "flex",
        height: 62,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
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
    </div>
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
