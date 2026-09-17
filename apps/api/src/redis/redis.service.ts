import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { AppEnv } from "../config/env.schema";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService<AppEnv, true>) {
    this.client = new Redis({
      host: config.get("REDIS_HOST", { infer: true }),
      port: config.get("REDIS_PORT", { infer: true }),
      maxRetriesPerRequest: null,
    });
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
