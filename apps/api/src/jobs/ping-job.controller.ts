import { Body, Controller, Post } from "@nestjs/common"
import { Request } from "express"
import { PingJobService } from "./ping-job.service"

@Controller("jobs")
export class PingJobController {
  constructor(private readonly jobs: PingJobService) {}

  @Post("ping")
  async enqueue(@Body("caseId") caseId: string) {
    return this.jobs.enqueue(caseId)
  }
}
