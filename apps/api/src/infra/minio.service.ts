import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Client } from "minio"

@Injectable()
export class MinioService implements OnModuleInit, OnModuleDestroy {
  readonly client: Client
  readonly bucket: string

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>("MINIO_BUCKET")
    this.client = new Client({
      endPoint: config.getOrThrow<string>("MINIO_ENDPOINT"),
      port: config.getOrThrow<number>("MINIO_PORT"),
      useSSL: config.getOrThrow<boolean>("MINIO_USE_SSL"),
      accessKey: config.getOrThrow<string>("MINIO_ACCESS_KEY"),
      secretKey: config.getOrThrow<string>("MINIO_SECRET_KEY"),
    })
  }

  async onModuleInit(): Promise<void> {
    if (!(await this.client.bucketExists(this.bucket))) {
      await this.client.makeBucket(this.bucket)
    }
  }

  async onModuleDestroy(): Promise<void> {}
}
