import { apiDownload, apiRequest } from "./api"
import type { ReportSocialPlatform } from "./report-center"

export type ProfileGender = "Male" | "Female" | "Other" | "Prefer not to say"
export type ProfileAccountType = "individual" | "corporate" | "govt"
export type ProfileLanguage = "english" | "hindi" | "bilingual"

export interface Profile {
  id: string
  username?: string | null
  avatarUrl?: string | null
  bio?: string | null

  fullName?: string | null
  dateOfBirth?: string | null
  gender?: ProfileGender | null

  mobile?: string | null
  email?: string | null

  addressLine1?: string | null
  city?: string | null
  district?: string | null
  state?: string | null
  pinCode?: string | null

  aadhaarLast4?: string | null   // masked ****1234 by the API
  pan?: string | null

  bankName?: string | null
  accountNumberLast4?: string | null // masked ****1234 by the API
  ifscCode?: string | null
  upiId?: string | null

  accountType?: ProfileAccountType | null
  preferredLanguage?: ProfileLanguage | null
  notificationSms: boolean
  notificationEmail: boolean

  gstNumber?: string | null
  companyName?: string | null
  authorizedSignatoryName?: string | null

  onboardingCompleted: boolean
}

/** Quick onboarding (4 fields, single screen, post-signup). */
export interface QuickOnboardInput {
  fullName: string
  email?: string
  addressLine1: string
  pinCode: string
}

export interface QuickOnboardResult extends Profile {
  derived: {
    city?: string | null
    district?: string | null
    state?: string | null
  }
}

export interface UpdateProfileInput {
  fullName?: string
  dateOfBirth?: string
  gender?: ProfileGender
  mobile?: string
  email?: string
  addressLine1?: string
  city?: string
  district?: string
  state?: string
  pinCode?: string
  aadhaarLast4?: string
  pan?: string
  bankName?: string
  accountNumberLast4?: string
  ifscCode?: string
  upiId?: string
  accountType?: ProfileAccountType
  preferredLanguage?: ProfileLanguage
  notificationSms?: boolean
  notificationEmail?: boolean
  gstNumber?: string
  companyName?: string
  authorizedSignatoryName?: string
}

/** Voice-agent session context (injected as system prompt context). */
export interface SathiContext {
  fullName?: string | null
  mobile?: string | null
  email?: string | null
  addressLine1?: string | null
  city?: string | null
  district?: string | null
  state?: string | null
  pinCode?: string | null

  bankName?: string | null
  accountNumberLast4?: string | null
  ifscCode?: string | null
  upiId?: string | null

  aadhaarLast4?: string | null

  preferredLanguage?: string | null
  accountType?: string | null

  onboardingCompleted: boolean
  greetingHint: string
  systemPromptContext: string
}

export interface PincodeLookupResult {
  pin: string
  status: string
  city?: string | null
  district?: string | null
  state?: string | null
}

export function getProfile() {
  return apiRequest<Profile>("/profile")
}

export function updateProfile(input: UpdateProfileInput) {
  return apiRequest<Profile>("/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function quickOnboard(input: QuickOnboardInput) {
  return apiRequest<QuickOnboardResult>("/profile/quick-onboard", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function lookUpPincode(pin: string) {
  return apiRequest<PincodeLookupResult>(`/profile/pincode?pin=${encodeURIComponent(pin)}`)
}

export function getSathiContext(caseId: string) {
  return apiRequest<SathiContext>(
    `/cases/${encodeURIComponent(caseId)}/sathi/context`,
  )
}

export const REQUIRED_FOR_NCRP = new Set([
  "fullName",
  "mobile",
  "addressLine1",
  "city",
  "district",
  "state",
  "pinCode",
  "aadhaarLast4",
])
