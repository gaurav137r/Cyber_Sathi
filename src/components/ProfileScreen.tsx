import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  getProfile,
  updateProfile,
  lookUpPincode,
  type Profile,
  type UpdateProfileInput,
  REQUIRED_FOR_NCRP,
} from "../lib/profile"

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
  success: "#3FAE5C",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "10px 12px",
  fontSize: 14,
  color: C.textPrimary,
  background: C.white,
  border: `1px solid ${C.divider}`,
  borderRadius: 10,
  outline: "none",
  boxSizing: "border-box",
}

// Profile picture configuration
const PROFILE_PIC_SIZE = 80

// Initials color palette
const INITIALS_COLORS = ["#146B66", "#0F4C4C", "#1D8577", "#7FD1C0", "#E3F3EF"]

// Generate color for initials based on name
const getInitialsColor = (initials: string) => {
  let hash = 0
  for (let i = 0; i < initials.length; i++) {
    hash = initials.charCodeAt(i) + ((hash << 5) - hash)
  }
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length]
}

// Render profile picture with initials fallback
const renderProfilePic = (
  picUrl: string | null | undefined,
  name: string | null | undefined,
) => {
  const initials =
    name
      ?.split(" ")
      .map((n: string) => (n.length > 0 ? n[0] : ""))
      .join("")
      .toUpperCase() || ""

  if (picUrl) {
    return (
      <img
        src={picUrl}
        alt="Profile picture"
        style={{
          width: PROFILE_PIC_SIZE,
          height: PROFILE_PIC_SIZE,
          borderRadius: PROFILE_PIC_SIZE / 2,
          objectFit: "cover",
          border: "3px solid " + C.white,
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      />
    )
  }

  if (initials) {
    const color = getInitialsColor(initials)
    return (
      <div
        style={{
          width: PROFILE_PIC_SIZE,
          height: PROFILE_PIC_SIZE,
          borderRadius: PROFILE_PIC_SIZE / 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: color,
          color: C.white,
          fontWeight: 700,
          fontSize: 24,
          textTransform: "uppercase",
        }}
      >
        {initials}
      </div>
    )
  }

  // Empty placeholder
  return (
    <div
      style={{
        width: PROFILE_PIC_SIZE,
        height: PROFILE_PIC_SIZE,
        borderRadius: PROFILE_PIC_SIZE / 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.divider,
        color: C.textSecondary,
        fontSize: 18,
      }}
    >
      —
    </div>
  )
}

const LOGO_SIZE = 96

const SECTIONS: Array<{
  id: string
  title: string
  hint: string
  fields: Array<{
    key: keyof UpdateProfileInput & keyof Profile
    label: string
    type: "text" | "email" | "tel" | "date" | "select" | "checkbox"
    placeholder?: string
    options?: Array<{ value: string; label: string }>
    dependOn?: { key: "accountType"; value: string }
  }>
}> = [
  {
    id: "identity",
    title: "Identity",
    hint: "Legal name and personal details used on reports.",
    fields: [
      {
        key: "fullName",
        label: "Full name",
        type: "text",
        placeholder: "As per Aadhaar / PAN",
      },
      {
        key: "dateOfBirth",
        label: "Date of birth",
        type: "date",
        placeholder: "YYYY-MM-DD",
      },
      {
        key: "gender",
        label: "Gender",
        type: "select",
        options: [
          { value: "Male", label: "Male" },
          { value: "Female", label: "Female" },
          { value: "Other", label: "Other" },
          { value: "Prefer not to say", label: "Prefer not to say" },
        ],
      },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    hint: "Mobile and email used for case updates and SMS alerts.",
    fields: [
      {
        key: "mobile",
        label: "Mobile number",
        type: "tel",
        placeholder: "+91 98765 43210",
      },
      {
        key: "email",
        label: "Email address",
        type: "email",
        placeholder: "you@example.com",
      },
    ],
  },
  {
    id: "address",
    title: "Address",
    hint: "Your full address. PIN code auto-fills city, district and state.",
    fields: [
      {
        key: "addressLine1",
        label: "Full address",
        type: "text",
        placeholder: "House/flat, street, locality",
      },
      {
        key: "pinCode",
        label: "PIN code",
        type: "text",
        placeholder: "110001",
      },
      {
        key: "city",
        label: "City",
        type: "text",
        placeholder: "Derived from PIN code",
      },
      {
        key: "district",
        label: "District",
        type: "text",
        placeholder: "Derived from PIN code",
      },
      {
        key: "state",
        label: "State",
        type: "text",
        placeholder: "Derived from PIN code",
      },
    ],
  },
  {
    id: "government",
    title: "Government ID",
    hint: "Used for NCRP filing. Only the last 4 digits are shown.",
    fields: [
      {
        key: "aadhaarLast4",
        label: "Aadhaar (last 4 digits)",
        type: "text",
        placeholder: "****1234",
      },
      {
        key: "pan",
        label: "PAN",
        type: "text",
        placeholder: "ABCDE1234F",
      },
    ],
  },
  {
    id: "financial",
    title: "Financial",
    hint: "Bank / UPI details used for refund conversations. Only last 4 digits shown.",
    fields: [
      {
        key: "bankName",
        label: "Bank name",
        type: "text",
        placeholder: "Bank name",
      },
      {
        key: "accountNumberLast4",
        label: "Account number (last 4)",
        type: "text",
        placeholder: "****1234",
      },
      {
        key: "ifscCode",
        label: "IFSC code",
        type: "text",
        placeholder: "ABCD0123456",
      },
      {
        key: "upiId",
        label: "UPI ID",
        type: "text",
        placeholder: "name@upi",
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    hint: "Account type and notification preferences.",
    fields: [
      {
        key: "accountType",
        label: "Account type",
        type: "select",
        options: [
          { value: "individual", label: "Individual" },
          { value: "corporate", label: "Corporate" },
          { value: "govt", label: "Government" },
        ],
      },
      {
        key: "gstNumber",
        label: "GST number",
        type: "text",
        placeholder: "22AAAAA0000A1Z5",
        dependOn: { key: "accountType", value: "corporate" },
      },
      {
        key: "companyName",
        label: "Company name",
        type: "text",
        placeholder: "Company name",
        dependOn: { key: "accountType", value: "corporate" },
      },
      {
        key: "authorizedSignatoryName",
        label: "Authorized signatory",
        type: "text",
        placeholder: "Signatory name",
        dependOn: { key: "accountType", value: "corporate" },
      },
      {
        key: "preferredLanguage",
        label: "Preferred language",
        type: "select",
        options: [
          { value: "english", label: "English" },
          { value: "hindi", label: "हिंदी" },
          { value: "bilingual", label: "English + Hindi" },
        ],
      },
      {
        key: "notificationSms",
        label: "SMS notifications",
        type: "checkbox",
      },
      {
        key: "notificationEmail",
        label: "Email notifications",
        type: "checkbox",
      },
    ],
  },
]

function isRequiredForNCRP(key: string): boolean {
  return REQUIRED_FOR_NCRP.has(key as any)
}

function maskLast4(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = String(value).replace(/\D/g, "")
  if (!digits) return value
  if (digits.length <= 4) return value
  return `****${digits.slice(-4)}`
}

type ProfileField = typeof SECTIONS[number]["fields"][number]

function getDisplayValue(field: ProfileField, value: unknown): string {
  if (field.type === "checkbox") return value ? "On" : "Off"
  if (field.type === "select") {
    return (
      field.options?.find((option) => option.value === value)?.label ??
      String(value ?? "")
    )
  }
  if (field.key === "aadhaarLast4" || field.key === "accountNumberLast4") {
    return maskLast4(String(value ?? "")) ?? ""
  }
  return String(value ?? "")
}

export default function ProfileScreen({
  language: initialLanguage = "en",
  onLogout,
}: {
  language?: string
  onLogout?: () => void
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<UpdateProfileInput>({})
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [language, setLanguage] = useState<"en" | "hi">(
    initialLanguage === "hi" ? "hi" : "en",
  )

  const pinBlurRef = useRef<() => void>(null)

  const t = (en: string, hi: string) => (language === "hi" ? hi : en)

  useEffect(() => {
    void (async () => {
      try {
        setError("")
        const data = await getProfile()
        setProfile(data)
        setDraft({})
      } catch (err: any) {
        setError(
          err?.message ||
            (language === "hi"
              ? "प्रोफाइल लोड नहीं हो सका।"
              : "Could not load the profile."),
        )
      }
    })()
  }, [])

  const handlePinBlur = useCallback(
    (key: "pinCode") => {
      const pin = String(draft[key] ?? "").trim()
      if (!/^\d{6}$/.test(pin)) return
      void (async () => {
        try {
          const result = await lookUpPincode(pin)
          setDraft((prev) => ({
            ...prev,
            city: result.city ?? prev.city,
            district: result.district ?? prev.district,
            state: result.state ?? prev.state,
          }))
        } catch {
          // Derived fields stay blank; user can enter manually.
        }
      })()
    },
    [draft],
  )

  const setField = (
    key: keyof UpdateProfileInput & keyof Profile,
    value: unknown,
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setError("")
  }

  const toggleSection = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isSectionExpanded = (id: string) => expanded.has(id)

  const startEditing = () => {
    const cleaned: UpdateProfileInput = {}
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const value = profile?.[field.key]
        if (value !== null && value !== undefined) {
          cleaned[field.key] = (value as any)
        }
      }
    }
    setDraft(cleaned)
    setExpanded(new Set(SECTIONS.map((s) => s.id)))
    setError("")
    setNotice("")
    setEditing(true)
  }

  const cancelEditing = () => {
    setDraft({})
    setEditing(false)
    setExpanded(new Set())
    setError("")
    setNotice("")
  }

  const handleSave = async () => {
    setError("")
    setNotice("")
    setBusy(true)
    try {
      const cleaned: UpdateProfileInput = {}
      for (const [key, value] of Object.entries(draft)) {
        if (value === "" || value === null || value === undefined) continue
        cleaned[(key as keyof UpdateProfileInput)] = value
      }
      const updated = await updateProfile(cleaned)
      setProfile(updated)
      setDraft({})
      setEditing(false)
      setExpanded(new Set())
      setNotice(
        language === "hi"
          ? "प्रोफ़ाइल अपडेट कर दिया गया है।"
          : "Profile updated successfully.",
      )
    } catch (err: any) {
      setError(
        err?.message ||
          (language === "hi"
            ? "प्रोफ़ाइल अपडेट नहीं हो सका।"
            : "Could not update the profile."),
      )
    } finally {
      setBusy(false)
    }
  }

  const fieldValue = (key: keyof UpdateProfileInput & keyof Profile) => {
    if (draft[key] !== undefined) return draft[key]
    return profile?.[key] ?? null
  }

  const isFilled = (key: keyof UpdateProfileInput & keyof Profile) => {
    const v = fieldValue(key)
    if (typeof v === "boolean") return v
    return v !== null && v !== undefined && v !== ""
  }

  const isFieldVisible = (field: ProfileField) =>
    !field.dependOn ||
    (draft[field.dependOn.key] ?? profile?.[field.dependOn.key]) ===
      field.dependOn.value

  const getSectionSummary = (section: typeof SECTIONS[number]) =>
    section.fields
      .filter(isFieldVisible)
      .filter((field) => isFilled(field.key))
      .map((field) => ({
        label: field.label,
        value: getDisplayValue(field, fieldValue(field.key)),
      }))

  const isCorporate =
    (draft.accountType ?? profile?.accountType) === "corporate"

  const signOut = async () => {
    if (onLogout) await onLogout()
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflowY: "auto",
        background: C.bgCanvas,
        padding: "16px 16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: C.white,
          borderRadius: 16,
          padding: "16px 18px",
          border: `1px solid ${C.divider}`,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {renderProfilePic(
          profile?.avatarUrl ?? null,
          profile?.fullName ?? null,
        )}
        <p
          style={{
            margin: "0 0 6px",
            fontSize: 18,
            fontWeight: 700,
            color: C.textPrimary,
            fontFamily: "'Poppins', sans-serif",
          }}
        >
          {t("My Profile", "मेरा प्रोफ़ाइल")}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>
          {profile?.fullName || t("Complainant", "शिकायतकर्ता")}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: C.textSecondary }}>
          {profile?.email || "No email on file"}
        </p>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 12,
            lineHeight: 1.5,
            color: C.textSecondary,
          }}
        >
          {t(
            "Your saved details are shown below. Select Edit profile to change them.",
            "आपकी सहेजी गई जानकारी नीचे है। बदलने के लिए प्रोफ़ाइल संपादित करें चुनें।",
          )}
        </p>
        {!editing && onLogout ? (
          <button
            type="button"
            onClick={signOut}
            style={{
              marginTop: 12,
              border: `1.5px solid ${C.teal600}`,
              background: C.white,
              color: C.teal600,
              borderRadius: 20,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            {language === "hi" ? "साइन आउट" : "Sign out"}
          </button>
        ) : null}
      </div>

      {error && (
        <p
          role="alert"
          style={{
            flexShrink: 0,
            color: C.danger,
            fontSize: 12,
            margin: 0,
            padding: 10,
            background: "#FFF1F0",
            borderRadius: 10,
          }}
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          style={{
            flexShrink: 0,
            margin: 0,
            fontSize: 11,
            color: C.teal700,
            background: C.mint100,
            borderRadius: 9,
            padding: "8px 10px",
          }}
        >
          {notice}
        </p>
      )}

      {SECTIONS.map((section) => {
        const open = isSectionExpanded(section.id)
        const summary = getSectionSummary(section)
        return (
          <div
            key={section.id}
            style={{
              background: C.white,
              borderRadius: 12,
              border: `1px solid ${C.divider}`,
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              aria-expanded={open}
              aria-controls={`profile-section-${section.id}`}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 16px",
                background: "transparent",
                border: 0,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: C.textPrimary,
                    }}
                  >
                    {section.title}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: summary.length ? C.teal700 : C.textSecondary,
                      background: summary.length ? C.mint100 : "#F3F4F6",
                      borderRadius: 20,
                      padding: "3px 8px",
                    }}
                  >
                    {summary.length
                      ? t(`${summary.length} saved`, `${summary.length} सहेजे गए`)
                      : t("Not added", "नहीं जोड़ा गया")}
                  </span>
                </div>
                <span
                  style={{
                    display: "block",
                    marginTop: 4,
                    fontSize: 11,
                    lineHeight: 1.4,
                    color: C.textSecondary,
                  }}
                >
                  {section.hint}
                </span>
              </div>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 12,
                  color: C.textSecondary,
                  transform: `rotate(${open ? 180 : 0}deg)`,
                  display: "inline-block",
                }}
              >
                ▾
              </span>
            </button>
            {!open && !editing && summary.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  padding: "0 16px 14px",
                }}
              >
                {summary.slice(0, 2).map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 12,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: C.textSecondary }}>{item.label}</span>
                    <span
                      style={{
                        minWidth: 0,
                        color: C.textPrimary,
                        fontWeight: 600,
                        textAlign: "right",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
                {summary.length > 2 && (
                  <span style={{ color: C.teal600, fontSize: 11 }}>
                    {t(
                      `+${summary.length - 2} more details`,
                      `और ${summary.length - 2} जानकारी`,
                    )}
                  </span>
                )}
              </div>
            )}
            {open && (
              <div
                id={`profile-section-${section.id}`}
                style={{ padding: "0 16px 16px" }}
              >
                <p
                  style={{
                    margin: "0 0 14px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: C.textSecondary,
                  }}
                >
                  {editing
                    ? t(
                        "Update the fields you want to change.",
                        "जिन फ़ील्ड को बदलना है, उन्हें अपडेट करें।",
                      )
                    : t("Your saved information", "आपकी सहेजी गई जानकारी")}
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 14,
                  }}
                >
                  {section.fields.map((field) => {
                    if (!isFieldVisible(field)) return null
                    const key = field.key
                    const value = fieldValue(key)
                    const filled = isFilled(key)
                    const required = isRequiredForNCRP(key as string)
                    const isCheckbox = field.type === "checkbox"
                    const isSelect = field.type === "select"
                    return (
                      <div
                        key={key}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <label
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: C.textPrimary,
                              margin: 0,
                              cursor: isCheckbox ? "pointer" : "default",
                            }}
                          >
                            {field.label}
                            {required && (
                              <span
                                style={{
                                  color: C.danger,
                                  marginLeft: 4,
                                  fontSize: 10,
                                }}
                              >
                                *
                              </span>
                            )}
                            {!required && (
                              <span
                                style={{
                                  fontSize: 9,
                                  color: C.textSecondary,
                                  marginLeft: 6,
                                  background: "#F3F4F6",
                                  borderRadius: 6,
                                  padding: "1px 6px",
                                }}
                              >
                                Optional
                              </span>
                            )}
                          </label>
                          {filled && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: C.success,
                              }}
                            >
                              ✅
                            </span>
                          )}
                        </div>
                        {editing ? (
                          <>
                            {isCheckbox ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setField(
                                    key,
                                    !(draft[key] ?? profile?.[key] ?? false),
                                  )
                                }
                                aria-pressed={Boolean(
                                  draft[key] ?? profile?.[key],
                                )}
                                aria-label={`${field.label}: ${
                                  (draft[key] ?? profile?.[key])
                                    ? "Enabled"
                                    : "Disabled"
                                }`}
                                style={{
                                  width: "100%",
                                  minHeight: 44,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  padding: "9px 12px",
                                  borderRadius: 10,
                                  border: `1px solid ${
                                    (draft[key] ?? profile?.[key])
                                      ? C.teal600
                                      : C.divider
                                  }`,
                                  background:
                                    (draft[key] ?? profile?.[key])
                                      ? C.mint100
                                      : C.white,
                                  color: C.textPrimary,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                <span
                                  aria-hidden="true"
                                  style={{
                                    width: 20,
                                    height: 20,
                                    flexShrink: 0,
                                    borderRadius: 6,
                                    border: `1px solid ${
                                      (draft[key] ?? profile?.[key])
                                        ? C.teal600
                                        : C.divider
                                    }`,
                                    background:
                                      (draft[key] ?? profile?.[key])
                                        ? C.teal600
                                        : C.white,
                                    color: C.white,
                                    display: "grid",
                                    placeItems: "center",
                                  }}
                                >
                                  {(draft[key] ?? profile?.[key]) ? "✓" : null}
                                </span>
                                {t(
                                  (draft[key] ?? profile?.[key])
                                    ? "Enabled"
                                    : "Disabled",
                                  (draft[key] ?? profile?.[key]) ? "चालू" : "बंद",
                                )}
                              </button>
                            ) : isSelect ? (
                              <select
                                value={String(
                                  draft[key] ?? profile?.[key] ?? "",
                                )}
                                onChange={(e) => setField(key, e.target.value)}
                                style={inputStyle}
                              >
                                <option value="" disabled>
                                  {t("Select an option", "एक विकल्प चुनें")}
                                </option>
                                {field.options!.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id={`profile-${key}`}
                                type={field.type}
                                value={String(value ?? "")}
                                onChange={(e) =>
                                  setField(
                                    key,
                                    key === "pinCode"
                                      ? e.target.value
                                          .replace(/\D/g, "")
                                          .slice(0, 6)
                                      : e.target.value,
                                  )
                                }
                                onBlur={
                                  key === "pinCode"
                                    ? () => handlePinBlur("pinCode")
                                    : undefined
                                }
                                placeholder={field.placeholder}
                                style={inputStyle}
                                autoComplete={
                                  key === "mobile"
                                    ? "tel"
                                    : key === "email"
                                      ? "email"
                                      : key === "pinCode"
                                        ? "postal-code"
                                        : "off"
                                }
                              />
                            )}
                            {key === "pinCode" &&
                              (draft.city || draft.district || draft.state) && (
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: 10,
                                    color: C.teal700,
                                  }}
                                >
                                  {t(
                                    "Derived from PIN code",
                                    "पिन कोड से प्राप्त",
                                  )}
                                  :{" "}
                                  {draft.state || draft.district || draft.city}
                                </p>
                              )}
                          </>
                        ) : (
                          <p
                            style={{
                              margin: 0,
                              fontSize: 13,
                              lineHeight: 1.5,
                              color: filled ? C.textPrimary : C.textSecondary,
                              fontWeight: filled ? 600 : 400,
                            }}
                          >
                            {isCheckbox && typeof value === "boolean"
                              ? getDisplayValue(field, value)
                              : filled
                                ? getDisplayValue(field, value)
                                : t("Not provided", "प्रदान नहीं किया गया")}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {editing ? (
        <div
          style={{
            display: "flex",
            flexShrink: 0,
            gap: 10,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={cancelEditing}
            disabled={busy}
            style={{
              flex: 1,
              minHeight: 46,
              border: `1px solid ${C.divider}`,
              background: C.white,
              color: C.textSecondary,
              borderRadius: 10,
              padding: "10px",
              fontSize: 12,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            style={{
              flex: 1,
              minHeight: 46,
              border: 0,
              background: C.teal600,
              color: C.white,
              borderRadius: 10,
              padding: "10px",
              fontSize: 12,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy
              ? t("Saving…", "सहेजा जा रहा है…")
              : t("Save changes", "परिवर्तन सहेजें")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          style={{
            width: "100%",
            flexShrink: 0,
            minHeight: 48,
            border: `1.5px solid ${C.teal600}`,
            background: C.white,
            color: C.teal600,
            borderRadius: 24,
            padding: "11px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            marginTop: 2,
          }}
        >
          {t("Edit profile", "प्रोफ़ाइल संपादित करें")}
        </button>
      )}
    </div>
  )
}
