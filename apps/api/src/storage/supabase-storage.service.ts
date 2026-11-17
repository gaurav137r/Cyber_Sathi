import {
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { AppEnv } from "../config/env.schema"

type StorageBucket = "evidence" | "social-posts" | "generated-images"

@Injectable()
export class SupabaseStorageService {
  private readonly ensuredBuckets = new Set<StorageBucket>()

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  /**
   * Best-effort bucket provisioning. Supabase returns 400/409 when the bucket
   * already exists; both are treated as success. Callers that can store a
   * local copy should treat failures as a warning rather than a hard error.
   */
  async ensureBucket(bucket: StorageBucket): Promise<boolean> {
    if (this.ensuredBuckets.has(bucket)) return true
    const name = this.bucketName(bucket)
    const response = await this.request("/bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: name,
        name,
        public: false,
      }),
    })
    if (response.ok) {
      this.ensuredBuckets.add(bucket)
      return true
    }
    const body = await response.text().catch(() => "")
    if (
      (response.status === 400 || response.status === 409) &&
      /already exists|duplicate|exists/i.test(body)
    ) {
      this.ensuredBuckets.add(bucket)
      return true
    }
    return false
  }

  async upload(
    bucket: StorageBucket,
    objectKey: string,
    content: Buffer,
    contentType: string,
  ): Promise<void> {
    const response = await this.request(
      `/object/${this.bucketName(bucket)}/${this.encodePath(objectKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "x-upsert": "false",
        },
        body: new Uint8Array(content),
      },
    )
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Private file storage upload failed with HTTP ${response.status}.`,
      )
    }
  }

  async remove(bucket: StorageBucket, objectKey: string): Promise<void> {
    const response = await this.request(`/object/${this.bucketName(bucket)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [objectKey] }),
    })
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Private file storage cleanup failed with HTTP ${response.status}.`,
      )
    }
  }

  async createSignedUrl(
    bucket: StorageBucket,
    objectKey: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const response = await this.request(
      `/object/sign/${this.bucketName(bucket)}/${this.encodePath(objectKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      },
    )
    const payload = (await response.json().catch(() => ({}))) as {
      signedURL?: unknown
    }
    if (!response.ok || typeof payload.signedURL !== "string") {
      throw new ServiceUnavailableException(
        `Private file preview could not be signed with HTTP ${response.status}.`,
      )
    }
    return /^https?:\/\//i.test(payload.signedURL)
      ? payload.signedURL
      : `${this.storageBaseUrl()}/${payload.signedURL.replace(/^\/+/, "")}`
  }

  async download(bucket: StorageBucket, objectKey: string): Promise<Buffer> {
    const response = await this.request(
      `/object/authenticated/${this.bucketName(bucket)}/${this.encodePath(objectKey)}`,
      { method: "GET" },
    )
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Private file download failed with HTTP ${response.status}.`,
      )
    }
    return Buffer.from(await response.arrayBuffer())
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const secretKey = this.config.get("SUPABASE_SECRET_KEY", { infer: true })
    if (!secretKey) {
      throw new ServiceUnavailableException(
        "Private Supabase Storage is not configured on the API server.",
      )
    }
    try {
      const headers = new Headers(init.headers)
      headers.set("apikey", secretKey)
      headers.set("Authorization", `Bearer ${secretKey}`)
      return await fetch(`${this.storageBaseUrl()}${path}`, {
        ...init,
        headers,
      })
    } catch {
      throw new ServiceUnavailableException(
        "Could not reach private Supabase Storage.",
      )
    }
  }

  private storageBaseUrl(): string {
    return `${this.config.get("SUPABASE_URL", { infer: true }).replace(/\/+$/, "")}/storage/v1`
  }

  private bucketName(bucket: StorageBucket): string {
    if (bucket === "evidence") {
      return this.config.get("SUPABASE_EVIDENCE_BUCKET", { infer: true })
    }
    if (bucket === "generated-images") {
      return this.config.get("SUPABASE_IMAGES_BUCKET", { infer: true })
    }
    return this.config.get("SUPABASE_SOCIAL_POSTS_BUCKET", { infer: true })
  }

  private encodePath(path: string): string {
    return path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")
  }
}
