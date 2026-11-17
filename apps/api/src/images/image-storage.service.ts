import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common"
import { promises as fs } from "node:fs"
import path from "node:path"
import { ImagesConfigService } from "./images.config"
import { SupabaseStorageService } from "../storage/supabase-storage.service"

export interface StoredImage {
  key: string
  contentType: string
  localPath: string
  remote: boolean
}

/**
 * Durable storage for generated artwork.
 *
 * The API always writes a local copy first so preview/download work even when
 * the Supabase Storage bucket is unavailable. A best-effort remote copy keeps
 * images available across redeploys and instances.
 */
@Injectable()
export class GeneratedImageStorage {
  private readonly logger = new Logger(GeneratedImageStorage.name)
  private readonly root: string

  constructor(
    private readonly config: ImagesConfigService,
    private readonly supabase: SupabaseStorageService,
  ) {
    this.root = path.resolve(process.cwd(), this.config.storageDir)
  }

  async save(
    objectKey: string,
    content: Buffer,
    contentType: string,
  ): Promise<StoredImage> {
    const key = this.assertSafeKey(objectKey)
    const localPath = this.localPath(key)

    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true })
      const temporary = `${localPath}.${process.pid}.${Date.now()}.tmp`
      await fs.writeFile(temporary, content, { mode: 0o600 })
      await fs.rename(temporary, localPath)
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: "images.storage.local_failed",
          key,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      throw new InternalServerErrorException(
        "The generated image could not be written to local project storage.",
      )
    }

    let remote = false
    try {
      remote = await this.supabase.ensureBucket("generated-images")
      if (remote) {
        await this.supabase.upload(
          "generated-images",
          key,
          content,
          contentType,
        )
        remote = true
      }
    } catch (error) {
      remote = false
      this.logger.warn(
        JSON.stringify({
          event: "images.storage.remote_failed",
          key,
          note: "Local copy retained; downloads will use it.",
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }

    return { key, contentType, localPath, remote }
  }

  async read(key: string): Promise<Buffer> {
    const safeKey = this.assertSafeKey(key)
    const local = this.localPath(safeKey)

    try {
      return await fs.readFile(local)
    } catch {
      // Fall through to the remote copy.
    }

    try {
      return await this.supabase.download("generated-images", safeKey)
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: "images.storage.read_failed",
          key: safeKey,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      if (error instanceof ServiceUnavailableException) {
        throw new NotFoundException(
          "The generated image file is no longer available on this server.",
        )
      }
      throw new NotFoundException(
        "The generated image file could not be found in project storage.",
      )
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const stat = await fs.stat(this.localPath(this.assertSafeKey(key)))
      return stat.isFile() && stat.size > 0
    } catch {
      return false
    }
  }

  private localPath(key: string): string {
    const resolved = path.resolve(this.root, key)
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new ServiceUnavailableException("Invalid image storage key.")
    }
    return resolved
  }

  private assertSafeKey(key: string): string {
    const normalised = key.replace(/^\/+/, "")
    if (
      !normalised ||
      normalised.includes("..") ||
      !normalised.split("/").every((segment) => /^[A-Za-z0-9._-]+$/.test(segment))
    ) {
      throw new ServiceUnavailableException("Invalid image storage key.")
    }
    return normalised
  }
}
