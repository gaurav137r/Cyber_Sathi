import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { CasesService } from "../cases/cases.service";
import { PrismaService } from "../prisma/prisma.service";
import { CASE_JOBS_QUEUE, PING_JOB } from "./job.constants";

@Processor(CASE_JOBS_QUEUE)
export class PingProcessor extends WorkerHost {
  private readonly logger = new Logger(PingProcessor.name);

  constructor(
    private readonly cases: CasesService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<{ caseId: string; requestId?: string }>) {
    if (job.name !== PING_JOB) {
      return;
    }
    const { caseId, requestId } = job.data;
    this.logger.log({ msg: "ping job start", caseId, requestId, jobId: job.id });
    const updated = await this.cases.touchUpdatedAt(caseId);
    await this.prisma.auditLogEntry.create({
      data: {
        caseId,
        actorUserId: updated.userId,
        action: "JOB_PING_PROCESSED",
        metadata: { jobId: job.id, requestId },
      },
    });
    this.logger.log({ msg: "ping job done", caseId, requestId, updatedAt: updated.updatedAt });
    return { caseId, updatedAt: updated.updatedAt };
  }
}
