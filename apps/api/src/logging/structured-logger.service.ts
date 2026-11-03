import { Injectable } from "@nestjs/common"
import pino, { Logger } from "pino"

@Injectable()
export class StructuredLogger {
  private readonly logger: Logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "cybersathi-api" },
    timestamp: pino.stdTimeFunctions.isoTime,
  })

  info(bindings: Record<string, unknown>, message: string): void {
    this.logger.info(bindings, message)
  }

  error(bindings: Record<string, unknown>, message: string): void {
    this.logger.error(bindings, message)
  }
}
