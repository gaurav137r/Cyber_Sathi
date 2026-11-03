import { ClassificationOutput } from "./classification.types"

export interface ClassificationService {
  classify(input: {
    canonicalTranscript: string
    extractedEntities: unknown
  }): Promise<ClassificationOutput>
}

export const CLASSIFICATION_SERVICE = Symbol("CLASSIFICATION_SERVICE")
