import { apiRequest } from "./api"
import type { ExtractedCaseData } from "./ai"
import { confirmCaseReview, getCaseState } from "./case-interactions"

export interface CaseRecord {
  id: string
  trackingNumber: string | null
  category: string
  amount: string
  suspectPhone: string
  suspectUpi: string
  suspectDetails: string
  platform: string
  incidentDate: string
  summary: string
  complaintNarrative: string
  actionRequested: string
  status: string
  createdAt: string
  filingDestination: string
  complainantName: string
  complainantPhone: string
  complainantLocation: string
  reviewed: boolean
}

export function isCaseOpen(record: Pick<CaseRecord, "status">): boolean {
  const s = String(record.status || "").toUpperCase()
  return !["REVIEWED", "FILED", "RESOLVED", "ARCHIVED"].includes(s)
}

export function caseStatusLabel(status: string): string {
  const normalized = String(status || "").toUpperCase()
  return normalized === "REVIEWED" ? "COMPLETED" : normalized
}

type ApiCase = {
  id: string
  trackingNumber?: string | null
  category?: string | null
  status: string
  createdAt: string
  filingDestination?: string | null
  rawTranscript?: string | null
  canonicalTranscript?: string | null
  structuredFields?: Record<string, unknown> | null
}

function asString(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return value.toLocaleString("en-IN")
  return ""
}

function mapApiCase(record: ApiCase): CaseRecord {
  const fields = record.structuredFields ?? {}
  const transcript = record.canonicalTranscript || record.rawTranscript || ""
  const sathi = fields.__sathi
  const reviewed =
    typeof sathi === "object" &&
    sathi !== null &&
    !Array.isArray(sathi) &&
    typeof (sathi as Record<string, unknown>).confirmedRevision === "string" &&
    Boolean((sathi as Record<string, unknown>).confirmedRevision)

  return {
    id: record.id,
    trackingNumber: record.trackingNumber ?? null,
    category: record.category ?? "",
    amount: asString(fields.amount),
    suspectPhone: asString(fields.suspectPhone ?? fields.phone),
    suspectUpi: asString(fields.suspectUpi ?? fields.upiId),
    suspectDetails: asString(fields.suspectDetails ?? fields.url),
    platform: asString(fields.platform ?? fields.bankOrApp),
    incidentDate: asString(fields.incidentDate ?? fields.date),
    summary: asString(fields.summary) || record.rawTranscript || "",
    complaintNarrative: transcript,
    actionRequested: asString(fields.actionRequested),
    status: record.status,
    createdAt: record.createdAt,
    filingDestination: record.filingDestination ?? "",
    complainantName: asString(fields.complainantName),
    complainantPhone: asString(fields.complainantPhone),
    complainantLocation: asString(fields.complainantLocation),
    reviewed,
  }
}

export async function fetchUserCases(): Promise<CaseRecord[]> {
  const records = await apiRequest<ApiCase[]>("/cases")
  return records.map(mapApiCase)
}

export async function compileCaseReport(
  caseId: string,
  expectedRevision: string,
): Promise<{ id: string; version: number; content: Record<string, unknown> }> {
  return apiRequest(`/cases/${encodeURIComponent(caseId)}/compile-report`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision }),
  })
}

export async function saveReviewedCase(
  caseId: string,
  data: ExtractedCaseData,
  complainant: {
    displayName: string
    phone: string
    email: string
    stateDistrict: string
  },
): Promise<CaseRecord> {
  const state = await getCaseState(caseId)
  const record = await apiRequest<ApiCase>(
    `/cases/${encodeURIComponent(caseId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: state.revision,
        category: data.category || undefined,
        structuredFields: {
          amount: data.amount,
          suspectPhone: data.suspectPhone,
          phone: data.suspectPhone,
          suspectUpi: data.suspectUpi,
          upiId: data.suspectUpi,
          suspectDetails: data.suspectDetails,
          url: data.suspectDetails,
          platform: data.platform,
          bankOrApp: data.platform,
          incidentDate: data.incidentDate,
          summary: data.summary,
          description: data.complaintNarrative,
          actionRequested: data.actionRequested,
          complainantName: complainant.displayName,
          complainantPhone: complainant.phone,
          complainantEmail: complainant.email,
          complainantLocation: complainant.stateDistrict,
        },
      }),
    },
  )

  return mapApiCase(record)
}

/**
 * Locks in the user's edited values and lets the backend compile the final
 * internal report for that exact revision. Both steps are best-effort on the
 * second call so a slow report model cannot lose the user's saved corrections.
 */
export async function confirmAndCompileCase(caseId: string): Promise<void> {
  const afterSave = await getCaseState(caseId)
  const confirmation = await confirmCaseReview(caseId, afterSave.revision)
  try {
    await apiRequest(`/cases/${encodeURIComponent(caseId)}/compile-report`, {
      method: "POST",
      body: JSON.stringify({ expectedRevision: confirmation.confirmedRevision }),
    })
  } catch (error) {
    console.warn("Case saved and confirmed, but report compilation failed:", error)
  }
}
