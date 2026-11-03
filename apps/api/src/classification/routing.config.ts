import { classificationCategories } from "./classification.types"

export type FilingRoute = {
  category: typeof classificationCategories[number]
  destinationName: string | null
  guidance: string
  deepLinkUrl: string | null
}

// Versioned configuration only. Government URLs/workflows must be re-verified against live portals before production use.
export const filingRoutes: Record<typeof classificationCategories[number], FilingRoute> =
  {
    UPI_FRAUD: {
      category: "UPI_FRAUD",
      destinationName: "NCRP financial-fraud module",
      guidance:
        "Use the National Cyber Crime Reporting Portal financial-fraud flow; report quickly because recovery is time-sensitive.",
      deepLinkUrl: null,
    },
    CARD_FRAUD: {
      category: "CARD_FRAUD",
      destinationName: "NCRP financial-fraud module",
      guidance:
        "Use the National Cyber Crime Reporting Portal financial-fraud flow and include transaction evidence.",
      deepLinkUrl: null,
    },
    NET_BANKING_FRAUD: {
      category: "NET_BANKING_FRAUD",
      destinationName: "NCRP financial-fraud module",
      guidance:
        "Use the National Cyber Crime Reporting Portal financial-fraud flow and contact the bank immediately.",
      deepLinkUrl: null,
    },
    PHISHING: {
      category: "PHISHING",
      destinationName: "NCRP general cybercrime complaint",
      guidance:
        "File a general cybercrime complaint and preserve the suspicious message, URL, or attachment.",
      deepLinkUrl: null,
    },
    IMPERSONATION_CALL: {
      category: "IMPERSONATION_CALL",
      destinationName: "NCRP general cybercrime complaint",
      guidance:
        "File the impersonation report; if money moved recently, surface the 1930 helpline for urgent recovery.",
      deepLinkUrl: null,
    },
    JOB_SCAM: {
      category: "JOB_SCAM",
      destinationName: "NCRP general cybercrime complaint",
      guidance:
        "File the cybercrime complaint and include the recruitment channel, messages, and payment evidence.",
      deepLinkUrl: null,
    },
    SOCIAL_MEDIA_IMPERSONATION: {
      category: "SOCIAL_MEDIA_IMPERSONATION",
      destinationName: "NCRP general cybercrime complaint",
      guidance:
        "File the impersonation complaint and preserve profile URLs and messages.",
      deepLinkUrl: null,
    },
    BANK_REFUND_DELAY: {
      category: "BANK_REFUND_DELAY",
      destinationName: "RBI Banking Ombudsman route",
      guidance:
        "Use the RBI Banking Ombudsman route only after the bank complaint and required waiting period.",
      deepLinkUrl: null,
    },
    UNCERTAIN: {
      category: "UNCERTAIN",
      destinationName: null,
      guidance:
        "A clarification is required before CyberSathi can recommend a filing destination.",
      deepLinkUrl: null,
    },
  }
