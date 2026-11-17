import { useState, useEffect, useRef } from "react"
import { supabase } from "./lib/supabase"

/**
 * Loading/Splash screen shown app startup or during auth flow.
 * Features:
 * - Cyber Sathi app logo in circular frame (replaces shield icon)
 * - CyberSathi title and subtitle
 * - Auto-proceed after session check
 */
export default function LoadingScreen({
  onStart,
}: {
  onStart: () => void
}) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const logoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Check for existing Supabase session
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        setHasSession(!!data.session)
      } catch {
        setHasSession(false)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  // Auto-proceed after a brief delay if no manual interaction
  useEffect(() => {
    if (!isLoading) return
    const timer = setTimeout(() => {
      // If has session, go to home; otherwise to auth
      onStart()
    }, 2000)
    return () => clearTimeout(timer)
  }, [isLoading])

  if (isLoading) {
    return null // Show nothing while loading (native splash may handle this)
  }

  return (
    <div
      style={{
        flex: 1,
        background: "#0B2E2E",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* App logo in circular frame - replaces shield icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          background: "#146B66",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "3px solid #7FD1C0",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
        }}
      >
        <span style={{ fontSize: 36 }}>🛡️</span>
      </div>

      <h2
        style={{
          color: "#FFFFFF",
          fontFamily: "'Poppins', sans-serif",
          fontSize: 28,
          fontWeight: 800,
          margin: "0 0 8px",
          letterSpacing: "-0.5px",
        }}
      >
        CyberSathi
      </h2>

      <p
        style={{
          color: "#7FD1C0",
          fontSize: 14,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        Official Cyber Crime Intake & Response Portal
      </p>
    </div>
  )
}
