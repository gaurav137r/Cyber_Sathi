import { supabase } from "./supabase"
import type { ExtractedCaseData } from "./ai"

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`

export type SathiFacts = {
  narrative: string | null

  category: string | null

  categoryConfidence: number | null

  explanation: string | null

  incidentAt: string | null

  amount: number | null

  channel: string | null

  suspectPhone: string | null

  victimPhone: string | null

  upiId: string | null

  bankOrApp: string | null

  url: string | null

  transactionIds: string[]

  description: string | null

  missingFields: string[]

  intakeComplete: boolean
}

export type SathiResponse = {
  agent: { name: string; purpose: string }

  caseId: string

  language: string

  reply: string | null

  conversation?: Array<{
    role: "user" | "model"
    text: string
  }>

  caseSnapshot?: {
    structuredFields: Record<string, unknown> | null
    evidence: Array<{
      id: string
      type: string
      fileName: string
      extractedEntities: Record<string, unknown> | null
      uploadedAt: string
    }>
    latestReport: {
      id: string
      version: number
      content: Record<string, unknown>
      generatedAt: string
    } | null
  } | null

  facts: SathiFacts

  clientAction: {
    type: "PICK_PHONE_NUMBER"

    source: "CALL" | "SMS" | "EITHER" | "MANUAL"

    prompt: string

    candidates: string[]
  } | null

  route: {
    category: string

    destinationName: string | null

    guidance: string
  }

  live: {
    ephemeralToken: string

    model: string

    websocketUrl: string

    voiceName: string

    expiresAt: string

    authQueryParam: string

    inputAudio: { mimeType: string; rateHz: number }

    outputAudio: { mimeType: string; rateHz: number }

    setupConfig?: Record<string, unknown>
  } | null
}

export function sathiFactsToReport(facts: SathiFacts) {
  return {
    category: facts.category ?? "",
    amount: facts.amount == null ? "" : `₹${facts.amount.toLocaleString("en-IN")}`,
    suspectPhone: facts.suspectPhone ?? "",
    suspectUpi: facts.upiId ?? "",
    suspectDetails: facts.url ?? "",
    platform: facts.bankOrApp ?? "",
    incidentDate: facts.incidentAt ?? "",
    summary: facts.description ?? facts.narrative ?? "",
    complaintNarrative: facts.narrative ?? "",
    actionRequested: "",
    isComplete: facts.intakeComplete,
  }
}

export function mergeSathiFactsIntoReport(
  current: ExtractedCaseData,
  facts: SathiFacts,
  previousFacts?: SathiFacts | null,
): ExtractedCaseData {
  const updated = { ...current }

  if (
    facts.category &&
    (facts.category !== previousFacts?.category || !current.category)
  )
    updated.category = facts.category
  if (
    facts.amount != null &&
    (facts.amount !== previousFacts?.amount || !current.amount)
  )
    updated.amount = `₹${facts.amount.toLocaleString("en-IN")}`
  if (
    facts.suspectPhone &&
    (facts.suspectPhone !== previousFacts?.suspectPhone ||
      !current.suspectPhone)
  )
    updated.suspectPhone = facts.suspectPhone
  if (facts.upiId && (facts.upiId !== previousFacts?.upiId || !current.suspectUpi))
    updated.suspectUpi = facts.upiId
  if (facts.url && (facts.url !== previousFacts?.url || !current.suspectDetails))
    updated.suspectDetails = facts.url
  if (
    facts.bankOrApp &&
    (facts.bankOrApp !== previousFacts?.bankOrApp || !current.platform)
  )
    updated.platform = facts.bankOrApp
  if (
    facts.incidentAt &&
    (facts.incidentAt !== previousFacts?.incidentAt || !current.incidentDate)
  )
    updated.incidentDate = facts.incidentAt
  if (
    (facts.description || facts.narrative) &&
    (facts.description !== previousFacts?.description ||
      facts.narrative !== previousFacts?.narrative ||
      !current.summary)
  )
    updated.summary = facts.description ?? facts.narrative ?? updated.summary
  if (
    facts.narrative &&
    (facts.narrative !== previousFacts?.narrative ||
      !current.complaintNarrative)
  )
    updated.complaintNarrative = facts.narrative
  updated.isComplete = facts.intakeComplete

  return updated
}

async function authHeader(): Promise<HeadersInit> {
  const {
    data: { session },

    error,
  } = await supabase.auth.getSession()

  if (error) throw error

  if (!session)
    throw new Error("Your session has expired. Please sign in again.")

  return {
    Accept: "application/json",

    Authorization: `Bearer ${session.access_token}`,
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as {
      message?: string | string[]
    } | undefined

    const message = Array.isArray(payload?.message)
      ? payload.message.join(". ")
      : payload?.message

    throw new Error(
      message || `Sathi request failed with status ${response.status}`,
    )
  }

  return (await response.json()) as T
}

export async function startSathiSession(
  language: string,
): Promise<SathiResponse> {
  const headers = await authHeader()

  const response = await fetch(
    `${apiBaseUrl.replace(/\/+$/, "")}/sathi/session`,
    {
      method: "POST",

      headers: { ...headers, "Content-Type": "application/json" },

      body: JSON.stringify({ language }),
    },
  )

  return readJson<SathiResponse>(response)
}

export async function resumeSathiSession(
  caseId: string,
  language: string,
): Promise<SathiResponse> {
  const headers = await authHeader()
  const response = await fetch(
    `${apiBaseUrl.replace(/\/+$/, "")}/cases/${encodeURIComponent(caseId)}/sathi/session`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    },
  )
  return readJson<SathiResponse>(response)
}

export async function getSathiState(caseId: string): Promise<SathiResponse> {
  const headers = await authHeader()
  const response = await fetch(
    `${apiBaseUrl.replace(/\/+$/, "")}/cases/${encodeURIComponent(caseId)}/sathi`,
    { headers },
  )
  return readJson<SathiResponse>(response)
}

export async function sendSathiTurn(
  caseId: string,

  input: { language: string; text?: string; audio?: Blob },
): Promise<SathiResponse> {
  const headers = await authHeader()

  const query = new URLSearchParams({ language: input.language })

  const body = new FormData()

  if (input.text) body.append("text", input.text)
  if (input.audio)
    body.append(
      "audio",
      input.audio,
      input.audio.type === "audio/wav" ? "incident.wav" : "incident.audio",
    )

  const response = await fetch(
    `${apiBaseUrl.replace(/\/+$/, "")}/cases/${caseId}/sathi/turns?${query}`,
    {
      method: "POST",

      headers,

      body,
    },
  )

  return readJson<SathiResponse>(response)
}

export async function saveSathiTranscript(
  caseId: string,
  input: { role: "user" | "agent"; text: string },
): Promise<void> {
  const text = input.text.trim()
  if (!text) return
  const headers = await authHeader()
  const response = await fetch(
    `${apiBaseUrl.replace(/\/+$/, "")}/cases/${encodeURIComponent(caseId)}/sathi/transcript`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        role: input.role === "agent" ? "model" : "user",
        text,
      }),
    },
  )
  await readJson<{ saved: boolean }>(response)
}

export async function generateSathiSpeech(
  caseId: string,
  text: string,
  language: string,
): Promise<Blob> {
  const headers = await authHeader()
  const response = await fetch(
    `${apiBaseUrl.replace(/\/+$/, "")}/cases/${caseId}/sathi/speech`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    },
  )
  const payload = await readJson<{ mimeType: string; data: string }>(response)
  const binary = atob(payload.data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: payload.mimeType || "audio/wav" })
}

export async function submitSathiPhone(
  caseId: string,

  input: {
    source: "CALL" | "SMS" | "EITHER" | "MANUAL"
    phone: string
    label?: string
  },
): Promise<SathiResponse> {
  const headers = await authHeader()

  const response = await fetch(
    `${apiBaseUrl.replace(/\/+$/, "")}/cases/${caseId}/sathi/device-context`,
    {
      method: "POST",

      headers: { ...headers, "Content-Type": "application/json" },

      body: JSON.stringify(input),
    },
  )

  return readJson<SathiResponse>(response)
}

export function requestNativePhonePicker(source: string, prompt: string): void {
  window.parent?.postMessage(
    { type: "SATHI_PICK_PHONE_NUMBER", source, prompt },
    "*",
  )
}
