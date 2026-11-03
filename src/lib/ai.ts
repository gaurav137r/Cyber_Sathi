export interface ExtractedCaseData {
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
  isComplete: boolean
}

export interface ChatMessage {
  id: string
  sender: "user" | "agent"
  text: string
  timestamp: string
}
