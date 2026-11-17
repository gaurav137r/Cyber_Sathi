import { InternalServerErrorException } from "@nestjs/common"
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"
import { contentInfo, type ImageFormat } from "./images.types"

const execFileAsync = promisify(execFile)

export interface ExportedImage {
  path: string
  fileName: string
  format: ImageFormat
  contentType: string
  bytes: number
}

function argsForFormat(source: string, target: string, format: ImageFormat): string[] {
  if (format === "png") {
    return [
      source,
      "-strip",
      "-colorspace",
      "sRGB",
      "-define",
      "png:compression-level=9",
      target,
    ]
  }
  if (format === "webp") {
    return [
      source,
      "-strip",
      "-colorspace",
      "sRGB",
      "-quality",
      "88",
      "-define",
      "webp:method=6",
      target,
    ]
  }
  return [
    source,
    "-strip",
    "-colorspace",
    "sRGB",
    "-sampling-factor",
    "4:2:0",
    "-interlace",
    "Plane",
    "-quality",
    "90",
    target,
  ]
}

/**
 * Convert the composed PNG into the requested delivery format and confirm the
 * file exists on disk before returning success.
 */
export async function exportImage(
  sourcePath: string,
  outputDirectory: string,
  baseName: string,
  format: ImageFormat,
): Promise<ExportedImage> {
  const info = contentInfo(format)
  const fileName = `${baseName}.${info.extension}`
  const targetPath = path.join(outputDirectory, fileName)

  try {
    await execFileAsync("magick", argsForFormat(sourcePath, targetPath, format), {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    })
  } catch (error) {
    const stderr =
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? ((error as { stderr: string }).stderr || "").slice(0, 600)
        : ""
    throw new InternalServerErrorException(
      `ImageMagick could not export the ${info.label} image.${
        stderr ? ` ${stderr.trim()}` : ""
      }`,
    )
  }

  const stat = await fs.stat(targetPath).catch(() => null)
  if (!stat || !stat.isFile() || stat.size < 100) {
    throw new InternalServerErrorException(
      "The rendered image file was not created. No download is available.",
    )
  }

  return {
    path: targetPath,
    fileName,
    format,
    contentType: info.contentType,
    bytes: stat.size,
  }
}

/**
 * Fail loudly if a renderer claims success without leaving a usable file.
 */
export async function assertOutputFile(
  filePath: string,
  minimumBytes = 100,
): Promise<number> {
  const stat = await fs.stat(filePath).catch(() => null)
  if (!stat || !stat.isFile() || stat.size < minimumBytes) {
    throw new InternalServerErrorException(
      "The rendered image file is missing or empty.",
    )
  }
  return stat.size
}
