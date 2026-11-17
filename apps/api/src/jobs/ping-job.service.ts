import { Injectable } from "@nestjs/common"
import { CaseService } from "../cases/case.service"
import { PrismaService } from "../infra/prisma.service"
import { StructuredLogger } from "../logging/structured-logger.service"

@Injectable()
export class PingJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CaseService,
    private readonly logger: StructuredLogger,
  ) {}

  async enqueue(caseId: string, requestId?: string): Promise<{
    jobId: string | undefined
    caseId: string
    updatedAt: Date
  }> {
    await this.cases.findOne(caseId)
    // In production, BullMQ would enqueue a job; for local dev, we just touch the case
    const updated = await this.cases.touchUpdatedAt(caseId)
    return { caseId, jobId: undefined, updatedAt: updated.updatedAt }
  }
}
