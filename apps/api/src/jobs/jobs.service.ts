import { Injectable } from "@nestjs/common"
import { CaseService } from "../cases/case.service"

@Injectable()
export class JobsService {
  constructor(private readonly cases: CaseService) {}

  async enqueuePing(caseId: string, requestId?: string) {
    await this.cases.findOne(caseId)
    // In production, BullMQ would enqueue a job; for local dev, we just touch the case
    const updated = await this.cases.touchUpdatedAt(caseId)
    return { caseId, updatedAt: updated.updatedAt }
  }
}
