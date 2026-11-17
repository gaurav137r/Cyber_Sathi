import { supabase } from "./supabase"

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`

export type EvidenceItem = {
  id: string
  extractedText?: string | null
  extractedEntities?: Record<string, unknown> | null
  type?: string
  processingStatus?: "ready" | "failed" | "processing"
  extractionError?: string
}

export async function uploadCaseEvidence(
  caseId: string,
  file: File,
): Promise<EvidenceItem> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error) throw error
  if (!session) throw new Error("Your session has expired. Please sign in again.")

  const body = new FormData()
  body.append("file", file)
  const type = file.type.startsWith("audio/")
    ? "AUDIO"
    : file.type.startsWith("image/")
      ? "SCREENSHOT"
      : "DOCUMENT"

  const response = await fetch(
    `${apiBaseUrl.replace(/\/+$/, "")}/cases/${encodeURIComponent(caseId)}/evidence?type=${encodeURIComponent(type)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body,
    },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = Array.isArray(payload?.message)
      ? payload.message.join(". ")
      : payload?.message
    throw new Error(message || `Upload failed (${response.status})`)
  }
  return payload as EvidenceItem
}
