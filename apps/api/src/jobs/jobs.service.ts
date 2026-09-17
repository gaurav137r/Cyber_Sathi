import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { CasesService } from "../cases/cases.service";
import { CASE_JOBS_QUEUE, PING_JOB } from "./job.constants";

@Injectable()
export class JobsService {
  constructor(
    @InjectQueue(CASE_JOBS_QUEUE) private readonly queue: Queue,
    private readonly cases: CasesService,
  ) {}

  async enqueuePing(caseId: string, requestId?: string) {
    await this.cases.get(caseId);
    const job = await this.queue.add(
      PING_JOB,
      { caseId, requestId },
      { removeOnComplete: 50, removeOnFail: 50 },
    );
    return { jobId: job.id, caseId, name: PING_JOB };
  }
}
