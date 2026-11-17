import { BadGatewayException } from "@nestjs/common"

export type DecodedImageFormat = "png" | "jpeg" | "webp" | "gif"

export interface DecodedImage {
  buffer: Buffer
  format: DecodedImageFormat
  contentType: string
}

const FORMAT_MIME: Record<DecodedImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
}

/**
 * Cloudflare returns the generated image as a base64 string. Depending on the
 * model version the string may be raw base64 or a `data:image/...;base64,`
 * URL, so normalise both shapes before decoding.
 */
export function decodeImagePayload(
  payload: unknown,
  maxBytes: number,
): DecodedImage {
  if (typeof payload !== "string" || payload.trim().length === 0) {
    throw new BadGatewayException(
      "Cloudflare returned no image data. The model response did not contain an image field.",
    )
  }

  const withoutPrefix = payload.replace(/^data:[^;]+;base64,/i, "")
  const compact = withoutPrefix.replace(/\s+/g, "")
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new BadGatewayException(
      "Cloudflare returned image data that is not valid base64.",
    )
  }
  if (compact.length % 4 === 1) {
    throw new BadGatewayException(
      "Cloudflare returned a truncated base64 image payload.",
    )
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(compact, "base64")
  } catch {
    throw new BadGatewayException(
      "The generated image could not be decoded from base64.",
    )
  }

  if (buffer.length < 128) {
    throw new BadGatewayException(
      `The generated image is unexpectedly small (${buffer.length} bytes).`,
    )
  }
  if (buffer.length > maxBytes) {
    throw new BadGatewayException(
      `The generated image is larger than the configured limit (${buffer.length} > ${maxBytes} bytes).`,
    )
  }

  const format = detectImageFormat(buffer)
  if (!format) {
    throw new BadGatewayException(
      "The generated image is not a valid PNG, JPEG, WebP or GIF file.",
    )
  }

  return { buffer, format, contentType: FORMAT_MIME[format] }
}

export function detectImageFormat(buffer: Buffer): DecodedImageFormat | null {
  if (buffer.length < 12) return null

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png"
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg"
  }

  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp"
  }

  const header = buffer.subarray(0, 6).toString("ascii")
  if (header === "GIF87a" || header === "GIF89a") return "gif"

  return null
}
