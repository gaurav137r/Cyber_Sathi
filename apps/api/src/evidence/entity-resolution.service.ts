import { Injectable } from "@nestjs/common"
import { CanonicalEntities, ExtractedEntities } from "./entity.types"

@Injectable()
export class EntityResolutionService {
  extractFromText(text: string): ExtractedEntities {
    const phoneNumbers = [
      ...new Set(
        (text.match(/(?:\+91[\s-]?)?[6-9]\d{9}\b/g) ?? []).map((value) =>
          value.replace(/[\s-]/g, ""),
        ),
      ),
    ].map((value) => (value.startsWith("+91") ? value : `+91${value}`))
    const upiIds = [
      ...new Set(text.match(/\b[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}\b/g) ?? []),
    ]
    const urls = [...new Set(text.match(/https?:\/\/[^\s)]+/gi) ?? [])]
    const amounts = [
      ...new Set(
        (text.match(/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?/gi) ?? [])
          .map((value) =>
            Number(value.replace(/[^\d.]/g, "").replace(/,/g, "")),
          )
          .filter(Number.isFinite),
      ),
    ]
    return { phoneNumbers, upiIds, urls, amounts }
  }

  merge(
    sources: Array<{
      evidenceId: string
      sourceType: string
      entities: ExtractedEntities
    }>,
    transcript?: ExtractedEntities,
  ): CanonicalEntities {
    const result: CanonicalEntities = {
      phoneNumbers: [],
      upiIds: [],
      urls: [],
      amounts: [],
    }
    const add = (
      field: keyof ExtractedEntities,
      value: string | number,
      evidenceId: string,
      sourceType: string,
    ) => {
      const existing = result[field].find(
        (entity) =>
          String(entity.value).toLowerCase() === String(value).toLowerCase(),
      )
      if (existing) {
        if (!existing.sources.includes(evidenceId))
          existing.sources.push(evidenceId)
        if (!existing.sourceTypes.includes(sourceType))
          existing.sourceTypes.push(sourceType)
      } else
        result[field].push({
          value,
          sources: [evidenceId],
          sourceTypes: [sourceType],
        })
    }
    const fields: Array<keyof ExtractedEntities> = [
      "phoneNumbers",
      "upiIds",
      "urls",
      "amounts",
    ]
    for (const source of sources)
      for (const field of fields)
        for (const value of source.entities[field])
          add(field, value, source.evidenceId, source.sourceType)
    if (transcript)
      for (const field of fields)
        for (const value of transcript[field])
          add(field, value, "case-transcript", "voice-transcript")
    return result
  }
}
