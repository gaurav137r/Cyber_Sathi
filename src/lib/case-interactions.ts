import { supabase } from "./supabase"

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`

export interface CaseRequest {
  requestId: string
  kind: "field" | "evidence" | "review"
  field?: string
  category?: string
  displayPrompt?: string
  status: "pending" | "submitted" | "cancelled" | "expired"
  createdAt: string
  updatedAt: string
  revision: string
}

export interface CaseState {
  caseId: string
  revision: string
  status: string
  fields: {
    confirmed: Record<string, unknown>
    extracted: Record<string, unknown>
    userFields: Record<string, unknown>
  }
  pendingRequests: CaseRequest[]
  evidence: Array<{
    evidenceId: string
    type: string
    uploadedAt: string
    status: "uploaded" | "queued" | "processing" | "ready" | "failed" | string
    extractedFields: Record<string, unknown>
  }>
  unresolvedConflicts: Array<Record<string, unknown>>
  review: { confirmedRevision: string | null; currentRevisionConfirmed: boolean }
  latestEventId: string | null
  nextAction: string
}

async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error) throw error
  if (!session?.access_token)
    throw new Error("Your session has expired. Sign in again to continue.")
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${session.access_token}`)
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json")
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { message?: string | string[] }
      | undefined
    const message = Array.isArray(body?.message)
      ? body.message.join(". ")
      : body?.message
    throw new Error(message || `Request failed with status ${response.status}`)
  }
  return response
}

export async function getCaseState(caseId: string): Promise<CaseState> {
  const response = await authenticatedFetch(
    `/cases/${encodeURIComponent(caseId)}/state`,
  )
  return (await response.json()) as CaseState
}

export async function submitCaseRequest(
  caseId: string,
  request: CaseRequest,
  expectedRevision: string,
  value?: string,
  omit = false,
) {
  const response = await authenticatedFetch(
    `/cases/${encodeURIComponent(caseId)}/requests/${encodeURIComponent(request.requestId)}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ expectedRevision, value, omit }),
    },
  )
  return response.json() as Promise<{ saved: boolean; revision: string }>
}

export async function requestCaseReview(caseId: string) {
  const response = await authenticatedFetch(
    `/cases/${encodeURIComponent(caseId)}/requests/review`,
    { method: "POST", body: "{}" },
  )
  return response.json() as Promise<CaseRequest>
}

export async function confirmCaseReview(
  caseId: string,
  expectedRevision: string,
) {
  const response = await authenticatedFetch(
    `/cases/${encodeURIComponent(caseId)}/review/confirm`,
    { method: "POST", body: JSON.stringify({ expectedRevision }) },
  )
  return response.json() as Promise<{
    caseId: string
    confirmedRevision: string
    status: "confirmed"
  }>
}

export function openCaseEvents(
  caseId: string,
  initialEventId: string | null,
  onEvent: (event: Record<string, unknown>) => void,
  onError: (error: Error) => void,
): () => void {
  const controller = new AbortController()
  let lastEventId = initialEventId ?? undefined
  let reconnectDelay = 1_000

  const reconnect = async () => {
    while (!controller.signal.aborted) {
      try {
        const headers = new Headers({ Accept: "text/event-stream" })
        if (lastEventId) headers.set("Last-Event-ID", lastEventId)
        const response = await authenticatedFetch(
          `/cases/${encodeURIComponent(caseId)}/events`,
          { headers, signal: controller.signal },
        )
        if (!response.body) throw new Error("The case event stream is unavailable.")
        reconnectDelay = 1_000
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!controller.signal.aborted) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n")
          let boundary = buffer.indexOf("\n\n")
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            let eventId = lastEventId
            let data = ""
            for (const line of frame.split("\n")) {
              if (line.startsWith("id:")) eventId = line.slice(3).trim()
              if (line.startsWith("data:")) data += line.slice(5).trim()
            }
            if (eventId) lastEventId = eventId
            if (data) {
              try {
                onEvent(JSON.parse(data) as Record<string, unknown>)
              } catch {
                onError(new Error("The case event stream returned invalid data."))
              }
            }
            boundary = buffer.indexOf("\n\n")
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          onError(error instanceof Error ? error : new Error("Event stream disconnected."))
        }
      }

      if (!controller.signal.aborted) {
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, reconnectDelay)
          controller.signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(timeout)
              resolve()
            },
            { once: true },
          )
        })
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
      }
    }
  }

  void reconnect()
  return () => controller.abort()
}
