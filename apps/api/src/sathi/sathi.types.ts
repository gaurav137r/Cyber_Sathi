import { classificationCategories } from "../classification/classification.types"

export const sathiChannels = [
  "CALL",
  "SMS",
  "WHATSAPP",
  "EMAIL",
  "WEBSITE",
  "UPI",
  "OTHER",
] as const

export type SathiChannel = typeof sathiChannels[number]

export const deviceContextSources = ["CALL", "SMS", "EITHER", "MANUAL"] as const

export type DeviceContextSource = typeof deviceContextSources[number]

export type SathiFacts = {
  narrative: string | null

  category: typeof classificationCategories[number] | null

  categoryConfidence: number | null

  explanation: string | null

  incidentAt: string | null

  amount: number | null

  channel: SathiChannel | null

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

export type SathiMessage = {
  role: "user" | "model"

  parts: Array<Record<string, unknown>>
}

export type SathiClientAction = {
  type: "PICK_PHONE_NUMBER"

  source: DeviceContextSource

  prompt: string

  candidates: string[]
}

export type SathiSessionState = {
  caseId: string

  language: string

  facts: SathiFacts

  messages: SathiMessage[]

  lastReply: string | null

  clientAction: SathiClientAction | null

  updatedAt: string
}

export const emptySathiFacts = (): SathiFacts => ({
  narrative: null,

  category: null,

  categoryConfidence: null,

  explanation: null,

  incidentAt: null,

  amount: null,

  channel: null,

  suspectPhone: null,

  victimPhone: null,

  upiId: null,

  bankOrApp: null,

  url: null,

  transactionIds: [],

  description: null,

  missingFields: ["narrative"],

  intakeComplete: false,
})
