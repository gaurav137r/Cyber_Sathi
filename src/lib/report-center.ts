import { apiDownload, apiRequest } from "./api"

export type ReportLanguage = "en" | "hi"
export type ReportSocialPlatform = "linkedin" | "instagram" | "facebook" | "twitter"
export type ReportExportFormat = "json" | "docx" | "pdf" | "txt"

export interface ReportCenterData {
  caseId: string
  status: string
  category: string | null
  amount: unknown
  incidentDate: unknown
  report: {
    id: string
    version: number
    generatedAt: string
    summaryEnglish?: string
    summaryHindi?: string
  } | null
  socialPosts: Array<{
    id: string
    platform: string
    caption: string
    hashtags: unknown
    imageUrl: string | null
    createdAt: string
  }>
}

export function getReportCenter(caseId: string) {
  return apiRequest<ReportCenterData>(
    `/cases/${encodeURIComponent(caseId)}/report-center`,
  )
}

export function generateReportSummary(caseId: string, language: ReportLanguage) {
  return apiRequest<{
    id: string
    version: number
    generatedAt: string
    language: ReportLanguage
    summary: string
    redacted: boolean
  }>(`/cases/${encodeURIComponent(caseId)}/report-center/summary`, {
    method: "POST",
    body: JSON.stringify({ language }),
  })
}

export function generateSocialDraft(
  caseId: string,
  platform: ReportSocialPlatform,
  language: ReportLanguage,
) {
  return apiRequest<{
    id: string
    platform: ReportSocialPlatform
    caption: string
    hashtags: unknown
    createdAt: string
    status: "draft"
    published: false
  }>(`/cases/${encodeURIComponent(caseId)}/report-center/social-draft`, {
    method: "POST",
    body: JSON.stringify({ platform, language }),
  })
}

export function downloadReport(
  caseId: string,
  format: ReportExportFormat,
  language: ReportLanguage,
) {
  return apiDownload(
    `/cases/${encodeURIComponent(caseId)}/report-export?format=${encodeURIComponent(
      format,
    )}&language=${encodeURIComponent(language)}`,
  )
}
