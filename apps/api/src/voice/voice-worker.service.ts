import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { Job, Worker } from "bullmq"
import { RedisService } from "../infra/redis.service"
import { StructuredLogger } from "../logging/structured-logger.service"
import { VOICE_QUEUE, VoiceService } from "./voice.service"

@Injectable()
export class VoiceWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker

  constructor(
    private readonly redis: RedisService,
    private readonly voice: VoiceService,
    private readonly logger: StructuredLogger,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(VOICE_QUEUE, (job: Job) => this.voice.run(job), {
      connection: this.redis.client.duplicate(),
    })
    this.worker.on("failed", (job, error) =>
      this.logger.error(
        { jobId: job?.id, caseId: job?.data?.caseId, error: error.message },
        "voice transcription failed",
      ),
    )
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close()
    await this.voice.close()
  }
}
