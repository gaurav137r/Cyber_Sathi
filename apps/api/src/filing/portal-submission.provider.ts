export type FilingPreview = {
  caseId: string
  destinationName: string
  destinationUrl: string
  explanation: string
  submissionData: Record<string, unknown>
  previewChecksum: string
}

export type GuidedHandoff = {
  mode: "GUIDED_BROWSER_HANDOFF"
  url: string
  instructions: string[]
}

export interface PortalSubmissionProvider {
  createGuidedHandoff(preview: FilingPreview): Promise<GuidedHandoff>
}

export const PORTAL_SUBMISSION_PROVIDER = Symbol("PORTAL_SUBMISSION_PROVIDER")
