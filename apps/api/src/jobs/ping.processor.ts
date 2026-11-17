// This BullMQ processor is replaced by JobsService.enqueuePing for local development.
// In production with Redis, a BullMQ Worker would call this processor.
import { Injectable, Logger } from "@nestjs/common"
import { CaseService } from "../cases/case.service"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class PingProcessor {
  private readonly logger = new Logger(PingProcessor.name)

  constructor(
    private readonly cases: CaseService,
    private readonly prisma: PrismaService,
  ) {}

  async process(jobId: string | undefined, caseId: string) {
    this.logger.log({ msg: "ping job processed", caseId, jobId })
    const updated = await this.cases.touchUpdatedAt(caseId)
    await this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId: updated.userId,
        action: "JOB_PING_PROCESSED",
        metadata: { jobId },
      },
    })
    this.logger.log({
      msg: "ping job done",
      caseId,
      updatedAt: updated.updatedAt,
    })
    return { caseId, updatedAt: updated.updatedAt }
  }
}
