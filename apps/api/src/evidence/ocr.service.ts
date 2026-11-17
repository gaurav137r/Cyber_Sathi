import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

export interface OcrService {
  extractText(image: Buffer): Promise<string>
}

export const OCR_SERVICE = Symbol("OCR_SERVICE")

@Injectable()
export class TesseractOcrProvider implements OcrService {
  private readonly logger = new Logger(TesseractOcrProvider.name)

  private pythonBin(): string {
    if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN
    // Prefer API virtualenv if present
    const venv = resolve(process.cwd(), ".venv", "bin", "python")
    if (existsSync(venv)) return venv
    return "python3"
  }

  private scriptPath(): string {
    // Works from apps/api cwd and from repo root
    const candidates = [
      resolve(process.cwd(), "scripts", "rapid_ocr.py"),
      resolve(process.cwd(), "apps/api/scripts", "rapid_ocr.py"),
      join(__dirname, "..", "..", "scripts", "rapid_ocr.py"),
    ]
    for (const c of candidates) if (existsSync(c)) return c
    return candidates[0]
  }

  async extractText(image: Buffer): Promise<string> {
    const python = this.pythonBin()
    const script = this.scriptPath()
    try {
      return await new Promise<string>((resolve, reject) => {
        const child = spawn(python, [script], { stdio: ["pipe", "pipe", "pipe"] })
        let out = ""
        let err = ""
        child.stdout.on("data", (d) => (out += d.toString()))
        child.stderr.on("data", (d) => (err += d.toString()))
        child.on("error", (e) => reject(e))
        child.on("close", (code) => {
          if (code !== 0 && !out) {
            return reject(new Error(err || `RapidOCR process exited ${code}`))
          }
          try {
            const payload = JSON.parse(out || "{}")
            if (!payload.ok) return reject(new Error(payload.error || err || "RapidOCR failed"))
            resolve(String(payload.text || "").trim())
          } catch (e) {
            reject(new Error(err || `Invalid OCR output: ${out.slice(0, 200)}`))
          }
        })
        child.stdin.write(image)
        child.stdin.end()
      })
    } catch (error) {
      this.logger.warn(`RapidOCR unavailable, falling back to Tesseract: ${String(error)}`)
      return this.tesseractFallback(image)
    }
  }

  private async tesseractFallback(image: Buffer): Promise<string> {
    try {
      const { createWorker } = await import("tesseract.js")
      const worker = await createWorker("eng")
      try {
        const result = await worker.recognize(image)
        return result.data.text.trim()
      } finally {
        await worker.terminate()
      }
    } catch (error) {
      throw new ServiceUnavailableException(
        `OCR failed (RapidOCR and Tesseract unavailable): ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
