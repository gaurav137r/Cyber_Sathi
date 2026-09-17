import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { StorageService } from "../storage/storage.service";

export type DependencyStatus = {
  name: "postgres" | "redis" | "minio";
  ok: boolean;
  latencyMs: number;
  error?: string;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  async check() {
    const started = Date.now();
    const dependencies = await Promise.all([
      this.wrap("postgres", async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      this.wrap("redis", async () => {
        const pong = await this.redis.ping();
        if (pong !== "PONG") {
          throw new Error(`Unexpected Redis ping response: ${pong}`);
        }
      }),
      this.wrap("minio", async () => {
        await this.storage.ping();
      }),
    ]);

    const ok = dependencies.every((item) => item.ok);
    return {
      status: ok ? "ok" : "degraded",
      uptimeMs: process.uptime() * 1000,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      dependencies,
    };
  }

  private async wrap(
    name: DependencyStatus["name"],
    fn: () => Promise<void>,
  ): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      await fn();
      return { name, ok: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        name,
        ok: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
