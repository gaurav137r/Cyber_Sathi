import { Body, Controller, Post, Req } from "@nestjs/common"
import { Request } from "express"
import { PingJobService } from "./ping-job.service"

@Controller("jobs")
export class PingJobController {
  constructor(private readonly jobs: PingJobService) {}

  @Post("ping")
  enqueue(
    @Body("caseId") caseId: string,
    @Req() request: Request & { requestId?: string },
  ) {
    return this.jobs.enqueue(caseId, request.requestId)
  }
}
