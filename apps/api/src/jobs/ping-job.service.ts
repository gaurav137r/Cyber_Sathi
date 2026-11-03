import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { Job, Queue, Worker } from "bullmq"
import { CaseService } from "../cases/case.service"
import { PrismaService } from "../infra/prisma.service"
import { RedisService } from "../infra/redis.service"
import { StructuredLogger } from "../logging/structured-logger.service"

const QUEUE_NAME = "case-events"

@Injectable()
export class PingJobService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue
  private worker?: Worker

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly cases: CaseService,
    private readonly logger: StructuredLogger,
  ) {
    this.queue = new Queue(QUEUE_NAME, { connection: redis.client })
  }

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<{ caseId: string; requestId?: string }>) => {
        await this.prisma.case.update({
          where: { id: job.data.caseId },
          data: { updatedAt: new Date() },
        })
        this.logger.info(
          {
            requestId: job.data.requestId,
            jobId: job.id,
            caseId: job.data.caseId,
          },
          "ping job processed",
        )
        return { caseId: job.data.caseId }
      },
      { connection: this.redis.client.duplicate() },
    )
    this.worker.on("failed", (job, error) =>
      this.logger.error(
        { jobId: job?.id, error: error.message },
        "ping job failed",
      ),
    )
  }

  async enqueue(caseId: string, requestId?: string): Promise<{
    jobId: string | undefined
    caseId: string
  }> {
    await this.cases.findOne(caseId)
    const job = await this.queue.add("ping", { caseId, requestId }, {
      removeOnComplete: 100,
      removeOnFail: 100,
    })
    return { jobId: job.id, caseId }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close()
    await this.queue.close()
  }
}
