import { Injectable } from "@nestjs/common"
import { PrismaService } from "../infra/prisma.service"

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const started = Date.now()
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return {
        status: "ok",
        uptimeMs: process.uptime() * 1000,
        timestamp: new Date().toISOString(),
        database: { ok: true, latencyMs: Date.now() - started },
      }
    } catch (error) {
      return {
        status: "error",
        uptimeMs: Date.now() - started,
        timestamp: new Date().toISOString(),
        database: {
          ok: false,
          latencyMs: 0,
          error: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }
}
