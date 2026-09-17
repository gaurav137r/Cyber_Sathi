import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/env.schema";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<AppEnv, true>) {
    const endpoint = config.get("MINIO_ENDPOINT", { infer: true });
    const port = config.get("MINIO_PORT", { infer: true });
    const useSsl = config.get("MINIO_USE_SSL", { infer: true });
    this.bucket = config.get("MINIO_BUCKET", { infer: true });
    this.client = new S3Client({
      region: "us-east-1",
      endpoint: `${useSsl ? "https" : "http"}://${endpoint}:${port}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get("MINIO_ACCESS_KEY", { infer: true }),
        secretAccessKey: config.get("MINIO_SECRET_KEY", { infer: true }),
      },
    });
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async presignUpload(key: string, contentType: string) {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 300 },
    );
    return { key, url, expiresInSeconds: 300, method: "PUT" as const };
  }

  async presignDownload(key: string) {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: 300 },
    );
    return { key, url, expiresInSeconds: 300, method: "GET" as const };
  }
}
