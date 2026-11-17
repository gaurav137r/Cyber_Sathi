import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { ConfigService } from "@nestjs/config"
import { Injectable, Logger } from "@nestjs/common"
import type { AppEnv } from "../config/env.schema"

/**
 * AES-256-GCM encryption for sensitive profile identifiers (Aadhaar last-4,
 * bank account last-4) stored in the `profiles` table.
 *
 * Ciphertext format: base64(iv || authTag || ciphertext)
 *
 * The key is derived from `PROFILE_ENCRYPTION_KEY`. Rotating the key invalidates
 * previously encrypted values; that is acceptable for last-4 identifiers which
 * the user can re-enter.
 */
@Injectable()
export class ProfileEncryptionService {
  private readonly logger = new Logger(ProfileEncryptionService.name)
  private key: Buffer | null = null

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    const raw = this.config.get("PROFILE_ENCRYPTION_KEY", { infer: true })
    if (raw && raw.length > 0) {
      this.key = createHash("sha256").update(raw).digest()
    } else {
      this.logger.warn(
        "PROFILE_ENCRYPTION_KEY is not set; sensitive profile fields will be stored in plaintext.",
      )
    }
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new Error("Profile encryption is not configured (PROFILE_ENCRYPTION_KEY).")
    }
    return this.key
  }

  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined || plaintext === "") {
      return null
    }
    const key = this.requireKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, ciphertext]).toString("base64")
  }

  decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) return null
    const key = this.requireKey()
    const data = Buffer.from(ciphertext, "base64")
    if (data.length < 12 + 16 + 1) {
      // Not produced by this encryptor; return as-is (backwards compatibility).
      return ciphertext
    }
    const iv = data.subarray(0, 12)
    const tag = data.subarray(12, 28)
    const encrypted = data.subarray(28)
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8")
  }

  /** Mask an identifier so only the last 4 digits are visible. */
  mask(value: string | null | undefined): string | null {
    if (!value) return null
    const digits = value.replace(/\D/g, "")
    if (digits.length <= 4) return value
    return `****${digits.slice(-4)}`
  }

  constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  }
}
