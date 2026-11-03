import { z } from "zod"

export const classificationCategories = [
  "UPI_FRAUD",
  "CARD_FRAUD",
  "NET_BANKING_FRAUD",
  "PHISHING",
  "IMPERSONATION_CALL",
  "JOB_SCAM",
  "SOCIAL_MEDIA_IMPERSONATION",
  "BANK_REFUND_DELAY",
  "UNCERTAIN",
] as const

export const classificationOutputSchema = z.object({
  category: z.enum(classificationCategories),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).max(500),
  extractedFields: z.object({
    phone: z.string().nullable(),
    amount: z.number().nonnegative().nullable(),
    date: z.string().nullable(),
    bankOrApp: z.string().nullable(),
    description: z.string().nullable(),
  }),
})

export type ClassificationOutput = z.infer<typeof classificationOutputSchema>
