import { BadGatewayException, BadRequestException } from "@nestjs/common"
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface ImageMetadata {
  format: string
  width: number
  height: number
}

export interface DimensionLimits {
  minDimension: number
  maxDimension: number
}

/**
 * Verify a decoded image with ImageMagick. Magic-byte checks in the decoder
 * catch obvious junk; this confirms the file is actually readable and gives us
 * its true dimensions before it enters the composition engine.
 */
export async function inspectImage(buffer: Buffer): Promise<ImageMetadata> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new BadGatewayException("The generated image file is empty.")
  }

  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "cyber-sathi-identify-"),
  )
  const filePath = path.join(directory, "input.bin")

  try {
    await fs.writeFile(filePath, buffer)
    let stdout = ""
    try {
      const result = await execFileAsync(
        "magick",
        ["identify", "-ping", "-format", "%m %w %h\n", filePath],
        { maxBuffer: 2 * 1024 * 1024, timeout: 30_000 },
      )
      stdout = result.stdout
    } catch (error) {
      const stderr =
        typeof (error as { stderr?: unknown }).stderr === "string"
          ? ((error as { stderr: string }).stderr || "").slice(0, 400)
          : ""
      throw new BadGatewayException(
        `ImageMagick could not read the generated image.${
          stderr ? ` ${stderr.trim()}` : ""
        }`,
      )
    }

    const firstLine = stdout.split(/\r?\n/).find((line) => line.trim())
    if (!firstLine) {
      throw new BadGatewayException(
        "ImageMagick returned no metadata for the generated image.",
      )
    }
    const [format, widthText, heightText] = firstLine.trim().split(/\s+/)
    const width = Number(widthText)
    const height = Number(heightText)
    if (
      !format ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new BadGatewayException(
        "ImageMagick returned invalid image metadata.",
      )
    }
    return { format: format.toUpperCase(), width, height }
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Validate a requested canvas before any AI credit is spent.
 */
export function validateDimensions(
  width: number,
  height: number,
  limits: DimensionLimits,
): { width: number; height: number } {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new BadRequestException("Image width and height must be integers.")
  }
  if (width < limits.minDimension || height < limits.minDimension) {
    throw new BadRequestException(
      `Image dimensions must be at least ${limits.minDimension}px on both sides.`,
    )
  }
  if (width > limits.maxDimension || height > limits.maxDimension) {
    throw new BadRequestException(
      `Image dimensions must not exceed ${limits.maxDimension}px on either side.`,
    )
  }

  const ratio = width / height
  if (ratio < 0.3 || ratio > 3.2) {
    throw new BadRequestException(
      "Unsupported aspect ratio. Use a canvas between 0.3:1 and 3.2:1.",
    )
  }

  return { width, height }
}

export function aspectRatioLabel(width: number, height: number): string {
  const ratio = width / height
  if (Math.abs(ratio - 1) < 0.02) return "1:1"
  if (Math.abs(ratio - 4 / 5) < 0.02) return "4:5"
  if (Math.abs(ratio - 9 / 16) < 0.02) return "9:16"
  if (Math.abs(ratio - 1200 / 628) < 0.02) return "1.91:1"
  return `${width}:${height}`
}
