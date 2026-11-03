import { z } from "zod"

export const extractedEntitiesSchema = z.object({
  phoneNumbers: z.array(z.string()).default([]),
  upiIds: z.array(z.string()).default([]),
  urls: z.array(z.string()).default([]),
  amounts: z.array(z.number()).default([]),
})

export type ExtractedEntities = z.infer<typeof extractedEntitiesSchema>

export type CanonicalEntity = {
  value: string | number
  sources: string[]
  sourceTypes: string[]
}

export type CanonicalEntities = {
  phoneNumbers: CanonicalEntity[]
  upiIds: CanonicalEntity[]
  urls: CanonicalEntity[]
  amounts: CanonicalEntity[]
}
