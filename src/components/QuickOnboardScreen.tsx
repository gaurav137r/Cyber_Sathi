import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { quickOnboard, lookUpPincode, type QuickOnboardInput } from "../lib/profile"

const C = {
  teal600: "#146B66",
  teal700: "#0F4C4C",
  mint100: "#E3F3EF",
  bgCanvas: "#F4F5F3",
  white: "#FFFFFF",
  textPrimary: "#16211F",
  textSecondary: "#5B6B68",
  divider: "#E6E8E6",
  danger: "#E15347",
}

const labelStyle: React.CSSProperties = {
  margin: "0 0 5px",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
  color: C.teal700,
  display: "block",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
  color: C.textPrimary,
  background: C.white,
  border: `1px solid ${C.divider}`,
  borderRadius: 10,
  outline: "none",
  boxSizing: "border-box",
}

const LOGO_SIZE = 96

export default function QuickOnboardScreen({
  onDone,
  language = "en",
}: {
  onDone: () => void
  language?: string
}) {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [pinCode, setPinCode] = useState("")
  const [derived, setDerived] = useState<{
    city?: string | null
    district?: string | null
    state?: string | null
  }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const emailPrefilledRef = useRef(false)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession()
      const userEmail = data?.session?.user?.email ?? ""
      if (userEmail && !emailPrefilledRef.current) {
        setEmail(userEmail)
        emailPrefilledRef.current = true
      }
    })()
  }, [])

  const handlePinBlur = useCallback(async () => {
    const pin = pinCode.trim()
    if (!/^\d{6}$/.test(pin)) {
      setDerived({})
      return
    }
    setError("")
    try {
      const result = await lookUpPincode(pin)
      if (result.state || result.district || result.city) {
        setDerived({
          city: result.city ?? null,
          district: result.district ?? null,
          state: result.state ?? null,
        })
        setNotice(
          language === "hi"
            ? "पिन कोड से स्थान का विवरण भर दिया गया है।"
            : "Location filled from PIN code.",
        )
      } else {
        setNotice(
          language === "hi"
            ? "पिन कोड से स्थान का विवरण नहीं मिला। मैन्युअल रूप से दर्ज करें।"
            : "Could not resolve location from PIN code. Please enter it manually.",
        )
      }
    } catch {
      setDerived({})
    }
  }, [pinCode, language])

  const handleSave = async () => {
    setError("")
    setNotice("")
    if (!fullName.trim()) {
      setError("Please enter your full name.")
      return
    }
    if (!addressLine1.trim()) {
      setError("Please enter your full address.")
      return
    }
    if (!/^\d{6}$/.test(pinCode.trim())) {
      setError("Please enter a valid 6-digit PIN code.")
      return
    }

    setBusy(true)
    try {
      const input: QuickOnboardInput = {
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        addressLine1: addressLine1.trim(),
        pinCode: pinCode.trim(),
      }
      await quickOnboard(input)
      setNotice(
        language === "hi"
          ? "प्रोफाइल बचा लिया गया है। डैशबोर्ड पर ले जाया जा रहा है।"
          : "Profile saved. Taking you to the dashboard.",
      )
      // Small delay so the notice is visible before navigation.
      await new Promise((resolve) => setTimeout(resolve, 800))
      onDone()
    } catch (err: any) {
      setError(
        err?.message ||
          (language === "hi"
            ? "प्रोफाइल नहीं बचा जा सका।"
            : "Could not save the profile."),
      )
    } finally {
      setBusy(false)
    }
  }

  const t = (en: string, hi: string) => (language === "hi" ? hi : en)

  return (
    <div
      style={{
        flex: 1,
        background: C.bgCanvas,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "18px 20px 10px",
          background: C.white,
          borderBottom: `1px solid ${C.divider}`,
        }}
      >
        <img
          src="/logo.png"
          alt="Cyber Sathi"
          style={{
            width: LOGO_SIZE,
            height: (LOGO_SIZE * 1070) / 1647,
            display: "block",
            margin: "0 auto",
          }}
        />
        <h2
          style={{
            margin: "10px 0 4px",
            fontSize: 20,
            fontWeight: 700,
            color: C.textPrimary,
            textAlign: "center",
            fontFamily: "'Poppins', sans-serif",
          }}
        >
          {t("Complete your profile", "अपना प्रोफ़ाइल पूरा करें")}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: C.textSecondary,
            textAlign: "center",
          }}
        >
          {t(
            "Tell us a little about yourself so we can personalise your experience.",
            "अपने अनुभव को निजी बनाने के लिए अपने बारे में थोड़ी जानकारी दें।",
          )}
        </p>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "18px 20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <label style={labelStyle} htmlFor="onboard-name">
            {t("Full name", "पूरा नाम")} <span style={{ color: C.danger }}>*</span>
          </label>
          <input
            id="onboard-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("As per Aadhaar / PAN", "आधार / पैन के अनुसार")}
            style={inputStyle}
            autoComplete="name"
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="onboard-email">
            {t("Email", "ईमेल")}
          </label>
          <input
            id="onboard-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("Pre-filled from your account", "आपके खाते से पहले से भरा हुआ")}
            style={inputStyle}
            autoComplete="email"
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="onboard-address">
            {t("Your full address", "आपका पूरा पता")} <span style={{ color: C.danger }}>*</span>
          </label>
          <input
            id="onboard-address"
            type="text"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder={t("House/flat, street, locality", "मकान/फ्लैट, सड़क, मोहल्ला")}
            style={inputStyle}
            autoComplete="street-address"
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="onboard-pincode">
            {t("PIN code", "पिन कोड")} <span style={{ color: C.danger }}>*</span>
          </label>
          <input
            id="onboard-pincode"
            type="text"
            value={pinCode}
            onChange={(e) =>
              setPinCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            onBlur={handlePinBlur}
            placeholder="110001"
            maxLength={6}
            style={inputStyle}
            autoComplete="postal-code"
          />
          {derived.state || derived.district || derived.city && (
            <p
              style={{
                margin: "5px 0 0",
                fontSize: 11,
                color: C.teal700,
                background: C.mint100,
                borderRadius: 8,
                padding: "6px 9px",
                display: "inline-block",
              }}
            >
              {t("Derived from PIN code", "पिन कोड से प्राप्त")}:{" "}
              {derived.state || derived.district || derived.city}
            </p>
          )}
        </div>

        {error && (
          <p style={{ color: C.danger, fontSize: 12, margin: 0 }}>{error}</p>
        )}
        {notice && (
          <p
            style={{
              margin: 0,
              fontSize: 11,
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

        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            disabled={busy}
            onClick={handleSave}
            style={{
              width: "100%",
              marginTop: 6,
              border: 0,
              borderRadius: 24,
              padding: "12px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              background: busy ? "#9AA6A3" : C.teal600,
              color: C.white,
            }}
          >
            {busy
              ? language === "hi"
                ? "प्रोफाइल बचा रहा है…"
                : "Saving profile…"
              : language === "hi"
                ? "प्रोफाइल बचाएं और आगे बढ़ें"
                : "Save & Continue to Dashboard"}
          </button>
        </div>
      </div>
    </div>
  )
}
