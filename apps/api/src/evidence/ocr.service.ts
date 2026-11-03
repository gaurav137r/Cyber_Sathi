import { Injectable, ServiceUnavailableException } from "@nestjs/common"
import { createWorker } from "tesseract.js"

export interface OcrService {
  extractText(image: Buffer): Promise<string>
}

export const OCR_SERVICE = Symbol("OCR_SERVICE")

@Injectable()
export class TesseractOcrProvider implements OcrService {
  async extractText(image: Buffer): Promise<string> {
    const worker = await createWorker("eng")
    try {
      const result = await worker.recognize(image)
      return result.data.text.trim()
    } catch (error) {
      throw new ServiceUnavailableException(
        `OCR failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      await worker.terminate()
    }
  }
}
